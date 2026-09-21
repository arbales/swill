# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Stable membership for a query result or to-many relationship.
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

    class ResultSet < Collection
      extend T::Generic

      Element = type_member
    end
  end
end
