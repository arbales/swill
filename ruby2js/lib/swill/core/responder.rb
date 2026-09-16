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
      target = action_target(name)
      raise "Unhandled action: #{name}" unless target
      Runtime.performAction(target, name, sender, event)
    end

    # TODO: It's unclear to me that this is the right place to handle this bubbling.
    sig { params(name: String).returns(T.nilable(Responder)) }
    def action_target(name)
      return self if Runtime.respondsTo(self, name)
      target = next_responder
      target ? target.action_target(name) : nil
    end

    sig { returns(T::Boolean) }
    def accepts_first_responder?
      false
    end

    # Return false to refuse to become First Reponder.
    sig { returns(T::Boolean) }
    def become_first_responder
      true
    end

    # Return false to refuse to resign to the provided next Reaponder.
    sig { params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      true
    end

    sig { params(event: KeyboardEvent).void }
    def key_down(event)
      case event.key
      when "Escape" then cancel_operation(event)
      when "Enter" then insert_newline(event)
      when "Tab" then complete(event)
      else
        target = next_responder
        target.key_down(event) if target
      end
    end

    sig { params(event: KeyboardEvent).void }
    def key_up(event)
      target = next_responder
      target.key_up(event) if target
    end

    sig { params(event: KeyboardEvent).void }
    def cancel_operation(event)
      target = next_responder
      target.cancel_operation(event) if target
    end

    sig { params(event: KeyboardEvent).void }
    def insert_newline(event)
      target = next_responder
      target.insert_newline(event) if target
    end

    sig { params(event: KeyboardEvent).void }
    def complete(event)
      target = next_responder
      target.complete(event) if target
    end
  end
end
