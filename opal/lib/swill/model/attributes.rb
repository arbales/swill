# frozen_string_literal: true

module Swill
  module Model
    # Observable attribute declarations, validation hooks, and wire-key
    # collection/application. Dirty tracking is optional and discovered by
    # protocol, allowing this concern to stand alone.
    module Attributes
      Attribute = Struct.new(:name, :key, :default, keyword_init: true)

      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Declarations

        inheritable_registry :model_attributes

        def attribute(name, key: name, default: UNSET)
          name = name.to_sym
          default = nil if default.equal?(UNSET)
          model_attributes[name] = Attribute.new(name: name, key: key.to_sym, default: default)
          property(name, default: default)
        end
        alias attr attribute
      end

      def collect_attributes
        self.class.model_attributes.each_with_object({}) do |(_name, descriptor), result|
          result[descriptor.key] = public_send(descriptor.name)
        end
      end
      alias attributes collect_attributes

      def apply_attributes(source)
        write_attributes(source, track_dirty: false)
      end
      alias apply_attributes_from apply_attributes

      private

      # Observable setter hooks: declared attributes coerce through the
      # validate_<name> convention and mark dirty just before storage. Plain
      # properties on the same class pass through untouched.
      def coerce_property_value(name, value, previous)
        value = super
        return value unless self.class.model_attributes.key?(name)

        validator = "validate_#{name}"
        respond_to?(validator) ? public_send(validator, value, previous) : value
      end

      def property_will_change(name, previous, value)
        super
        return unless self.class.model_attributes.key?(name)

        mark_attribute_dirty(name, previous, value) if respond_to?(:mark_attribute_dirty, true)
      end

      # Server/codec application is clean; a user mutation (Drafts#apply_draft)
      # writes with +track_dirty+ so the change participates in dirty tracking.
      def write_attributes(source, track_dirty:)
        source = source.collect_attributes if source.respond_to?(:collect_attributes)
        suspend_attribute_dirty_tracking(track_dirty) do
          self.class.model_attributes.each_value do |descriptor|
            value, present = fetch_model_attribute(source, descriptor)
            public_send("#{descriptor.name}=", value) if present
          end
        end
        self
      end

      def suspend_attribute_dirty_tracking(track_dirty)
        if !track_dirty && respond_to?(:without_dirty_tracking, true)
          without_dirty_tracking { yield }
        else
          yield
        end
      end

      def fetch_model_attribute(source, descriptor)
        return [nil, false] unless source.respond_to?(:key?)

        key = Indifferent.locate(source, descriptor.key) || Indifferent.locate(source, descriptor.name)
        key.nil? ? [nil, false] : [source[key], true]
      end
    end
  end
end
