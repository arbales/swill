# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # A `Resource` is an editable model backed by a JSON endpoint. It adds to
    # `Editable`:
    #
    # - a codec that decodes records from the endpoint's responses and encodes
    #   the resource for its requests; JSON:API unless the class declares
    #   `codec`;
    # - one instance per id, through `Identity`, so a record fetched twice is
    #   the same object;
    # - persistence: `save`, `delete` and `reload` against the class's
    #   `endpoint`;
    # - relationships declared with `has_many` and `has_one`, loaded from their
    #   own URLs on first access.
    #
    # A menu declares its endpoint and a relationship:
    #
    #     class Menu < Swill::Model::Resource
    #       endpoint "/api/menus"
    #       resource_type "menus"
    #       attribute :name, type: String, default: ""
    #       has_many :recipes, type: Recipe, url: "/api/menus/:id/recipes"
    #     end
    #
    # See [Models](rdoc-ref:doc/models.md).
    class Resource < Editable
      extend T::Sig
      include Relationships
      include Identity

      # Creates an empty, unsaved resource with no relationship requests in
      # flight.
      sig { void }
      def initialize
        super
        @relationship_requests = T.let({}, T::Hash[String, T.untyped])
      end

      # Returns the resource subclass whose `resource_type` is `type`, or nil
      # when none declares it.
      sig { params(type: String).returns(T.nilable(T.class_of(Resource))) }
      def self.class_for_type(type)
        T.unsafe(Swill::Runtime.class_with_setting("resource_type", type))
      end

      # :section: Decoding and Encoding
      # The codec between this class and its endpoint.

      # Returns the codec this class exchanges records with: the one declared
      # with `codec`, or `JSONAPI` by default.
      sig { returns(T.class_of(Codec)) }
      def self.active_codec
        codec || JSONAPI
      end

      # Returns the record decoded from `payload` by the active codec, or nil
      # when the payload holds none. A decoded record replaces the pooled
      # instance with the same id.
      sig { params(payload: T.untyped).returns(T.nilable(T.attached_class)) }
      def self.parse_one(payload)
        T.unsafe(active_codec.parse_one(self, payload))
      end

      # Returns the records decoded from `payload` by the active codec, in
      # the payload's order; an empty array when it holds none.
      sig { params(payload: T.untyped).returns(T::Array[T.attached_class]) }
      def self.parse_many(payload)
        T.unsafe(active_codec.parse_many(self, payload))
      end

      # Returns this resource encoded by the active codec for a request: every
      # attribute, or only the dirty ones when `dirty_only` is true.
      sig { params(dirty_only: T::Boolean).returns(T.untyped) }
      def serialize(dirty_only)
        self.class.active_codec.serialize(self, dirty_only)
      end

      # :section: Locating Resources
      # URLs, and the requests that fetch records from them.

      # Returns the URL declared with `endpoint`. Raises when the class
      # declares none.
      sig { returns(String) }
      def self.endpoint_url
        url = endpoint
        raise "no endpoint declared" unless url
        "#{url}"
      end

      # Returns the URL of the record with `id` under the endpoint.
      sig { params(id: String).returns(String) }
      def self.resource_url(id)
        Wire.resource_url(endpoint_url, id)
      end

      # Returns the record with `id`: the pooled instance when there is one,
      # otherwise the record `fetch` retrieves. Raises when the endpoint has
      # no such record.
      sig { params(id: String).returns(T.attached_class) }
      async def self.find(id)
        cached = get(id)
        return cached if cached
        await fetch(id)
      end

      # Requests the record with `id` from the endpoint and returns it, even
      # when an instance is already pooled; the pooled instance takes the
      # fetched attributes. Raises when the response holds no record.
      sig { params(id: String).returns(T.attached_class) }
      async def self.fetch(id)
        url = resource_url(id)
        record = parse_one(await Wire.default.get_json(url))
        raise "no record at #{url}" unless record
        record
      end

      # Requests every record from the endpoint and returns them in the
      # response's order.
      sig { returns(T::Array[T.attached_class]) }
      async def self.find_all
        await fetch_all(endpoint_url, {})
      end

      # Requests the records matching `params`, sent as the query string, and
      # returns them in the response's order.
      sig { params(params: T::Hash[String, T.untyped]).returns(T::Array[T.attached_class]) }
      async def self.where(params)
        await fetch_all(endpoint_url, params)
      end

      # Requests `url` with `params` as the query string and returns the
      # records in its response. `find_all` and `where` call this with the
      # endpoint URL.
      sig { params(url: String, params: T::Hash[String, T.untyped]).returns(T::Array[T.attached_class]) }
      async def self.fetch_all(url, params)
        parse_many(await Wire.default.get_json(url, params: params))
      end

      # Returns a `Dataset` for `url` and `params`: the same request as
      # `fetch_all`, held as bindable `records`, `loading` and `error`
      # properties instead of awaited.
      sig { params(url: String, params: T::Hash[String, T.untyped]).returns(Dataset) }
      def self.dataset(url, params)
        Dataset.new(self, url, params)
      end

      # :section: Persisting
      # Writing this resource to its endpoint, and reading it back.

      # Returns a message describing why this resource cannot be saved, or
      # nil when it can. The default implementation returns nil. Override it
      # to validate before `save` sends a request.
      sig { returns(T.nilable(String)) }
      def validate
        nil
      end

      # Saves this resource to the endpoint and returns it: `POST` to the
      # endpoint URL for a resource with no id, `PATCH` of the dirty
      # attributes to its own URL otherwise. A saved resource with nothing
      # dirty sends no request. The response's attributes are applied and the
      # resource is marked clean and pooled under its id. Raises with the
      # message from `validate` when it returns one, and when the response
      # holds no record.
      sig { returns(T.self_type) }
      async def save
        problem = validate
        raise "#{problem}" if problem
        creating = id == nil
        return self if !creating && !dirty?
        method = creating ? "POST" : "PATCH"
        url = creating ? self.class.endpoint_url : self.class.resource_url(T.must(id))
        response = await Wire.default.request_json(method, url, body: serialize(!creating))
        persisted = self.class.parse_one(response)
        raise "#{method} #{url} returned no record" unless persisted
        self.id = persisted.id
        apply_attributes(persisted.collect_attributes)
        mark_clean!
        self.class.remove(T.must(id)) if creating && persisted != self
        self.class.put(self)
        self
      end

      # Sends `DELETE` to this resource's URL, removes it from the pool, and
      # returns it. A resource with no id sends nothing.
      sig { returns(T.self_type) }
      async def delete
        identifier = id
        return self if identifier == nil
        await Wire.default.request_json("DELETE", self.class.resource_url(identifier))
        self.class.remove(identifier)
        self
      end

      # Requests this resource's record from the endpoint, applies its
      # attributes, marks the resource clean, and returns it. Unsaved edits
      # are lost. Raises for a resource with no id.
      sig { returns(T.self_type) }
      async def reload
        identifier = id
        raise "reload requires an id" if identifier == nil
        await self.class.fetch(identifier)
        mark_clean!
        self
      end

      # :section: Loading Relationships
      # Relationships declared with `has_many` and `has_one`. Each is a value
      # property with `_loading`, `_loaded` and `_error` properties beside it;
      # reading the value of a saved resource starts its request.

      # Returns a `Relationship` for each relationship this class declares,
      # in declaration order.
      sig { returns(T::Array[Relationship]) }
      def relationships
        descriptors = T.let(self.class.model_relationships.values, T::Array[T::Hash[String, T.untyped]])
        descriptors.map { |descriptor| Relationship.new(descriptor) }
      end

      # Returns the `Relationship` declared as `name`. Raises when the class
      # declares no such relationship.
      sig { params(name: String).returns(Relationship) }
      def relationship(name)
        descriptor = self.class.model_relationships[name]
        raise "#{name} is not a relationship" unless descriptor
        Relationship.new(T.cast(descriptor, T::Hash[String, T.untyped]))
      end

      # Returns whether the relationship `name` holds a loaded value.
      sig { params(name: String).returns(T::Boolean) }
      def relationship_loaded?(name)
        Swill::Runtime.read(self, "#{name}_loaded") == true
      end

      # Sets the relationship `name` to `value` as though it had loaded:
      # marks it loaded and clears its error. No request is sent.
      sig { params(name: String, value: T.untyped).void }
      def assign_relationship(name, value)
        Swill::Runtime.write(self, name, value)
        Swill::Runtime.write(self, "#{name}_error", nil)
        Swill::Runtime.write(self, "#{name}_loaded", true)
      end

      # Returns the value of the relationship `name`, requesting it from its
      # URL when it has not loaded. A request already in flight is awaited
      # rather than repeated. Raises when the request fails.
      sig { params(name: String).returns(T.untyped) }
      async def load_relationship(name)
        return Swill::Runtime.read(self, name) if relationship_loaded?(name)
        pending = @relationship_requests[name]
        if pending
          await pending
          return Swill::Runtime.read(self, name)
        end
        await reload_relationship(name)
      end

      sig { params(name: String).void }
      def property_will_access(name) # :nodoc:
        super
        return if id == nil
        return unless self.class.model_relationships[name]
        return if relationship_loaded?(name)
        return if Swill::Runtime.read(self, "#{name}_loading") == true
        return if Swill::Runtime.read(self, "#{name}_error") != nil
        load_relationship_in_background(name)
      end

      # Loads the relationship `name` without awaiting it. A failure is
      # recorded in the relationship's `_error` property and logged as a
      # warning rather than raised. Reading an unloaded relationship of a
      # saved resource calls this.
      sig { params(name: String).void }
      async def load_relationship_in_background(name)
        begin
          await load_relationship(name)
        rescue => failure
          Swill::Runtime.warn("#{name} did not load: #{failure.message}")
        end
      end

      # Requests the relationship `name` from its URL whether or not it has
      # loaded, and returns the value. `_loading` is true for the duration.
      # On failure the value is unchanged, `_error` holds the message, and
      # the error is raised. A request already in flight is awaited instead.
      sig { params(name: String).returns(T.untyped) }
      async def reload_relationship(name)
        pending = @relationship_requests[name]
        if pending
          await pending
          return Swill::Runtime.read(self, name)
        end

        Swill::Runtime.write(self, "#{name}_loading", true)
        Swill::Runtime.write(self, "#{name}_error", nil)
        request = T.let(nil, T.untyped)
        begin
          descriptor = relationship(name)
          model_class = descriptor.model_class
          request = Wire.default.get_json(descriptor.url_for(self))
          @relationship_requests[name] = request
          payload = await request
          value = descriptor.many? ? model_class.parse_many(payload) : model_class.parse_one(payload)
          assign_relationship(name, value)
        rescue => failure
          Swill::Runtime.write(self, "#{name}_error", failure.message)
          raise "#{failure.message}"
        ensure
          @relationship_requests.delete(name) if @relationship_requests[name] == request
          Swill::Runtime.write(self, "#{name}_loading", false)
        end
        Swill::Runtime.read(self, name)
      end
    end
  end
end
