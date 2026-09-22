# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Declaration and partial-field behavior for generated distant objects.
    module DistantData
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base) # :nodoc:
        base.extend(ClassMethods)
      end

      module ClassMethods # :nodoc:
        extend Swill::Declarations

        class_setting :data_model_name
        inheritable_registry :data_fields

        # Declares the authoritative server model name used on the wire.
        macro def model_name(name)
          data_model_name(name)
        end

        # Declares a partially loadable scalar field.
        macro def attribute(name, type:, default: nil, key: name)
          model_attributes[name.to_s] = {
            "name" => name.to_s, "key" => key.to_s,
            "type" => Swill::Runtime.type_name(type), "default" => default
          }
          data_fields[name.to_s] = { "kind" => "field", "type" => Swill::Runtime.type_name(type) }
          property name, type: type, default: default, attribute: true, key: key, will_access: true
        end

        # Declares a partially loadable to-one relationship.
        macro def has_one(name, model:)
          data_fields[name.to_s] = { "kind" => "one", "model" => model }
          property name, type: "T.nilable(#{model})", default: nil, will_access: true
        end

        # Declares a partially loadable to-many relationship.
        macro def has_many(name, model:)
          data_fields[name.to_s] = { "kind" => "many", "model" => model }
          property name, type: "Swill::Model::Collection[#{model}]", default: nil, will_access: true
        end
      end

      # Whether +name+ has an authoritative value, including nil.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loaded?(name)
        data_field_loaded(name.to_s)
      end

      # Whether +name+ currently has a request in flight.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loading?(name)
        data_field_loading(name.to_s)
      end

      # The last loading error for +name+, if any.
      sig { params(name: Symbol).returns(T.nilable(String)) }
      def field_error(name)
        data_field_error(name.to_s)
      end

    end
  end
end
