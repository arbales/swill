# frozen_string_literal: true

module Swill
  module Data
    # Executes schema-declared messages under one authenticated connection.
    class Dispatcher
      class RemoteError < StandardError
        attr_reader :code, :details

        def initialize(code, message, details: nil)
          @code = code
          @details = details
          super(message)
        end
      end

      attr_reader :schema, :context

      def initialize(schema:, viewer_context:, actor:, scope_token:)
        @schema = schema
        @context = Context.new(viewer_context:, actor:, scope_token:)
        @welcomed = false
      end

      def call(message)
        type = message.fetch("type").to_s
        return hello(message) if type == "HELLO"
        raise RemoteError.new("handshake_required", "HELLO must be the first message") unless @welcomed

        context.use { dispatch(type, message) }
      rescue RemoteError => e
        error_message(message, e.code, e.message, e.details)
      rescue Sequel::ValidationFailed => e
        details = e.respond_to?(:model) && e.model ? e.model.errors.to_hash : nil
        error_message(message, "validation_failed", e.message, details)
      rescue StandardError => e
        code = privacy_error?(e) ? "unauthorized" : "operation_failed"
        error_message(message, code, e.message)
      end

      private

      def hello(message)
        unless message["protocol_version"] == PROTOCOL_VERSION && message["schema_hash"] == schema.hash
          raise RemoteError.new("schema_mismatch", "client and server data schemas differ")
        end

        @welcomed = true
        {
          "type" => "WELCOME",
          "protocol_version" => PROTOCOL_VERSION,
          "schema_hash" => schema.hash,
          "actor_scope" => context.scope_token
        }
      end

      def dispatch(type, message)
        case type
        when "QUERY", "RESOLVE", "COMMAND" then operation(type, message)
        when "CREATE", "UPDATE", "DELETE" then persist(type, message)
        when "GET" then hydrate(message)
        else raise RemoteError.new("unknown_message", "unknown message #{type}")
        end
      end

      def persist(type, message)
        model_name = message.fetch("model")
        model_schema = schema.models.fetch(model_name) do
          raise RemoteError.new("unknown_model", "unknown model #{model_name}")
        end
        klass = schema.model_class(model_name)
        generation = Integer(message.fetch("generation"))

        return destroy_record(klass, message) if type == "DELETE"

        attributes = validated_attributes(model_schema, message.fetch("attributes", {}))
        transaction(klass) do
          record = if type == "CREATE"
                     build_record(klass, attributes)
                   else
                     privacy_dataset(klass).with_pk!(message.fetch("id"))
                   end
          type == "CREATE" ? record.save : record.update(attributes)
          response(message, "RETURN", record, model_schema.fetch("fields").keys, generation)
        end
      end

      def destroy_record(klass, message)
        transaction(klass) do
          record = privacy_dataset(klass).with_pk!(message.fetch("id"))
          if record.respond_to?(:allow?) && !record.allow?(context.viewer_context, :delete)
            raise RemoteError.new("unauthorized", "Cannot delete #{klass}")
          end
          record.destroy
          response(message, "RETURN", nil, [], Integer(message.fetch("generation")))
        end
      end

      def validated_attributes(model_schema, encoded)
        unless encoded.is_a?(Hash)
          raise RemoteError.new("invalid_attributes", "attributes must be a map")
        end
        allowed = model_schema.fetch("writable_fields")
        unknown = encoded.keys.map(&:to_s) - allowed
        unless unknown.empty?
          raise RemoteError.new("invalid_attributes", "field is not client-writable",
                                details: { "fields" => unknown.sort })
        end
        encoded.to_h do |name, value|
          field = model_schema.fetch("fields").fetch(name.to_s)
          resolved = resolve_argument(value, field.fetch("type"))
          Validator.value!(resolved, field.fetch("type"), "attribute #{name}")
          [name.to_sym, resolved]
        end
      end

      def operation(type, message)
        model_name = message.fetch("model")
        name = message.fetch("name")
        model_schema = schema.models.fetch(model_name) do
          raise RemoteError.new("unknown_model", "unknown model #{model_name}")
        end
        declaration = model_schema.fetch("operations").fetch(name) do
          raise RemoteError.new("unknown_operation", "unknown operation #{model_name}.#{name}")
        end
        expected = { "QUERY" => "query", "RESOLVE" => "resolver", "COMMAND" => "command" }.fetch(type)
        unless declaration["kind"] == expected
          raise RemoteError.new("wrong_operation_kind", "#{model_name}.#{name} is not a #{expected}")
        end

        generation = Integer(message.fetch("generation"))
        parameters = declaration.fetch("parameters")
        raw_arguments = message.fetch("arguments", [])
        bindings = Validator.positional_parameters!(declaration, raw_arguments.length)
        arguments = raw_arguments.each_with_index.map do |value, index|
          parameter = bindings[index]
          resolve_argument(value, parameter&.fetch("type", nil))
        end
        keywords = message.fetch("keywords", {}).to_h do |key, value|
          parameter = parameters.find { |item| item["name"] == key.to_s }
          [key.to_sym, resolve_argument(value, parameter&.fetch("type", nil))]
        end
        Validator.arguments!(declaration, arguments, keywords)
        klass = schema.model_class(model_name)
        value = case expected
                when "query"
                  dataset = privacy_dataset(klass)
                  queried = dataset.public_send(name, *arguments, **keywords)
                  defined?(Sequel::Dataset) && queried.is_a?(Sequel::Dataset) ? queried.all : queried
                when "resolver"
                  klass.public_send(name, *arguments, **keywords)
                when "command"
                  receiver = if declaration.fetch("target", "instance") == "class"
                               klass
                             else
                               privacy_dataset(klass).with_pk!(message.fetch("id"))
                             end
                  invoke = proc do
                    returned = receiver.public_send(name, *arguments, **keywords)
                    Validator.result!(returned, declaration.fetch("returns"))
                    response(message, "RETURN", returned, declaration.fetch("projection", []), generation,
                             receiver: receiver.is_a?(Sequel::Model) ? receiver : nil,
                             changes: declaration.fetch("changes", []))
                  end
                  reply = declaration.fetch("transaction", true) ? transaction(klass, &invoke) : invoke.call
                  return reply
                end
        Validator.result!(value, declaration.fetch("returns"))
        response(message, expected == "query" ? "RESULT" : "RETURN", value,
                 declaration.fetch("projection", []), generation)
      end

      def hydrate(message)
        generation = Integer(message.fetch("generation"))
        patches = message.fetch("demands").flat_map do |demand|
          klass = schema.model_class(demand.fetch("model"))
          model_schema = schema.models.fetch(klass.name)
          allowed = model_schema.fetch("fields").keys + model_schema.fetch("relationships").keys
          fields = demand.fetch("fields").map(&:to_s)
          unknown = fields - allowed
          raise RemoteError.new("unknown_field", "unknown field #{unknown.first}") unless unknown.empty?

          record = privacy_dataset(klass).with_pk!(demand.fetch("id"))
          nested = []
          parent = patch(record, fields, generation, nested)
          nested << parent
          nested
        end
        envelope(message, "RETURN").merge("value" => nil, "patches" => patches)
      end

      def response(message, type, value, projection, generation, receiver: nil, changes: [])
        patches = []
        encoded = encode_value(value, projection, generation, patches)
        patches << patch(receiver, changes, generation, patches) if receiver && !changes.empty?
        invalidations = encode_effects(generation, patches)
        result = envelope(message, type).merge("value" => encoded, "patches" => patches.uniq)
        result["invalidations"] = invalidations unless invalidations.empty?
        result
      end

      # Re-fetch under the current viewer context so cached associations cannot
      # turn a declared refresh into a stale or privileged membership patch.
      def encode_effects(generation, patches)
        invalidations = []
        context.effects.group_by { |effect| [effect[:model], effect[:id]] }.each do |(model, id), effects|
          definition = schema.models.fetch(model)
          fields = definition.fetch("fields").keys
          relationships = definition.fetch("relationships").keys
          effects.each do |effect|
            allowed = effect[:kind] == :invalidate ? relationships : fields + relationships
            unknown = effect[:fields] - allowed
            unless unknown.empty?
              raise RemoteError.new("unknown_field", "unknown effect field #{model}.#{unknown.first}")
            end
          end
          record = privacy_dataset(schema.model_class(model)).with_pk(id)
          next unless record

          refresh = effects.select { |effect| effect[:kind] == :refresh }.flat_map { |effect| effect[:fields] }.uniq
          stale = effects.select { |effect| effect[:kind] == :invalidate }
          stale = stale.flat_map { |effect| effect[:fields] }.uniq - refresh
          patches << patch(record, refresh, generation, patches) unless refresh.empty?
          unless stale.empty?
            invalidations << { "model" => model, "id" => id, "generation" => generation, "fields" => stale }
          end
        end
        invalidations
      end

      def encode_value(value, projection, generation, patches)
        if model_record?(value)
          patches << patch(value, projection, generation, patches)
          reference(value)
        elsif value.respond_to?(:all) && !value.is_a?(Array) && !value.is_a?(Hash)
          value.all.map { |item| encode_value(item, projection, generation, patches) }
        elsif value.is_a?(Array)
          value.map { |item| encode_value(item, projection, generation, patches) }
        elsif value.is_a?(Value)
          fields = schema.values.fetch(value.class.name).fetch("fields")
          encoded = fields.to_h do |name, field|
            item_projection = projection.is_a?(Hash) ? projection.fetch(name, projection.fetch(name.to_sym, [])) : projection
            [name, encode_value(value.public_send(name), item_projection, generation, patches)]
          end
          {"$value" => [value.class.name, encoded]}
        else
          value
        end
      end

      def patch(record, projection, generation, patches)
        fields = Array(projection).each_with_object({}) do |item, result|
          if item.is_a?(Hash)
            item.each do |relationship, nested|
              value = record.public_send(relationship)
              result[relationship.to_s] = encode_value(value, nested, generation, patches)
            end
          else
            name = item.to_s
            value = record.public_send(item)
            relationship = schema.models.dig(record.class.name, "relationships", name)
            result[name] = relationship ? encode_value(value, [], generation, patches) : value
          end
        end
        {
          "model" => record.class.name,
          "id" => record.pk.to_s,
          "generation" => generation,
          "fields" => fields
        }
      end

      def reference(record)
        Protocol::Reference.new(record.class.name, record.pk.to_s)
      end

      def model_record?(value)
        defined?(Sequel::Model) && value.is_a?(Sequel::Model)
      end

      def privacy_dataset(klass)
        klass.respond_to?(:for_vc) ? klass.for_vc(context.viewer_context) : klass.dataset
      end

      def privacy_error?(error)
        return false unless defined?(Sequel::Privacy)
        %i[Unauthorized FieldUnauthorized].filter_map do |name|
          Sequel::Privacy.const_get(name, false) if Sequel::Privacy.const_defined?(name, false)
        end.any? do |type|
          error.is_a?(type)
        end
      end

      # sequel-privacy datasets attach their viewer context through #new.
      # Plain Sequel datasets construct records through the model class.
      def build_record(klass, attributes)
        dataset = privacy_dataset(klass)
        dataset.respond_to?(:new) ? dataset.new(attributes) : klass.new(attributes)
      end

      def resolve_argument(value, type)
        if value.is_a?(Protocol::Reference)
          klass = schema.model_class(value.model)
          return privacy_dataset(klass).with_pk!(value.id)
        end
        if value.is_a?(Array)
          member = type&.fetch("members", [])&.first
          return value.map { |item| resolve_argument(item, member) }
        end
        return value.transform_values { |item| resolve_argument(item, nil) } if value.is_a?(Hash)

        value
      end

      def transaction(klass, &block)
        klass.db.transaction(&block)
      end

      def envelope(message, type)
        { "type" => type, "request_id" => message["request_id"] }
      end

      def error_message(message, code, text, details = nil)
        envelope(message || {}, "ERROR").merge("error" => {
                                                 "code" => code,
                                                 "message" => text,
                                                 **(details ? { "details" => details } : {})
                                               })
      end
    end
  end
end
