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

    # ---- first responder ----
    #
    # The policy gate for being made first responder by focus or the key loop.
    # Views accept; a bare responder refuses.
    sig { returns(T::Boolean) }
    def accepts_first_responder?
      false
    end

    # Return false to refuse; set up state such as focus otherwise. Never
    # call directly; ask the application.
    sig { returns(T::Boolean) }
    def become_first_responder
      true
    end

    # Return false to keep first responder status; the incoming responder is
    # passed so a refusal can be selective.
    sig { params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      true
    end

    # ---- key events ----
    #
    # Well-known keys route to named methods; everything else, and the named
    # methods themselves, continue up the chain.
    sig { params(event: T.untyped).void }
    def key_down(event)
      case event.key
      when "Escape" then cancel_operation(event)
      when "Enter" then insert_newline(event)
      when "Tab" then complete(event)
      else next_responder&.key_down(event)
      end
    end

    sig { params(event: T.untyped).void }
    def key_up(event)
      next_responder&.key_up(event)
    end

    sig { params(event: T.untyped).void }
    def cancel_operation(event)
      next_responder&.cancel_operation(event)
    end

    sig { params(event: T.untyped).void }
    def insert_newline(event)
      next_responder&.insert_newline(event)
    end

    sig { params(event: T.untyped).void }
    def complete(event)
      next_responder&.complete(event)
    end
  end
end
