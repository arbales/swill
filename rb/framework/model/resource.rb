# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # An endpoint-backed JSON resource with identity, persistence, and URL
    # relationships. JSON:API is the default codec; PlainJSON is optional.
    class Resource < Editable
      extend T::Sig
      include Relationships
      include Identity

      # Creates an empty resource with no relationship requests in flight.
      sig { void }
      def initialize
        super
        @relationship_requests = T.let({}, T::Hash[String, T.untyped])
      end

      # Finds the resource subclass registered for a JSON:API type.
      sig { params(type: String).returns(T.nilable(T.class_of(Resource))) }
      def self.class_for_type(type)
        T.unsafe(Swill::Runtime.class_with_setting("resource_type", type))
      end

      sig { returns(T.class_of(Codec)) }
      def self.active_codec
        codec || JSONAPI
      end

      sig { params(payload: T.untyped).returns(T.nilable(T.attached_class)) }
      def self.parse_one(payload)
        T.unsafe(active_codec.parse_one(self, payload))
      end

      sig { params(payload: T.untyped).returns(T::Array[T.attached_class]) }
      def self.parse_many(payload)
        T.unsafe(active_codec.parse_many(self, payload))
      end

      sig { returns(String) }
      def self.endpoint_url
        url = endpoint
        raise "no endpoint declared" unless url
        "#{url}"
      end

      sig { params(id: String).returns(String) }
      def self.resource_url(id)
        Wire.resource_url(endpoint_url, id)
      end

      sig { params(id: String).returns(T.attached_class) }
      async def self.find(id)
        cached = get(id)
        return cached if cached
        await fetch(id)
      end

      sig { params(id: String).returns(T.attached_class) }
      async def self.fetch(id)
        url = resource_url(id)
        record = parse_one(await Wire.default.get_json(url))
        raise "no record at #{url}" unless record
        record
      end

      sig { returns(T::Array[T.attached_class]) }
      async def self.find_all
        await fetch_all(endpoint_url, {})
      end

      sig { params(params: T::Hash[String, T.untyped]).returns(T::Array[T.attached_class]) }
      async def self.where(params)
        await fetch_all(endpoint_url, params)
      end

      sig { params(url: String, params: T::Hash[String, T.untyped]).returns(T::Array[T.attached_class]) }
      async def self.fetch_all(url, params)
        parse_many(await Wire.default.get_json(url, params: params))
      end

      sig { params(url: String, params: T::Hash[String, T.untyped]).returns(Dataset) }
      def self.dataset(url, params)
        Dataset.new(self, url, params)
      end

      sig { returns(T.nilable(String)) }
      def validate
        nil
      end

      sig { params(dirty_only: T::Boolean).returns(T.untyped) }
      def serialize(dirty_only)
        self.class.active_codec.serialize(self, dirty_only)
      end

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

      sig { returns(T.self_type) }
      async def delete
        identifier = id
        return self if identifier == nil
        await Wire.default.request_json("DELETE", self.class.resource_url(identifier))
        self.class.remove(identifier)
        self
      end

      sig { returns(T.self_type) }
      async def reload
        identifier = id
        raise "reload requires an id" if identifier == nil
        await self.class.fetch(identifier)
        mark_clean!
        self
      end

      sig { returns(T::Array[Relationship]) }
      def relationships
        descriptors = T.let(self.class.model_relationships.values, T::Array[T::Hash[String, T.untyped]])
        descriptors.map { |descriptor| Relationship.new(descriptor) }
      end

      sig { params(name: String).returns(Relationship) }
      def relationship(name)
        descriptor = self.class.model_relationships[name]
        raise "#{name} is not a relationship" unless descriptor
        Relationship.new(T.cast(descriptor, T::Hash[String, T.untyped]))
      end

      sig { params(name: String).returns(T::Boolean) }
      def relationship_loaded?(name)
        Swill::Runtime.read(self, "#{name}_loaded") == true
      end

      sig { params(name: String, value: T.untyped).void }
      def assign_relationship(name, value)
        Swill::Runtime.write(self, name, value)
        Swill::Runtime.write(self, "#{name}_error", nil)
        Swill::Runtime.write(self, "#{name}_loaded", true)
      end

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
      def property_will_access(name)
        super
        return if id == nil
        return unless self.class.model_relationships[name]
        return if relationship_loaded?(name)
        return if Swill::Runtime.read(self, "#{name}_loading") == true
        return if Swill::Runtime.read(self, "#{name}_error") != nil
        load_relationship_in_background(name)
      end

      sig { params(name: String).void }
      async def load_relationship_in_background(name)
        begin
          await load_relationship(name)
        rescue => failure
          Swill::Runtime.warn("#{name} did not load: #{failure.message}")
        end
      end

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
