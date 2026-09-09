# typed: true
# frozen_string_literal: true

module Swill
  # Cocoa-style object bindings: bind(:target, to: source, key_path: "a.b")
  # keeps the target property equal to the source path. Built entirely from
  # the runtime's path observation and metadata-checked writes, so a target
  # must be a declared property or generated writer. One binding per target;
  # rebinding disposes the previous observation first.
  module ObjectBindings
    extend T::Sig

    sig { params(target: Symbol, options: T::Hash[Symbol, T.untyped]).returns(T.untyped) }
    def bind(target, options)
      unbind(target)
      source = options[:to]
      path = options[:key_path]
      sync = ->(value) { Runtime.write(self, target, value) }
      sync.(Runtime.readPath(source, path))
      object_bindings.push({target: target, dispose: Runtime.observePath(source, path, sync)})
      self
    end

    sig { params(target: Symbol).returns(T.untyped) }
    def unbind(target)
      remaining = []
      object_bindings.forEach do |binding|
        if binding.target == target
          binding.dispose.()
        else
          remaining.push(binding)
        end
      end
      @object_bindings = remaining
      self
    end

    sig { returns(T.untyped) }
    def unbind_all
      object_bindings.forEach { |binding| binding.dispose.() }
      @object_bindings = []
      self
    end

    sig { returns(T.untyped) }
    def object_bindings
      @object_bindings = [] unless @object_bindings
      @object_bindings
    end
  end
end
