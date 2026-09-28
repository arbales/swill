# typed: true
# frozen_string_literal: true

module Swill
  # `ObjectBindings` adds bindings established from Ruby to the objects that
  # include it: `bind` keeps one of the object's properties equal to a key
  # path on an observed object. It is the same binding markup establishes
  # with `bind="path"`, with the same options and the same behavior, so an
  # object can bind to itself or to any observed object without markup.
  #
  # A controller binds its own property to a path under one of its
  # properties, supplying an empty array while the path has no value:
  #
  #     bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
  #          null_placeholder: [])
  #
  # Each name holds one binding, and a controller releases them all when it
  # unloads. See [Bindings](rdoc-ref:doc/bindings.md).
  module ObjectBindings
    extend T::Sig

    # Establishes a binding that keeps the property `binding` equal to
    # `key_path` on `to`, and returns the object. The property receives
    # `null_placeholder` whenever the path has no value; the default is nil.
    # `transform` names a registered `ValueTransformer`, as `transform` does in
    # markup, and raises when no transformer has that name. A binding already
    # established under this name is released first.
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

    # Releases the binding named `binding`, if there is one, and returns the
    # object.
    sig { params(binding: Symbol).returns(T.untyped) }
    def unbind(binding)
      dispose = object_bindings[binding]
      return self unless dispose
      dispose.()
      object_bindings.delete(binding)
      self
    end

    # Releases every binding on the object and returns it. A controller
    # calls this as it unloads.
    sig { returns(T.untyped) }
    def unbind_all
      object_bindings.each { |_binding, dispose| dispose.() }
      @object_bindings = {}
      self
    end

    # The release callable of each binding, by name.
    sig { returns(T::Hash[Symbol, T.untyped]) }
    def object_bindings # :nodoc:
      @object_bindings = {} unless @object_bindings
      @object_bindings
    end
  end
end
