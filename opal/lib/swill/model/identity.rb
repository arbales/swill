# frozen_string_literal: true

module Swill
  module Model
    # Observable ids and one lazily-created identity store per including class.
    # Includers must be Observable: the id is an ordinary declared property.
    module Identity
      def self.included(base)
        base.extend(ClassMethods)
        base.property(:id)
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

    end
  end
end
