# typed: true
# frozen_string_literal: true

module Swill
  # The top of the responder chain for one launched region of the page. The
  # application records itself on its root element, so controllers find it by
  # walking up from their own elements, the same way views are found.
  class Application < Responder
    extend T::Sig

    sig { params(root: T.untyped).returns(Application) }
    def launch(root)
      @root = root
      root.__swill_application__ = self
      @controllers = Awakening.new.wire(root)
      application_did_launch
      self
    end

    # Every controller awakened at launch, in document order, as a JavaScript array.
    sig { returns(T.untyped) }
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
      @root.__swill_application__ = nil
    end

    sig { void }
    def application_did_launch; end

    sig { void }
    def application_will_terminate; end
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
