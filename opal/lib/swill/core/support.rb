# frozen_string_literal: true

module Swill
  # The one "no argument given" sentinel, shared by every declaration macro
  # that must distinguish an omitted value from an explicit nil.
  UNSET = Object.new
  def UNSET.inspect
    "Swill::UNSET"
  end

  # String/symbol-indifferent access into wire-shaped hashes. Payloads arrive
  # string-keyed from JSON and symbol-keyed from Ruby callers; declarations
  # store symbols. Indifference lives here once instead of at every boundary.
  module Indifferent
    module_function

    # The key actually present in +hash+ for +key+ (as given, as symbol, or as
    # string), or nil. Lets callers distinguish a missing key from a nil value.
    def locate(hash, key)
      return key if hash.key?(key)

      symbol = key.to_sym
      return symbol if hash.key?(symbol)

      string = key.to_s
      hash.key?(string) ? string : nil
    end

    def key?(hash, key)
      !locate(hash, key).nil?
    end

    def fetch(hash, key)
      found = locate(hash, key)
      found.nil? ? nil : hash[found]
    end
  end

  # Class-level declaration macros, extended into a concern's ClassMethods
  # module. Implemented once so every registry inherits the same way.
  module Declarations
    # A per-class declaration collection that copies from the superclass on
    # first touch — Sequel's inherited-configuration semantics without each
    # concern defining its own `inherited` hook.
    def inheritable_registry(name, initial = :hash)
      ivar = :"@#{name}"
      define_method(name) do
        existing = instance_variable_get(ivar)
        return existing if existing

        inherited = superclass.respond_to?(name) ? superclass.public_send(name).dup : nil
        instance_variable_set(ivar, inherited || (initial == :array ? [] : {}))
      end
    end

    # A combined class-level getter/setter that reads through to the
    # superclass until written. The optional block coerces the assigned value
    # (and may maintain side registries) before storage.
    def class_setting(name, &on_write)
      ivar = :"@#{name}"
      define_method(name) do |value = UNSET|
        if value.equal?(UNSET)
          return instance_variable_get(ivar) if instance_variable_defined?(ivar)

          superclass.respond_to?(name) ? superclass.public_send(name) : nil
        else
          value = instance_exec(value, &on_write) if on_write
          instance_variable_set(ivar, value)
        end
      end
    end
  end
end
