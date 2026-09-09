# typed: true
# frozen_string_literal: true

module Swill
  # The top of the responder chain for one launched region of the page. The
  # application records itself on its root element, so controllers find it by
  # walking up from their own elements, the same way views are found. It also
  # owns the first responder and routes focus and key events to it.
  class Application < Responder
    extend T::Sig

    sig { params(root: T.untyped).returns(Application) }
    def launch(root)
      @root = root
      root.__swill_application__ = self
      @on_focus = ->(event) { sync_first_responder(event.target, event.relatedTarget) }
      @on_key_down = ->(event) { first_responder.key_down(event) }
      @on_key_up = ->(event) { first_responder.key_up(event) }
      root.addEventListener("focusin", @on_focus)
      root.addEventListener("keydown", @on_key_down)
      root.addEventListener("keyup", @on_key_up)
      @controllers = Awakening.new.wire(root)
      application_did_launch
      self
    end

    # Every controller awakened at launch, in document order.
    sig { returns(T::Array[T.untyped]) }
    def controllers
      @controllers
    end

    sig { returns(T.untyped) }
    def root
      @root
    end

    # Idempotent: a page may see more than one pagehide before it is unloaded.
    sig { void }
    def terminate
      return unless @root.__swill_application__ == self
      application_will_terminate
      @controllers.forEach { |controller| controller.teardown() }
      @controllers = []
      @root.removeEventListener("focusin", @on_focus)
      @root.removeEventListener("keydown", @on_key_down)
      @root.removeEventListener("keyup", @on_key_up)
      @first_responder = nil
      @root.__swill_application__ = nil
    end

    sig { void }
    def application_did_launch; end

    sig { void }
    def application_will_terminate; end

    # ---- first responder ----

    # The application itself when nothing more specific holds it.
    sig { returns(Responder) }
    def first_responder
      @first_responder || self
    end

    # Cocoa's makeFirstResponder: a responder that does not accept is refused
    # up front; the current first responder may refuse to resign; a responder
    # that refuses to become leaves the application as first responder.
    sig { params(responder: T.nilable(Responder)).returns(T::Boolean) }
    def make_first_responder(responder)
      return false if responder && !responder.accepts_first_responder?
      current = first_responder
      return true if responder == current
      return false unless current.resign_first_responder(responder)
      @first_responder = nil
      @first_responder = responder if responder && responder.become_first_responder
      true
    end

    # The browser already moved focus; reconcile the first responder without
    # re-running become. A resign refusal restores focus to the refuser.
    sig { params(target: T.untyped, previous: T.untyped).void }
    def sync_first_responder(target, previous)
      responder = responder_for(target)
      current = first_responder
      return if responder == current
      unless current.resign_first_responder(responder)
        restore_focus(current, previous)
        return
      end
      @first_responder = responder
    end

    # A first responder inside a region being torn down falls back here.
    sig { params(element: T.untyped).void }
    def release_first_responder(element)
      owner = responder_element(first_responder)
      @first_responder = nil if owner && (owner == element || element.contains(owner))
    end

    # The responder for a DOM location: the first managed view above it,
    # which yields its controller for a controller root and itself otherwise.
    sig { params(element: T.untyped).returns(T.nilable(Responder)) }
    def responder_for(element)
      return nil unless element
      view = element.__swill_view__
      return view.controller_value() || view if view
      responder_for(element.parentElement)
    end

    sig { params(responder: Responder).returns(T.untyped) }
    def responder_element(responder)
      return responder.view().element() if responder.is_a?(Controller)
      return responder.element() if responder.is_a?(View)
      nil
    end

    sig { params(responder: Responder, previous: T.untyped).void }
    def restore_focus(responder, previous)
      owner = responder_element(responder)
      return unless owner
      target = previous && owner.contains(previous) ? previous : owner.__swill_view__.first_focusable_element()
      target.focus() if target
    end
  end

  # Markup entry point. The framework bundle installs one launcher when a
  # document exists; it launches the class named by the [application] element
  # once the DOM is parsed and terminates it when the page is discarded.
  class Launcher < Swill::Object
    extend T::Sig

    sig { params(document: T.untyped).void }
    def install(document)
      if document.readyState == "loading"
        document.addEventListener("DOMContentLoaded", ->(_event) { launch(document) }, {once: true})
      else
        launch(document)
      end
    end

    # A page without an [application] element is inert; a page naming an
    # unregistered class fails closed through Runtime.resolve.
    sig { params(document: T.untyped).returns(T.nilable(Application)) }
    def launch(document)
      element = document.querySelector("[application]")
      return nil unless element
      application_class = Runtime.resolve(element.getAttribute("application"))
      application = application_class.new()
      application.launch(element)
      # A persisted pagehide means the page may return from the back-forward
      # cache with its controllers intact, so only a real unload terminates.
      # The listener stays installed because a persisted pagehide can precede
      # the real one.
      document.defaultView.addEventListener("pagehide", ->(event) do
        application.terminate() unless event.persisted
      end)
      application
    end
  end
end
