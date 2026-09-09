# typed: true
# frozen_string_literal: true

module Swill
  class Responder < Swill::Object
    extend T::Sig

    sig { returns(T.nilable(Responder)) }
    def next_responder
      nil
    end

    # Target/action: the first responder in the chain that responds to the
    # name handles it, as respond_to? would decide in Ruby. A same-named
    # property or a method of the wrong arity is an error there, not a reason
    # to keep walking. An action nobody handles is also an error.
    sig { params(name: String, sender: T.untyped, event: T.untyped).returns(T.untyped) }
    def perform_action(name, sender, event)
      return Runtime.performAction(self, name, sender, event) if Runtime.respondsTo(self, name)
      target = next_responder
      raise "Unhandled action: #{name}" unless target
      target.perform_action(name, sender, event)
    end
  end
end
