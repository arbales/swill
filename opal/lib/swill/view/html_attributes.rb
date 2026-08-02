# frozen_string_literal: true
# backtick_javascript: true

module Swill
  module HTMLAttributes
    Mapping = Struct.new(:attribute, :property, :codec, :value, keyword_init: true)

    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      extend Declarations

      inheritable_registry :html_attribute_mappings, :array

      def html_attribute(attribute, to:, codec: Restoration::Codecs::String, value: UNSET)
        html_attribute_mappings << Mapping.new(
          attribute: attribute.to_s,
          property: to.to_sym,
          codec: codec,
          value: value
        )
      end
    end

    def apply_html_attributes(element)
      self.class.html_attribute_mappings.each do |mapping|
        next unless `#{element}.hasAttribute(#{mapping.attribute})`

        raw = `#{element}.getAttribute(#{mapping.attribute})`
        value = if mapping.value.equal?(UNSET)
                  mapping.codec.decode(raw.nil? ? "true" : raw.to_s)
                else
                  mapping.value
                end
        public_send("#{mapping.property}=", value)
      rescue StandardError => error
        raise ArgumentError, "invalid #{mapping.attribute.inspect} attribute for #{self.class}: #{error.message}"
      end
    end
  end
end
