# typed: true
# frozen_string_literal: true

module Swill
  module Distant
    # `Swill::Distant::Client` is the browser's end of a Distant Objects
    # connection. It holds one canonical object per `(model, id)`, so every
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
        Runtime.configure_data(url, schema_hash)
      end

      # Creates a client with no objects, and registers with the runtime to be
      # reset when the connection is lost and to send queued demands when it opens.
      sig { void }
      def initialize
        super
        @stores = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @tombstones = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @queued_demands = T.let({}, T::Hash[String, T.untyped])
        @demand_scheduled = T.let(false, T::Boolean)
        @actor_scope = T.let(nil, T.nilable(String))
        @generation = T.let(0, Integer)
        @active_generations = T.let([], T::Array[Integer])
        Runtime.register_data_lifecycle(-> { reset }, -> { connection_opened })
      end

      # :section: Remote Methods and Writes
      # What a generated model calls; each sends one message and applies the response.

      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def query(model, name, positional, keywords, result_kind) # :nodoc:
        value = await request("QUERY", operation(model, name, positional, keywords), nil, false)
        wrap_result(value, result_kind)
      end

      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def resolve(model, name, positional, keywords, result_kind) # :nodoc:
        value = await request("RESOLVE", operation(model, name, positional, keywords), nil, false)
        wrap_result(value, result_kind)
      end

      sig do
        params(object: Object, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def command(object, name, positional, keywords, result_kind) # :nodoc:
        contents = operation(object.class.data_model_name, name, positional, keywords)
        contents["id"] = object.id
        value = await request("COMMAND", contents, nil, true)
        wrap_result(value, result_kind)
      end

      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped], result_kind: String).returns(T.untyped)
      end
      async def class_command(model, name, positional, keywords, result_kind) # :nodoc:
        value = await request("COMMAND", operation(model, name, positional, keywords), nil, true)
        wrap_result(value, result_kind)
      end

      sig { params(object: Object, attributes: T::Hash[T.untyped, T.untyped]).returns(Object) }
      async def create(object, attributes) # :nodoc:
        await request("CREATE", {
          "model" => object.class.data_model_name,
          "attributes" => encode_value(attributes)
        }, object, true)
        object
      end

      sig { params(object: Object, attributes: T::Hash[T.untyped, T.untyped]).returns(Object) }
      async def update(object, attributes) # :nodoc:
        await request("UPDATE", {
          "model" => object.class.data_model_name,
          "id" => object.id,
          "attributes" => encode_value(attributes)
        }, nil, true)
        object
      end

      sig { params(object: Object).returns(Object) }
      async def delete(object) # :nodoc:
        model = object.class.data_model_name
        id = object.id.to_s
        _value, removed_generation = await request_with_generation("DELETE", {
          "model" => model, "id" => id
        }, nil, true)
        model_store(model).delete(id)
        model_tombstones(model)[id] = {"object" => object, "generation" => removed_generation}
        object.deleted = true
        @queued_demands.delete("#{model}:#{id}")
        object.disconnect
        prune_tombstones
        object
      end

      # :section: Loading Fields
      # What a distant object asks for when a field is read or loaded.

      # Queues a load of the field `name` on `object`, joining every other
      # field demanded in this JavaScript turn into one request. Does nothing for
      # an unsaved object, or for a field already loaded or loading. Reading an
      # unloaded field of a saved object calls this.
      # Queue all members read in this JavaScript turn into one GET.
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

      # Loads the field `name` on `object` and returns its value; returns the
      # current value without a request when the field is loaded and not stale,
      # unless `reload` is true. Raises when the request fails.
      sig { params(object: Object, name: String, reload: T::Boolean).returns(T.untyped) }
      async def load_field(object, name, reload)
        return Runtime.read(object, name) if !reload && object.data_field_loaded(name) && !object.data_field_stale(name)
        object.begin_data_field_load(name, true)
        await request("GET", {"demands" => [demand_hash(object, [name])]}, nil, false)
        Runtime.read(object, name)
      end

      # :section: Identity
      # The one canonical object per (model, id).

      # Forgets every object the client holds: each is reset to unloaded and
      # disconnected, and queued demands are dropped. The runtime calls this when
      # the connection is lost, and the client calls it when a response arrives
      # under a different actor scope than the one before.
      # A changed actor or an explicit close invalidates every identity.
      sig { void }
      def reset
        @stores.each do |_model, store|
          typed_store = T.cast(store, T::Hash[String, T.untyped])
          typed_store.each do |_id, object|
            distant = T.cast(object, Object)
            distant.reset_data_fields
            distant.disconnect
          end
        end
        @stores = {}
        @tombstones = {}
        @queued_demands = {}
        @actor_scope = nil
      end

      sig { void }
      def connection_opened # :nodoc:
        schedule_demands unless @queued_demands.empty?
      end

      sig do
        params(model: String, name: String, positional: T::Array[T.untyped],
               keywords: T::Hash[T.untyped, T.untyped]).returns(T::Hash[String, T.untyped])
      end
      def operation(model, name, positional, keywords) # :nodoc:
        {
          "model" => model,
          "name" => name,
          "arguments" => encode_arguments(positional),
          "keywords" => encode_keywords(keywords)
        }
      end

      sig { params(value: T.untyped, result_kind: String).returns(T.untyped) }
      def wrap_result(value, result_kind) # :nodoc:
        return value unless result_kind == "result_set"
        Model::ResultSet.new.replace(T.cast(value, T::Array[T.untyped]))
      end

      sig { params(values: T::Array[T.untyped]).returns(T::Array[T.untyped]) }
      def encode_arguments(values) # :nodoc:
        values.reject { |value| Runtime.omitted_argument?(value) }.map { |value| encode_value(value) }
      end

      sig { params(values: T::Hash[T.untyped, T.untyped]).returns(T::Hash[T.untyped, T.untyped]) }
      def encode_keywords(values) # :nodoc:
        result = T.let({}, T::Hash[T.untyped, T.untyped])
        values.each do |name, value|
          result[name] = encode_value(value) unless Runtime.omitted_argument?(value)
        end
        result
      end

      sig { params(value: T.untyped).returns(T.untyped) }
      def encode_value(value) # :nodoc:
        if value.is_a?(Object) && value.id
          distant = T.cast(value, Object)
          return {"$ref" => [distant.class.data_model_name, distant.id.to_s]}
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

      sig { params(value: T.untyped, response_generation: Integer, preferred: T.nilable(Object)).returns(T.untyped) }
      def decode_value(value, response_generation, preferred = nil) # :nodoc:
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
        return record["$date"] if record.size == 1 && record.key?("$date")
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

      sig do
        params(model: String, id: String, response_generation: Integer,
               preferred: T.nilable(Object)).returns(Object)
      end
      def canonical(model, id, response_generation, preferred = nil) # :nodoc:
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
        store[id] = object
        object
      end

      sig { params(patch: T::Hash[String, T.untyped], preferred: T.nilable(Object), overwrite_dirty: T::Boolean).returns(Object) }
      def apply_patch(patch, preferred, overwrite_dirty) # :nodoc:
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

      # Invalidations affect cached objects only; they never instantiate a graph.
      sig { params(effect: T::Hash[String, T.untyped]).void }
      def apply_invalidation(effect) # :nodoc:
        object = model_store(effect["model"].to_s)[effect["id"].to_s]
        return unless object
        distant = T.cast(object, Object)
        return if distant.deleted?
        T.cast(effect["fields"], T::Array[String]).each do |name|
          distant.invalidate_data_field(name, T.cast(effect["generation"], Integer))
        end
      end

      sig { params(effect: T::Hash[String, T.untyped]).void }
      def refresh_observed(effect) # :nodoc:
        object = model_store(effect["model"].to_s)[effect["id"].to_s]
        return unless object
        distant = T.cast(object, Object)
        return if distant.deleted?
        T.cast(effect["fields"], T::Array[String]).each do |name|
          demand(distant, name) if distant.data_field_stale(name) && distant.data_field_observed(name)
        end
      end

      sig do
        params(message: T::Hash[String, T.untyped], response_generation: Integer,
               preferred: T.nilable(Object), overwrite_dirty: T::Boolean).returns(T.untyped)
      end
      def apply_envelope(message, response_generation, preferred, overwrite_dirty) # :nodoc:
        invalidations = T.cast(message["invalidations"] || [], T::Array[T::Hash[String, T.untyped]])
        invalidations.each { |effect| apply_invalidation(effect) }
        patches = T.cast(message["patches"] || [], T::Array[T::Hash[String, T.untyped]])
        patches.each { |patch| apply_patch(patch, preferred, overwrite_dirty) }
        invalidations.each { |effect| refresh_observed(effect) }
        decode_value(message["value"], response_generation, preferred)
      end

      sig do
        params(type: String, contents: T::Hash[String, T.untyped], preferred: T.nilable(Object),
               overwrite_dirty: T::Boolean).returns(T.untyped)
      end
      async def request(type, contents, preferred, overwrite_dirty) # :nodoc:
        value, _operation_generation = await request_with_generation(type, contents, preferred, overwrite_dirty)
        value
      end

      sig do
        params(type: String, contents: T::Hash[String, T.untyped], preferred: T.nilable(Object),
               overwrite_dirty: T::Boolean).returns(T::Array[T.untyped])
      end
      async def request_with_generation(type, contents, preferred, overwrite_dirty) # :nodoc:
        @generation += 1
        operation_generation = @generation
        @active_generations << operation_generation
        payload = contents.merge({"generation" => operation_generation})
        update_demand_state(contents, operation_generation, nil) if type == "GET"
        begin
          raw = await Runtime.data_request(type, payload)
          received = T.cast(raw, T::Hash[String, T.untyped])
          scope = received["actor_scope"].to_s
          reset if @actor_scope && @actor_scope != scope
          @actor_scope = scope
          message = T.cast(received["message"], T::Hash[String, T.untyped])
          [apply_envelope(message, operation_generation, preferred, overwrite_dirty), operation_generation]
        rescue => error
          update_demand_state(contents, operation_generation, error.message) if type == "GET"
          raise error
        ensure
          @active_generations = @active_generations.reject { |item| item == operation_generation }
          prune_tombstones
        end
      end

      sig { params(contents: T::Hash[String, T.untyped], generation: Integer, error: T.nilable(String)).void }
      def update_demand_state(contents, generation, error) # :nodoc:
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

      sig { params(model: String).returns(T::Hash[String, T.untyped]) }
      def model_store(model) # :nodoc:
        @stores[model] ||= {}
      end

      sig { params(model: String).returns(T::Hash[String, T.untyped]) }
      def model_tombstones(model) # :nodoc:
        @tombstones[model] ||= {}
      end

      sig { void }
      def prune_tombstones # :nodoc:
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

      sig { params(object: Object, fields: T::Array[String]).returns(T::Hash[String, T.untyped]) }
      def demand_hash(object, fields) # :nodoc:
        {"model" => object.class.data_model_name, "id" => object.id, "fields" => fields}
      end

      sig { void }
      def schedule_demands # :nodoc:
        return if @demand_scheduled
        @demand_scheduled = true
        queueMicrotask(-> { flush_demands })
      end

      sig { void }
      async def flush_demands # :nodoc:
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
          unless Runtime.data_connected
            batch.each do |item|
              object = T.cast(item["object"], Object)
              fields = T.cast(item["fields"], T::Array[String])
              key = "#{object.class.data_model_name}:#{object.id}"
              queued = @queued_demands[key] ||= {"object" => object, "fields" => []}
              target = T.cast(queued["fields"], T::Array[String])
              fields.each { |name| target << name unless target.include?(name) }
            end
          end
          Runtime.warn("data did not load: #{error.message}")
        end
      end
    end
  end
end
