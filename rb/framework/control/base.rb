# typed: true
# frozen_string_literal: true

module Swill
  # A Control is a small View that manages a single control from a user-perspective.
  # This may involve a number of HTML elements that the view coordinates, but they act
  # as one discrete package. If you're tempted to create a subview of a Control, then
  # you're probably exceeding its intended scope.
  #
  # Control is somewhat thin at the moment, but I imagine it growing over time.
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
