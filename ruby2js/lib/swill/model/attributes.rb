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

      def coerce_property_value(name, value, previous)
        super
      end

      def property_will_change(name, previous, value)
        super
      end
    end
  end
end
