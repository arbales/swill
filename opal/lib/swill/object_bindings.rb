# frozen_string_literal: true

module Swill
  # Cocoa-style object bindings. Including objects keep one binding per target
  # property; replacing a binding disposes the old key-path observation first.
  module ObjectBindings
    def bind(target, to:, key_path:)
      target = target.to_sym
      unbind(target)
      segments = key_path.to_s.split(".").reject(&:empty?)
      sync = -> { public_send("#{target}=", KeyPath.read(to, segments)) }
      sync.call
      object_bindings[target] = KeyPath.observe(to, segments, &sync)
      self
    end

    def unbind(target)
      object_bindings.delete(target.to_sym)&.call
      self
    end

    def unbind_all
      object_bindings.values.each(&:call)
      object_bindings.clear
      self
    end

    private

    def object_bindings
      @object_bindings ||= {}
    end
  end
end
