# typed: true
# frozen_string_literal: true

module Swill
  module Distant
    # `Swill::Distant::Client` is the browser's end of a Distant Objects
    # connection. Its default context holds one object per `(model, id)`, so every
    # query, association, patch and write that names a record updates the same
    # object; it batches the fields read in one turn into one request; and it
    # applies each response — the value, the patches for every record it
    # touched, and the invalidations — before handing the value back. The
    # runtime supplies the WebSocket; the client owns what comes over it.
    #
    # An application configures the shared client once, in its
    # `Application#initialize`, and otherwise works through its distant
    # objects:
    #
    #     Swill::Distant::Client.configure(url: "/data", schema_hash: MyApp::DataSchema::HASH)
    #
    # See [Models](rdoc-ref:doc/models.md) for the client side of Distant
    # Objects and [Server Data](rdoc-ref:doc/server_data.md) for the server.
    class Client < Swill::Object
      extend T::Sig

      # Milliseconds between failed attempts, capped during prolonged outages.
      RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000].freeze
      # Spread simultaneous reconnects by ten percent in either direction.
      RETRY_JITTER = 0.1

      # Returns the client the application shares: every distant object's
      # queries, writes and field loads go through it.
      sig { returns(T.attached_class) }
      def self.default
        @default ||= new
      end

      # Names the connection the runtime opens: `url` is the path the server
      # mounted `Swill::Distant::Connection` at, and `schema_hash` the
      # `DataSchema::HASH` the generator wrote. Called once, before the first
      # remote method; the handshake fails with `schema_mismatch` when the hash is
      # not the server's.
      sig { params(url: String, schema_hash: String).void }
      def self.configure(url:, schema_hash:)
        default
        Runtime.configure_data(url, schema_hash)
      end

      # Creates the identity store and observes the transport. Transient loss
      # leaves local objects intact; only an intentional reset forgets them.
      sig { void }
      def initialize
        super
        @context = Context.default
        @tombstones = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @queued_demands = T.let({}, T::Hash[String, T.untyped])
        @demand_scheduled = T.let(false, T::Boolean)
        @actor_scope = T.let(nil, T.nilable(String))
        @generation = T.let(0, Integer)
        @active_generations = T.let([], T::Array[Integer])
        @retry_timer = T.let(nil, T.nilable(Integer))
        @retry_attempt = T.let(0, Integer)
        @connection_detail = T.let("", String)
        NotificationCenter.default.add_observer("application_did_launch", ->(_note) { present_connection })
        NotificationCenter.default.add_observer("application_will_terminate", ->(_note) { Runtime.close_data })
        Runtime.register_data_lifecycle(-> { reset }, -> { connection_opened },
                                        ->(state, detail) { connection_changed(state, detail) })
      end

      # The handshake, rather than the socket alone, determines readiness.
      # idle, connecting, connected, disconnected, or reload_required.
      property :connection_state, type: String, default: "idle"

      # Tries immediately, sharing an attempt already in progress. Failed
      # operations are never replayed; a successful handshake resumes field loads.
      sig { returns(T::Boolean) }
      async def reconnect
        return false if connection_state == "reload_required"
        cancel_retry
        begin
          await Runtime.connect_data
          true
        rescue => _error
          false
        end
      end

      sig { params(state: String, detail: String).void }
      def connection_changed(state, detail) # :nodoc:
        cancel_retry
        self.connection_state = state
        @connection_detail = detail
        @retry_attempt = 0 if state == "connected" || state == "idle"
        if state == "disconnected"
          delays = T.let(RETRY_DELAYS, T::Array[Integer])
          delay = T.must(delays[[@retry_attempt, delays.length - 1].min])
          @retry_attempt += 1
          jittered = T.let(delay * (1 - RETRY_JITTER + Math.random() * RETRY_JITTER * 2), Float)
          @retry_timer = setTimeout(-> { reconnect }, jittered.round)
        end
        present_connection
      end

      sig { void }
      def present_connection # :nodoc:
        return unless Application.running?

        app = Application.shared
        app.connection_changed(connection_state, @connection_detail, -> { reconnect })
      end

      sig { void }
      def cancel_retry # :nodoc:
        timer = @retry_timer
        clearTimeout(timer) if timer
        @retry_timer = nil
      end

      # :section: Called by Generated Models
      # The remote methods and writes a generated model's methods call: each
      # sends one message, applies the response's patches and invalidations
      # to the objects the client holds, and returns the decoded value. An
      # application calls the generated methods, not these.

      # Sends a `QUERY` for the query `name` of `model` with `positional` and
      # `keywords` arguments, and returns its result: a `ResultSet` when
      # `result_kind` is `"result_set"`, the decoded value otherwise. Raises
      # the server's error when the query fails.
      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def query(model, name, positional, keywords, result_kind)
        value = await request("QUERY", operation(model, name, positional, keywords), nil, false)
        wrap_result(value, result_kind)
      end

      # Sends a `RESOLVE` for the resolver `name` of `model`, as `query` does
      # for a query.
      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def resolve(model, name, positional, keywords, result_kind)
        value = await request("RESOLVE", operation(model, name, positional, keywords), nil, false)
        wrap_result(value, result_kind)
      end

      # Sends a `COMMAND` for the command `name` on `object`, identified by
      # its model and id, and returns the result as `query` does. The
      # response updates confirmed values without erasing local edits.
      sig do
        params(object: Object, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def command(object, name, positional, keywords, result_kind)
        Context.refuse("Commands in an isolated editing context are not supported yet") if object.context.parent
        contents = operation(object.class.data_model_name, name, positional, keywords)
        contents["id"] = object.id
        value = await request("COMMAND", contents, nil, true)
        wrap_result(value, result_kind)
      end

      # Sends a `COMMAND` for the class command `name` of `model`, one with no
      # receiving record, and returns the result as `command` does.
      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def class_command(model, name, positional, keywords, result_kind)
        value = await request("COMMAND", operation(model, name, positional, keywords), nil, true)
        wrap_result(value, result_kind)
      end

      # Sends a `CREATE` of `object`'s model with `attributes`, and returns
      # `object`, which becomes the canonical instance for the id the server
      # assigns: the response's reference to the new record is bound to it
      # rather than to a new object. `Object#save` calls this for an object
      # with no id.
      sig { params(object: Object, attributes: T::Hash[T.untyped, T.untyped]).returns(Object) }
      async def create(object, attributes)
        await request("CREATE", {
          "model" => object.class.data_model_name,
          "attributes" => encode_value(attributes)
        }, object, true)
        object
      end

      # Sends an `UPDATE` of `object` with `attributes`, applies the response
      # as an acknowledgement, and returns `object`. `Object#save` calls this.
      sig { params(object: Object, attributes: T::Hash[T.untyped, T.untyped]).returns(Object) }
      async def update(object, attributes)
        await request("UPDATE", {
          "model" => object.class.data_model_name,
          "id" => object.id,
          "attributes" => encode_value(attributes)
        }, object, true)
        object
      end

      # Sends a `DELETE` of `object`, forgets it, marks it deleted, drops its
      # queued demands, deallocs it, and returns it. The object is kept as a
      # tombstone for as long as a request older than the deletion is in
      # flight, so that such a response resolves to the deleted object rather
      # than to a new one. `Object#delete` calls this.
      sig { params(object: Object).returns(Object) }
      async def delete(object)
        model = object.class.data_model_name
        id = object.id.to_s
        _value, removed_generation = await request_with_generation("DELETE", {
          "model" => model, "id" => id
        }, nil, true)
        @context.forget(object)
        model_tombstones(model)[id] = {"object" => object, "generation" => removed_generation}
        object.deleted = true
        object.mark_clean!
        @queued_demands.delete("#{model}:#{id}")
        object.dealloc
        prune_tombstones
        object
      end

      # :section: Called by Distant Objects
      # What a distant object asks for when a field is read or loaded.

      # Queues a load of the field `name` on `object`, joining every other
      # field demanded in this JavaScript turn into one `GET`. Does nothing
      # for an unsaved object, or for a field already loaded or loading;
      # `Object#begin_data_field_load` decides, and marks the field loading.
      # `Object#property_will_access` calls this when an unloaded field of a
      # saved object is read.
      sig { params(object: Object, name: String).void }
      def demand(object, name)
        return unless object.id
        return unless object.begin_data_field_load(name, false)
        model = object.class.data_model_name
        key = "#{model}:#{object.id}"
        item = @queued_demands[key]
        unless item
          item = {"object" => object, "fields" => []}
          @queued_demands[key] = item
        end
        fields = T.cast(item["fields"], T::Array[String])
        fields << name unless fields.include?(name)
        schedule_demands
      end

      # Loads the field `name` on `object` with its own `GET` and returns its
      # value; returns the current value without a request when the field is
      # loaded and not stale, unless `reload` is true. Raises when the
      # request fails, after `Object#fail_data_field` has recorded the
      # failure. `Object#load_field` and `Object#reload_field` call this.
      sig { params(object: Object, name: String, reload: T::Boolean).returns(T.untyped) }
      async def load_field(object, name, reload)
        if !reload && Runtime.read(object, "#{name}_loaded") == true && Runtime.read(object, "#{name}_stale") != true
          return Runtime.read(object, name)
        end
        object.begin_data_field_load(name, true)
        await request("GET", {"demands" => [demand_hash(object, [name])]}, nil, false)
        Runtime.read(object, name)
      end

      # :section: Called by the Runtime
      # The connection's lifecycle, as the runtime reports it.

      # Forgets every object the client holds: each has its fields reset to
      # unloaded and deallocs, which releases its association controllers, and
      # queued demands and tombstones are dropped. The runtime calls this when
      # the connection is intentionally closed or the handshake changes actor
      # scope: another actor's records are another identity.
      sig { void }
      def reset
        @context.reset
        @tombstones = {}
        @queued_demands = {}
        @actor_scope = nil
      end

      # Sends the demands queued while the connection was down. The runtime
      # calls this when the connection opens.
      sig { void }
      def connection_opened
        schedule_demands unless @queued_demands.empty?
      end

      private

        # The body of a `QUERY`, `RESOLVE` or `COMMAND` message: the model
        # and remote method named, with the arguments encoded for the wire.
        sig do
          params(model: String, name: String, positional: T::Array[T.untyped],
                 keywords: T::Hash[T.untyped, T.untyped]).returns(T::Hash[String, T.untyped])
        end
        def operation(model, name, positional, keywords)
          {
            "model" => model,
            "name" => name,
            "arguments" => encode_arguments(positional),
            "keywords" => encode_keywords(keywords)
          }
        end

        # A remote method's decoded value as the generated method returns it:
        # a `ResultSet` over the array when the schema says `result_set`, the
        # value itself otherwise.
        sig { params(value: T.untyped, result_kind: String).returns(T.untyped) }
        def wrap_result(value, result_kind)
          return value unless result_kind == "result_set"
          Model::ResultSet.new.replace(T.cast(value, T::Array[T.untyped]))
        end

        # Positional arguments for the wire, an omitted optional dropped.
        sig { params(values: T::Array[T.untyped]).returns(T::Array[T.untyped]) }
        def encode_arguments(values)
          values.reject { |value| Runtime.omitted_argument?(value) }.map { |value| encode_value(value) }
        end

        # Keyword arguments for the wire, an omitted optional dropped.
        sig { params(values: T::Hash[T.untyped, T.untyped]).returns(T::Hash[T.untyped, T.untyped]) }
        def encode_keywords(values)
          result = T.let({}, T::Hash[T.untyped, T.untyped])
          values.each do |name, value|
            result[name] = encode_value(value) unless Runtime.omitted_argument?(value)
          end
          result
        end

        # One value as the protocol carries it: a saved distant object as a
        # `$ref` of its model and id, a time as an ISO `$time`, and arrays
        # and records element by element. Anything else is sent as it is.
        sig { params(value: T.untyped).returns(T.untyped) }
        def encode_value(value)
          if value.is_a?(Object) && value.id
            distant = T.cast(value, Object)
            return {"$ref" => [distant.class.data_model_name, distant.id.to_s]}
          end
          case Runtime.data_value_type(value)
          when "Time" then return {"$time" => Runtime.data_value_payload(value)}
          when "Date" then return {"$date" => Runtime.data_value_payload(value)}
          when "DateTime" then return {"$datetime" => Runtime.data_value_payload(value)}
          when "BigDecimal" then return {"$decimal" => Runtime.data_value_payload(value)}
          when "TimeOfDay" then return {"$time_of_day" => Runtime.data_value_payload(value)}
          when "RangeValue"
            parts = T.cast(Runtime.data_value_payload(value), T::Array[T.untyped])
            return {"$range" => [parts[0], parts[1], encode_value(parts[2]), encode_value(parts[3]), parts[4], parts[5]]}
          when "Interval" then return {"$interval" => Runtime.data_value_payload(value)}
          end
          return {"$time" => Runtime.data_time_iso(value)} if Runtime.data_time(value)
          if value.is_a?(Array)
            return T.cast(value, T::Array[T.untyped]).map { |item| encode_value(item) }
          end
          if Runtime.data_record(value)
            result = T.let({}, T::Hash[T.untyped, T.untyped])
            T.cast(value, T::Hash[T.untyped, T.untyped]).each do |name, item|
              result[name] = encode_value(item)
            end
            return result
          end
          value
        end

        # One value from the protocol: a `$ref` resolves to the canonical
        # object for its model and id, created if the client holds none — or
        # to `preferred`, an unsaved object of that model awaiting its id; a
        # `$time` and a `$date` become the runtime's time values; a `$value`
        # becomes an instance of the value class it names with its fields
        # written; arrays and records decode element by element.
        # `response_generation` is the generation a new object's id is applied
        # under, so a tombstone of a newer deletion is not brought back.
        sig { params(value: T.untyped, response_generation: Integer, preferred: T.nilable(Object)).returns(T.untyped) }
        def decode_value(value, response_generation, preferred = nil)
          if value.is_a?(Array)
            return T.cast(value, T::Array[T.untyped]).map do |item|
              decode_value(item, response_generation, preferred)
            end
          end
          return value unless Runtime.data_record(value)

          record = T.cast(value, T::Hash[String, T.untyped])
          if record.size == 1 && record.key?("$ref")
            reference = T.cast(record["$ref"], T::Array[T.untyped])
            use_preferred = preferred && preferred.class.data_model_name == reference[0] && preferred.id == nil
            return canonical(reference[0].to_s, reference[1].to_s, response_generation,
                             use_preferred ? preferred : nil)
          end
          return Runtime.data_time_from_iso(record["$time"].to_s) if record.size == 1 && record.key?("$time")
          return Runtime.data_date_from_iso(record["$date"].to_s) if record.size == 1 && record.key?("$date")
          return Runtime.data_date_time_from_iso(record["$datetime"].to_s) if record.size == 1 && record.key?("$datetime")
          return Runtime.data_decimal_from_string(record["$decimal"].to_s) if record.size == 1 && record.key?("$decimal")
          return Runtime.data_time_of_day_from_iso(record["$time_of_day"].to_s) if record.size == 1 && record.key?("$time_of_day")
          if record.size == 1 && record.key?("$range")
            parts = T.cast(record["$range"], T::Array[T.untyped])
            return Runtime.data_range(parts[0], parts[1], decode_value(parts[2], response_generation),
                                      decode_value(parts[3], response_generation), parts[4], parts[5])
          end
          if record.size == 1 && record.key?("$interval")
            parts = T.cast(record["$interval"], T::Array[T.untyped])
            return Runtime.data_interval(parts[0], parts[1], parts[2])
          end
          if record.size == 1 && record.key?("$value")
            tagged = T.cast(record["$value"], T::Array[T.untyped])
            klass = Runtime.resolve(tagged[0].to_s)
            attributes = T.cast(decode_value(tagged[1], response_generation), T::Hash[String, T.untyped])
            object = klass.new
            attributes.each { |name, item| Runtime.write(object, name, item) }
            return object
          end

          result = T.let({}, T::Hash[String, T.untyped])
          record.each { |name, item| result[name] = decode_value(item, response_generation, preferred) }
          result
        end

        # The one object for `model` and `id`: the held object when there is
        # one; the tombstone when the record was deleted at a generation no
        # older than `response_generation`, so an old response cannot revive
        # it; otherwise a new object — `preferred` when given — with its id
        # applied under `response_generation`, held from now on.
        sig do
          params(model: String, id: String, response_generation: Integer,
                 preferred: T.nilable(Object)).returns(Object)
        end
        def canonical(model, id, response_generation, preferred = nil)
          store = model_store(model)
          existing = store[id]
          return T.cast(existing, Object) if existing

          removed = model_tombstones(model)[id]
          if removed && response_generation <= removed["generation"]
            return T.cast(removed["object"], Object)
          end
          model_tombstones(model).delete(id) if removed

          object = preferred || Runtime.resolve(model).new
          object.apply_data_field("id", id, response_generation, true)
          object.attach_context(@context)
          @context.register(object)
          object
        end

        # Applies one patch — a record's model, id, generation and fields —
        # to its canonical object through `Object#apply_data_field`, which
        # ignores a field a newer response already applied. A patch for a
        # record deleted at a newer generation is dropped. `overwrite_dirty`
        # says whether the patch replaces a dirty field: true for the
        # application's own writes, false for what arrives alongside a query.
        sig { params(patch: T::Hash[String, T.untyped], preferred: T.nilable(Object), overwrite_dirty: T::Boolean).returns(Object) }
        def apply_patch(patch, preferred, overwrite_dirty)
          model = patch["model"].to_s
          id = patch["id"].to_s
          patch_generation = T.cast(patch["generation"], Integer)
          use_preferred = preferred && preferred.class.data_model_name == model && preferred.id == nil
          object = canonical(model, id, patch_generation, use_preferred ? preferred : nil)
          removed = model_tombstones(model)[id]
          return object if removed && patch_generation <= removed["generation"]

          fields = T.cast(patch["fields"] || {}, T::Hash[String, T.untyped])
          fields.each do |name, encoded|
            value = decode_value(encoded, patch_generation)
            object.apply_data_field(name, value, patch_generation, overwrite_dirty)
          end
          object
        end

        # Marks the fields an invalidation names stale on the object it
        # names, through `Object#invalidate_data_field`. An invalidation of an
        # object the client does not hold, or has deleted, does nothing: it
        # never creates an object.
        sig { params(effect: T::Hash[String, T.untyped]).void }
        def apply_invalidation(effect)
          object = model_store(effect["model"].to_s)[effect["id"].to_s]
          return unless object
          distant = T.cast(object, Object)
          return if distant.deleted?
          T.cast(effect["fields"], T::Array[String]).each do |name|
            distant.invalidate_data_field(name, T.cast(effect["generation"], Integer))
          end
        end

        # Demands each field an invalidation left stale that something
        # observes (`Object#data_field_observed`), so a bound view refreshes
        # without a read; an unobserved stale field waits for its next read.
        sig { params(effect: T::Hash[String, T.untyped]).void }
        def refresh_observed(effect)
          object = model_store(effect["model"].to_s)[effect["id"].to_s]
          return unless object
          distant = T.cast(object, Object)
          return if distant.deleted?
          T.cast(effect["fields"], T::Array[String]).each do |name|
            demand(distant, name) if Runtime.read(distant, "#{name}_stale") == true && distant.data_field_observed(name)
          end
        end

        # Applies a response message in order — its invalidations, then its
        # patches, then a demand for each invalidated field that is observed
        # — and returns its decoded value. Patches follow invalidations so a
        # patch carrying the invalidated field satisfies it without a request.
        sig do
          params(message: T::Hash[String, T.untyped], response_generation: Integer,
                 preferred: T.nilable(Object), overwrite_dirty: T::Boolean).returns(T.untyped)
        end
        def apply_envelope(message, response_generation, preferred, overwrite_dirty)
          preferred&.begin_acknowledgement
          invalidations = T.cast(message["invalidations"] || [], T::Array[T::Hash[String, T.untyped]])
          invalidations.each { |effect| apply_invalidation(effect) }
          patches = T.cast(message["patches"] || [], T::Array[T::Hash[String, T.untyped]])
          patches.each { |patch| apply_patch(patch, preferred, overwrite_dirty) }
          invalidations.each { |effect| refresh_observed(effect) }
          decode_value(message["value"], response_generation, preferred)
        ensure
          preferred&.end_acknowledgement
        end

        # Sends one message and returns its decoded value; see
        # `request_with_generation`.
        sig do
          params(type: String, contents: T::Hash[String, T.untyped], preferred: T.nilable(Object),
                 overwrite_dirty: T::Boolean).returns(T.untyped)
        end
        async def request(type, contents, preferred, overwrite_dirty)
          value, _operation_generation = await request_with_generation(type, contents, preferred, overwrite_dirty)
          value
        end

        # Sends one message of `type` with `contents` under the next
        # generation, applies the response envelope, and returns the decoded
        # value with that generation. Every message carries a generation, and
        # every patch and invalidation in the response carries it back, which
        # is how an object tells an older response from a newer one. A
        # handshake checks the actor scope before requests are sent. For a `GET`, each demanded field is told the request
        # started, and told of the failure if the request raises; the error is
        # raised on to the caller. The generation is active until the response
        # is applied, which is what keeps a tombstone alive.
        sig do
          params(type: String, contents: T::Hash[String, T.untyped], preferred: T.nilable(Object),
                 overwrite_dirty: T::Boolean).returns(T::Array[T.untyped])
        end
        async def request_with_generation(type, contents, preferred, overwrite_dirty)
          @generation += 1
          operation_generation = @generation
          @active_generations << operation_generation
          payload = contents.merge({"generation" => operation_generation})
          update_demand_state(contents, operation_generation, nil) if type == "GET"
          begin
            raw = await Runtime.data_request(type, payload)
            received = T.cast(raw, T::Hash[String, T.untyped])
            scope = received["actor_scope"].to_s
            @actor_scope = scope
            message = T.cast(received["message"], T::Hash[String, T.untyped])
            [apply_envelope(message, operation_generation, preferred, overwrite_dirty), operation_generation]
          rescue Error => error
            if error.code == "outcome_unknown" && Application.running?
              Application.shared.report_problem("Operation outcome unknown", error.message)
            end
            update_demand_state(contents, operation_generation, error.message) if type == "GET"
            raise error
          ensure
            @active_generations = @active_generations.reject { |item| item == operation_generation }
            prune_tombstones
          end
        end

        # Tells each object a `GET`'s demands name what became of the request
        # of `generation`: with no `error`, that it started
        # (`Object#data_request_started`); with one, that it failed
        # (`Object#fail_data_field`). An object the client no longer holds is
        # skipped.
        sig { params(contents: T::Hash[String, T.untyped], generation: Integer, error: T.nilable(String)).void }
        def update_demand_state(contents, generation, error)
          T.cast(contents["demands"], T::Array[T::Hash[String, T.untyped]]).each do |item|
            object = model_store(item["model"].to_s)[item["id"].to_s]
            next unless object
            distant = T.cast(object, Object)
            T.cast(item["fields"], T::Array[String]).each do |name|
              if error
                distant.fail_data_field(name, error, generation)
              else
                distant.data_request_started(name, generation)
              end
            end
          end
        end

        # The held objects of `model` by id, created empty on first use.
        sig { params(model: String).returns(T::Hash[String, T.untyped]) }
        def model_store(model)
          @context.model_store(model)
        end

        # The deleted objects of `model` by id, each with the generation of
        # its deletion, created empty on first use.
        sig { params(model: String).returns(T::Hash[String, T.untyped]) }
        def model_tombstones(model)
          @tombstones[model] ||= {}
        end

        # Drops every tombstone older than the oldest request still in
        # flight: no response can arrive that predates it. Runs after every
        # response and every deletion.
        sig { void }
        def prune_tombstones
          oldest = @active_generations.min || @generation + 1
          @tombstones.each do |_model, removed_objects|
            typed_removed = T.cast(removed_objects, T::Hash[String, T.untyped])
            typed_removed.keys.each do |id|
              removed = typed_removed[id]
              typed_removed.delete(id) if removed["generation"] < oldest
            end
          end
          @tombstones.keys.each do |model|
            @tombstones.delete(model) if T.must(@tombstones[model]).empty?
          end
        end

        # One demand of a `GET`: the model and id of `object` and the
        # `fields` wanted from it.
        sig { params(object: Object, fields: T::Array[String]).returns(T::Hash[String, T.untyped]) }
        def demand_hash(object, fields)
          {"model" => object.class.data_model_name, "id" => object.id, "fields" => fields}
        end

        # Arranges for `flush_demands` to run in a microtask, once, however
        # many fields are demanded before it does: every field read in one
        # JavaScript turn goes in one `GET`.
        sig { void }
        def schedule_demands
          return if @demand_scheduled
          @demand_scheduled = true
          queueMicrotask(-> { flush_demands })
        end

        # Sends the queued demands as one `GET`. When the request fails while
        # the connection is down, the demands are queued again for
        # `connection_opened` to send; the failure is logged as a warning
        # either way, since no caller awaits a demand.
        sig { void }
        async def flush_demands
          @demand_scheduled = false
          batch = @queued_demands.values
          @queued_demands = {}
          return if batch.empty?
          demands = batch.map do |item|
            demand_hash(T.cast(item["object"], Object), T.cast(item["fields"], T::Array[String]))
          end
          begin
            await request("GET", {"demands" => demands}, nil, false)
          rescue => error
            if connection_state == "disconnected" || connection_state == "connecting"
              batch.each do |item|
                object = T.cast(item["object"], Object)
                fields = T.cast(item["fields"], T::Array[String])
                key = "#{object.class.data_model_name}:#{object.id}"
                queued = @queued_demands[key] ||= {"object" => object, "fields" => []}
                target = T.cast(queued["fields"], T::Array[String])
                fields.each { |name| target << name unless target.include?(name) }
              end
            end
            Runtime.warn("data did not load: #{error.message}") if connection_state == "connected"
          end
        end
    end
  end
end
