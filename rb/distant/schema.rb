# frozen_string_literal: true

require "digest"
require "json"

module Swill
  module Distant
    # A `Schema` is the protocol description of a set of server models: for
    # each model, its primary key, the fields with their types, the
    # associations with their kinds and targets, the writable fields, and the
    # signature and return type of every remote method; for each `Value` a
    # remote method returns, its fields. It is reflected from the models'
    # distant interfaces, their database columns, Sequel association
    # reflections and method signatures when the schema is created, and every
    # inconsistency between an interface and its model raises `ArgumentError`
    # then, before a browser connects. The schema is deterministic: its
    # `hash` is the same for the same models on any machine, so the generator
    # writes it into the client and the `Dispatcher` refuses a browser whose
    # hash differs.
    #
    # The connection and the generator each need one. `discover` collects the
    # loaded models that declare an interface:
    #
    #     run Swill::Distant::Connection.new(
    #       schema: Swill::Distant::Schema.discover,
    #       authenticate: ->(env) { MyApp.authenticate_data_connection(env) }
    #     )
    #
    # See [Server Data](rdoc-ref:doc/server_data.md).
    class Schema
      # The protocol primitive for each Sequel column type. A column type not
      # listed is reflected as `dynamic`.
      SEQUEL_TYPES = {
        integer: "Integer", float: "Float", decimal: "Float",
        string: "String", boolean: "Boolean", date: "Date",
        datetime: "Time", time: "Time"
      }.freeze

      # :section: Discovering Models
      # Which models a schema describes, and how each is found again.

      # Returns a schema of every loaded, named `Sequel::Model` subclass that
      # declares a distant interface, in name order; a schema of no models
      # when Sequel is not loaded or none declares one. `new` names the
      # models instead.
      def self.discover
        candidates = defined?(Sequel::Model) ? descendants(Sequel::Model) : []
        new(candidates.select { |klass| klass.name && Interface.of(klass) }.sort_by(&:name))
      end

      # Returns every subclass of `klass` at any depth, parents before their
      # children.
      def self.descendants(klass)
        klass.subclasses.flat_map { |subclass| [subclass, *descendants(subclass)] }
      end
      private_class_method :descendants

      # Creates a schema of `items`, each a model class or its interface, in
      # any mix. Reflects each model and validates the whole: raises
      # `ArgumentError` for a model without an interface or with a composite
      # primary key; a field that is neither a column nor explicitly typed,
      # or has no reader; a writable field that is not a field, is the
      # primary key, or has no writer; an association the model does not
      # define, of an unsupported type, or to a model outside the schema; a
      # remote method without an implementation, without a signature or
      # `returns:`, with a block parameter, or whose projection names an
      # unknown field; and a type naming a model or value the schema does not
      # hold.
      def initialize(items)
        pairs = items.map { |item| Interface.pair(item) }
        @classes = pairs.to_h { |klass, _| [klass.name, klass] }
        @models = pairs.to_h { |klass, interface| [klass.name, model_schema(klass, interface)] }.freeze
        @values = discover_values.freeze
        validate_schema!
      end

      # Returns the model class named `name`, a String or Symbol. Raises
      # `KeyError` when the schema does not hold it.
      def model_class(name)
        @classes.fetch(name.to_s)
      end

      # :section: The Payload
      # The schema as the protocol encodes it.

      # The model descriptions, a frozen Hash from model name to a Hash with
      # `"name"`, `"primary_key"` (a one-element array), `"fields"`,
      # `"associations"`, `"writable_fields"` (sorted) and
      # `"remote_methods"`, each of the last three keyed by name in sorted
      # order. A field has `"name"` and an encoded `"type"`; an association
      # `"name"`, `"kind"` (`"one"` or `"many"`), `"association"` (the Sequel
      # type) and `"model"`; a remote method its interface declaration with
      # `"parameters"` (each `"name"`, `"kind"` and `"type"`) and `"returns"`
      # encoded, and without `"projection"` when it is empty.
      attr_reader :models

      # The value descriptions, a frozen Hash from `Value` class name to a
      # Hash with `"name"` and `"fields"` (name to `"name"` and encoded
      # `"type"`), for every value a remote method's return type names,
      # directly or through another value's field; an empty Hash when none.
      attr_reader :values

      # Returns the payload the generator writes and the hash covers: a Hash
      # with `"protocol_version"`, `"models"` and `"values"`.
      def payload
        { "protocol_version" => PROTOCOL_VERSION, "models" => models, "values" => values }
      end

      # Returns the SHA-256 hex digest of the payload with its keys sorted at
      # every depth, so the same models give the same hash wherever the
      # schema is built. The generator writes it into the client, the
      # browser sends it in `HELLO`, and the dispatcher compares it.
      def hash
        Digest::SHA256.hexdigest(canonical_json)
      end

      # Returns the payload with `"schema_hash"` added, as the generator
      # writes to `schema.json`.
      def to_h
        payload.merge("schema_hash" => hash)
      end

      private

      # Returns the payload as JSON with keys sorted at every depth, the text
      # `hash` digests.
      def canonical_json
        JSON.generate(deep_sort(payload))
      end

      # Returns the description of `klass` from its `interface`, the entry
      # `models` holds under the class name. Raises `ArgumentError` when the
      # model's primary key is composite.
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

      # Returns the field descriptions of `klass`: the primary key and the
      # fields in `declaration`, sorted by name, each typed explicitly or
      # from its column through `SEQUEL_TYPES`, nilable when the column
      # allows null and no explicit type is given. Raises `ArgumentError` for
      # a bare name that is not a column.
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

      # Returns the association descriptions of `klass` from `declaration`,
      # sorted by name, each with its kind and target model read from the
      # Sequel reflection. Raises `ArgumentError` for an association the
      # model does not define or of an unsupported type.
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

      # Returns the remote method descriptions of `klass` from `interface`,
      # sorted by name: each declaration with its parameters typed from the
      # method's signature (`dynamic` where the signature gives none) and its
      # return type from `returns:` or the signature. Raises `ArgumentError`
      # when neither gives a return type.
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

      # Returns the Method or UnboundMethod a remote method `declaration`
      # exports on `klass`: an instance or class method for a command by its
      # target, a dataset method for a query, a class method for a resolver.
      # Raises `ArgumentError` when the method does not exist.
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

      # Returns the signature of `callable` as `{parameters:, returns:}` with
      # `Type` values — from a `Swill::Sig` signature recorded on `klass`
      # when there is one, otherwise from Sorbet's runtime signature, which
      # also supplies `shape:` (the method's parameter list) — or nil when
      # neither declares one or Sorbet cannot read it.
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

      # Returns `value` with every Hash's keys sorted, recursively, for
      # `canonical_json`.
      def deep_sort(value)
        case value
        when Hash then value.sort.to_h { |key, item| [key, deep_sort(item)] }
        when Array then value.map { |item| deep_sort(item) }
        else value
        end
      end

      # :section: Validating
      # The checks that make an interface's mistakes fail when the schema is
      # created rather than when a browser calls.

      # Checks every model description against its class and the rest of the
      # schema: writable fields are fields with writers and not the primary
      # key, fields have readers, a to-many association's `_controller`
      # helper collides with no client member, associations target models in
      # the schema, remote method parameters are of supported kinds, and
      # their types and projections are valid. Raises `ArgumentError` at the
      # first failure.
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

      # Returns the value descriptions for every `Value` class a remote
      # method's return type names, following members and value fields to
      # the values they name in turn, sorted by class name.
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

      # Checks that an encoded `type` and its members name only models and
      # values the schema holds. Raises `ArgumentError` otherwise.
      def validate_type!(type)
        if %w[model model_ref].include?(type.fetch("kind")) && !models.key?(type["name"])
          raise ArgumentError, "unsupported protocol type #{type['name']}"
        end
        if type.fetch("kind") == "value" && !values.key?(type["name"])
          raise ArgumentError, "unsupported protocol type #{type['name']}"
        end
        type.fetch("members", []).each { |member| validate_type!(member) }
      end

      # Checks that each name in `projection` is a field or association of
      # the `model` description, and each `{association: nested}` Hash names
      # an association whose nested projection is valid on its target.
      # Raises `ArgumentError` otherwise.
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

      # Checks `projection` against the return `type` it preloads, since a
      # return projection describes the result and not the method's model: a
      # model type is checked with `validate_projection!`, a wrapping type
      # checks each member, and a value type checks each field — a Hash
      # projection per named field, a list against every field. A scalar
      # type accepts nothing to preload. Raises `ArgumentError` for an
      # unknown name.
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
