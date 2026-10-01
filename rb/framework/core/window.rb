# typed: true
# frozen_string_literal: true

module Swill
  # One presented window: a named [window] container with replaceable content,
  # or a template-instantiated dialog. Owns its root element, current
  # controller and content name, the first responder to restore on dismissal,
  # and a promise that resolves when it closes.
  class Window < Swill::Object
    extend T::Sig

    sig { params(name: String, root: Element, modal: T::Boolean).void }
    def initialize(name, root, modal: false)
      super()
      @name = name
      @root = root
      @modal = modal
      @controller = T.let(nil, T.nilable(Controller))
      @content_name = T.let(nil, T.nilable(String))
      @saved_first_responder = T.let(nil, T.nilable(Responder))
      @restoration_disposers = T.let([], T::Array[T.proc.void])
      @restoration_keys = T.let([], T::Array[String])
      @resolve_closed = T.let(nil, T.untyped)
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
      @restoration_disposers << disposer
      @restoration_keys << key
    end

    # Release the current restoration subscriptions; returns the scoped keys
    # they covered so a caller can prune ones the next controller will not own.
    sig { returns(T::Array[String]) }
    def dispose_restoration
      disposers = @restoration_disposers
      keys = @restoration_keys
      @restoration_disposers = []
      @restoration_keys = []
      disposers.each { |dispose| dispose.() }
      keys
    end

    sig { returns(String) }
    attr_reader :name

    sig { returns(Element) }
    attr_reader :root

    sig { returns(T.nilable(Controller)) }
    attr_reader :controller

    # Whether the window was shown modally, keeping the keyboard inside it.
    sig { returns(T::Boolean) }
    def modal?
      @modal
    end

    sig { returns(T.nilable(String)) }
    attr_reader :content_name

    # Resolves with nil when the window is dismissed.
    sig { returns(Promise) }
    attr_reader :closed

    sig { returns(T.nilable(Responder)) }
    attr_reader :saved_first_responder

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
      candidate == @controller || @root.contains(candidate.view.element)
    end

    # Adds the title bar for a presented dialog and follows its controller's title.
    sig { params(identifier: String, controller: Controller).void }
    def show_title(identifier, controller) # :nodoc:
      document = @root.ownerDocument
      title = Swell[document.createElement("span")].attr("id", identifier)
      header = Swell[document.createElement("header")].add_class("window-title").append(title.element)
      Swell[@root].prepend(header.element)
      title.text(controller.title)
      controller.observe(controller, :title, ->(value) { title.text(value) })
    end

    # Tear down the subtree, close a dialog, remove the root, and resolve.
    sig { void }
    def dismiss
      dispose_restoration
      Awakening.detach(@root)
      @root.close if @root.tagName == "DIALOG"
      @root.remove
      @resolve_closed.(nil)
    end
  end
end
