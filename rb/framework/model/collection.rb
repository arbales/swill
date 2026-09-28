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

    # `AssociationCollection` is the value of a to-many association on a
    # `Distant::Object`: one stable collection per association whose
    # membership the server replaces and the application reads. Its state —
    # `loaded`, `stale`, `loading` and `error` — is its owner's state for
    # the association, read through the owner's `<name>_loaded`,
    # `<name>_stale`, `<name>_loading` and `<name>_error` properties, so a
    # binding may follow either.
    class AssociationCollection < Collection
      extend T::Generic

      Element = type_member

      # The records the server last sent, frozen. Reading them on a saved
      # owner requests the association when it is unloaded or stale.
      property :records, type: T::Array[T.untyped], default: [], will_access: true

      # Whether the owner holds a membership the server sent, nil included.
      property :loaded, type: T::Boolean do
        association_state("loaded") == true
      end

      # Whether the server has invalidated the membership since it was sent.
      # A stale collection keeps its records until it refreshes.
      property :stale, type: T::Boolean do
        association_state("stale") == true
      end

      # Whether a request for the membership is in flight.
      property :loading, type: T::Boolean do
        association_state("loading") == true
      end

      # The message of the last failed request for the membership, or nil.
      property :error, type: T.nilable(String) do
        T.cast(association_state("error"), T.nilable(String))
      end

      # `stale`, as a predicate.
      sig { returns(T::Boolean) }
      def stale?
        stale
      end

      # Makes this collection the value of the association `name` on
      # `owner`. `Distant::Object` calls this as it creates the collection;
      # from then on the collection's state is read from the owner.
      sig { params(owner: Distant::Object, name: String).void }
      def attach_association(owner, name)
        @association_owner = owner
        @association_name = name
      end

      # The owner's `<name>_<state>` property, or nil before an owner is
      # attached. Reading it inside a computed property makes that property
      # follow the owner's.
      sig { params(state: String).returns(T.untyped) }
      def association_state(state)
        owner = @association_owner
        return nil unless owner
        Swill::Runtime.read(owner, "#{@association_name}_#{state}")
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
        @association_owner = T.let(nil, T.nilable(Distant::Object))
        @association_name = T.let("", String)
        records.freeze
      end

      # Raises: association membership is read-only and changes through a
      # server operation.
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

      # Replaces the membership with a frozen copy of `records`. The owner
      # calls this as it applies the server's value for the association.
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
