# frozen_string_literal: true

module Swill
  module Distant
    # A `Dispatcher` executes the messages a browser sends over an
    # authenticated connection: it checks each against the `Schema`, runs
    # remote methods and writes under the connection's `Context`, and encodes
    # the reply with the records the message touched. The `Connection`
    # creates one per WebSocket from the authenticator's result and passes it
    # each unpacked frame; an application that serves the protocol over
    # another transport, or a test, drives one directly:
    #
    #     dispatcher = Swill::Distant::Dispatcher.new(
    #       schema: schema, viewer_context: nil, actor: nil, scope_token: "test"
    #     )
    #     dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION,
    #                     "schema_hash" => schema.hash)
    #     reply = dispatcher.call("type" => "QUERY", "request_id" => 1, "generation" => 1,
    #                             "model" => "Post", "name" => "search", "arguments" => ["swill"])
    #
    # A message is a Hash with a `"type"` and, after the handshake, a
    # `"request_id"` the reply repeats and a `"generation"` the browser uses
    # to order replies. The types are:
    #
    # - `HELLO` — the handshake, with `"protocol_version"` and
    #   `"schema_hash"`; answered `WELCOME` with the server's version, hash
    #   and `"actor_scope"`, or `schema_mismatch` when either differs. It
    #   must be the first message; any other before it is answered
    #   `handshake_required`.
    # - `QUERY`, `RESOLVE`, `COMMAND` — a remote method, with `"model"`,
    #   `"name"`, `"arguments"`, `"keywords"` and, for an instance command,
    #   `"id"`; a query is answered `RESULT`, the others `RETURN`, each with
    #   the encoded `"value"` and the `"patches"` of every record in it.
    # - `CREATE`, `UPDATE`, `DELETE` — a write, with `"model"`,
    #   `"attributes"` and, for update and delete, `"id"`; answered `RETURN`
    #   with a patch of the record's fields, or a nil value for a delete.
    # - `GET` — a demand for fields, with `"demands"` of `"model"`, `"id"`
    #   and `"fields"`; answered `RETURN` with a patch per record.
    #
    # A reply carrying effects the method recorded adds `"invalidations"`.
    # A message that fails is answered `ERROR` with an `"error"` of
    # `"code"`, `"message"` and optional `"details"`; the codes are listed
    # under `call`. See [Server Data](rdoc-ref:doc/server_data.md).
    class Dispatcher
      # A `RemoteError` is a failure the dispatcher answers as an `ERROR`
      # message with its `code`. The dispatcher and the `Validator` raise it
      # for a message that cannot be run; a remote method may raise one to
      # answer a code of its own.
      class RemoteError < StandardError
        # The error code sent to the browser, such as `"unknown_model"`.
        attr_reader :code

        # The structured `"details"` sent with the error, or nil.
        attr_reader :details

        # Creates an error with `code`, the human-readable `message`, and
        # optional `details`, a Hash the browser receives as given.
        def initialize(code, message, details: nil)
          @code = code
          @details = details
          super(message)
        end
      end

      # The `Context` every message on this connection runs under, created
      # from `new`'s `viewer_context`, `actor` and `scope_token`. Tests and
      # other callers that run a method outside `call` install it with
      # `Context#use`.
      attr_reader :context

      # Creates a dispatcher serving `schema` for a connection authenticated
      # as `actor` under `viewer_context` (nil without sequel-privacy) with
      # the opaque `scope_token`. The `Connection` passes the authenticator's
      # result as these keywords. The dispatcher answers nothing but `HELLO`
      # until the handshake succeeds.
      def initialize(schema:, viewer_context:, actor:, scope_token:)
        @schema = schema
        @context = Context.new(viewer_context:, actor:, scope_token:)
        @welcomed = false
      end

      # Runs `message`, a decoded Hash as `Protocol.unpack` returns it, and
      # returns the reply Hash for `Protocol.pack`. `HELLO` is answered at any
      # time; every other type runs under the context, with an empty effects
      # list, and is answered `handshake_required` before a successful
      # handshake. An exception in the message is answered `ERROR` rather
      # than raised, with the code `schema_mismatch`, `unknown_message`,
      # `unknown_model`, `unknown_operation`, `unknown_field`,
      # `wrong_operation_kind`, `invalid_attributes`, `invalid_arguments` or
      # `type_mismatch` for what the dispatcher and validator refuse;
      # `validation_failed` with the model's errors as details for
      # `Sequel::ValidationFailed`; `unauthorized` for a sequel-privacy error
      # or a delete the record's `allow?` denies; and `operation_failed` for
      # any other `StandardError`, whose message is sent to the browser.
      def call(message)
        type = message.fetch("type").to_s
        return hello(message) if type == "HELLO"
        raise RemoteError.new("handshake_required", "HELLO must be the first message") unless @welcomed

        context.use { dispatch(type, message) }
      rescue RemoteError => e
        error_message(message, e.code, e.message, e.details)
      rescue StandardError => e
        if validation_error?(e)
          details = e.respond_to?(:model) && e.model ? e.model.errors.to_hash : nil
          return error_message(message, "validation_failed", e.message, details)
        end
        code = privacy_error?(e) ? "unauthorized" : "operation_failed"
        error_message(message, code, e.message)
      end

      private

      # The `Schema` the connection serves.
      attr_reader :schema

      # :section: Running Messages
      # The handler for each message type, and the checks each performs.

      # Answers `HELLO`: compares the browser's protocol version and schema
      # hash with the server's and returns `WELCOME`, marking the handshake
      # done. Raises `schema_mismatch` when either differs.
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

      # Routes `message` by `type` to `operation`, `persist` or `hydrate`.
      # Raises `unknown_message` for any other type.
      def dispatch(type, message)
        case type
        when "QUERY", "RESOLVE", "COMMAND" then operation(type, message)
        when "CREATE", "UPDATE", "DELETE" then persist(type, message)
        when "GET" then hydrate(message)
        else raise RemoteError.new("unknown_message", "unknown message #{type}")
        end
      end

      # Runs a `CREATE`, `UPDATE` or `DELETE` on the model `message` names.
      # A create builds the record from the validated attributes and saves
      # it; an update fetches the record by `"id"` under the viewer context
      # and updates it; both run in a transaction and answer `RETURN` with a
      # patch of every field. A delete is handed to `destroy_record`. Raises
      # `unknown_model` for a model outside the schema; Sequel raises when
      # the id does not exist or validation fails.
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

      # Destroys the `klass` record `message` identifies, in a transaction,
      # and answers `RETURN` with a nil value and no patches. Raises
      # `unauthorized` when the record responds to `allow?` and denies
      # `:delete` to the viewer context.
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

      # Returns the attributes of a write as a symbol-keyed Hash, each
      # reference resolved to its record and each value checked against the
      # field's type. Raises `invalid_attributes` when `encoded` is not a
      # Hash or names a field the interface does not declare writable, with
      # the offending fields in details; the validator raises
      # `type_mismatch`.
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

      # Runs a `QUERY`, `RESOLVE` or `COMMAND`: finds the remote method
      # `message` names, resolves references in the arguments, validates them,
      # invokes the method on its receiver — the privacy-scoped dataset, the
      # class, or the instance fetched by `"id"` — validates the return value
      # and answers `RESULT` for a query or `RETURN` otherwise, with the
      # declared projection and, for an instance command, the receiver's
      # `changes`. A command runs in a transaction unless declared
      # `transaction: false`; a query's dataset result is loaded as an array.
      # Raises `unknown_model`, `unknown_operation`, or
      # `wrong_operation_kind` when the message type does not match the
      # method's kind; the validator raises `invalid_arguments` and
      # `type_mismatch`.
      def operation(type, message)
        model_name = message.fetch("model")
        name = message.fetch("name")
        model_schema = schema.models.fetch(model_name) do
          raise RemoteError.new("unknown_model", "unknown model #{model_name}")
        end
        declaration = model_schema.fetch("remote_methods").fetch(name) do
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
                             receiver: sequel_model?(receiver) ? receiver : nil,
                             changes: declaration.fetch("changes", []))
                  end
                  reply = declaration.fetch("transaction", true) ? transaction(klass, &invoke) : invoke.call
                  return reply
                end
        Validator.result!(value, declaration.fetch("returns"))
        response(message, expected == "query" ? "RESULT" : "RETURN", value,
                 declaration.fetch("projection", []), generation)
      end

      # Runs a `GET`: fetches each model's records together under the viewer
      # context, then patches the demanded fields and associations, with the
      # records an association reaches patched before their owner. Answers
      # `RETURN` with a nil value and the patches. Raises `unknown_field` for
      # a name the model's interface does not declare.
      def hydrate(message)
        generation = Integer(message.fetch("generation"))
        demands = message.fetch("demands").map do |demand|
          klass = schema.model_class(demand.fetch("model"))
          model_schema = schema.models.fetch(klass.name)
          allowed = model_schema.fetch("fields").keys + model_schema.fetch("associations").keys
          fields = demand.fetch("fields").map(&:to_s)
          unknown = fields - allowed
          raise RemoteError.new("unknown_field", "unknown field #{unknown.first}") unless unknown.empty?

          [klass, demand.fetch("id"), fields]
        end
        records = demands.group_by(&:first).to_h do |klass, group|
          dataset = privacy_dataset(klass)
          ids = group.map { |_, id, _| id }.uniq
          loaded = dataset.where(klass.qualified_primary_key => ids).all
          [klass, [dataset, loaded.to_h { |record| [record.pk.to_s, record] }]]
        end
        patches = demands.flat_map do |klass, id, fields|
          dataset, indexed = records.fetch(klass)
          # Retain Sequel's lookup semantics for missing or noncanonical ids.
          record = indexed.fetch(id.to_s) { dataset.with_pk!(id) }
          nested = []
          parent = patch(record, fields, generation, nested)
          nested << parent
          nested
        end
        envelope(message, "RETURN").merge("value" => nil, "patches" => patches)
      end

      # :section: Encoding Replies
      # How a reply carries the value, the records it references, and the
      # effects the method recorded.

      # Returns the reply of `type` to `message`: `value` encoded with
      # `projection`, the patches of every record encountered (and of
      # `receiver`'s `changes` when given), and the invalidations from the
      # context's effects when there are any. Duplicate patches are removed.
      def response(message, type, value, projection, generation, receiver: nil, changes: [])
        patches = []
        encoded = encode_value(value, projection, generation, patches)
        patches << patch(receiver, changes, generation, patches) if receiver && !changes.empty?
        invalidations = encode_effects(generation, patches)
        result = envelope(message, type).merge("value" => encoded, "patches" => patches.uniq)
        result["invalidations"] = invalidations unless invalidations.empty?
        result
      end

      # Appends a patch to `patches` for each record the context's `refresh`
      # effects name, with the refreshed fields, and returns the
      # invalidations for its `invalidate` effects, less any association the
      # same record refreshes. Each record is fetched again under the viewer
      # context, so a cached association cannot turn a refresh into a stale
      # or privileged membership; a record the viewer cannot see is skipped.
      # Raises `unknown_field` for a name the model's interface does not
      # declare, or an invalidated name that is not an association.
      def encode_effects(generation, patches)
        invalidations = []
        context.effects.group_by { |effect| [effect[:model], effect[:id]] }.each do |(model, id), effects|
          definition = schema.models.fetch(model)
          fields = definition.fetch("fields").keys
          associations = definition.fetch("associations").keys
          effects.each do |effect|
            allowed = effect[:kind] == :invalidate ? associations : fields + associations
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

      # Returns `value` as the wire carries it: a model record becomes a
      # `Protocol::Reference` with its `projection` patched into `patches`;
      # a dataset or Array encodes each item; a `Value` becomes
      # `{"$value" => [class name, fields]}` with each field encoded under
      # its part of the projection; anything else is returned as is.
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

      # Returns the patch for `record`: its model name, id, `generation` and
      # the fields `projection` names. A bare name reads the record's method
      # and, for an association, encodes the result with an empty
      # projection; an `{association: nested}` Hash encodes the associated
      # records with the nested projection. Records reached are patched into
      # `patches`.
      def patch(record, projection, generation, patches)
        fields = Array(projection).each_with_object({}) do |item, result|
          if item.is_a?(Hash)
            item.each do |association, nested|
              value = record.public_send(association)
              result[association.to_s] = encode_value(value, nested, generation, patches)
            end
          else
            name = item.to_s
            value = record.public_send(item)
            association = schema.models.dig(record.class.name, "associations", name)
            result[name] = association ? encode_value(value, [], generation, patches) : value
          end
        end
        {
          "model" => record.class.name,
          "id" => record.pk.to_s,
          "generation" => generation,
          "fields" => fields
        }
      end

      # Returns the `Protocol::Reference` to `record`, by class name and
      # primary key as a string.
      def reference(record)
        Protocol::Reference.new(record.class.name, record.pk.to_s)
      end

      # Returns true when `value` is a `Sequel::Model` instance.
      def model_record?(value)
        defined?(Sequel::Model) && value.is_a?(Sequel::Model)
      end

      # :section: Privacy and Persistence
      # Where the viewer context enters, and how records are fetched, built
      # and written.

      # Returns the dataset of `klass` scoped to the viewer context through
      # `for_vc` when the model provides it, or its plain dataset.
      def privacy_dataset(klass)
        klass.respond_to?(:for_vc) ? klass.for_vc(context.viewer_context) : klass.dataset
      end

      # Returns true when `error` is a sequel-privacy `Unauthorized` or
      # `FieldUnauthorized`, which `call` answers as `unauthorized`; false
      # when sequel-privacy is not loaded.
      # Whether `error` is Sequel's validation failure; false without Sequel.
      def validation_error?(error)
        defined?(Sequel::ValidationFailed) && error.is_a?(Sequel::ValidationFailed)
      end

      # Whether `value` is a Sequel model instance; false without Sequel.
      def sequel_model?(value)
        defined?(Sequel::Model) && value.is_a?(Sequel::Model)
      end

      def privacy_error?(error)
        return false unless defined?(Sequel::Privacy)
        %i[Unauthorized FieldUnauthorized].filter_map do |name|
          Sequel::Privacy.const_get(name, false) if Sequel::Privacy.const_defined?(name, false)
        end.any? do |type|
          error.is_a?(type)
        end
      end

      # Returns a new, unsaved `klass` record with `attributes`, built through
      # the privacy-scoped dataset's `new` when it has one, so the record
      # carries the viewer context, and through the class otherwise.
      def build_record(klass, attributes)
        dataset = privacy_dataset(klass)
        dataset.respond_to?(:new) ? dataset.new(attributes) : klass.new(attributes)
      end

      # Returns `value` with each `Protocol::Reference` replaced by the record
      # it names, fetched under the viewer context, recursively through
      # Arrays (with `type`'s member type) and Hashes. Sequel raises when a
      # referenced record does not exist or the viewer cannot see it.
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

      # Runs `block` in a transaction on `klass`'s database and returns its
      # value.
      def transaction(klass, &block)
        klass.db.transaction(&block)
      end

      # Returns the start of a reply of `type` to `message`, repeating its
      # request id.
      def envelope(message, type)
        { "type" => type, "request_id" => message["request_id"] }
      end

      # Returns the `ERROR` reply to `message` with `code`, `text` and
      # `details` when given.
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
