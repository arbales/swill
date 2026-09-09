# typed: true
# frozen_string_literal: true

module Swill
  # The top of the responder chain for one launched region of the page. The
  # application records itself on its root element, so controllers find it by
  # walking up from their own elements, the same way views are found. It owns
  # the first responder, routes focus and key events, and presents windows.
  class Application < Responder
    extend T::Sig
    include Ownership

    sig { params(root: T.untyped).returns(Application) }
    def launch(root)
      @root = root
      root.__swill_application__ = self
      @windows = []
      @templates = {}
      @captured = {}
      @on_focus = ->(event) { sync_first_responder(event.target, event.relatedTarget) }
      @on_focus_out = ->(event) { focus_left(event.relatedTarget) }
      @on_key_down = ->(event) { first_responder.key_down(event) }
      @on_key_up = ->(event) { first_responder.key_up(event) }
      root.addEventListener("focusin", @on_focus)
      root.addEventListener("focusout", @on_focus_out)
      root.addEventListener("keydown", @on_key_down)
      root.addEventListener("keyup", @on_key_up)
      @fragments = Fragments.new(root.ownerDocument.defaultView)
      scan_templates
      prepare_window_containers
      awakening = Awakening.new
      @controllers = awakening.awaken(root)
      register_window_containers
      restore_launched_windows
      awakening.finish(@controllers)
      @fragments.observe(->() { apply_fragment })
      watch(root)
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
      @fragments.release()
      @observer.disconnect() if @observer
      @windows.forEach { |window| release_window(window) }
      @windows = []
      @controllers.forEach { |controller| controller.teardown() }
      @controllers = []
      @root.removeEventListener("focusin", @on_focus)
      @root.removeEventListener("focusout", @on_focus_out)
      @root.removeEventListener("keydown", @on_key_down)
      @root.removeEventListener("keyup", @on_key_up)
      @first_responder = nil
      @root.__swill_application__ = nil
    end

    sig { void }
    def application_did_launch; end

    sig { void }
    def application_will_terminate; end

    # ---- windows ----

    # Replace a named container's content with a window template or captured
    # pre-rendered content, awaken it, record the content in the URL fragment
    # as a history entry, restore the new controller's state, and hand the
    # first responder to it. Returns that controller.
    sig { params(window_name: String, content_name: String).returns(T.nilable(Controller)) }
    def load_window_content(window_name, content_name)
      load_window_content_with(window_name, content_name, :push)
    end

    # history is :push for navigation, :replace to rewrite the entry, or :none
    # when the fragment itself asked for the content (Back/Forward).
    sig { params(window_name: String, content_name: String, history: Symbol).returns(T.nilable(Controller)) }
    def load_window_content_with(window_name, content_name, history)
      window = window_named(window_name)
      raise "No window container: #{window_name}" unless window
      container = window.root()
      previous = first_responder
      awakening = Awakening.new
      each_child(container, ->(child) { awakening.detach(child) })
      container.replaceChildren()
      container.appendChild(clone_window_content(content_name))
      container.setAttribute("name", content_name)
      controllers = awakening.awaken(container)
      window.assign_content(content_name, top_controller_in(container))
      @fragments.write(window.name(), content_name, history)
      restore_window_state(window, history != :none, history != :none)
      awakening.finish(controllers)
      controller = window.controller()
      if controller
        make_first_responder(controller)
      elsif attached?(previous)
        make_first_responder(previous)
      end
      controller
    end

    # Present a template as a window appended to the root. A <dialog> root is
    # shown. Dismiss it with dismiss(controller); the window's closed promise
    # resolves then.
    sig { params(name: String).returns(Window) }
    def show_window(name)
      show_window_in(name, @root)
    end

    sig { params(name: String, into: T.untyped).returns(Window) }
    def show_window_in(name, into)
      node = clone_window_content(name)
      into.appendChild(node)
      awakening = Awakening.new
      controllers = awakening.awaken(node)
      view = node.__swill_view__
      controller = view ? view.controller_value() : nil
      unless controller
        # Leave nothing behind: whatever the template awakened is torn down.
        awakening.detach(node)
        node.remove()
        raise "Window root has no controller: #{name}"
      end
      node.show() if node.show
      window = Window.new(name, node)
      window.assign_content(name, controller)
      window.save_first_responder(first_responder)
      @windows.push(window)
      restore_window_state(window, false, false)
      awakening.finish(controllers)
      make_first_responder(controller)
      window
    end

    sig { params(controller: Controller).returns(T::Boolean) }
    def dismiss(controller)
      window = window_containing(controller)
      return false unless window
      @windows = @windows.filter { |candidate| candidate != window }
      saved = window.saved_first_responder()
      window.dismiss()
      make_first_responder(saved) if saved && attached?(saved)
      true
    end

    sig { params(name: String).returns(T.nilable(Window)) }
    def window_named(name)
      @windows.find { |window| matches_container?(window, name) }
    end

    sig { params(name: String).returns(T::Boolean) }
    def window_content?(name)
      (@captured[name] || window_template(name)) != nil
    end

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

    # Focus moved to another part of the page: the first responder falls
    # back here. A null destination (the browser's own chrome, or dead space
    # in the page) leaves it alone, as Cocoa does, so keys still reach it
    # when focus returns.
    sig { params(destination: T.untyped).void }
    def focus_left(destination)
      @first_responder = nil if destination && !@root.contains(destination)
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

    # ---- window templates, containers, and content ----

    # <template for="window" name="x"> anywhere, or <template name="x"> directly
    # under the root. Templates are inert; content is cloned from them.
    sig { void }
    def scan_templates
      @root.querySelectorAll("template[name]").forEach do |template|
        name = template.getAttribute("name")
        @templates[name] = template if template.getAttribute("for") == "window" || template.parentElement == @root
      end
    end

    # Rescans once on a miss so templates inserted after launch are found.
    sig { params(name: String).returns(T.untyped) }
    def window_template(name)
      found = @templates[name]
      return found if found
      scan_templates
      @templates[name]
    end

    sig { params(name: String).returns(T.untyped) }
    def clone_window_content(name)
      captured = @captured[name]
      return captured.cloneNode(true) if captured
      template = window_template(name)
      raise "No window content template: #{name}" unless template
      content = template.content
      node = content ? content.firstElementChild : template.firstElementChild
      raise "Empty window template: #{name}" unless node
      node.cloneNode(true)
    end

    sig { returns(T.untyped) }
    def window_containers
      found = []
      found.push(@root) if @root.hasAttribute("window")
      @root.querySelectorAll("[window]").forEach { |container| found.push(container) }
      found
    end

    # Before awakening: capture pre-rendered content under the container's
    # name so it can be reloaded later, and fill empty containers from the
    # template their name attribute (or window name) selects.
    sig { void }
    def prepare_window_containers
      params = @fragments.params()
      window_containers.forEach do |container|
        window_name = container.getAttribute("window")
        default_name = container.getAttribute("name") || window_name
        first = container.firstElementChild
        @captured[default_name] = first.cloneNode(true) if first && !@captured[default_name]
        content_name = requested_content(window_name, default_name, params[window_name])
        next if first && content_name == default_name
        container.replaceChildren()
        container.appendChild(clone_window_content(content_name))
        container.setAttribute("name", content_name)
      end
    end

    # The fragment may name the content to show; unknown names are reported
    # and the default stands.
    sig { params(window_name: String, default_name: String, requested: T.untyped).returns(String) }
    def requested_content(window_name, default_name, requested)
      return default_name if requested == nil || requested == default_name
      return requested if window_content?(requested)
      Runtime.warn("window \"#{window_name}\" requested unknown content \"#{requested}\"")
      default_name
    end

    sig { void }
    def register_window_containers
      window_containers.forEach do |container|
        window = Window.new(container.getAttribute("window"), container)
        window.assign_content(container.getAttribute("name"), top_controller_in(container))
        @windows.push(window)
      end
    end

    # The first controller inside the container whose parent is outside it.
    sig { params(container: T.untyped).returns(T.nilable(Controller)) }
    def top_controller_in(container)
      Awakening.new.controllers_within(container).find { |controller| top_within?(controller, container) }
    end

    sig { params(controller: Controller, container: T.untyped).returns(T::Boolean) }
    def top_within?(controller, container)
      parent = controller.parent
      parent == nil || !container.contains(parent.view().element())
    end

    sig { params(window: Window, name: String).returns(T::Boolean) }
    def matches_container?(window, name)
      window.container? && window.name == name
    end

    sig { params(controller: Controller).returns(T.nilable(Window)) }
    def window_containing(controller)
      @windows.find { |window| holds?(window, controller) }
    end

    sig { params(window: Window, controller: Controller).returns(T::Boolean) }
    def holds?(window, controller)
      window.contains_controller?(controller)
    end

    sig { params(responder: T.nilable(Responder)).returns(T::Boolean) }
    def attached?(responder)
      return false unless responder
      element = responder_element(responder)
      element != nil && @root.contains(element)
    end

    # At terminate: a container's content is torn down in place; a dialog is
    # dismissed.
    sig { params(window: Window).void }
    def release_window(window)
      if window.container?
        window.dispose_restoration
        Awakening.new.detach(window.root)
      else
        window.dismiss
      end
    end

    # ---- fragment restoration ----
    #
    # Restoration reuses the binding machinery: restorable paths are
    # observed and written exactly as bind paths are. Runs after the load
    # phase and before controller_did_load, so restored values are in place
    # for it.

    sig { params(window: Window, prune_stale: T::Boolean, write_content: T::Boolean).void }
    def restore_window_state(window, prune_stale, write_content)
      stale = window.dispose_restoration
      controller = window.controller
      declarations = controller ? Runtime.restorations(controller) : []
      keys = declarations.map { |declaration| window.scoped_key(declaration.key) }
      content = window.content_name
      @fragments.write(window.name, content, :replace) if write_content && content
      if prune_stale
        stale.forEach { |key| @fragments.write(key, nil, :replace) unless keys.includes(key) }
      end
      return unless controller
      params = @fragments.params()
      applied = 0
      @fragments.suspended(->() do
        declarations.forEach do |declaration|
          text = params[window.scoped_key(declaration.key)]
          next if text == nil
          value = Runtime.decodeFragment(declaration.type, text)
          next if value == nil
          Runtime.writePath(controller, declaration.path, value)
          applied += 1
        end
      end)
      controller.controller_did_restore(applied > 0) if declarations.length > 0
      declarations.forEach do |declaration|
        disposer = Runtime.observePath(controller, declaration.path, ->(_value) { write_window_state(window) })
        window.add_restoration(disposer, window.scoped_key(declaration.key))
      end
    end

    sig { void }
    def restore_launched_windows
      @windows.forEach { |window| restore_window_state(window, false, true) }
    end

    # Push the controller's current restorable state into the fragment.
    sig { params(window: Window).void }
    def write_window_state(window)
      controller = window.controller
      return unless controller
      Runtime.restorations(controller).forEach do |declaration|
        value = Runtime.encodeFragment(Runtime.readPath(controller, declaration.path))
        @fragments.write(window.scoped_key(declaration.key), value, :replace)
      end
    end

    # Back/Forward: a container whose fragment names other known content loads
    # it without touching history; otherwise its state is reapplied.
    sig { void }
    def apply_fragment
      params = @fragments.params()
      @windows.forEach { |window| apply_fragment_to(window, params) }
    end

    sig { params(window: Window, params: T.untyped).void }
    def apply_fragment_to(window, params)
      return unless window.container?
      requested = params[window.name]
      if requested != nil && requested != window.content_name
        if window_content?(requested)
          load_window_content_with(window.name, requested, :none)
        else
          Runtime.warn("window \"#{window.name}\" requested unknown content \"#{requested}\"")
        end
      else
        restore_window_state(window, false, false)
      end
    end

    # Code-created content awakens through the same path as markup: the
    # observer wires added subtrees and detaches removed ones. Explicit wiring
    # before the observer runs is harmless, since both are idempotent.
    sig { params(root: T.untyped).void }
    def watch(root)
      return unless defined?(MutationObserver)
      awakening = Awakening.new
      @observer = MutationObserver.new(->(records, _observer) do
        records.forEach do |record|
          record.removedNodes.forEach { |node| awakening.detach(node) if node.nodeType == 1 }
          record.addedNodes.forEach { |node| awakening.wire(node) if node.nodeType == 1 }
        end
      end)
      @observer.observe(root, {childList: true, subtree: true})
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
