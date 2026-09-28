# typed: true
# frozen_string_literal: true

module Swill
  # The top of the responder chain. One application runs per page, as one
  # NSApp runs per process: it owns the first responder, routes focus and key
  # events, presents windows, and keeps the URL fragment. Controllers reach it
  # through Application.shared.
  #
  # See the Lifecycle guide for launch, restoration and teardown.
  class Application < Responder
    extend T::Sig
    include OutletOwner

    # NSApp: the application running on this page. Asking for it when none
    # is running is a mistake, not a nil.
    sig { returns(Application) }
    def self.shared
      running = @running
      raise "No application is running" unless running
      running
    end

    # Whether an application is running on this page.
    sig { returns(T::Boolean) }
    def self.running?
      @running != nil
    end

    sig { params(application: Application).void }
    def self.launched(application) # :nodoc:
      @running = T.let(application, T.nilable(Application))
    end

    sig { params(application: Application).void }
    def self.terminated(application) # :nodoc:
      @running = nil if @running == application
    end

    # Creates the application. Call #launch to start it.
    sig { void }
    def initialize
      super
      @windows = T.let([], T::Array[Window])
      @controllers = T.let([], T::Array[Controller])
      @templates = T.let({}, T::Hash[String, Element])
      @captured = T.let({}, T::Hash[String, Element])
      @first_responder = T.let(nil, T.nilable(Responder))
      @posted_first_responder = T.let(nil, T.nilable(Responder))
      @observer = T.let(nil, T.nilable(MutationObserver))
    end

    # Starts the application at +root+: awakens the markup beneath it,
    # restores window content from the URL fragment, and begins watching for
    # content added later. One application runs per page.
    sig { params(root: Element).returns(Application) }
    def launch(root)
      raise "An application is already running" if Application.running?
      Application.launched(self)
      @root = root
      @on_focus = ->(event) { focus_in(event) }
      @on_focus_out = ->(event) { focus_out(event) }
      @on_key_down = ->(event) { first_responder.key_down(event) }
      @on_key_up = ->(event) { first_responder.key_up(event) }
      root.addEventListener("focusin", @on_focus)
      root.addEventListener("focusout", @on_focus_out)
      root.addEventListener("keydown", @on_key_down)
      root.addEventListener("keyup", @on_key_up)
      @fragments = URLFragment.new(root.ownerDocument.defaultView)
      scan_templates
      prepare_window_containers
      @controllers = Awakening.prepare(root)
      # Application connections are available in every controller load hook.
      Connections::Outlets.establish(self, root)
      @controllers.reverse.each { |controller| Awakening.load(controller) }
      register_window_containers
      restore_launched_windows
      Awakening.finish(@controllers)
      @fragments.start_observing(->() { apply_fragment })
      watch(root)
      application_did_launch
      self
    end

    # The browser window the application runs in, for what only it offers:
    # a prompt, printing.
    sig { returns(DOMWindow) }
    def browser
      T.must(root.ownerDocument.defaultView)
    end

    # Every controller awakened at launch, in document order.
    sig { returns(T::Array[Controller]) }
    attr_reader :controllers

    # The element the application was launched at.
    sig { returns(Element) }
    attr_reader :root

    # Idempotent: a page may see more than one pagehide before it is unloaded.
    sig { void }
    def terminate
      return unless Application.running? && Application.shared == self
      application_will_terminate
      @fragments.stop_observing
      observer = @observer
      observer.disconnect if observer
      @windows.each { |window| release_window(window) }
      @windows = []
      @controllers.each { |controller| controller.unload }
      Awakening.detach(@root)
      @controllers = []
      @root.removeEventListener("focusin", @on_focus)
      @root.removeEventListener("focusout", @on_focus_out)
      @root.removeEventListener("keydown", @on_key_down)
      @root.removeEventListener("keyup", @on_key_up)
      assign_first_responder(nil)
      Application.terminated(self)
    end

    # The application is running and its markup is awake.
    sig { void }
    def application_did_launch; end

    # The application is about to stop. Everything it owns is still alive.
    sig { void }
    def application_will_terminate; end

    # ---- windows ----

    # Replace a named container's content with a window template or captured
    # pre-rendered content, awaken it, record the content in the URL fragment
    # as a history entry, restore the new controller's state, and hand the
    # first responder to it. Returns that controller.
    # history is :push for navigation, :replace to rewrite the entry, or :none
    # when the fragment itself asked for the content (Back/Forward).
    sig { params(window_name: String, content_name: String, history: Symbol).returns(T.nilable(Controller)) }
    def load_window_content(window_name, content_name, history: :push)
      window = window_named(window_name)
      raise "No window container: #{window_name}" unless window
      container = window.root
      previous = first_responder
            DOM.each_child(container, ->(child) { Awakening.detach(child) })
      container.replaceChildren
      container.appendChild(clone_window_content(content_name))
      container.setAttribute("name", content_name)
      controllers = Awakening.awaken(container)
      window.assign_content(content_name, top_controller_in(container))
      @fragments.write(window.name, content_name, history: history)
      restore_window_state(window, prune_stale: history != :none, write_content: history != :none)
      Awakening.finish(controllers)
      controller = window.controller
      if controller
        # The content's own choice (a field focused in controller_did_load)
        # stands; otherwise the controller takes the first responder.
        make_first_responder(controller) unless responder_within?(first_responder, container)
      elsif attached?(previous)
        make_first_responder(previous)
      end
      controller
    end

    # Present a template as a window appended to the root. A <dialog> root is
    # shown. Dismiss it with dismiss(controller); the window's closed promise
    # resolves then.
    sig { params(name: String, into: Element).returns(Window) }
    def show_window(name, into: @root)
      node = clone_window_content(name)
      into.appendChild(node)
      controllers = Awakening.awaken(node)
      controller = View.controller_for(node)
      unless controller
        # Leave nothing behind: whatever the template awakened is torn down.
        Awakening.detach(node)
        node.remove
        raise "Window root has no controller: #{name}"
      end
      node.show if node.tagName == "DIALOG"
      window = Window.new(name, node)
      window.assign_content(name, controller)
      window.save_first_responder(first_responder)
      @windows << window
      restore_window_state(window, prune_stale: false, write_content: false)
      Awakening.finish(controllers)
      make_first_responder(controller) unless responder_within?(first_responder, node)
      window
    end

    # Closes the window +controller+ belongs to, restoring the first responder
    # it displaced.
    sig { params(controller: Controller).returns(T::Boolean) }
    def dismiss(controller)
      window = window_containing(controller)
      return false unless window
      @windows = @windows.select { |candidate| candidate != window }
      saved = window.saved_first_responder
      window.dismiss
      make_first_responder(saved) if saved && attached?(saved)
      true
    end

    # The window with +name+, or nil.
    sig { params(name: String).returns(T.nilable(Window)) }
    def window_named(name)
      @windows.find { |window| matches_container?(window, name) }
    end

    # Whether content named +name+ exists to be loaded into a window.
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
      # Nobody holds it while the newcomer becomes it, so focus moving
      # during become reconciles against the application. When that focus
      # lands in a nested responder, the keyboard is there, and that
      # responder stays first.
      @first_responder = nil
      if responder && responder.become_first_responder
        @first_responder = responder if @first_responder == nil
      end
      post_first_responder_change
      true
    end

    sig { params(responder: T.nilable(Responder)).void }
    def assign_first_responder(responder) # :nodoc:
      @first_responder = responder
      post_first_responder_change
    end

    # Every change of first responder is posted once as
    # first_responder_did_change, with the application as the object and the
    # responder as user info, so a debugging view or a toolbar can follow it
    # without polling. Focus moving during become may already have posted
    # the same responder; the last one posted is remembered for that.
    sig { void }
    def post_first_responder_change
      return if @first_responder == @posted_first_responder
      @posted_first_responder = @first_responder
      NotificationCenter.default.post("first_responder_did_change", self, @first_responder)
    end

    sig { params(event: Event).void }
    def focus_in(event) # :nodoc:
      sync_first_responder(event.target, event.relatedTarget)
    end

    sig { params(event: Event).void }
    def focus_out(event) # :nodoc:
      focus_left(event.relatedTarget)
    end

    # The browser already moved focus; reconcile the first responder without
    # re-running become. A resign refusal restores focus to the refuser.
    sig { params(target: Element, previous: T.nilable(Element)).void }
    def sync_first_responder(target, previous)
      responder = responder_for(target)
      current = first_responder
      return if responder == current
      unless current.resign_first_responder(responder)
        restore_focus(current, previous)
        return
      end
      assign_first_responder(responder)
    end

    # Focus moved to another part of the page: the first responder falls
    # back here. A null destination (the browser's own chrome, or dead space
    # in the page) leaves it alone, as Cocoa does, so keys still reach it
    # when focus returns.
    sig { params(destination: T.nilable(Element)).void }
    def focus_left(destination)
      assign_first_responder(nil) if destination && !@root.contains(destination)
    end

    # A first responder inside a region being torn down falls back here.
    sig { params(element: Element).void }
    def release_first_responder(element)
      owner = responder_element(first_responder)
      assign_first_responder(nil) if owner && (owner == element || element.contains(owner))
    end

    # The responder for a DOM location: the first managed view above it,
    # which yields its controller for a controller root and itself otherwise.
    sig { params(element: T.nilable(Element)).returns(T.nilable(Responder)) }
    def responder_for(element)
      return nil unless element
      view = element.__swill_view__
      return view.controller_value || view if view
      responder_for(element.parentElement)
    end

    sig { params(responder: Responder).returns(T.nilable(Element)) }
    def responder_element(responder) # :nodoc:
      return T.cast(responder, Controller).view.element if responder.is_a?(Controller)
      return T.cast(responder, View).element if responder.is_a?(View)
      nil
    end

    sig { params(responder: Responder, previous: T.nilable(Element)).void }
    def restore_focus(responder, previous) # :nodoc:
      owner = responder_element(responder)
      return unless owner
      target = previous && owner.contains(previous) ? previous : T.must(owner.__swill_view__).first_focusable_element
      target.focus if target
    end

    # ---- window templates, containers, and content ----

    # <template for="window" name="x"> anywhere, or <template name="x"> directly
    # under the root. Templates are inert; content is cloned from them.
    sig { void }
    def scan_templates
      @root.querySelectorAll("template[name]").forEach do |template|
        name = T.must(template.getAttribute("name"))
        @templates[name] = template if template.getAttribute("for") == "window" || template.parentElement == @root
      end
    end

    # Rescans once on a miss so templates inserted after launch are found.
    sig { params(name: String).returns(T.nilable(Element)) }
    def window_template(name)
      found = @templates[name]
      return found if found
      scan_templates
      @templates[name]
    end

    sig { params(name: String).returns(Element) }
    def clone_window_content(name) # :nodoc:
      captured = @captured[name]
      return captured.cloneNode(true) if captured
      template = window_template(name)
      raise "No window content template: #{name}" unless template
      node = T.cast(template, HTMLTemplateElement).content.firstElementChild
      raise "Empty window template: #{name}" unless node
      node.cloneNode(true)
    end

    sig { returns(T::Array[Element]) }
    def window_containers # :nodoc:
      found = T.let([], T::Array[Element])
      found << @root if @root.hasAttribute("window")
      @root.querySelectorAll("[window]").forEach { |container| found << container }
      found
    end

    # Before awakening: capture pre-rendered content under the container's
    # name so it can be reloaded later, and fill empty containers from the
    # template their name attribute (or window name) selects.
    sig { void }
    def prepare_window_containers
      params = @fragments.params
      window_containers.each do |container|
        window_name = T.must(container.getAttribute("window"))
        default_name = container.getAttribute("name") || window_name
        first = container.firstElementChild
        @captured[default_name] = first.cloneNode(true) if first && !@captured[default_name]
        content_name = requested_content(window_name, default_name, params[window_name])
        next if first && content_name == default_name
        container.replaceChildren
        container.appendChild(clone_window_content(content_name))
        container.setAttribute("name", content_name)
      end
    end

    # The fragment may name the content to show; unknown names are reported
    # and the default stands.
    sig { params(window_name: String, default_name: String, requested: T.nilable(String)).returns(String) }
    def requested_content(window_name, default_name, requested)
      return default_name if requested == nil || requested == default_name
      return requested if window_content?(requested)
      warn("window \"#{window_name}\" requested unknown content \"#{requested}\"")
      default_name
    end

    sig { void }
    def register_window_containers # :nodoc:
      window_containers.each do |container|
        window = Window.new(T.must(container.getAttribute("window")), container)
        window.assign_content(container.getAttribute("name"), top_controller_in(container))
        @windows << window
      end
    end

    # The first controller inside the container whose parent is outside it.
    sig { params(container: Element).returns(T.nilable(Controller)) }
    def top_controller_in(container)
      Awakening.controllers_within(container).find { |controller| top_within?(controller, container) }
    end

    sig { params(controller: Controller, container: Element).returns(T::Boolean) }
    def top_within?(controller, container) # :nodoc:
      parent = controller.parent
      parent == nil || !container.contains(parent.view.element)
    end

    sig { params(window: Window, name: String).returns(T::Boolean) }
    def matches_container?(window, name) # :nodoc:
      window.container? && window.name == name
    end

    sig { params(controller: Controller).returns(T.nilable(Window)) }
    def window_containing(controller) # :nodoc:
      @windows.find { |window| holds?(window, controller) }
    end

    sig { params(window: Window, controller: Controller).returns(T::Boolean) }
    def holds?(window, controller) # :nodoc:
      window.contains_controller?(controller)
    end

    # Whether a responder's element sits inside an element; the application
    # itself sits nowhere.
    sig { params(responder: Responder, container: Element).returns(T::Boolean) }
    def responder_within?(responder, container)
      return false if responder == self
      element = responder_element(responder)
      element != nil && container.contains(element)
    end

    sig { params(responder: T.nilable(Responder)).returns(T::Boolean) }
    def attached?(responder) # :nodoc:
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
        Awakening.detach(window.root)
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
    def restore_window_state(window, prune_stale:, write_content:)
      stale = window.dispose_restoration
      controller = window.controller
      declarations = T.let(controller ? Runtime.restorations(controller) : [], T::Array[T.untyped])
      keys = declarations.map { |declaration| window.scoped_key(declaration.key) }
      content = window.content_name
      @fragments.write(window.name, content, history: :replace) if write_content && content
      if prune_stale
        stale.each { |key| @fragments.write(key, nil, history: :replace) unless keys.include?(key) }
      end
      return unless controller
      params = @fragments.params
      applied = 0
      @fragments.suspended do
        declarations.each do |declaration|
          text = params[window.scoped_key(declaration.key)]
          next if text == nil
          value = decode_fragment_value(declaration.type, text)
          next if value == nil
          Runtime.writePath(controller, declaration.path, value)
          applied += 1
        end
      end
      controller.controller_did_restore(applied > 0) unless declarations.empty?
      declarations.each do |declaration|
        disposer = Runtime.observePath(controller, declaration.path, ->(_value) { write_window_state(window) })
        window.add_restoration(disposer, window.scoped_key(declaration.key))
      end
    end

    sig { void }
    def restore_launched_windows # :nodoc:
      @windows.each { |window| restore_window_state(window, prune_stale: false, write_content: true) }
    end

    # Push the controller's current restorable state into the fragment.
    sig { params(window: Window).void }
    def write_window_state(window)
      controller = window.controller
      return unless controller
      T.let(Runtime.restorations(controller), T::Array[T.untyped]).each do |declaration|
        value = encode_fragment_value(Runtime.readPath(controller, declaration.path))
        @fragments.write(window.scoped_key(declaration.key), value, history: :replace)
      end
    end

    # Typed URL leaves; nil rejects invalid values.
    sig { params(type: String, text: String).returns(T.untyped) }
    def decode_fragment_value(type, text) # :nodoc:
      if type == "Integer" || type == "T.nilable(Integer)"
        stripped = text.strip
        return nil unless stripped =~ /\A[+-]?\d/
        return stripped.to_i
      end
      if type == "T::Boolean" || type == "T.nilable(T::Boolean)"
        return true if text == "true" || text == "1"
        return false if text == "false" || text == "0"
        return nil
      end
      text
    end

    sig { params(value: T.untyped).returns(T.nilable(String)) }
    def encode_fragment_value(value) # :nodoc:
      return nil if value.nil? || value == ""
      "#{value}"
    end

    # Back/Forward: a container whose fragment names other known content loads
    # it without touching history; otherwise its state is reapplied.
    sig { void }
    def apply_fragment
      params = @fragments.params
      @windows.each { |window| apply_fragment_to(window, params) }
    end

    sig { params(window: Window, params: T::Hash[String, String]).void }
    def apply_fragment_to(window, params) # :nodoc:
      return unless window.container?
      requested = params[window.name]
      if requested != nil && requested != window.content_name
        if window_content?(requested)
          load_window_content(window.name, requested, history: :none)
        else
          warn("window \"#{window.name}\" requested unknown content \"#{requested}\"")
        end
      else
        restore_window_state(window, prune_stale: false, write_content: false)
      end
    end

    # Code-created content awakens through the same path as markup: the
    # observer wires added subtrees and detaches removed ones. Explicit wiring
    # before the observer runs is harmless, since both are idempotent.
    sig { params(root: Element).void }
    def watch(root)
      return unless defined?(MutationObserver)
            observer = MutationObserver.new(->(records, _observer) do
        records.each do |record|
          record.removedNodes.forEach { |node| Awakening.detach(node) if node.nodeType == 1 }
          record.addedNodes.forEach { |node| Awakening.instantiate(node) if node.nodeType == 1 }
        end
      end)
      observer.observe(root, {childList: true, subtree: true})
      @observer = observer
    end
  end

  # Markup entry point. The framework bundle installs one launcher when a
  # document exists; it launches the class named by the [application] element
  # once the DOM is parsed and terminates it when the page is discarded.
  class Launcher < Swill::Object
    extend T::Sig

    sig { params(document: Document).void }
    def install(document)
      if document.readyState == "loading"
        document.addEventListener("DOMContentLoaded", ->(_event) { launch(document) }, {once: true})
      else
        launch(document)
      end
    end

    # A page without an [application] element is inert; a page naming an
    # unregistered class fails closed through Runtime.resolve. A running
    # application is returned rather than launched again.
    sig { params(document: Document).returns(T.nilable(Application)) }
    def launch(document)
      element = document.querySelector("[application]")
      return nil unless element
      return Application.shared if Application.running?
      application = T.cast(Runtime.resolve(T.must(element.getAttribute("application"))).new, Application)
      application.launch(element)
      # A persisted pagehide means the page may return from the back-forward
      # cache with its controllers intact, so only a real unload terminates.
      # The listener stays installed because a persisted pagehide can precede
      # the real one.
      T.must(document.defaultView).addEventListener("pagehide", ->(event) do
        application.terminate unless T.cast(event, PageTransitionEvent).persisted
      end)
      application
    end
  end
end
