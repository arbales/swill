# typed: true
# frozen_string_literal: true

module Swill
  class Responder < Swill::Object
    extend T::Sig

    sig { returns(T.nilable(Responder)) }
    def next_responder
      nil
    end

    sig { params(name: String, sender: T.untyped, event: T.untyped).returns(T.untyped) }
    def perform_action(name, sender, event)
      Runtime.performAction(self, name, sender, event)
    end
  end
end
