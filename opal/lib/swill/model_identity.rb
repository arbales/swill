# frozen_string_literal: true

module Swill
  module Model
    # Observable ids and one lazily-created identity store per including class.
    module Identity
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        def store
          @model_store ||= Store.new
        end

        def get(id)
          store.get(id)
        end

        def include?(id)
          store.include?(id)
        end

        def put(instance)
          store.put(instance)
        end

        def remove(id)
          store.remove(id)
        end

        def clear
          store.clear
        end

        def values
          store.values
        end
      end

      attr_reader :id

      def id=(value)
        previous = @id
        return value if previous == value

        @id = value
        notify_change(:id, previous, value)
        value
      end
    end
  end
end
