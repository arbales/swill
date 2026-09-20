# typed: true
# frozen_string_literal: true

module Swill
  # Cocoa-style object bindings: bind(:target, to: source, key_path: "a.b")
  # keeps the target property equal to the source path. Built entirely from
  # the runtime's path observation and metadata-checked writes, so a target
  # must be a declared property or generated writer. One binding per target;
  # rebinding disposes the previous observation first.
  #
  # null_placeholder: is Cocoa's NSNullPlaceholderBindingOption — what the
  # target receives when the path has no value, so a path that runs through a
  # nilable object can feed a property that is not one:
  #
  #   bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
  #        null_placeholder: [])
  module ObjectBindings
    extend T::Sig

    sig { params(target: Symbol, options: T::Hash[Symbol, T.untyped]).returns(T.untyped) }
    def bind(target, options)
      unbind(target)
      source = options[:to]
      path = options[:key_path]
      # One value serves every fall-back, so a placeholder is treated as
      # immutable, as Cocoa's is. Not giving one is giving nil.
      placeholder = options.fetch(:null_placeholder, nil)
      sync = ->(value) { Runtime.write(self, target, value == nil ? placeholder : value) }
      sync.(Runtime.readPath(source, path))
      object_bindings << {target: target, dispose: Runtime.observePath(source, path, sync)}
      self
    end

    sig { params(target: Symbol).returns(T.untyped) }
    def unbind(target)
      remaining = T.let([], T::Array[T::Hash[Symbol, T.untyped]])
      object_bindings.each do |binding|
        if binding[:target] == target
          binding[:dispose].()
        else
          remaining << binding
        end
      end
      @object_bindings = remaining
      self
    end

    sig { returns(T.untyped) }
    def unbind_all
      object_bindings.each { |binding| binding[:dispose].() }
      @object_bindings = []
      self
    end

    sig { returns(T::Array[T::Hash[Symbol, T.untyped]]) }
    def object_bindings
      @object_bindings = [] unless @object_bindings
      @object_bindings
    end
  end
end
