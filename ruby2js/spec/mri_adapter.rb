# typed: false
# Only a semantic oracle for explicitly shared code. This is not a second port:
# reuse the working Opal implementation's DOM-free observation on MRI.
require "sorbet-runtime"
require_relative "../../opal/lib/swill/core/support"
require_relative "../../opal/lib/swill/core/core_ext"
require_relative "../../opal/lib/swill/core/observable"

module Swill
  module Runtime
    def self.collect_attributes(object, only = nil)
      object.class.model_attributes.each_with_object({}) do |(_name, descriptor), result|
        next if only && !only.include?(descriptor[:name])
        # Wire keys are strings, as the JavaScript runtime's are.
        result[descriptor[:key].to_s] = object.public_send(descriptor[:name])
      end
    end

    def self.read(object, name)
      object.public_send(name)
    end

    def self.write(object, name, value)
      object.public_send("#{name}=", value)
    end

    def self.identity_store(klass)
      klass.instance_variable_get(:@identity_store) ||
        klass.instance_variable_set(:@identity_store, Swill::Model::Store.new)
    end

    # The class whose own setting has the value; a JSON:API type's class.
    def self.class_with_setting(name, value)
      ObjectSpace.each_object(Class).find do |klass|
        klass < Swill::Model::Base && klass.instance_variable_get(:"@#{name}") == value
      end
    end

    def self.relationship(object, name)
      relationships(object).find { |descriptor| descriptor["name"] == name.to_s }
    end

    # A class named by a string (a forward reference) resolves from the
    # model's namespace outwards.
    def self.relationships(object)
      object.class.ancestors.reverse.flat_map do |ancestor|
        ancestor.instance_variable_defined?(:@relationships) ? ancestor.instance_variable_get(:@relationships) : []
      end.map do |descriptor|
        type = descriptor["type"]
        next descriptor unless type.is_a?(String)
        parts = object.class.name.split("::")[0..-2]
        resolved = nil
        until resolved || parts.nil?
          candidate = (parts + [type]).join("::")
          resolved = Object.const_get(candidate) if Object.const_defined?(candidate)
          parts = parts.empty? ? nil : parts[0..-2]
        end
        descriptor.merge("type" => resolved || Object.const_get(type))
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

    # The wire key first, then the name; a wire hash from JSON has string
    # keys, a Ruby caller may pass symbols, as the JavaScript runtime's
    # plain objects accept either spelling.
    def self.apply_attributes(object, source)
      object.class.model_attributes.each_value do |descriptor|
        candidates = [descriptor[:key], descriptor[:name]].flat_map { |key| [key, key.to_s] }
        found = candidates.find { |key| source.key?(key) }
        object.public_send("#{descriptor[:name]}=", source[found]) if found
      end
      object
    end
  end

  class Object
    include Observable

    # async/await compile to JavaScript's keywords; on MRI a method is what
    # it is and await yields its argument.
    def self.async(definition)
      definition
    end

    def self.await(value)
      value
    end

    def await(value)
      value
    end

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

    # has_many/has_one: the observable property, its loading flag, and the
    # descriptor the runtime would install.
    def self.has_many(name, type:, key: name, url: nil)
      declare_relationship(name, type, key, url, "many", [])
    end

    def self.has_one(name, type:, key: name, url: nil)
      declare_relationship(name, type, key, url, "one", nil)
    end

    def self.declare_relationship(name, type, key, url, kind, default)
      property(name, type: T.untyped, default: default)
      property(:"#{name}_loading", type: T::Boolean, default: false)
      (@relationships ||= []) << {"name" => name.to_s, "key" => key.to_s, "kind" => kind, "type" => type, "url" => url}
    end
  end
end
