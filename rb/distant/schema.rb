# frozen_string_literal: true

require "digest"
require "json"

module Swill
  module Distant
    # Deterministic protocol schema reflected from loaded Sequel models.
    class Schema
      SEQUEL_TYPES = {
        integer: "Integer", float: "Float", decimal: "Float",
        string: "String", boolean: "Boolean", date: "Date",
        datetime: "Time", time: "Time"
      }.freeze

      attr_reader :models, :values

      # Each loaded model that has a distant interface.
      def self.discover
        candidates = defined?(Sequel::Model) ? descendants(Sequel::Model) : []
        new(candidates.select { |klass| klass.name && Interface.of(klass) }.sort_by(&:name))
      end

      def self.descendants(klass)
        klass.subclasses.flat_map { |subclass| [subclass, *descendants(subclass)] }
      end

      # +items+ are models, their interfaces, or a mix of both.
      def initialize(items)
        pairs = items.map { |item| Interface.pair(item) }
        @classes = pairs.to_h { |klass, _| [klass.name, klass] }
        @models = pairs.to_h { |klass, interface| [klass.name, model_schema(klass, interface)] }.freeze
        @values = discover_values.freeze
        validate_schema!
      end

      def model_class(name)
        @classes.fetch(name.to_s)
      end

      def payload
        { "protocol_version" => PROTOCOL_VERSION, "models" => models, "values" => values }
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

      def model_schema(klass, interface)
        if Array(klass.primary_key).length != 1
          raise ArgumentError, "#{klass.name} must have one primary key in protocol v1"
        end

        declaration = interface.declaration
        {
          "name" => klass.name,
          "primary_key" => Array(klass.primary_key).map(&:to_s),
          "fields" => fields(klass, declaration),
          "associations" => associations(klass, declaration),
          "writable_fields" => declaration.fetch("writable").sort,
          "remote_methods" => remote_methods(klass, interface)
        }
      end

      def fields(klass, declaration)
        names = (Array(klass.primary_key).map(&:to_s) + declaration.fetch("fields")).uniq.sort
        names.to_h do |field|
          name = field.to_sym
          explicit = declaration.fetch("field_types", {})[field]
          descriptor = klass.db_schema[name]
          raise ArgumentError, "unknown client field #{klass.name}.#{field}" unless descriptor || explicit
          type = explicit || Types.parse(SEQUEL_TYPES.fetch(descriptor[:type], "T.untyped"))
          type = Type.new("optional", members: [type]) if descriptor && descriptor[:allow_null] && !explicit
          [field, { "name" => field, "type" => type.to_h }]
        end
      end

      def associations(klass, declaration)
        declaration.fetch("associations").sort.to_h do |association|
          name = association.to_sym
          reflection = klass.association_reflections[name]
          raise ArgumentError, "unknown client association #{klass.name}.#{association}" unless reflection

          target = reflection.associated_class.name
          type = reflection[:type].to_s
          unless %w[many_to_one one_to_one one_to_many many_to_many one_through_one].include?(type)
            raise ArgumentError, "unsupported client association #{klass.name}.#{association}: #{type}"
          end

          many = reflection.returns_array?
          [association, {
            "name" => association,
            "kind" => many ? "many" : "one",
            "association" => type,
            "model" => target
          }]
        end
      end

      def remote_methods(klass, interface)
        interface.remote_methods.sort.to_h do |name, declaration|
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
        when "command"
          declaration.fetch("target", "instance") == "class" ? klass.method(name) : klass.instance_method(name)
        when "query" then klass.dataset.method(name)
        when "resolver" then klass.method(name)
        end
      rescue NameError
        raise ArgumentError, "missing #{declaration['kind']} implementation #{klass.name}.#{name}"
      end

      def signature_for(klass, callable, declaration)
        side = declaration["kind"] == "command" && declaration.fetch("target", "instance") == "instance" ? :instance : :class
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

        positional = signature.arg_types.to_h
        keywords = signature.kwarg_types
        parameters = signature.method.parameters.to_h do |kind, name|
          type = case kind
                 when :rest then signature.rest_type
                 when :keyrest then signature.keyrest_type
                 when :block then signature.block_type
                 when :key, :keyreq then keywords[name]
                 else positional[name]
                 end
          [name, type ? Types.parse(type.to_s) : Type.new("dynamic")]
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
          primary_keys = model.fetch("primary_key")
          writable = model.fetch("writable_fields")
          unknown_writable = writable - model.fetch("fields").keys
          raise ArgumentError, "unknown writable field #{model['name']}.#{unknown_writable.first}" unless unknown_writable.empty?
          primary_writable = writable & primary_keys
          raise ArgumentError, "primary key is not writable: #{model['name']}.#{primary_writable.first}" unless primary_writable.empty?
          klass = model_class(model.fetch("name"))
          model.fetch("fields").each_key do |field|
            unless klass.method_defined?(field.to_sym)
              raise ArgumentError, "client field has no reader: #{model['name']}.#{field}"
            end
          end
          writable.each do |field|
            unless klass.method_defined?("#{field}=")
              raise ArgumentError, "writable client field has no writer: #{model['name']}.#{field}"
            end
          end

          client_names = model.fetch("fields").keys + model.fetch("associations").keys + model.fetch("remote_methods").keys
          model.fetch("associations").each_value do |association|
            helper = "#{association['name']}_controller"
            if association["kind"] == "many" && client_names.include?(helper)
              raise ArgumentError, "association controller conflicts with client member #{model['name']}.#{helper}"
            end
            unless models.key?(association.fetch("model"))
              raise ArgumentError, "unknown related model #{association['model']}"
            end
          end
          model.fetch("remote_methods").each_value do |operation|
            unsupported = operation.fetch("parameters").reject do |parameter|
              %w[req opt rest keyreq key keyrest].include?(parameter["kind"])
            end
            unless unsupported.empty?
              kinds = unsupported.map { |parameter| parameter["kind"] }.uniq.join(", ")
              raise ArgumentError, "#{model['name']}.#{operation['name']} uses unsupported remote parameter kinds: #{kinds}"
            end
            operation.fetch("parameters").each { |parameter| validate_type!(parameter.fetch("type")) }
            validate_type!(operation.fetch("returns"))
            validate_projection!(model, operation.fetch("changes", []))
            validate_return_projection!(operation.fetch("returns"), operation.fetch("projection", []))
          end
        end
      end

      def discover_values
        found = {}
        pending = models.values.flat_map do |model|
          model.fetch("remote_methods").values.map { |operation| operation.fetch("returns") }
        end
        until pending.empty?
          type = pending.pop
          pending.concat(type.fetch("members", []))
          next unless type["kind"] == "value"
          klass = ::Object.const_get(type.fetch("name"))
          next if found.key?(klass.name)
          fields = klass.fields.to_h do |name, field_type|
            dumped = Types.dump(field_type)
            pending << dumped
            [name, {"name" => name, "type" => dumped}]
          end
          found[klass.name] = {"name" => klass.name, "fields" => fields}
        end
        found.sort.to_h
      end

      def validate_type!(type)
        if %w[model model_ref].include?(type.fetch("kind")) && !models.key?(type["name"])
          raise ArgumentError, "unsupported protocol type #{type['name']}"
        end
        if type.fetch("kind") == "value" && !values.key?(type["name"])
          raise ArgumentError, "unsupported protocol type #{type['name']}"
        end
        type.fetch("members", []).each { |member| validate_type!(member) }
      end

      def validate_projection!(model, projection)
        projection.each do |item|
          if item.is_a?(Hash)
            item.each do |name, nested|
              association = model.fetch("associations")[name.to_s]
              raise ArgumentError, "unknown projection #{model['name']}.#{name}" unless association

              validate_projection!(models.fetch(association.fetch("model")), nested)
            end
          elsif !model.fetch("fields").key?(item.to_s) && !model.fetch("associations").key?(item.to_s)
            raise ArgumentError, "unknown projection #{model['name']}.#{item}"
          end
        end
      end

      # A return projection follows the declared result, not the method's owner.
      def validate_return_projection!(type, projection)
        return if projection.empty?

        case type.fetch("kind")
        when "model", "model_ref"
          validate_projection!(models.fetch(type.fetch("name")), projection)
        when "optional", "array", "result_set", "union"
          type.fetch("members").each { |member| validate_return_projection!(member, projection) }
        when "value"
          fields = values.fetch(type.fetch("name")).fetch("fields")
          if projection.is_a?(Hash)
            projection.each do |name, nested|
              field = fields[name.to_s]
              raise ArgumentError, "unknown value projection #{type['name']}.#{name}" unless field
              validate_return_projection!(field.fetch("type"), nested)
            end
          else
            fields.each_value { |field| validate_return_projection!(field.fetch("type"), projection) }
          end
        # Scalars carry their own value, with no fields to preload.
        end
      end
    end
  end
end
