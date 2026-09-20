# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # The client model: declared attributes with validation and dirty
    # tracking, an identity pool per class, JSON:API (or plain JSON)
    # persistence over the wire, and has_many/has_one relationships.
    #
    #   class Menu < Swill::Model::Base
    #     endpoint "/api/menus"
    #     resource_type "menus"
    #     attribute :name, type: String, default: ""
    #     has_many :recipes, type: MenuRecipe, key: "menu_recipes", url: "/api/menus/:id/recipes"
    #   end
    #
    #   menu = await Menu.find(id)        # the pooled instance, or a fetch
    #   menu.name = "Brunch"              # dirty; observers of name run
    #   await menu.save                   # PATCH with the dirty attributes
    #   menu.recipes                      # what it has; the read starts the request
    #   await menu.load_recipes           # the same, for code that must wait
    #
    # A view binds to +recipes+ and fills in when the request lands;
    # +recipes_loading+, +recipes_loaded+, and +recipes_error+ are the rest of
    # the relationship's key-value loading state, and are bindable too.
    class Base < Swill::Object
      extend T::Sig
      include Attributes
      include Relationships
      include DirtyTracking
      include Drafts
      include Identity

      attribute :id, type: T.nilable(String), default: nil

      sig { void }
      def initialize
        super()
        @relationship_requests = T.let({}, T::Hash[String, T.untyped])
      end

      # ---- reading ----

      # The model class declaring a JSON:API resource type, or nil.
      sig { params(type: String).returns(T.nilable(T.class_of(Base))) }
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

      # The pooled instance, or the server's.
      sig { params(id: String).returns(T.attached_class) }
      async def self.find(id)
        cached = get(id)
        return cached if cached
        await fetch(id)
      end

      # The server's instance for an id, pooled, whatever the pool held.
      sig { params(id: String).returns(T.attached_class) }
      async def self.fetch(id)
        url = resource_url(id)
        record = parse_one(await Wire.default.get_json(url, {}))
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

      # A collection at any URL, parsed as this class.
      sig { params(url: String, params: T::Hash[String, T.untyped]).returns(T::Array[T.attached_class]) }
      async def self.fetch_all(url, params)
        parse_many(await Wire.default.get_json(url, params))
      end

      sig { params(url: String, params: T::Hash[String, T.untyped]).returns(Dataset) }
      def self.dataset(url, params)
        Dataset.new(self, url, params)
      end

      # ---- writing ----

      # An error message that refuses a save, or nil. Attribute validators
      # run as values are written; this is the whole record's check.
      sig { returns(T.nilable(String)) }
      def validate
        nil
      end

      sig { params(dirty_only: T::Boolean).returns(T.untyped) }
      def serialize(dirty_only)
        self.class.active_codec.serialize(self, dirty_only)
      end

      # POST a new record, or PATCH a dirty one with its dirty attributes.
      # The server's answer is applied, and the record is clean and pooled.
      sig { returns(T.self_type) }
      async def save
        problem = validate
        raise "#{problem}" if problem
        creating = id == nil
        return self if !creating && !dirty?
        method = creating ? "POST" : "PATCH"
        url = creating ? self.class.endpoint_url : self.class.resource_url(T.must(id))
        response = await Wire.default.request_json(method, url, serialize(!creating))
        persisted = self.class.parse_one(response)
        raise "#{method} #{url} returned no record" unless persisted
        self.id = persisted.id
        apply_attributes(persisted.collect_attributes)
        mark_clean!
        self.class.remove(T.must(id)) if creating && persisted != self
        self.class.put(self)
        self
      end

      # DELETE on the server, then leave the pool.
      sig { returns(T.self_type) }
      async def delete
        identifier = id
        return self if identifier == nil
        await Wire.default.request_json("DELETE", self.class.resource_url(identifier), nil)
        self.class.remove(identifier)
        self
      end

      # The server's current attributes, applied here; the record is clean.
      sig { returns(T.self_type) }
      async def reload
        identifier = id
        raise "reload requires an id" if identifier == nil
        await self.class.fetch(identifier)
        mark_clean!
        self
      end

      # ---- relationships ----

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

      # A relationship's value, assigned here or hydrated from a document.
      # Assignment is a load: whatever the value came from, the relationship
      # is loaded and has no failure to report.
      sig { params(name: String, value: T.untyped).void }
      def assign_relationship(name, value)
        Swill::Runtime.write(self, name, value)
        Swill::Runtime.write(self, "#{name}_error", nil)
        Swill::Runtime.write(self, "#{name}_loaded", true)
      end

      # The relationship's records, from the server the first time.
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

      # Cocoa's -willAccessValueForKey:. A relationship nobody prefetched
      # loads itself when it is first read: the value answers what it has,
      # and fills in when the request lands. The guard is what keeps a
      # re-render from re-requesting, and a remembered failure is part of it;
      # reload_<name> is how an application asks again.
      sig { params(name: String).void }
      def property_will_access(name)
        super(name)
        return if id == nil
        return unless self.class.model_relationships[name]
        return if relationship_loaded?(name)
        return if Swill::Runtime.read(self, "#{name}_loading") == true
        return if Swill::Runtime.read(self, "#{name}_error") != nil
        load_relationship_in_background(name)
      end

      # A read has no caller to receive a rejection. The same explicit load
      # updates every bindable state; this wrapper only catches and reports it.
      sig { params(name: String).void }
      async def load_relationship_in_background(name)
        begin
          await load_relationship(name)
        rescue => failure
          Swill::Runtime.warn("#{name} did not load: #{failure.message}")
        end
      end

      # Asks the server, whatever the relationship already holds. Concurrent
      # callers share one request; explicit callers receive its rejection
      # after the bindable error state has been updated.
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
          request = Wire.default.get_json(descriptor.url_for(self), {})
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
