# frozen_string_literal: true

require "digest"
require "json"

module Swill
  module Data
    # Deterministic protocol schema reflected from loaded Sequel models.
    class Schema
      SEQUEL_TYPES = {
        integer: "Integer", float: "Float", decimal: "Float",
        string: "String", boolean: "Boolean", date: "Date",
        datetime: "Time", time: "Time"
      }.freeze

      attr_reader :models

      def self.discover
        candidates = ObjectSpace.each_object(Class).select do |klass|
          klass.name&.match?(/\A[A-Z]\w*(?:::[A-Z]\w*)*\z/) &&
            defined?(Sequel::Model) && klass < Sequel::Model
        end
        new(candidates.sort_by(&:name))
      end

      def initialize(model_classes)
        @classes = model_classes.to_h { |klass| [klass.name, klass] }
        @models = model_classes.to_h { |klass| [klass.name, model_schema(klass)] }.freeze
        validate_schema!
      end

      def model_class(name)
        @classes.fetch(name.to_s)
      end

      def payload
        { "protocol_version" => PROTOCOL_VERSION, "models" => models }
      end

      def hash
        Digest::SHA256.hexdigest(canonical_json)
      end

      def to_h
        payload.merge("schema_hash" => hash)
      end

      def canonical_json
        JSON.generate(deep_sort(payload))
      end

      private

      def model_schema(klass)
        if Array(klass.primary_key).length != 1
          raise ArgumentError, "#{klass.name} must have one primary key in protocol v1"
        end

        {
          "name" => klass.name,
          "primary_key" => Array(klass.primary_key).map(&:to_s),
          "fields" => fields(klass),
          "relationships" => relationships(klass),
          "operations" => operations(klass)
        }
      end

      def fields(klass)
        klass.db_schema.sort.to_h do |name, descriptor|
          type = Types.parse(SEQUEL_TYPES.fetch(descriptor[:type], "T.untyped"))
          type = Type.new("optional", members: [type]) if descriptor[:allow_null]
          [name.to_s, { "name" => name.to_s, "type" => type.to_h }]
        end
      end

      def relationships(klass)
        klass.association_reflections.sort.to_h do |name, reflection|
          target = reflection.associated_class.name
          many = %i[one_to_many many_to_many].include?(reflection[:type])
          [name.to_s, {
            "name" => name.to_s,
            "kind" => many ? "many" : "one",
            "model" => target
          }]
        end
      end

      def operations(klass)
        klass.swill_data_operations.sort.to_h do |name, declaration|
          callable = operation_callable(klass, declaration)
          signature = signature_for(klass, callable, declaration)
          return_type = declaration["returns"] || signature&.fetch(:returns, nil)
          raise ArgumentError, "#{klass.name}.#{name} needs a signature or returns:" if return_type.nil?

          callable_parameters = callable.parameters
          callable_parameters = signature[:shape] if signature&.key?(:shape)
          parameters = callable_parameters.map do |kind, parameter|
            type = signature&.dig(:parameters, parameter) || Type.new("dynamic")
            { "name" => parameter.to_s, "kind" => kind.to_s, "type" => Types.dump(type) }
          end
          [name, declaration.merge(
            "parameters" => parameters,
            "returns" => Types.dump(return_type)
          ).reject { |key, _| key == "projection" && declaration["projection"].empty? }]
        end
      end

      def operation_callable(klass, declaration)
        name = declaration.fetch("name")
        case declaration.fetch("kind")
        when "command" then klass.instance_method(name)
        when "query" then klass.dataset.method(name)
        when "resolver" then klass.method(name)
        end
      rescue NameError
        raise ArgumentError, "missing #{declaration['kind']} implementation #{klass.name}.#{name}"
      end

      def signature_for(klass, callable, declaration)
        side = declaration["kind"] == "command" ? :instance : :class
        native = klass.respond_to?(:swill_signatures) && klass.swill_signatures[[side, declaration["name"].to_sym]]
        if native
          return {
            parameters: native.parameters.transform_values { |type| Types.normalize(type) },
            returns: Types.normalize(native.return_type)
          }
        end
        return unless defined?(T::Private::Methods)

        signature = T::Private::Methods.signature_for_method(callable)
        return unless signature

        parameters = signature.arg_types.to_h do |name, type|
          [name.to_sym, Types.parse(type.to_s)]
        end
        {
          parameters:,
          returns: Types.parse(signature.return_type.to_s),
          shape: signature.method.parameters
        }
      rescue StandardError
        nil
      end

      def deep_sort(value)
        case value
        when Hash then value.sort.to_h { |key, item| [key, deep_sort(item)] }
        when Array then value.map { |item| deep_sort(item) }
        else value
        end
      end

      def validate_schema!
        models.each_value do |model|
          model.fetch("relationships").each_value do |relationship|
            unless models.key?(relationship.fetch("model"))
              raise ArgumentError, "unknown related model #{relationship['model']}"
            end
          end
          model.fetch("operations").each_value do |operation|
            unsupported = operation.fetch("parameters").reject do |parameter|
              %w[req opt rest keyreq key keyrest].include?(parameter["kind"])
            end
            unless unsupported.empty?
              kinds = unsupported.map { |parameter| parameter["kind"] }.uniq.join(", ")
              raise ArgumentError, "#{model['name']}.#{operation['name']} uses unsupported remote parameter kinds: #{kinds}"
            end
            operation.fetch("parameters").each { |parameter| validate_type!(parameter.fetch("type")) }
            validate_type!(operation.fetch("returns"))
            validate_projection!(model, operation.fetch("projection", []))
          end
        end
      end

      def validate_type!(type)
        if %w[model model_ref].include?(type.fetch("kind")) && !models.key?(type["name"])
          raise ArgumentError, "unsupported protocol type #{type['name']}"
        end
        type.fetch("members", []).each { |member| validate_type!(member) }
      end

      def validate_projection!(model, projection)
        projection.each do |item|
          if item.is_a?(Hash)
            item.each do |name, nested|
              relationship = model.fetch("relationships")[name.to_s]
              raise ArgumentError, "unknown projection #{model['name']}.#{name}" unless relationship

              validate_projection!(models.fetch(relationship.fetch("model")), nested)
            end
          elsif !model.fetch("fields").key?(item.to_s) && !model.fetch("relationships").key?(item.to_s)
            raise ArgumentError, "unknown projection #{model['name']}.#{item}"
          end
        end
      end
    end
  end
end
