# typed: false
# frozen_string_literal: true

# Declaration-backed model attributes, on MRI: the mirror of
# runtime/attributes.mjs. Attributes are ordinary properties carrying an
# attribute mark and a wire key, so every answer here is read from the
# installed property descriptors rather than from a registry.
module Swill
  module Runtime
    class << self
      def isAttribute(object, name)
        !!property_descriptor(object, name)&.fetch("attribute", false)
      end

      # Declared attributes coerce through validate_<name>(value, previous).
      def validate_attribute(object, name, value, previous)
        return value unless isAttribute(object, name)
        validator = "validate_#{name}"
        object.respond_to?(validator) ? object.public_send(validator, value, previous) : value
      end

      def outlets(object)
        declarations(object.class, "properties").each_value.select { |descriptor| descriptor["outlet"] }
      end

      # Attribute values keyed by wire key; with names, only those attributes.
      def collect_attributes(object, only = nil)
        declarations(object.class, "properties").each_value.with_object({}) do |descriptor, result|
          next unless descriptor["attribute"] && !descriptor["computed"]
          name = descriptor["name"]
          next if only && !only.map(&:to_s).include?(name)
          result[descriptor["key"]] = object.public_send(name)
        end
      end

      # The wire key first, then the name. A wire hash from JSON has string
      # keys and a Ruby caller may pass symbols, as the plain objects the
      # JavaScript runtime reads accept either spelling.
      def apply_attributes(object, source)
        declarations(object.class, "properties").each_value do |descriptor|
          next unless descriptor["attribute"] && !descriptor["computed"]
          candidates = [descriptor["key"], descriptor["name"]].flat_map { |key| [key, key.to_sym] }
          found = candidates.find { |key| source.key?(key) }
          object.public_send("#{descriptor['name']}=", applied(descriptor, source[found])) if found
        end
        object
      end

      # A document's nil for an attribute whose declaration does not admit nil
      # is an absent value, not a value: the declared default stands, so a
      # reader the compiler types String really holds a String. Nilable and
      # untyped attributes keep the nil.
      def applied(descriptor, value)
        return value unless value.nil?
        admits_nil?(descriptor["type"]) ? value : descriptor["default_value"].call
      end

      # On MRI a descriptor's type is the declared object — a class, or a
      # sorbet type — where the browser reads the text the compiler
      # serialized. Both spell themselves the same way.
      def admits_nil?(type)
        return true if type.nil?
        text = type.to_s
        text == "T.untyped" || text == "NilClass" || text.start_with?("T.nilable(")
      end
    end
  end
end
