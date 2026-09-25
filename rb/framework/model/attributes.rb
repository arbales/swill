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

        # Materialize an instance from a wire hash keyed by attribute keys.
        def from_attributes(source)
          self.new.apply_attributes(source)
        end
      end

      # Attribute values by wire key.
      sig { returns(T::Hash[T.untyped, T.untyped]) }
      def collect_attributes
        collect_selected_attributes(nil)
      end

      sig { params(only: T.nilable(T::Array[T.untyped])).returns(T::Hash[T.untyped, T.untyped]) }
      def collect_selected_attributes(only)
        T.bind(self, Swill::Model::Base)
        selected = only ? T.cast(only, T::Array[T.untyped]).map { |name| name.to_s } : nil
        result = T.let({}, T::Hash[T.untyped, T.untyped])
        self.class.model_attributes.each do |name, descriptor|
          declared_name = T.cast(name, String)
          declared = T.cast(descriptor, T::Hash[String, T.untyped])
          next if selected && !selected.include?(declared_name)
          result[declared["key"]] = Swill::Runtime.read(self, declared_name)
        end
        result
      end

      sig { params(source: T.untyped).returns(T.self_type) }
      def apply_attributes(source)
        T.bind(self, Swill::Model::Base)
        values = T.cast(source, T::Hash[T.untyped, T.untyped])
        self.class.model_attributes.each do |name, descriptor|
          declared_name = T.cast(name, String)
          declared = T.cast(descriptor, T::Hash[String, T.untyped])
          key = T.cast(declared["key"], String)
          candidates = [key, key.to_sym, declared_name, declared_name.to_sym]
          found = candidates.find { |candidate| values.key?(candidate) }
          next unless found
          value = applied_attribute_value(declared, values[found])
          Swill::Runtime.write(self, declared_name, value)
        end
        self
      end

      # Declared attributes coerce through the validate_<name>(value, previous)
      # convention, resolved from metadata. A validator may raise to reject.
      def coerce_property_value(name, value, previous)
        T.bind(self, Swill::Model::Base)
        value = super
        return value unless self.class.model_attributes.key?(name)
        validator = "validate_#{name}"
        return value unless Swill::Runtime.responds_to(self, validator)
        unless Swill::Runtime.method_accepts(self, validator, 2)
          raise "Validator must take a value and a previous value: #{validator}"
        end
        Swill::Runtime.invoke(self, validator, value, previous)
      end

      def property_will_change(name, previous, value)
        super
      end

      sig { params(descriptor: T::Hash[String, T.untyped], value: T.untyped).returns(T.untyped) }
      def applied_attribute_value(descriptor, value)
        return value unless value.nil?
        type = T.cast(descriptor["type"], String)
        return value if type == "T.untyped" || type == "NilClass" || type.start_with?("T.nilable(")
        Swill::Runtime.duplicate(descriptor["default"])
      end
    end
  end
end
