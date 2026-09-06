# typed: true
# frozen_string_literal: true

module Swill
  # Class-level declaration macros shared by framework concerns. Ruby2JS
  # recognizes these declarations statically; MRI executes this implementation
  # for source-shared model and contract tests.
  module Declarations
    def inheritable_registry(name, initial = :hash)
      ivar = :"@#{name}"
      define_method(name) do
        existing = instance_variable_get(ivar)
        return existing if existing

        inherited = superclass.respond_to?(name) ? superclass.public_send(name).dup : nil
        instance_variable_set(ivar, inherited || (initial == :array ? [] : {}))
      end
    end

    def class_setting(name, &on_write)
      ivar = :"@#{name}"
      define_method(name) do |value = Swill::UNSET|
        if value.equal?(Swill::UNSET)
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
