# typed: true
# frozen_string_literal: true

module Swill
  # Cocoa-style object bindings: bind(:name, to: object, key_path: "a.b")
  # keeps the property the binding names equal to the key path on the observed
  # object. This is the same binding markup establishes, asked for in Ruby
  # rather than read from an attribute, so the same options apply and the same
  # machinery runs.
  #
  # One binding per name; rebinding disposes the previous one first.
  #
  # null_placeholder: is Cocoa's NSNullPlaceholderBindingOption — what the
  # property receives when the path has no value, so a path that runs through a
  # nilable object can feed a property that is not one:
  #
  #   bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
  #        null_placeholder: [])
  #
  # transform: names a registered ValueTransformer, as transform= does in
  # markup.
  module ObjectBindings
    extend T::Sig

    # Keeps the property named by **binding** equal to **key_path** on **to**,
    # writing **null_placeholder** whenever the path has no value. Replaces any
    # existing binding of that name.
    #
    # Returns self.
    sig do
      params(
        binding: Symbol,
        to: Swill::Object,
        key_path: String,
        null_placeholder: T.untyped,
        transform: T.nilable(String)
      ).returns(T.untyped)
    end
    def bind(binding, to:, key_path:, null_placeholder: nil, transform: nil)
      unbind(binding)
      transformer = transform ? ValueTransformer.named(transform) : nil
      raise "unknown transform #{transform}" if transform && !transformer
      # One value serves every fall-back, so a placeholder is treated as
      # immutable, as Cocoa's is. Not giving one is giving nil.
      object_bindings[binding] = Binding.establish(
        BindingDestination.object_property, self, binding.to_s, to, key_path,
        transformer, null_placeholder, true
      )
      self
    end

    # Releases the binding named **binding,** if any.
    #
    # Returns self.
    sig { params(binding: Symbol).returns(T.untyped) }
    def unbind(binding)
      dispose = object_bindings[binding]
      return self unless dispose
      dispose.()
      object_bindings.delete(binding)
      self
    end

    # Releases every binding, as a controller does when it unloads.
    sig { returns(T.untyped) }
    def unbind_all
      object_bindings.each { |_binding, dispose| dispose.() }
      @object_bindings = {}
      self
    end

    # Keyed by binding name: binding a name replaces whatever was bound there.
    sig { returns(T::Hash[Symbol, T.untyped]) }
    def object_bindings # :nodoc:
      @object_bindings = {} unless @object_bindings
      @object_bindings
    end
  end
end
