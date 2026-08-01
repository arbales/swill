# frozen_string_literal: true

module Swill
  module Model
    # Observable attribute declarations, validation hooks, and wire-key
    # collection/application. Dirty tracking is optional and discovered by
    # protocol, allowing this concern to stand alone.
    module Attributes
      Attribute = Struct.new(:name, :key, :default, keyword_init: true)
      DEFAULT_UNSET = Object.new
      private_constant :DEFAULT_UNSET

      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        def attribute(name, key: name, default: DEFAULT_UNSET)
          name = name.to_sym
          default = nil if default.equal?(DEFAULT_UNSET)
          model_attributes[name] = Attribute.new(name: name, key: key.to_sym, default: default)
          property(name, default: default)

          define_method("#{name}=") do |value|
            previous = public_send(name)
            validator = "validate_#{name}"
            value = public_send(validator, value, previous) if respond_to?(validator)
            return value if previous == value

            mark_attribute_dirty(name, previous, value) if respond_to?(:mark_attribute_dirty, true)
            __send__(:property_store)[name] = value
            notify_change(name, previous, value)
            value
          end
        end
        alias attr attribute

        def model_attributes
          @model_attributes ||= {}
        end

        def inherited(subclass)
          super
          subclass.instance_variable_set(:@model_attributes, model_attributes.dup)
        end
      end

      def collect_attributes
        self.class.model_attributes.each_with_object({}) do |(_name, descriptor), result|
          result[descriptor.key] = public_send(descriptor.name)
        end
      end
      alias attributes collect_attributes

      def apply_attributes(source)
        source = source.collect_attributes if source.respond_to?(:collect_attributes)
        suspend_attribute_dirty_tracking do
          self.class.model_attributes.each_value do |descriptor|
            value, present = fetch_model_attribute(source, descriptor)
            public_send("#{descriptor.name}=", value) if present
          end
        end
        self
      end
      alias apply_attributes_from apply_attributes

      private

      def suspend_attribute_dirty_tracking
        if respond_to?(:without_dirty_tracking, true)
          without_dirty_tracking { yield }
        else
          yield
        end
      end

      def fetch_model_attribute(source, descriptor)
        keys = [descriptor.key, descriptor.key.to_s, descriptor.name, descriptor.name.to_s]
        key = keys.find { |candidate| source.respond_to?(:key?) && source.key?(candidate) }
        key ? [source[key], true] : [nil, false]
      end
    end
  end
end
