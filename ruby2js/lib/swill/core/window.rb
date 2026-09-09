# typed: true
# frozen_string_literal: true

module Swill
  # One presented window: a named [window] container with replaceable content,
  # or a template-instantiated dialog. Owns its root element, current
  # controller and content name, the first responder to restore on dismissal,
  # and a promise that resolves when it closes.
  class Window < Swill::Object
    extend T::Sig

    sig { params(name: String, root: T.untyped).void }
    def initialize(name, root)
      super()
      @name = name
      @root = root
      @controller = nil
      @content_name = nil
      @saved_first_responder = nil
      @restoration_disposers = []
      @restoration_keys = []
      @closed = Promise.new(->(resolve, _reject) { @resolve_closed = resolve })
    end

    # ---- fragment restoration ----
    #
    # The window's own fragment param is its bare name (main=farewell); its
    # controller's state params are scoped under it (main.n=3).

    sig { params(key: String).returns(String) }
    def scoped_key(key)
      "#{@name}.#{key}"
    end

    sig { params(disposer: T.proc.void, key: String).void }
    def add_restoration(disposer, key)
      @restoration_disposers.push(disposer)
      @restoration_keys.push(key)
    end

    # Release the current restoration subscriptions; returns the scoped keys
    # they covered so a caller can prune ones the next controller will not own.
    sig { returns(T.untyped) }
    def dispose_restoration
      disposers = @restoration_disposers
      keys = @restoration_keys
      @restoration_disposers = []
      @restoration_keys = []
      disposers.forEach { |dispose| dispose.() }
      keys
    end

    sig { returns(String) }
    def name
      @name
    end

    sig { returns(T.untyped) }
    def root
      @root
    end

    sig { returns(T.nilable(Controller)) }
    def controller
      @controller
    end

    sig { returns(T.nilable(String)) }
    def content_name
      @content_name
    end

    # Resolves with nil when the window is dismissed.
    sig { returns(T.untyped) }
    def closed
      @closed
    end

    sig { returns(T.nilable(Responder)) }
    def saved_first_responder
      @saved_first_responder
    end

    sig { params(responder: T.nilable(Responder)).void }
    def save_first_responder(responder)
      @saved_first_responder = responder
    end

    sig { params(content_name: T.nilable(String), controller: T.nilable(Controller)).void }
    def assign_content(content_name, controller)
      @content_name = content_name
      @controller = controller
    end

    # A named [window] container, as opposed to a template-instantiated dialog.
    sig { returns(T::Boolean) }
    def container?
      @root.hasAttribute("window")
    end

    sig { params(candidate: Controller).returns(T::Boolean) }
    def contains_controller?(candidate)
      candidate == @controller || @root.contains(candidate.view().element())
    end

    # Tear down the subtree, close a dialog, remove the root, and resolve.
    sig { void }
    def dismiss
      dispose_restoration
      Awakening.new.detach(@root)
      @root.close() if @root.close
      @root.remove()
      @resolve_closed.(nil)
    end
  end
end
