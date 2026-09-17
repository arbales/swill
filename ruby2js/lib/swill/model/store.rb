# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # One class's identity pool: the single instance a record has in the
    # page. A second instance arriving with a pooled id merges into the
    # first, so observers keep one source of truth.
    class Store < Swill::Object
      extend T::Sig

      sig { void }
      def initialize
        super()
        @instances = T.let({}, T::Hash[String, Base])
      end

      sig { params(id: String).returns(T.nilable(Base)) }
      def get(id)
        @instances.key?(id) ? @instances[id] : nil
      end

      sig { params(id: String).returns(T::Boolean) }
      def include?(id)
        @instances.key?(id)
      end

      sig { params(instance: Base).returns(Base) }
      def put(instance)
        id = instance.id
        raise "Store#put requires an id" if id == nil
        existing = @instances[id]
        if existing && existing != instance
          existing.apply_attributes(instance.collect_attributes)
          return existing
        end
        @instances[id] = instance
        instance
      end

      sig { params(id: String).void }
      def remove(id)
        @instances.delete(id)
      end

      sig { void }
      def clear
        @instances = {}
      end

      sig { returns(T::Array[Base]) }
      def values
        @instances.values
      end
    end
  end
end
