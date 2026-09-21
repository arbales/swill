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
      rescue StandardError => e
        error_message(message, "operation_failed", e.message)
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
        when "GET" then hydrate(message)
        else raise RemoteError.new("unknown_message", "unknown message #{type}")
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
                  receiver = privacy_dataset(klass).with_pk!(message.fetch("id"))
                  reply = transaction(klass) do
                    returned = receiver.public_send(name, *arguments, **keywords)
                    Validator.result!(returned, declaration.fetch("returns"))
                    response(message, "RETURN", returned, declaration.fetch("projection", []), generation,
                             receiver: receiver)
                  end
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

      def response(message, type, value, projection, generation, receiver: nil)
        patches = []
        encoded = encode_value(value, projection, generation, patches)
        patches << patch(receiver, projection, generation, patches) if receiver && !projection.empty?
        envelope(message, type).merge("value" => encoded, "patches" => patches.uniq)
      end

      def encode_value(value, projection, generation, patches)
        if model_record?(value)
          patches << patch(value, projection, generation, patches)
          reference(value)
        elsif value.respond_to?(:all) && !value.is_a?(Array) && !value.is_a?(Hash)
          value.all.map { |item| encode_value(item, projection, generation, patches) }
        elsif value.is_a?(Array)
          value.map { |item| encode_value(item, projection, generation, patches) }
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
