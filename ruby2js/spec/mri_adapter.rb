# typed: false
# Only a semantic oracle for explicitly shared code. This is not a second port:
# reuse the working Opal implementation's DOM-free observation on MRI.
require "sorbet-runtime"
require_relative "../../opal/lib/swill/core/support"
require_relative "../../opal/lib/swill/core/core_ext"
require_relative "../../opal/lib/swill/core/observable"

module Swill
  module Runtime
    def self.collect_attributes(object)
      object.class.model_attributes.each_with_object({}) do |(_name, descriptor), result|
        result[descriptor[:key]] = object.public_send(descriptor[:name])
      end
    end

    def self.isAttribute(object, name)
      object.class.model_attributes.key?(name.to_sym)
    end

    def self.validate_attribute(object, name, value, previous)
      return value unless isAttribute(object, name)

      validator = "validate_#{name}"
      object.respond_to?(validator) ? object.public_send(validator, value, previous) : value
    end

    def self.apply_attributes(object, source)
      object.class.model_attributes.each_value do |descriptor|
        key = descriptor[:key]
        name = descriptor[:name]
        value = source[key] if source.key?(key)
        value = source[name] if !source.key?(key) && source.key?(name)
        object.public_send("#{name}=", value) if source.key?(key) || source.key?(name)
      end
      object
    end
  end

  class Object
    include Observable

    # Empty collection defaults are fresh per instance, as generated
    # defaultValue functions are in JavaScript.
    def self.property(name, type:, default: nil, &block)
      return super(name, &block) if block

      fresh = default.is_a?(Array) || default.is_a?(Hash) ? -> { default.dup } : default
      super(name, default: fresh)
    end

    def self.attribute(name, type:, default:, key: name)
      property(name, type: type, default: default)
    end
  end
end
