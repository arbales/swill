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

    # Keeps +target+ equal to +key_path+ on +to+, writing +null_placeholder+
    # whenever the path has no value. Replaces any existing binding on
    # +target+. Answers self.
    sig do
      params(
        target: Symbol,
        to: Swill::Object,
        key_path: String,
        null_placeholder: T.untyped
      ).returns(T.untyped)
    end
    def bind(target, to:, key_path:, null_placeholder: nil)
      unbind(target)
      # One value serves every fall-back, so a placeholder is treated as
      # immutable, as Cocoa's is. Not giving one is giving nil.
      sync = ->(value) { Runtime.write(self, target, value == nil ? null_placeholder : value) }
      sync.(Runtime.readPath(to, key_path))
      object_bindings << {target: target, dispose: Runtime.observePath(to, key_path, sync)}
      self
    end

    # Releases the binding on +target+, if any. Answers self.
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

    # Releases every binding, as a controller does when it unloads.
    sig { returns(T.untyped) }
    def unbind_all
      object_bindings.each { |binding| binding[:dispose].() }
      @object_bindings = []
      self
    end

    sig { returns(T::Array[T::Hash[Symbol, T.untyped]]) }
    def object_bindings # :nodoc:
      @object_bindings = [] unless @object_bindings
      @object_bindings
    end
  end
end
