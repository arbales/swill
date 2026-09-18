# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Production source for model attribute declarations. The compiler consumes
    # the class-side protocol statically and the runtime installs ordinary
    # JavaScript properties from the resulting metadata.
    module Attributes
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Swill::Declarations

        inheritable_registry :model_attributes

        # An attribute is a property that carries a wire key and an attribute
        # mark: the validation, dirty tracking, and codec paths all read those
        # marks off the property descriptor. The registry is the same
        # declaration as data, for code that asks the class rather than an
        # instance.
        macro def attribute(name, type:, default:, key: name)
          model_attributes[name.to_s] = {
            "name" => name.to_s, "key" => key.to_s,
            "type" => Swill::Runtime.type_name(type), "default" => default
          }
          property name, type: type, default: default, attribute: true, key: key
        end

        # Materialize an instance from a wire hash keyed by attribute keys,
        # as Opal's Base.new(values) does.
        def from_attributes(source)
          self.new.apply_attributes(source)
        end
      end

      # Attribute values by wire key.
      sig { returns(T::Hash[T.untyped, T.untyped]) }
      def collect_attributes
        Swill::Runtime.collect_attributes(self)
      end

      sig { params(source: T.untyped).returns(T.self_type) }
      def apply_attributes(source)
        Swill::Runtime.apply_attributes(self, source)
      end

      # Declared attributes coerce through the validate_<name>(value, previous)
      # convention, resolved from metadata. A validator may raise to reject.
      def coerce_property_value(name, value, previous)
        value = super
        Swill::Runtime.validate_attribute(self, name, value, previous)
      end

      def property_will_change(name, previous, value)
        super
      end
    end
  end
end
