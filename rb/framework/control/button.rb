# typed: true
# frozen_string_literal: true

module Swill
  # `Control::Button` wraps a native button and participates in keyboard focus.
  # Enter and Space retain the button's activation behavior; other keys follow
  # the responder chain.
  #
  #     <button klass="Swill::Control::Button" data-action="save">Save</button>
  #
  # See [Controls](rdoc-ref:doc/controls.md) for declaring buttons and actions.
  class Control::Button < Control
    extend T::Sig

    # Creates a control for `element` and adds `tabindex="0"` when no tabindex
    # is present. An existing tabindex is preserved.
    sig { params(element: Element).void }
    def initialize(element)
      super
      ensure_focusable
    end

    # Invoked for a key event. Leaves Enter and Space to the native button
    # and passes other keys to the superclass. An override should call `super`
    # for keys it does not handle.
    sig { override.params(event: KeyboardEvent).void }
    def key_down(event)
      return if event.key == "Enter" || event.key == " "
      super
    end
  end
end
