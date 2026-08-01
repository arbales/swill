# frozen_string_literal: true

module Swill
  # Base form control view. Delegates may veto first-responder resignation.
  class Control < View
    attr_accessor :delegate

    def resign_first_responder(next_responder = nil)
      if delegate&.respond_to?(:control_should_resign_first_responder) &&
         delegate.control_should_resign_first_responder(self, next_responder) == false
        return false
      end

      super
    end
  end
end
