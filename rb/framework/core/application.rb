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
      @page = T.let(nil, T.nilable(Window))
      @key_windows = T.let([], T::Array[Window])
      @changing_windows = T.let(false, T::Boolean)
      @posted_first_responder = T.let(nil, T.nilable(Responder))
      @observer = T.let(nil, T.nilable(MutationObserver))
      @unrestored = T.let([], T::Array[String])
      @unrestorable_paths = T.let([], T::Array[String])
      @problems = T.let(nil, T.nilable(ProblemReporter))
      @development_monitor = T.let(nil, T.nilable(DevelopmentMonitor))
      @connection_state = T.let("idle", String)
      @reconnect = T.let(nil, T.nilable(T.proc.void))
      @on_online = ->(_event) { @reconnect&.() if @connection_state == "disconnected" }
      @window_titles = T.let(0, Integer)
    end

    # The theme the page is drawn in: the name of one of the framework's
    # stylesheets, such as linear or bioplastic. The page links its theme as
    # `<link rel="stylesheet" data-swill-theme href=".../linear.css">`; at
    # launch this reads that link, and setting it points the link at another
    # theme. Raises for a theme the framework does not have.
    property :theme, type: T.nilable(String), default: nil

    # Whether the application is in development, which shows its problems as
    # alerts as well as in the console. Opt in with a `development` attribute
    # on the application's element, `Swill.start({development: true})`, or by
    # setting this before launch. False by default. See ProblemReporter.
    property :development, type: T::Boolean, default: false

    # Code in an in_development block runs only while this is true.
    sig { params(_previous: T::Boolean, development: T::Boolean).void }
    def development_did_change(_previous, development) # :nodoc:
      Runtime.setDevelopment(development)
    end

    # Starts the application at +root+: awakens the markup beneath it,
    # restores window content from the URL fragment, and begins watching for
    # content added later. One application runs per page.
    sig { params(root: Element).returns(Application) }
    def launch(root)
      raise "An application is already running" if Application.running?
      Application.launched(self)
      @root = root
      root.ownerDocument.defaultView&.addEventListener("online", @on_online)
      adopt_theme(root.ownerDocument)
      self.development = true if root.hasAttribute("development")
      problems = ProblemReporter.new(root.ownerDocument.defaultView)
      problems.start if development
      @problems = problems
      # The page is the first window, and key until another is presented.
      page = Window.new("", root)
      @page = page
      @key_windows = [page]
      @on_focus = ->(event) { focus_in(event) }
      @on_focus_out = ->(event) { focus_out(event) }
      @on_key_down = ->(event) { key_down_in_window(event) }
      @on_key_up = ->(event) { first_responder.key_up(event) }
      # Focus is followed in the capture phase, so content that stops a focus
      # event cannot hide the move from the first responder.
      root.addEventListener("focusin", @on_focus, true)
      root.addEventListener("focusout", @on_focus_out, true)
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
      warn_unrestored(@controllers)
      Awakening.finish(@controllers)
      @fragments.start_observing(->() { apply_fragment })
      watch(root)
      adopt_focus(root)
      application_did_launch
      NotificationCenter.default.post("application_did_launch", self, nil)
      monitor = DevelopmentMonitor.new(root.ownerDocument, problems)
      monitor.start
      @development_monitor = monitor
      self
    end

    # Presents connection notices without coupling UI-only applications to a
    # particular data transport. The transport supplies its recovery action.
    sig { params(state: String, detail: String, retry_action: T.proc.void).void }
    def connection_changed(state, detail, retry_action)
      @connection_state = state
      @reconnect = retry_action
      @problems&.connection_changed(state, detail, retry_action)
    end

    # Reports a recoverable operation problem, including in production.
    sig { params(message: String, detail: String).void }
    def report_problem(message, detail)
      @problems&.report("Warning", message, detail)
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
      root.ownerDocument.defaultView&.removeEventListener("online", @on_online)
      @reconnect = nil
      @development_monitor&.stop
      @development_monitor = nil
      @problems&.stop
      @problems = nil
      NotificationCenter.default.post("application_will_terminate", self, nil)
      @fragments.stop_observing
      observer = @observer
      observer.disconnect if observer
      @windows.each { |window| release_window(window) }
      @windows = []
      @controllers.each { |controller| controller.unload }
      Awakening.detach(@root)
      @controllers = []
      @root.removeEventListener("focusin", @on_focus, true)
      @root.removeEventListener("focusout", @on_focus_out, true)
      @root.removeEventListener("keydown", @on_key_down)
      @root.removeEventListener("keyup", @on_key_up)
      assign_first_responder(nil)
      @key_windows = []
      @page = nil
      Runtime.setDevelopment(false)
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
    # as a history entry, restore the new controller's state, and offer the
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
      warn_unrestored(controllers)
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
    # shown. The window becomes key, and the keyboard goes to its initial
    # first responder; see Window#initial_focus_element. Dismiss it with
    # dismiss(controller); the window's closed promise resolves then.
    sig { params(name: String, into: Element).returns(Window) }
    def show_window(name, into: @root)
      node = clone_window_content(name)
      into.appendChild(node)
      window = begin_window(name, node, false)
      controllers = Awakening.awaken(node)
      controller = View.controller_for(node)
      unless controller
        # Leave nothing behind: whatever the template awakened is torn down.
        @key_windows = @key_windows.reject { |candidate| candidate == window }
        Awakening.detach(node)
        node.remove
        raise "Window root has no controller: #{name}"
      end
      open_window(window, controller, controllers)
    end

    # Present a controller built in code as a window named +name+, its view
    # appended to the root, as a template's would be. The controller has
    # attached its root element; anything managed inside it awakens first,
    # then the controller loads. A <dialog> root is shown, and when +modal+
    # it is shown modally: the rest of the page is inert until it is
    # dismissed, and the keyboard stays inside it.
    sig { params(controller: Controller, name: String, into: Element, modal: T::Boolean).returns(Window) }
    def present_window(controller, name, into: @root, modal: false)
      node = controller.view.element
      raise "Window is already presented: #{name}" if node.isConnected
      into.appendChild(node)
      window = begin_window(name, node, modal)
      controllers = Awakening.awaken(node)
      Awakening.load(controller)
      open_window(window, controller, [controller] + controllers)
    end

    # A window about to be presented is key before its content awakens, so
    # content that takes the keyboard as it loads takes it in this window,
    # not the page.
    sig { params(name: String, node: Element, modal: T::Boolean).returns(Window) }
    def begin_window(name, node, modal) # :nodoc:
      window = Window.new(name, node, modal: modal)
      @key_windows << window
      window
    end

    sig { params(window: Window, controller: Controller, controllers: T::Array[Controller]).returns(Window) }
    def open_window(window, controller, controllers) # :nodoc:
      node = window.root
      if node.tagName == "DIALOG" && node.classList.contains("window")
        @window_titles += 1
        window.show_title("swill-window-title-#{@window_titles}", controller)
      end
      controller.view.update_accessibility
      window.assign_content(window.name, controller)
      if node.tagName == "DIALOG"
        # Opening runs the browser's own dialog focusing steps; the window's
        # initial first responder is chosen below instead.
        changing_windows do
          if window.modal?
            node.showModal
            # Escape is the responder chain's, as cancel_operation; the
            # browser's own cancel would close the dialog behind its back.
            node.addEventListener("cancel", ->(event) { event.preventDefault })
          else
            node.show
          end
        end
        # Safari ignores focus in a dialog it has not laid out since it
        # opened, so the window lays out before its first responder focuses.
        node.getBoundingClientRect
      end
      @windows << window
      restore_window_state(window, prune_stale: false, write_content: false)
      warn_unrestored(controllers)
      Awakening.finish(controllers)
      take_initial_first_responder(window, controller)
      window
    end

    # The keyboard goes to the window's initial first responder, unless its
    # content took it while loading; either way it is focused now that the
    # window is open, since a browser ignores focus in a closed dialog. With
    # nothing to focus, the controller is offered it and refuses.
    sig { params(window: Window, controller: Controller).void }
    def take_initial_first_responder(window, controller) # :nodoc:
      chosen = window.first_responder
      element = chosen ? chosen.key_element : window.initial_focus_element(excluded_roots(window))
      if element
        focus_in_window(element)
      elsif !chosen
        make_first_responder(controller)
      end
      post_first_responder_change
      in_development { verify_focus("a window opened") }
    end

    # Focuses +element+, or, when it already has focus (a dialog's own
    # focusing steps may have chosen it), reconciles the first responder
    # with it as the focus event would have.
    sig { params(element: Element).void }
    def focus_in_window(element) # :nodoc:
      if element.ownerDocument.activeElement == element
        sync_first_responder(element, nil)
      else
        DOM.focus(element)
      end
    end

    # Runs +block+ while windows open or close. Focus the browser moves then,
    # by a dialog's focusing steps or its return of focus on closing, is not
    # the user's; the framework places the keyboard itself afterward.
    sig { params(block: T.proc.void).void }
    def changing_windows(&block) # :nodoc:
      @changing_windows = true
      begin
        block.call
      ensure
        @changing_windows = false
      end
    end

    # The page's theme link, or nil when the page links none.
    sig { params(document: Document).returns(T.nilable(Element)) }
    def theme_link(document) # :nodoc:
      document.querySelector("link[data-swill-theme]")
    end

    sig { params(document: Document).void }
    def adopt_theme(document) # :nodoc:
      link = theme_link(document)
      return unless link
      file = T.must(T.must(link.getAttribute("href")).split("?").first).split("/").last.to_s
      self.theme = file.split(".").first
    end

    sig { params(_previous: T.nilable(String), theme: T.nilable(String)).void }
    def theme_did_change(_previous, theme) # :nodoc:
      root = @root
      return unless theme && root
      link = theme_link(root.ownerDocument)
      return unless link
      framework = Bundle.framework
      url = framework ? framework.url_for_resource(theme, "css") : nil
      raise "Unknown theme: #{theme}" unless url
      # The same stylesheet, however the page spelled its address, is left
      # alone rather than loaded again.
      current = link.getAttribute("href").to_s
      return if current.end_with?("/#{theme}.css") || current == "#{theme}.css"
      link.setAttribute("href", url)
    end

    # Only a window's content controller is restored, so restorable paths
    # declared on any other controller would be silently ignored. Warns once
    # per class, naming the paths. A class that is some window's content as
    # well is declaring for that use, so it is not warned about.
    sig { params(controllers: T::Array[Controller]).void }
    def warn_unrestored(controllers) # :nodoc:
      contents = @windows.map { |window| window.controller }.compact.map { |content| Runtime.nameOf(content) }
      controllers.each do |controller|
        next if @windows.any? { |window| window.controller == controller }
        declarations = T.let(Runtime.restorations(controller), T::Array[T.untyped])
        next if declarations.empty?
        name = T.let(Runtime.nameOf(controller), T.nilable(String)) || "a controller"
        next if contents.include?(name) || @unrestored.include?(name)
        @unrestored << name
        paths = declarations.map { |declaration| declaration.path }.join(", ")
        warn "#{name} declares restorable #{paths}, but only a window's content controller is restored; " \
             "declare it there as a path through this controller"
      end
    end

    # Closes the window +controller+ belongs to. The window that was key
    # before it is key again, and its first responder, kept all along, takes
    # the keyboard back.
    sig { params(controller: Controller).returns(T::Boolean) }
    def dismiss(controller)
      window = window_containing(controller)
      return false unless window
      @windows = @windows.select { |candidate| candidate != window }
      @key_windows = @key_windows.select { |candidate| candidate != window }
      changing_windows { window.dismiss }
      refocus_key_window
      true
    end

    # The key window's first responder takes focus again, as an NSWindow's
    # does when the window becomes key, without becoming first responder
    # anew: at the element within it that last had focus, or else at its key
    # element.
    sig { void }
    def refocus_key_window # :nodoc:
      responder = first_responder
      owner = responder_element(responder)
      window = key_window
      last = window ? window.focused_element : nil
      element = last && owner && owner.contains(last) && @root.contains(last) ? last : responder.key_element
      focus_in_window(element) if element && @root.contains(element)
      post_first_responder_change
      in_development { verify_focus("a window closed") }
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

    # ---- key window and first responder ----

    # The page, the window everything else is presented over, as Cocoa's main
    # window is the document a panel serves. Its first responder is kept
    # while other windows are key. Nil before launch.
    sig { returns(T.nilable(Window)) }
    def main_window
      @page
    end

    # The page and the presented windows, in the order they were last key.
    sig { returns(T::Array[Window]) }
    def key_windows # :nodoc:
      @key_windows
    end

    # The window that has the keyboard: the most recently presented window
    # still open, or the window focus last moved into; the page when none
    # is presented. Nil before launch.
    sig { returns(T.nilable(Window)) }
    def key_window
      @key_windows.last
    end

    # The key window's first responder, which keys go to; the application
    # itself when nothing more specific holds it.
    sig { returns(Responder) }
    def first_responder
      window = key_window
      responder = window ? window.first_responder : nil
      responder || self
    end

    # Cocoa's makeFirstResponder, on the window +responder+ belongs to: a
    # responder that does not accept is refused up front; that window's
    # current first responder may refuse to resign; a responder that refuses
    # to become leaves the window with none, and the application holds it.
    # In the key window, becoming focuses the responder's key element; a
    # window that is not key keeps the responder for when it is, as making a
    # first responder does not make its window key. Nil gives the key
    # window's first responder up to the application.
    #
    # The first responder changes in four places only: here, when the
    # browser moves focus (sync_first_responder), when focus leaves the page
    # (focus_left), and when its region is torn down
    # (release_first_responder).
    sig { params(responder: T.nilable(Responder)).returns(T::Boolean) }
    def make_first_responder(responder)
      return false if responder && !responder.accepts_first_responder?
      window = responder ? window_of(responder) : key_window
      return false unless window
      current = T.let(window.first_responder || self, Responder)
      return true if responder == current
      return false unless current.resign_first_responder(responder)
      # Nobody holds it while the newcomer becomes it, so focus moving
      # during become reconciles against the application. When that focus
      # lands in a nested responder, the keyboard is there, and that
      # responder stays first.
      window.first_responder = nil
      if window != key_window
        window.first_responder = responder
      elsif responder && responder.become_first_responder
        window.first_responder = responder if window.first_responder.nil?
      end
      post_first_responder_change
      in_development { verify_focus("make_first_responder") }
      true
    end

    # Gives the key window's keyboard to +responder+ without asking anyone,
    # for the framework's own bookkeeping.
    sig { params(responder: T.nilable(Responder)).void }
    def assign_first_responder(responder) # :nodoc:
      window = key_window
      assign_window_first_responder(window, responder) if window
    end

    sig { params(window: Window, responder: T.nilable(Responder)).void }
    def assign_window_first_responder(window, responder) # :nodoc:
      window.first_responder = responder
      post_first_responder_change
    end

    # Every change of first responder is posted once as
    # first_responder_did_change, with the application as the object and the
    # responder as user info, so a debugging view or a toolbar can follow it
    # without polling. Focus moving during become may already have posted
    # the same responder; the last one posted is remembered for that.
    sig { void }
    def post_first_responder_change
      window = key_window
      responder = window ? window.first_responder : nil
      return if responder == @posted_first_responder
      @posted_first_responder = responder
      NotificationCenter.default.post("first_responder_did_change", self, responder)
    end

    # A responder's class, and for a view or controller the element it is
    # rooted at, as the development focus checks name it.
    sig { params(responder: Responder).returns(String) }
    def describe_responder(responder) # :nodoc:
      name = T.let(Runtime.nameOf(responder), T.nilable(String)) || "a responder"
      element = responder_element(responder)
      element ? "#{name} #{describe_element(element)}" : name
    end

    # The window +responder+ belongs to: the innermost window holding its
    # element, or the key window for one with no element.
    sig { params(responder: Responder).returns(T.nilable(Window)) }
    def window_of(responder) # :nodoc:
      element = responder_element(responder)
      element ? window_holding(element) : key_window
    end

    # The innermost window holding +element+: a presented window whose root
    # contains it, else the page.
    sig { params(element: Element).returns(T.nilable(Window)) }
    def window_holding(element) # :nodoc:
      key_windows.reverse.find { |window| window.root.contains(element) }
    end

    # The roots of the presented windows other than +window+. The page's
    # root holds them all, but their controls are not the page's key views.
    sig { params(window: Window).returns(T::Array[Element]) }
    def excluded_roots(window) # :nodoc:
      key_windows.select { |other| other != window && other != @page }.map(&:root)
    end

    sig { params(event: KeyboardEvent).void }
    def key_down_in_window(event) # :nodoc:
      in_development { verify_focus("a key") }
      DOM.revealing { first_responder.key_down(event) }
    end

    # Focus the browser gave before launch, as to an `autofocus` field,
    # makes its responder first, as later focus does.
    sig { params(root: Element).void }
    def adopt_focus(root) # :nodoc:
      active = root.ownerDocument.activeElement
      sync_first_responder(active, nil) if active && active != root && root.contains(active)
    end

    # In development, checks that the keyboard is where the first responder
    # says: focus outside the page is fine (the first responder waits for
    # it), but focus inside it must be in the key window and within the key
    # window's first responder, which must be attached and accept. A
    # mismatch is a framework bug or a focus moved behind the framework's
    # back, and is reported as a warning naming +moment+.
    sig { params(moment: String).void }
    def verify_focus(moment) # :nodoc:
      window = key_window
      active = @root.ownerDocument.activeElement
      return unless window && active && @root.contains(active) && active != @root
      responder = first_responder
      owner = responder_element(responder)
      problem = if window_holding(active) != window
        "focus is in another window than the key window #{window_label(window)}"
      elsif responder != self && !attached?(responder)
        "the first responder is no longer in the page"
      elsif responder != self && !responder.accepts_first_responder?
        "the first responder does not accept being first responder"
      elsif owner && !owner.contains(active)
        "the focused element is outside the first responder"
      end
      return unless problem
      focused = describe_element(active)
      warn "Focus check after #{moment}: #{problem}. First responder: #{describe_responder(responder)}; focused: #{focused}."
    end

    sig { params(window: Window).returns(String) }
    def window_label(window) # :nodoc:
      window == @page ? "(the page)" : "\"#{window.name}\""
    end

    sig { params(element: Element).returns(String) }
    def describe_element(element) # :nodoc:
      tag = element.tagName.downcase
      %w[outlet controller klass data-action class].each do |attribute|
        value = element.getAttribute(attribute)
        tag = "#{tag} #{attribute}=\"#{value}\"" if value
      end
      "<#{tag}>"
    end

    sig { params(event: Event).void }
    def focus_in(event) # :nodoc:
      return if @changing_windows
      target = event.target
      window = window_holding(target)
      if window && window != @page && window.root == target
        # A dialog itself takes focus when its background is clicked, and
        # Safari tabs to it; the control focus came from takes it back, or
        # the window's initial one when focus came from outside.
        previous = event.relatedTarget
        back = previous && previous != target && target.contains(previous) ? previous : nil
        back ||= window.initial_focus_element(excluded_roots(window))
        return DOM.focus(back) if back
      end
      sync_first_responder(target, event.relatedTarget)
    end

    # Tab moves through the key window's key view loop: its key views in
    # document order, wrapping at either end, as an NSWindow's does. The
    # browser's own Tab is prevented. A responder that takes insert_tab
    # without calling super keeps Tab for itself.
    sig { override.params(event: KeyboardEvent).void }
    def insert_tab(event)
      super unless select_key_view(event, 1)
    end

    # Shift-Tab, the key view loop backward.
    sig { override.params(event: KeyboardEvent).void }
    def insert_backtab(event)
      super unless select_key_view(event, -1)
    end

    # Enter that nothing else took presses the key window's default button,
    # the one marked with the `default` class.
    sig { override.params(event: KeyboardEvent).void }
    def insert_newline(event)
      window = key_window
      button = window ? window.default_button(excluded_roots(window)) : nil
      return super unless button
      event.preventDefault
      button.click
    end

    # Focuses the key view +delta+ places from the event's target in the key
    # window, wrapping; one focus cannot take (hidden by a style, say) is
    # passed over.
    sig { params(event: KeyboardEvent, delta: Integer).returns(T::Boolean) }
    def select_key_view(event, delta) # :nodoc:
      window = key_window
      return false unless window
      views = window.key_views(excluded_roots(window))
      return false if views.empty?
      event.preventDefault
      found = views.index(event.target)
      # From outside the loop, Tab starts at the first view and Shift-Tab at
      # the last.
      index = T.let(found || (delta.positive? ? -1 : 0), Integer)
      attempts = 0
      while attempts < views.length
        index = (index + delta) % views.length
        candidate = T.must(views[index])
        DOM.focus_revealing(candidate)
        return true if candidate.ownerDocument.activeElement == candidate
        attempts += 1
      end
      true
    end

    sig { params(event: Event).void }
    def focus_out(event) # :nodoc:
      focus_left(event.relatedTarget)
    end

    # The browser already moved focus; reconcile the first responder without
    # re-running become. A responder that does not accept is refused, as
    # make_first_responder refuses it, and so is a change the current first
    # responder will not resign for; either way focus goes back.
    sig { params(target: Element, previous: T.nilable(Element)).void }
    def sync_first_responder(target, previous)
      window = window_holding(target)
      return unless window
      # Focus moving into another window, one not modal to the rest, makes
      # it key, as clicking a window does.
      @key_windows = @key_windows.select { |other| other != window } + [window] unless window == key_window
      window.focused_element = target
      responder = responder_for(target)
      current = T.let(window.first_responder || self, Responder)
      return if responder == current
      if responder && !responder.accepts_first_responder?
        responder_element(current) ? restore_focus(current, previous) : target.blur
        return
      end
      unless current.resign_first_responder(responder)
        restore_focus(current, previous)
        return
      end
      assign_window_first_responder(window, responder)
      in_development { verify_focus("focus moved") }
    end

    # Focus moved to another part of the page: the first responder falls
    # back here. A null destination (the browser's own chrome, or dead space
    # in the page) leaves it alone, as Cocoa does, so keys still reach it
    # when focus returns.
    sig { params(destination: T.nilable(Element)).void }
    def focus_left(destination)
      assign_first_responder(nil) if destination && !@root.contains(destination)
    end

    # A window's first responder inside a region being torn down falls back
    # to the window, so the application holds it.
    sig { params(element: Element).void }
    def release_first_responder(element)
      key_windows.each do |window|
        responder = window.first_responder
        owner = responder ? responder_element(responder) : nil
        window.first_responder = nil if owner && (owner == element || element.contains(owner))
      end
      post_first_responder_change
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
      responder.focus_region
    end

    sig { params(responder: Responder, previous: T.nilable(Element)).void }
    def restore_focus(responder, previous) # :nodoc:
      owner = responder_element(responder)
      return unless owner
      target = previous && owner.contains(previous) ? previous : responder.key_element
      DOM.focus(target) if target
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
    sig { params(window_name: String, default_name: String, requested: T.untyped).returns(String) }
    def requested_content(window_name, default_name, requested)
      return default_name unless requested.is_a?(String)
      return default_name if requested == default_name
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
      unrestorable = T.let([], T::Array[String])
      @fragments.suspended do
        declarations.each do |declaration|
          key = window.scoped_key(declaration.key)
          text = params[key]
          next if text == nil
          value = decode_fragment_value(declaration.type, text)
          next if value == nil
          if restore_path(controller, declaration.path, value)
            applied += 1
          else
            unrestorable << key
          end
        end
      end
      # Writes are suspended while restoring, so a key that could not be
      # restored leaves the fragment afterwards.
      unrestorable.each { |key| @fragments.write(key, nil, history: :replace) }
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
      changes = T.let({}, T::Hash[String, T.untyped])
      T.let(Runtime.restorations(controller), T::Array[T.untyped]).each do |declaration|
        path = declaration.path
        # A value that could not be restored is not worth keeping in the URL.
        value = writable_path?(controller, path) ? encode_fragment_value(controller, Runtime.readPath(controller, path), path) : nil
        changes[window.scoped_key(declaration.key)] = value
      end
      @fragments.write_values(changes, history: :replace)
    end

    # Typed URL leaves; nil rejects invalid values.
    sig { params(type: T.nilable(String), text: T.untyped).returns(T.untyped) }
    def decode_fragment_value(type, text) # :nodoc:
      kind = T.let(type || "T.untyped", String)
      kind = kind.slice(10, kind.length - 11) || "" if kind.start_with?("T.nilable(")
      if text.is_a?(Array)
        return nil unless kind.start_with?("T::Array[") || kind == "T.untyped"
        element = kind == "T.untyped" ? "String" : kind.slice(9, kind.length - 10)
        values = T.cast(text, T::Array[String]).map { |item| decode_fragment_value(element, item) }
        return values.any? { |value| value.nil? } ? nil : values
      end
      return nil unless text.is_a?(String)
      scalar = T.cast(text, String)
      return nil if kind.start_with?("T::Array[")
      if kind == "Integer"
        stripped = scalar.strip
        return nil unless stripped =~ /\A[+-]?\d+\z/
        return stripped.to_i
      end
      if kind == "Float"
        return nil unless scalar.strip =~ /\A[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\z/
        number = scalar.to_f
        return nil if number.to_s =~ /Infinity|NaN/
        return number
      end
      if kind == "T::Boolean"
        return true if scalar == "true" || scalar == "1"
        return false if scalar == "false" || scalar == "0"
        return nil
      end
      kind == "String" || kind == "T.untyped" ? scalar : nil
    end

    # Scalar text or a flat array of scalar text; nil leaves the key out.
    sig { params(controller: Controller, value: T.untyped, path: String).returns(T.untyped) }
    def encode_fragment_value(controller, value, path) # :nodoc:
      return nil if value.nil?
      if value.is_a?(Array)
        values = T.cast(value, T::Array[T.untyped]).map { |item| fragment_scalar(item) }
        if values.any? { |item| item.nil? }
          warn_unrestorable(controller, path, "its array must contain only strings, finite numbers or booleans")
          return nil
        end
        return values
      end
      text = fragment_scalar(value)
      return text unless text.nil?
      warn_unrestorable(controller, path, "its value cannot be written to the URL; restore a string, finite number, boolean or flat array")
      nil
    end

    sig { params(value: T.untyped).returns(T.nilable(String)) }
    def fragment_scalar(value) # :nodoc:
      return value if value.is_a?(String)
      if value.is_a?(Integer) || value.is_a?(Float) || value == true || value == false
        text = "#{value}"
        return text unless text =~ /Infinity|NaN/
      end
      nil
    end

    # Writes a restored value through +path+, answering false when the path
    # cannot take it, so the rest of the window's state still restores.
    sig { params(controller: Controller, path: String, value: T.untyped).returns(T::Boolean) }
    def restore_path(controller, path, value) # :nodoc:
      Runtime.writePath(controller, path, value)
      true
    rescue => error
      warn_unrestorable(controller, path, error.message)
      false
    end

    # Whether a value read through +path+ could be written back. A path
    # through an owner that is missing for now still counts as writable.
    sig { params(controller: Controller, path: String).returns(T::Boolean) }
    def writable_path?(controller, path) # :nodoc:
      Runtime.assertWritablePath(controller, path)
      true
    rescue => error
      warn_unrestorable(controller, path, error.message)
      false
    end

    # Warns once per class and path.
    sig { params(controller: Controller, path: String, reason: String).void }
    def warn_unrestorable(controller, path, reason) # :nodoc:
      name = T.let(Runtime.nameOf(controller), T.nilable(String)) || "a controller"
      return if @unrestorable_paths.include?("#{name} #{path}")
      @unrestorable_paths << "#{name} #{path}"
      warn "#{name}: restorable #{path} is left out of the URL: #{reason}"
    end

    # Back/Forward: a container whose fragment names other known content loads
    # it without touching history; otherwise its state is reapplied.
    sig { void }
    def apply_fragment
      params = @fragments.params
      @windows.each { |window| apply_fragment_to(window, params) }
    end

    sig { params(window: Window, params: T::Hash[String, T.untyped]).void }
    def apply_fragment_to(window, params) # :nodoc:
      return unless window.container?
      requested = params[window.name]
      if requested.is_a?(String) && requested != window.content_name
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
      failure = T.let(Runtime.buildFailure, T.nilable(String))
      if failure
        show_build_failure(element, failure)
        return nil
      end
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

    # A development build that failed to compile replaces the application's
    # script with one reporting the error. No application can launch, so the
    # error is shown as an alert is, without one, in +root+, the element that
    # names the application.
    sig { params(root: Element, message: String).void }
    def show_build_failure(root, message)
      dialog = T.must(Templates.named("alert", root.ownerDocument).content.firstElementChild).cloneNode(true)
      alert = Swell[dialog]
      alert.find!("h2").text("The application failed to build")
      Swell[T.must(alert.find!(".alert-text").element.querySelector("p"))].text(message)
      stop = Image.named("Stop")
      alert.find!("img").attr("src", stop.url) if stop
      alert.find!(".actions").remove
      root.appendChild(dialog)
      dialog.show
    end
  end
end
