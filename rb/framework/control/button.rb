# typed: true
# frozen_string_literal: true

module Swill
  # A native button that participates in keyboard focus order.
  class Control::Button < Control
    extend T::Sig

    sig { params(element: Element).void }
    def initialize(element)
      super
      ensure_focusable
    end

    # Native buttons activate themselves; Enter must not commit an ancestor editor.
    sig { override.params(event: KeyboardEvent).void }
    def key_down(event)
      return if event.key == "Enter" || event.key == " "
      super
    end
  end
end
