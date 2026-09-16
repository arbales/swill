# typed: true
# frozen_string_literal: true

module Swill
  # NSEditor analog: owns the object being edited as represented_object, so
  # descendant bindings resolve against it. commit_editing pushes pending
  # edits into that object and says whether it could; discard_editing drops
  # them. Enter commits and Escape discards through the responder chain.
  class Controller::Editor < Controller
    extend T::Sig

    sig { override.returns(T.nilable(Symbol)) }
    def binding_root
      :represented_object
    end

    # Two-way bindings have already written into the object, so nothing is
    # pending and the answer is yes. A subclass whose control holds a value
    # it cannot push back returns false.
    sig { returns(T::Boolean) }
    def commit_editing
      true
    end

    sig { void }
    def discard_editing; end

    sig { override.params(event: T.untyped).void }
    def insert_newline(event)
      event.preventDefault()
      commit_editing
    end

    sig { override.params(event: T.untyped).void }
    def cancel_operation(event)
      discard_editing
    end
  end
end
