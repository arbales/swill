# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Generated remote model shape. The browser keeps presence and transport
    # state outside ordinary values, so unknown and known nil read the same.
    module RemoteData
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Swill::Declarations

        class_setting :remote_model_name
        inheritable_registry :remote_fields

        macro def remote_model(name)
          remote_model_name(name)
        end

        macro def remote_attribute(name, type:)
          remote_fields[name.to_s] = { "kind" => "field", "type" => Swill::Runtime.type_name(type) }
          property name, type: type, default: nil, will_access: true
        end

        macro def remote_has_one(name, model:)
          remote_fields[name.to_s] = { "kind" => "one", "model" => model }
          property name, type: "T.nilable(#{model})", default: nil, will_access: true
        end

        macro def remote_has_many(name, model:)
          remote_fields[name.to_s] = { "kind" => "many", "model" => model }
          property name, type: "Swill::Model::Collection[#{model}]", default: nil, will_access: true
        end

      end

      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loaded?(name)
        Swill::Runtime.data_field_loaded(self, name.to_s)
      end

      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loading?(name)
        Swill::Runtime.data_field_loading(self, name.to_s)
      end

      sig { params(name: Symbol).returns(T.nilable(String)) }
      def field_error(name)
        Swill::Runtime.data_field_error(self, name.to_s)
      end

      sig { params(name: Symbol).returns(T.untyped) }
      def load_field(name)
        Swill::Runtime.load_data_field(self, name.to_s, false)
      end

      sig { params(name: Symbol).returns(T.untyped) }
      def reload_field(name)
        Swill::Runtime.load_data_field(self, name.to_s, true)
      end
    end
  end
end
