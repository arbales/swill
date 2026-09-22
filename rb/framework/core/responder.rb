# typed: true
# frozen_string_literal: true

module Swill
  # A link in the responder chain.
  #
  # Actions and key events start at one responder and walk `next_responder`
  # until something handles them, so a control need not know which object
  # implements the action it sends. Controllers and the application are
  # responders; the application is the last link.
  class Responder < Swill::Object
    extend T::Sig

    # The next link in the chain, or nil at the end of it.
    sig { returns(T.nilable(Responder)) }
    def next_responder
      nil
    end

    # Sends +name+ to the first responder in the chain that implements it.
    # Raises when no responder does.
    sig { params(name: String, sender: T.untyped, event: T.untyped).returns(T.untyped) }
    def perform_action(name, sender, event)
      target = action_target(name)
      raise "Unhandled action: #{name}" unless target
      Runtime.performAction(target, name, sender, event)
    end

    # TODO: It's unclear to me that this is the right place to handle this bubbling.
    # The responder that would handle +name+, or nil.
    sig { params(name: String).returns(T.nilable(Responder)) }
    def action_target(name)
      return self if Runtime.respondsTo(self, name)
      next_responder&.action_target(name)
    end

    # Whether this responder will take focus. False here; a controller
    # accepts when its region holds something focusable.
    sig { returns(T::Boolean) }
    def accepts_first_responder?
      false
    end

    # Called as this responder takes focus. Answer false to refuse it.
    sig { returns(T::Boolean) }
    def become_first_responder
      true
    end

    # Called as focus moves to +next_responder+. Answer false to keep it.
    sig { params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      true
    end

    # Routes Escape, Enter and Tab to their own hooks; anything else passes
    # to the next responder.
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

    # Passes to the next responder.
    sig { params(event: KeyboardEvent).void }
    def key_up(event)
      target = next_responder
      target.key_up(event) if target
    end

    # Escape. Dismiss what is open, or pass it along.
    sig { params(event: KeyboardEvent).void }
    def cancel_operation(event)
      target = next_responder
      target.cancel_operation(event) if target
    end

    # Enter. Commit what is being edited, or pass it along.
    sig { params(event: KeyboardEvent).void }
    def insert_newline(event)
      target = next_responder
      target.insert_newline(event) if target
    end

    # Tab. Complete what is being edited, or pass it along.
    sig { params(event: KeyboardEvent).void }
    def complete(event)
      target = next_responder
      target.complete(event) if target
    end
  end
end
