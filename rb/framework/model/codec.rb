# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # How a model class reads a payload and writes one. A codec keeps no
    # state, so its protocol is class methods. JSON:API is the default; a
    # class declares `codec PlainJSON` for a plain JSON endpoint.
    class Codec < Swill::Object
      extend T::Sig

      sig { params(model_class: T.class_of(Base), payload: T.untyped).returns(T.nilable(Base)) }
      def self.parse_one(model_class, payload)
        raise "codec does not parse"
      end

      sig { params(model_class: T.class_of(Base), payload: T.untyped).returns(T::Array[Base]) }
      def self.parse_many(model_class, payload)
        raise "codec does not parse"
      end

      sig { params(model: Base, dirty_only: T::Boolean).returns(T.untyped) }
      def self.serialize(model, dirty_only)
        raise "codec does not serialize"
      end

      # The attributes a payload carries, by wire key; the id is identity,
      # not an attribute, and travels on its own.
      sig { params(model: Base, dirty_only: T::Boolean).returns(T::Hash[T.untyped, T.untyped]) }
      def self.attributes_of(model, dirty_only)
        attributes = dirty_only ? model.collect_dirty_attributes : model.collect_attributes
        attributes.delete("id")
        attributes
      end
    end

    # Plain JSON: an object per record with its attributes at the top level
    # and its id under "id"; a collection is an array of them.
    class PlainJSON < Codec
      sig { params(model_class: T.class_of(Base), payload: T.untyped).returns(T.nilable(Base)) }
      def self.parse_one(model_class, payload)
        return nil if payload == nil
        materialize(model_class, T.cast(payload, T::Hash[String, T.untyped]))
      end

      sig { params(model_class: T.class_of(Base), payload: T.untyped).returns(T::Array[Base]) }
      def self.parse_many(model_class, payload)
        T.cast(payload, T::Array[T.untyped]).map do |item|
          materialize(model_class, T.cast(item, T::Hash[String, T.untyped]))
        end
      end

      sig { params(model: Base, dirty_only: T::Boolean).returns(T.untyped) }
      def self.serialize(model, dirty_only)
        Codec.attributes_of(model, dirty_only)
      end

      # The pooled instance for the object's id, refreshed, or a new one.
      # The id is a string in the pool, whatever the payload's number.
      sig { params(model_class: T.class_of(Base), values: T::Hash[String, T.untyped]).returns(Base) }
      def self.materialize(model_class, values)
        raw = values["id"]
        id = raw == nil ? nil : "#{raw}"
        instance = (id ? model_class.get(id) : nil) || model_class.new
        instance.apply_attributes(values)
        # Identity comes from the server and is never a change to save.
        instance.apply_attributes({"id" => id})
        model_class.put(instance) if id
        instance
      end
    end

    # JSON:API: {"data": resource | [resource] | null, "included": [resource]}
    # where a resource is {"id", "type", "attributes", "relationships"}.
    # Every resource in a document is pooled first and relationships are
    # hydrated from the pool afterwards, so included records resolve
    # whatever their order. A resource's class is the one declaring its
    # type as resource_type.
    class JSONAPI < Codec
      sig { params(model_class: T.class_of(Base), payload: T.untyped).returns(T.nilable(Base)) }
      def self.parse_one(model_class, payload)
        document = T.cast(payload, T::Hash[String, T.untyped])
        data = document["data"]
        raise "expected a single JSON:API resource" if data.is_a?(Array)
        pool(document)
        data == nil ? nil : pooled(T.cast(data, T::Hash[String, T.untyped]))
      end

      sig { params(model_class: T.class_of(Base), payload: T.untyped).returns(T::Array[Base]) }
      def self.parse_many(model_class, payload)
        document = T.cast(payload, T::Hash[String, T.untyped])
        data = document["data"]
        raise "expected a JSON:API collection" unless data.is_a?(Array)
        pool(document)
        resources_in(data).map { |resource| pooled(resource) }.compact
      end

      sig { params(model: Base, dirty_only: T::Boolean).returns(T.untyped) }
      def self.serialize(model, dirty_only)
        attributes = Codec.attributes_of(model, dirty_only)
        resource = T.let({"type" => model.class.resource_type, "attributes" => attributes}, T::Hash[String, T.untyped])
        id = model.id
        resource["id"] = id if id
        {"data" => resource}
      end

      sig { params(document: T::Hash[String, T.untyped]).void }
      def self.pool(document)
        resources = resources_in(document["included"]) + resources_in(document["data"])
        resources.each { |resource| materialize(resource) }
        resources.each { |resource| hydrate(resource) }
      end

      # The resources a data or included member holds: none, one, or many.
      sig { params(value: T.untyped).returns(T::Array[T::Hash[String, T.untyped]]) }
      def self.resources_in(value)
        return [] if value == nil
        return T.cast(value, T::Array[T::Hash[String, T.untyped]]) if value.is_a?(Array)
        [T.cast(value, T::Hash[String, T.untyped])]
      end

      sig { params(resource: T::Hash[String, T.untyped]).returns(T.nilable(Base)) }
      def self.materialize(resource)
        raw_type = resource["type"]
        type = "#{raw_type}"
        model_class = Base.class_for_type(type)
        unless model_class
          warn "no model class declares resource_type #{type}"
          return nil
        end
        raw_id = resource["id"]
        if raw_id == nil
          warn "a JSON:API resource of type #{type} has no id"
          return nil
        end
        id = "#{raw_id}"
        instance = model_class.get(id) || model_class.new
        attributes = resource["attributes"]
        instance.apply_attributes(attributes) if attributes
        instance.apply_attributes({"id" => id})
        model_class.put(instance)
      end

      sig { params(resource: T::Hash[String, T.untyped]).returns(T.nilable(Base)) }
      def self.pooled(resource)
        raw_type = resource["type"]
        model_class = Base.class_for_type("#{raw_type}")
        id = resource["id"]
        return nil unless model_class && id != nil
        model_class.get("#{id}")
      end

      # Relationship linkage ({"data": {id, type}} or a list of them) is
      # resolved from the pool; a record the document did not carry leaves
      # the relationship unloaded.
      sig { params(resource: T::Hash[String, T.untyped]).void }
      def self.hydrate(resource)
        instance = pooled(resource)
        linkages = resource["relationships"]
        return unless instance && linkages
        instance.relationships.each do |relationship|
          linkage = linkages[relationship.key] || linkages[relationship.name]
          next unless linkage
          data = linkage["data"]
          if relationship.many?
            next unless data.is_a?(Array)
            related = resources_in(data).map { |item| pooled(item) }
            next if related.include?(nil)
            instance.assign_relationship(relationship.name, related)
          elsif data == nil
            instance.assign_relationship(relationship.name, nil)
          elsif !data.is_a?(Array)
            related_one = pooled(T.cast(data, T::Hash[String, T.untyped]))
            instance.assign_relationship(relationship.name, related_one) if related_one
          end
        end
      end
    end
  end
end
