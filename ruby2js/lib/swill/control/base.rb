# typed: true
# frozen_string_literal: true

module Swill
  # NSControl analog: a view over a form element. Its delegate may keep it
  # from resigning first responder, as NSControlTextEditingDelegate's
  # control:textShouldEndEditing: does, so an editor can hold focus in a
  # control until the edit is accepted.
  class Control < View
    extend T::Sig

    property :delegate, type: T.untyped, default: nil

    sig { override.params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      current = self.delegate
      if current && current.respond_to?(:control_should_resign_first_responder)
        return false unless current.control_should_resign_first_responder(self, next_responder)
      end
      super(next_responder)
    end
  end
end
