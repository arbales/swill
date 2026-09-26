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
  end
end
