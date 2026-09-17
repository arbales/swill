# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # A model class's configuration and identity pool: the endpoint and
    # JSON:API type it answers to, its codec, and one instance per id.
    #
    #   endpoint "/api/menus"
    #   resource_type "menus"
    #   codec Swill::Model::PlainJSON   # JSON:API unless declared
    module Identity
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Swill::Declarations
        extend T::Sig

        class_setting :endpoint
        class_setting :resource_type
        class_setting :codec

        sig { returns(Store) }
        def store
          Swill::Runtime.identity_store(self)
        end

        sig { params(id: String).returns(T.nilable(T.attached_class)) }
        def get(id)
          T.unsafe(store.get(id))
        end

        sig { params(id: String).returns(T::Boolean) }
        def pooled?(id)
          store.include?(id)
        end

        sig { params(instance: Base).returns(T.attached_class) }
        def put(instance)
          T.unsafe(store.put(instance))
        end

        sig { params(id: String).void }
        def remove(id)
          store.remove(id)
        end

        sig { void }
        def clear
          store.clear
        end

        sig { returns(T::Array[T.attached_class]) }
        def values
          T.unsafe(store.values)
        end
      end
    end
  end
end
