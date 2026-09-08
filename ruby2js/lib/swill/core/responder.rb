# typed: true
# frozen_string_literal: true

module Swill
  class Responder < Swill::Object
    extend T::Sig

    sig { returns(T.nilable(Responder)) }
    def next_responder
      nil
    end

    # Target/action: handle the action here when a generated method with a
    # compatible arity exists, otherwise continue up the responder chain. An
    # action nobody handles is an error, not a silent no-op.
    sig { params(name: String, sender: T.untyped, event: T.untyped).returns(T.untyped) }
    def perform_action(name, sender, event)
      return Runtime.performAction(self, name, sender, event) if Runtime.hasAction(self, name)
      target = next_responder
      raise "Unhandled action: #{name}" unless target
      target.perform_action(name, sender, event)
    end
  end
end
