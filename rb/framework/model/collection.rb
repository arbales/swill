# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Stable membership for a query result or to-many association.
    class Collection < Swill::Object
      extend T::Sig
      extend T::Generic

      Element = type_member

      property :records, type: T::Array[T.untyped], default: []
      property :loading, type: T::Boolean, default: false
      property :loaded, type: T::Boolean, default: false
      property :error, type: T.nilable(String), default: nil

      sig { params(records: T::Array[T.untyped]).returns(T.self_type) }
      def replace(records)
        self.records = records
        self.error = nil
        self.loaded = true
        self.loading = false
        self
      end

      sig { returns(T.nilable(Element)) }
      def first
        T.unsafe(records.first)
      end

      sig { returns(T.nilable(Element)) }
      def last
        T.unsafe(records.last)
      end

      sig { returns(Integer) }
      def size
        records.size
      end

      sig { returns(T::Boolean) }
      def empty?
        records.empty?
      end

      sig { returns(T::Boolean) }
      def loaded?
        loaded
      end

      sig { returns(T::Boolean) }
      def loading?
        loading
      end

      sig { params(index: Integer).returns(T.nilable(Element)) }
      def at(index)
        T.unsafe(records[index])
      end
    end

    # Read-only membership; only authoritative hydration replaces its snapshot.
    class AssociationCollection < Collection
      extend T::Generic

      Element = type_member

      property :records, type: T::Array[T.untyped], default: [], will_access: true
      property :stale, type: T::Boolean, default: false

      sig { returns(T::Boolean) }
      def stale?
        stale
      end

      sig { params(owner: DistantObject, name: String).void }
      def attach_association(owner, name)
        @association_owner = owner
        @association_name = name
      end

      sig { params(name: String).void }
      def property_will_access(name)
        super
        owner = @association_owner
        owner.property_will_access(@association_name) if owner && name == "records"
      end

      sig { void }
      def initialize
        super
        @applying_membership = T.let(false, T::Boolean)
        @association_owner = T.let(nil, T.nilable(DistantObject))
        @association_name = T.let("", String)
        records.freeze
      end

      sig { override.params(_records: T::Array[T.untyped]).returns(T.self_type) }
      def replace(_records)
        raise "Association membership is read-only; use a server operation"
      end

      sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
      def coerce_property_value(name, value, previous)
        if name == "records" && !@applying_membership
          raise "Association membership is read-only; use a server operation"
        end

        super
      end

      # Internal hydration entry point. Copy once per patch, never per read.
      sig { params(records: T::Array[T.untyped]).void }
      def apply_membership(records)
        @applying_membership = true
        begin
          self.records = records.dup.freeze
        ensure
          @applying_membership = false
        end
      end
    end

    class ResultSet < Collection
      extend T::Generic

      Element = type_member
    end
  end
end
