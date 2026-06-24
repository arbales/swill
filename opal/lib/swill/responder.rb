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
        @current = responder
      end

      # Cocoa NSWindow#makeFirstResponder — the single orchestrator. Verified
      # against Apple's documented contract:
      #
      #   1. already the FR             -> true, do nothing
      #   2. ask current FR to resign   -> refusal ABORTS (FR unchanged, false)
      #   3. resigned, target is nil    -> FR = chain_top, true
      #   4. ask target to become       -> refusal does NOT abort: FR = chain_top, true
      #   5. accepted                   -> FR = target, true
      #
      # The outgoing/incoming asymmetry is deliberate: only an outgoing
      # resign-refusal aborts. We do not pre-gate on can_become_first_responder?
      # — per Apple that is the caller's check.
      def make(responder)
        return true if responder.equal?(@current) # 1

        current = @current
        return false if current && !current.resign_first_responder(responder) # 2

        # Clear before `become` so a focus event triggered during become sees no
        # outgoing FR and does not re-run the resign handshake.
        @current = nil

        if responder.nil? # 3
          @current = @chain_top
          return true
        end

        if responder.become_first_responder # 5
          @current = responder
          return true
        end

        @current = @chain_top # 4
        true
      end
    end
  end

  # Base for anything in the responder chain (Cocoa NSResponder). Pure chain
  # mechanics: first-responder protocol, key-event routing, and target-action
  # lookup. Nothing here touches the DOM — View and Controller add that.
  class Responder
    # Next link in the chain; nil at the root. Subclasses provide it.
    def next_responder
      nil
    end

    # Override to gate transitions declaratively; become/resign consult these.
    def can_become_first_responder?
      true
    end

    def can_resign_first_responder?
      true
    end

    def first_responder?
      FirstResponder.current.equal?(self)
    end

    # Request that +responder+ become the first responder. Delegates to the
    # orchestrator so any responder can initiate (a controller asking in
    # after_load, say). Returns whether the FR now reflects the request.
    def make_first_responder(responder)
      FirstResponder.make(responder)
    end

    # Pure protocol (Cocoa becomeFirstResponder): accept-or-refuse plus the
    # "about to become" setup. Return false to refuse. Does not touch the
    # global FR — that is the orchestrator's job; there is no separate did* hook.
    def become_first_responder
      can_become_first_responder?
    end

    # Pure protocol (Cocoa resignFirstResponder). Return false to refuse, which
    # aborts the transition and keeps this responder first. +next_responder+ is
    # the proposed incoming responder (nil when focus is going nowhere).
    def resign_first_responder(_next_responder = nil)
      can_resign_first_responder?
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
