# typed: true
# frozen_string_literal: true

module Swill
  class View < Responder
    extend T::Sig

    sig { params(element: T.untyped).void }
    def initialize(element)
      super()
      @element = element
      @controller = nil
      element.__swill_view__ = self
    end

    sig { returns(T.untyped) }
    def element
      @element
    end

    sig { returns(T.nilable(Controller)) }
    def controller_value
      @controller
    end

    sig { params(controller: T.nilable(Controller)).returns(T.nilable(Controller)) }
    def controller=(controller)
      @controller = controller
    end

    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      @controller
    end
  end
end
