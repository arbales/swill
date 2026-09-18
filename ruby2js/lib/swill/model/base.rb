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
        @loaded_relationships = T.let([], T::Array[String])
        # A relationship whose own load failed is not retried on every read;
        # reload_<name> is how an application asks again.
        @unloadable_relationships = T.let([], T::Array[String])
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
        @loaded_relationships.include?(name)
      end

      # A relationship's value, assigned here or hydrated from a document;
      # loading it asks the server only when it has not been.
      sig { params(name: String, value: T.untyped).void }
      def assign_relationship(name, value)
        Swill::Runtime.write(self, name, value)
        @loaded_relationships << name unless relationship_loaded?(name)
      end

      # The relationship's records, from the server the first time. The
      # <name>_loading property is true while the request is out.
      sig { params(name: String).returns(T.untyped) }
      async def load_relationship(name)
        return Swill::Runtime.read(self, name) if relationship_loaded?(name)
        await reload_relationship(name)
      end

      # Cocoa's -willAccessValueForKey:. A relationship nobody prefetched
      # loads itself when it is first read: the value answers what it has,
      # and fills in when the request lands. The guard is what keeps a
      # re-render from re-requesting.
      sig { params(name: String).void }
      def property_will_access(name)
        super(name)
        return if id == nil
        return unless self.class.model_relationships[name]
        return if relationship_loaded?(name)
        return if @unloadable_relationships.include?(name)
        return if Swill::Runtime.read(self, "#{name}_loading") == true
        load_relationship_in_background(name)
      end

      sig { params(name: String).void }
      async def load_relationship_in_background(name)
        begin
          await reload_relationship(name)
        rescue => failure
          @unloadable_relationships << name
          Swill::Runtime.warn("#{name} did not load: #{failure.message}")
        end
      end

      sig { params(name: String).returns(T.untyped) }
      async def reload_relationship(name)
        descriptor = relationship(name)
        model_class = descriptor.model_class
        value = T.let(nil, T.untyped)
        Swill::Runtime.write(self, "#{name}_loading", true)
        begin
          payload = await Wire.default.get_json(descriptor.url_for(self), {})
          value = descriptor.many? ? model_class.parse_many(payload) : model_class.parse_one(payload)
          assign_relationship(name, value)
        ensure
          Swill::Runtime.write(self, "#{name}_loading", false)
        end
        value
      end
    end
  end
end
