# frozen_string_literal: true

module Swill
  # The first-responder singleton and the one orchestrator that changes it.
  # Holds module-level state (Opal is single-threaded, so no per-thread
  # concern) rather than per-class, so that calling through any Responder
  # subclass operates on the same first responder.
  #
  # TODO(per-window FR): when responder chains become per-window, `chain_top`
  # and `current` move onto the window.
  module FirstResponder
    @current = nil
    @chain_top = nil
    @observers = []

    class << self
      # The current first responder, or nil.
      attr_reader :current

      # The chain-top responder (the Application), set once at boot. A root
      # controller's next_responder bottoms out here; on an incoming refusal or
      # a nil target the first responder falls here rather than to nil —
      # Cocoa's NSWindow/app fallback.
      attr_accessor :chain_top

      # Record the first responder after DOM focus has already moved. Internal;
      # the focus adapter uses it. Prefer `make`.
      def install(responder)
        previous = @current
        @current = responder
        notify_observers(previous, responder) unless previous.equal?(responder)
      end

      # Observe successful first-responder transitions. The callback receives
      # the new responder and the previous responder. Returns an unsubscribe
      # callback so controllers can tie diagnostics to their own lifecycle.
      def observe(&observer)
        @observers << observer
        -> { @observers.delete(observer) }
      end

      # If responder isn’t already the first responder, this method first sends a resignFirstResponder message to the object that is the first responder. If that object refuses to resign, it remains the first responder, and this method immediately returns false. If the current first responder resigns, this method sends a becomeFirstResponder message to responder. If responder does not accept first responder status, the NSWindow object becomes first responder; in this case, the method returns true even if responder refuses first responder status.
      # If responder is nil, this method still sends resignFirstResponder to the current first responder. If the current first responder refuses to resign, it remains the first responder and this method immediately returns false. If the current first responder returns true from resignFirstResponder, the window is made its own first responder and this method returns true.
      # The Application Kit framework uses this method to alter the first responder in response to mouse-down events; you can also use it to explicitly set the first responder from within your program. The responder object is typically an NSView object in the window’s view hierarchy. If this method is called explicitly, first send acceptsFirstResponder to responder, and do not call makeFirstResponder: if acceptsFirstResponder returns false.
      # Use initialFirstResponder to the set the first responder to be used when the window is brought onscreen for the first time.
      def make(responder)
        return true if responder.equal?(@current) # 1

        current = @current
        return false if current && !current.resign_first_responder(responder) # 2

        # Clear before `become` so a focus event triggered during become sees no
        # outgoing FR and does not re-run the resign handshake.
        @current = nil

        if responder.nil? # 3
          complete_transition(current, @chain_top)
          return true
        end

        if responder.become_first_responder # 5
          complete_transition(current, responder)
          return true
        end

        complete_transition(current, @chain_top) # 4
        true
      end

      private

      def notify_observers(previous, responder)
        @observers.dup.each { |observer| observer.call(responder, previous) }
      end

      def complete_transition(previous, responder)
        @current = responder
        notify_observers(previous, responder) unless previous.equal?(responder)
      end
    end
  end


  class Responder
    # Override
    def next_responder
      nil
    end

    # Cocoa NSResponder#acceptsFirstResponder: the policy gate for being *made*
    # first responder by a click or the key-view loop. Default false; a control
    # overrides it to true. NSWindow#makeFirstResponder does not consult it (nor
    # does `make` above) — honoring the gate is the focus machinery's job.
    # `can_become_first_responder?` is UIKit's spelling for the same gate.
    def accepts_first_responder?
      false
    end
    alias can_become_first_responder? accepts_first_responder?

    def first_responder?
      FirstResponder.current.equal?(self)
    end

    # Cocoa NSResponder#becomeFirstResponder: default accepts (true). Override
    # to set up state — highlight a selection, focus an element — or return
    # false to refuse. Never invoke directly; ask the application to make the
    # responder first responder.
    def become_first_responder
      true
    end

    # Cocoa NSResponder#resignFirstResponder: default resigns (true). Override
    # to tear down state or return false to refuse relinquishing. Never invoke
    # directly. +next_responder+ is a Swill extension carrying the incoming
    # responder; Cocoa's resignFirstResponder takes no argument.
    def resign_first_responder(_next_responder = nil)
      true
    end

    # ---- key-event chain ----
    #
    # keyDown routes well-known keys to named methods; everything else, and the
    # named methods themselves, bubble up through next_responder (Cocoa).

    def key_down(event)
      case event && event.key
      when "Escape" then cancel_operation(event)
      when "Enter" then insert_newline(event)
      when "Tab" then complete(event)
      else next_responder&.key_down(event)
      end
    end

    def key_up(event)
      next_responder&.key_up(event)
    end

    def cancel_operation(event)
      next_responder&.cancel_operation(event)
    end

    def insert_newline(event)
      next_responder&.insert_newline(event)
    end

    def complete(event)
      next_responder&.complete(event)
    end

    # Walk the chain for the first responder answering +name+. Target-action:
    # `<button data-action="save">` starts at the responder for the button and
    # walks up until something handles it.
    def perform_action(name, sender = nil, event = nil)
      responder = self
      while responder
        if responder.respond_to?(name)
          responder.public_send(name, sender, event)
          return true
        end

        responder = responder.next_responder
      end

      false
    end
  end
end
