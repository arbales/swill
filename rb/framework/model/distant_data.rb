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

        # Names mirror Sequel; persistence options stay on the server.
        macro def many_to_one(name, **options)
          declare_data_relationship(name, relationship_class(options), "one", "many_to_one")
        end

        macro def one_to_one(name, **options)
          declare_data_relationship(name, relationship_class(options), "one", "one_to_one")
        end

        macro def one_to_many(name, **options)
          declare_data_relationship(name, relationship_class(options), "many", "one_to_many")
        end

        macro def many_to_many(name, **options)
          declare_data_relationship(name, relationship_class(options), "many", "many_to_many")
        end

        macro def one_through_one(name, **options)
          declare_data_relationship(name, relationship_class(options), "one", "one_through_one")
        end

        macro def relationship_class(options)
          unknown = options.keys - [:class]
          raise ArgumentError, "unknown relationship options: #{unknown.join(', ')}" unless unknown.empty?

          options.fetch(:class)
        end

        macro def declare_data_relationship(name, model, kind, association)
          target = Swill::Runtime.class_name(model, self)
          data_fields[name.to_s] = { "kind" => kind, "model" => target, "association" => association }
          type = kind == "many" ? "Swill::Model::RelationshipCollection[#{target}]" : "T.nilable(#{target})"
          property name, type: type, default: nil, will_access: true
          if kind == "many"
            forward :"#{name}_controller", to: :relationship_controller, with: [name.to_s],
                    returns: "Swill::ArrayController"
          end
        end
      end

      # Whether +name+ has an authoritative value, including nil.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loaded?(name)
        data_field_loaded(name.to_s)
      end

      # Cached data remains readable while an invalidated relationship refreshes.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_stale?(name)
        data_field_stale(name.to_s)
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
