# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Production source for model attribute declarations. The compiler consumes
    # the class-side protocol statically and the runtime installs ordinary
    # JavaScript properties from the resulting metadata.
    module Attributes
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Swill::Declarations

        inheritable_registry :model_attributes

        def attribute(name, type:, default:, key: name)
          model_attributes[name] = {
            name: name,
            key: key,
            type: type,
            default: default
          }
          property(name, type: type, default: default)
        end
      end

      def collect_attributes
        Swill::Runtime.collect_attributes(self)
      end

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
