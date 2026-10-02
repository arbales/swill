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

    # The element this responder's focus lies within: a view's element, or a
    # controller's view's. Nil here, for a responder with no place on the
    # page.
    sig { returns(T.nilable(Element)) }
    def focus_region
      nil
    end

    # The element that carries this responder's focus: becoming first
    # responder focuses it. Nil here; a view's is its first focusable
    # element, and a controller's is its view's.
    sig { returns(T.nilable(Element)) }
    def key_element
      nil
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

    # Translates a key into a command and sends it to this responder, as
    # Cocoa's interpretKeyEvents: does. A key the focused element handles
    # itself, such as typing in a field, stops here. A key held with Control,
    # Command or Option, or one no command names, passes to the next
    # responder as it is. An override sees the raw key before any of this.
    sig { params(event: KeyboardEvent).void }
    def key_down(event)
      return if event.isComposing
      unless event.ctrlKey || event.metaKey || event.altKey
        return if DOM.handles_key?(event)
        case event.key
        when "Escape" then return cancel_operation(event)
        when "Enter" then return insert_newline(event)
        when "Tab" then return event.shiftKey ? insert_backtab(event) : insert_tab(event)
        when "ArrowUp" then return move_up(event)
        when "ArrowDown" then return move_down(event)
        when "ArrowLeft" then return move_left(event)
        when "ArrowRight" then return move_right(event)
        when "Home" then return move_to_beginning_of_document(event)
        when "End" then return move_to_end_of_document(event)
        end
      end
      target = next_responder
      target.key_down(event) if target
    end

    # Passes to the next responder.
    sig { params(event: KeyboardEvent).void }
    def key_up(event)
      target = next_responder
      target.key_up(event) if target
    end

    # :section: Commands
    # What keys mean. Each passes to the next responder, so implementing one
    # takes that key for this responder's region, and calling super declines
    # it.

    # Escape. Dismiss what is open.
    sig { params(event: KeyboardEvent).void }
    def cancel_operation(event)
      target = next_responder
      target.cancel_operation(event) if target
    end

    # Enter. Commit what is being edited.
    sig { params(event: KeyboardEvent).void }
    def insert_newline(event)
      target = next_responder
      target.insert_newline(event) if target
    end

    # Tab. Unless something prevents it, the browser then moves focus on.
    sig { params(event: KeyboardEvent).void }
    def insert_tab(event)
      target = next_responder
      target.insert_tab(event) if target
    end

    # Shift-Tab.
    sig { params(event: KeyboardEvent).void }
    def insert_backtab(event)
      target = next_responder
      target.insert_backtab(event) if target
    end

    # Up arrow.
    sig { params(event: KeyboardEvent).void }
    def move_up(event)
      target = next_responder
      target.move_up(event) if target
    end

    # Down arrow.
    sig { params(event: KeyboardEvent).void }
    def move_down(event)
      target = next_responder
      target.move_down(event) if target
    end

    # Left arrow.
    sig { params(event: KeyboardEvent).void }
    def move_left(event)
      target = next_responder
      target.move_left(event) if target
    end

    # Right arrow.
    sig { params(event: KeyboardEvent).void }
    def move_right(event)
      target = next_responder
      target.move_right(event) if target
    end

    # Home.
    sig { params(event: KeyboardEvent).void }
    def move_to_beginning_of_document(event)
      target = next_responder
      target.move_to_beginning_of_document(event) if target
    end

    # End.
    sig { params(event: KeyboardEvent).void }
    def move_to_end_of_document(event)
      target = next_responder
      target.move_to_end_of_document(event) if target
    end
  end
end
