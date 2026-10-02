# typed: true
# frozen_string_literal: true

module Swill
  # One window: the page itself, a named [window] container with replaceable
  # content, or a presented dialog. Owns its root element, current controller
  # and content name, and a promise that resolves when it closes.
  #
  # The page and each presented window keep a first responder of their own,
  # as an NSWindow does: presenting a window makes it key without touching
  # the page's, and the page's takes the keyboard back when the window goes.
  # A window's key views are the elements Tab moves among within it.
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
      @first_responder = T.let(nil, T.nilable(Responder))
      @focused_element = T.let(nil, T.nilable(Element))
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

    # The responder that has the keyboard while this window is key, or nil
    # when the window itself (the application, for the page) has it. Set
    # through Application#make_first_responder.
    sig { returns(T.nilable(Responder)) }
    attr_reader :first_responder

    sig { params(first_responder: T.nilable(Responder)).returns(T.nilable(Responder)) }
    attr_writer :first_responder # :nodoc:

    # The element that last had focus in this window, within or beside its
    # first responder's key element; the keyboard goes back to it when the
    # window is key again.
    sig { returns(T.nilable(Element)) }
    attr_reader :focused_element # :nodoc:

    sig { params(focused_element: T.nilable(Element)).returns(T.nilable(Element)) }
    attr_writer :focused_element # :nodoc:

    # :section: Key Views
    # The elements Tab moves among within the window.

    # The elements Tab stops at within the window, in document order: those
    # that are focusable and enabled, not taken out of the order with
    # `tabindex="-1"`, not hidden or inert, and not inside one of the
    # +excluded+ roots (other windows the page holds).
    sig { params(excluded: T::Array[Element]).returns(T::Array[Element]) }
    def key_views(excluded)
      views = T.let([], T::Array[Element])
      @root.querySelectorAll("button, input, select, textarea, [tabindex]").forEach(->(element) do
        views << element if key_view?(element, excluded)
      end)
      views
    end

    # Whether +element+ is one of the window's key views.
    sig { params(element: Element, excluded: T::Array[Element]).returns(T::Boolean) }
    def key_view?(element, excluded)
      return false if element.disabled || element.getAttribute("tabindex") == "-1"
      return false if element.closest("[hidden]") || element.closest("[inert]")
      excluded.none? { |root| root.contains(element) }
    end

    # Where the keyboard goes as the window opens: an element marked
    # `autofocus`, else the default button, else the first key view. Nil when
    # the window has no key view.
    sig { params(excluded: T::Array[Element]).returns(T.nilable(Element)) }
    def initial_focus_element(excluded)
      first_key_view("[autofocus]", excluded) || default_button(excluded) || key_views(excluded).first
    end

    # The window's default button, the one marked with the `default` class,
    # which Enter presses from anywhere in the window. Nil when it has none.
    sig { params(excluded: T::Array[Element]).returns(T.nilable(Element)) }
    def default_button(excluded)
      first_key_view("button.default", excluded)
    end

    sig { params(selector: String, excluded: T::Array[Element]).returns(T.nilable(Element)) }
    def first_key_view(selector, excluded) # :nodoc:
      found = T.let(nil, T.nilable(Element))
      @root.querySelectorAll(selector).forEach(->(element) do
        found = element if found.nil? && key_view?(element, excluded)
      end)
      found
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
