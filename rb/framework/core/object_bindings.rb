# typed: true
# frozen_string_literal: true

module Swill
  # Cocoa-style object bindings: bind(:target, to: source, key_path: "a.b")
  # keeps the target property equal to the source path. This is the same
  # binding markup establishes, asked for in Ruby rather than read from an
  # attribute, so the same options apply and the same machinery runs.
  #
  # One binding per target; rebinding disposes the previous one first.
  #
  # null_placeholder: is Cocoa's NSNullPlaceholderBindingOption — what the
  # target receives when the path has no value, so a path that runs through a
  # nilable object can feed a property that is not one:
  #
  #   bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
  #        null_placeholder: [])
  #
  # transform: names a registered ValueTransformer, as transform= does in
  # markup.
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
        null_placeholder: T.untyped,
        transform: T.nilable(String)
      ).returns(T.untyped)
    end
    def bind(target, to:, key_path:, null_placeholder: nil, transform: nil)
      unbind(target)
      transformer = transform ? ValueTransformer.named(transform) : nil
      raise "unknown transform #{transform}" if transform && !transformer
      # One value serves every fall-back, so a placeholder is treated as
      # immutable, as Cocoa's is. Not giving one is giving nil.
      object_bindings[target] = Binding.establish(
        BindingDestination.object_property, self, target.to_s, to, key_path,
        transformer, null_placeholder, true
      )
      self
    end

    # Releases the binding on +target+, if any. Answers self.
    sig { params(target: Symbol).returns(T.untyped) }
    def unbind(target)
      dispose = object_bindings[target]
      return self unless dispose
      dispose.()
      object_bindings.delete(target)
      self
    end

    # Releases every binding, as a controller does when it unloads.
    sig { returns(T.untyped) }
    def unbind_all
      object_bindings.each { |_target, dispose| dispose.() }
      @object_bindings = {}
      self
    end

    # Keyed by target: binding a target replaces whatever was bound there.
    sig { returns(T::Hash[Symbol, T.untyped]) }
    def object_bindings # :nodoc:
      @object_bindings = {} unless @object_bindings
      @object_bindings
    end
  end
end
