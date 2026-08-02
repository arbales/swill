# backtick_javascript: true

module Swill
  class Application < Responder
    class << self
      attr_writer :shared

      def shared
        @shared ||= new
      end
    end

    def start(root = `document.body`)
      self.class.shared = self
      # The application is the chain top — the responder chain bottoms out here
      # and the first responder falls back here. Set before wiring so
      # after_load can make a view the first responder.
      FirstResponder.chain_top = self
      @root = root
      @window_templates = {}
      @captured_window_contents = {}
      @windows = []
      @fragments = FragmentRouter.new
      scan_window_templates
      prepare_window_containers(root)
      before_launch
      controllers = Awakening.wire(root, appear: false)
      register_window_containers(root)
      @windows.each { |window| window.restore_state(@fragments, prune_stale: false, write_content: true) }
      Awakening.activate(controllers)
      watch(root)
      install_event_listeners(root)
      @fragments.on_change { apply_fragment_to_windows }
      after_launch
      self
    end

    # Cocoa puts this transition on NSWindow. Until first-responder state
    # moves onto Swill::Window, the application owns it. Explicit requests
    # honor the responder's policy gate before entering the first-responder
    # state machine.
    def make_first_responder(responder)
      return false if responder && !responder.accepts_first_responder?

      FirstResponder.make(responder)
    end

    # Present a template-backed dialog. Returns a Promise that resolves when
    # the window is dismissed.
    def show_window(name, into: `document.body`)
      saved_first_responder = FirstResponder.current
      controller = instantiate_window(name.to_s, into)
      root = controller.view.element

      `#{root}.show && #{root}.show()`

      FirstResponder.make(controller)

      promise = Promise.new
      @windows << Window.new(
        name: name,
        root: root,
        controller: controller,
        saved_first_responder: saved_first_responder,
        close_resolver: -> { promise.resolve(nil) }
      )
      promise
    end

    def load_window_content(window_name, content_name, history: :push)
      window = window_named(window_name.to_s) || register_container(window_container(window_name.to_s))
      raise ArgumentError, %(Application: no window container "#{window_name}") unless window

      container = window.root
      previous = FirstResponder.current
      detach_window_content(container)
      `#{container}.replaceChildren()`

      node = clone_window_content(content_name.to_s)
      `#{container}.appendChild(#{node})`
      controllers = Awakening.wire(container, appear: false)
      window.controller = top_controller_in(container, controllers)
      window.content_name = content_name.to_s

      `#{container}.setAttribute("name", #{content_name.to_s})`
      @fragments.write(window.name, content_name.to_s, history)
      window.restore_state(@fragments, prune_stale: history != :none, write_content: history != :none)
      Awakening.activate(controllers)
      if window.controller
        FirstResponder.make(window.controller)
      elsif previous && Focus.responder_element(previous) && `#{Focus.responder_element(previous)}.parentElement`
        FirstResponder.make(previous)
      end

      window.controller
    end

    def dismiss(controller)
      window = @windows.find { |candidate| candidate.contains_controller?(controller) }
      return unless window

      @windows.delete(window)
      window.dismiss
    end

    def next_responder
      nil
    end

    # Launch lifecycle, Cocoa nouns in Sequel hook structure:
    #   before_launch — before the root subtree is awakened.
    #   after_launch  — the subtree is wired and observed; Cocoa's
    #                   applicationDidFinishLaunching moment.
    def before_launch; end
    def after_launch; end

    private

    # ---- windows ----

    # Named [window] containers only — dialogs share the array but are never
    # targets for load_window_content.
    def window_named(name)
      @windows.find { |window| window.container? && window.name == name }
    end

    def window_for_root(root)
      @windows.find { |window| window.root?(root) }
    end

    def register_window_containers(root)
      window_containers(root).each do |container|
        register_container(container) unless window_for_root(container)
      end
    end

    def register_container(container)
      return nil unless container

      name = element_attribute(container, "window")
      return nil unless name

      window = Window.new(
        name: name,
        root: container,
        content_name: element_attribute(container, "name"),
        controller: top_controller_in(container, Awakening.controllers_within(container))
      )
      @windows << window
      window
    end

    def window_containers(root)
      containers = []
      containers << root if `#{root}.hasAttribute && #{root}.hasAttribute("window")`
      `Array.from(#{root}.querySelectorAll("[window]"))`.each { |container| containers << container }
      containers
    end

    def window_container(name)
      window_containers(@root).find { |container| element_attribute(container, "window") == name }
    end

    def detach_window_content(container)
      Awakening.controllers_within(container).each do |controller|
        next if `#{controller.view.element} === #{container}`

        Awakening.detach(controller.view.element)
      end
    end

    def top_controller_in(container, controllers)
      controllers.find do |controller|
        element = controller.view.element
        parent = controller.parent
        `#{container}.contains(#{element})` &&
          (parent.nil? || !`#{container}.contains(#{parent.view.element})`)
      end
    end

    def invalidate_restorable_state(controller)
      window = @windows.find { |candidate| candidate.controller.equal?(controller) }
      window&.write_current_state(@fragments)
    end

    # ---- fragment routing ----

    def apply_fragment_to_windows
      params = @fragments.params
      @windows.dup.each do |window|
        requested = params[window.name]
        if requested && requested != window.content_name
          if window_content?(requested)
            load_window_content(window.name, requested, history: :none)
          else
            warn(%([Swill] window="#{window.name}" requested unknown content "#{requested}"))
          end
        else
          window.restore_state(@fragments, prune_stale: false, write_content: false)
        end
      end
    end

    # ---- window templates and content ----

    def scan_window_templates
      @window_templates ||= {}
      `Array.from(document.querySelectorAll("template"))`.each do |template|
        name = `#{template}.getAttribute("name")`
        next unless name

        for_window = `#{template}.getAttribute("for") === "window"`
        body_child = `#{template}.parentElement === document.body`
        @window_templates[name.to_s] = template if for_window || body_child
      end
      @window_templates
    end

    # Look up a window template, rescanning the document once on a miss so
    # templates inserted after launch are still found.
    def window_template(name)
      @window_templates[name] || scan_window_templates[name]
    end

    def window_content?(name)
      return false unless name

      name = name.to_s
      return true if @captured_window_contents.key?(name)

      # The template is a raw DOM node; test presence on the JS side.
      `!!#{window_template(name)}`
    end

    def prepare_window_containers(root)
      window_containers(root).each do |container|
        window_name = element_attribute(container, "window")
        default_name = element_attribute(container, "name") || window_name
        if `#{container}.children.length > 0`
          first = `#{container}.firstElementChild`
          @captured_window_contents[default_name.to_s] ||= `#{first}.cloneNode(true)` if first && default_name
        end

        requested = @fragments.params[window_name.to_s]
        content_name = requested || default_name
        unless window_content?(content_name)
          warn(%([Swill] window="#{window_name}" requested unknown content "#{content_name}")) if requested
          content_name = default_name
        end
        next unless content_name
        next if `#{container}.children.length > 0` && content_name.to_s == default_name.to_s

        `#{container}.replaceChildren()`
        `#{container}.appendChild(#{clone_window_content(content_name.to_s)})`
        `#{container}.setAttribute("name", #{content_name.to_s})`
      end
    end

    def instantiate_window(name, into)
      node = clone_window_content(name)
      raise ArgumentError, %(Application: empty window template "#{name}") unless node

      `#{into}.appendChild(#{node})`
      controllers = Awakening.wire(node)
      controller = Awakening.controller_for(node) || controllers.first
      raise ArgumentError, %(Application: window "#{name}" root has no controller attribute) unless controller

      controller
    end

    def clone_window_content(name)
      captured = @captured_window_contents[name]
      return `#{captured}.cloneNode(true)` if captured

      template = window_template(name)
      raise ArgumentError, %(Application: no window content template "#{name}") unless template

      `const content = #{template}.content;
       const node = content && content.firstElementChild
         ? content.firstElementChild
         : #{template}.children[0];
       return node ? node.cloneNode(true) : null;`
    end

    def element_attribute(element, name)
      value = `#{element}.getAttribute(#{name})`
      value && value.to_s
    end

    # ---- document-level event routing ----

    # Reconcile the first responder with DOM focus changes, and route key
    # events to the current first responder. focusin/focusout bubble to the
    # root; keydown/keyup bubble up from the focused element.
    def install_event_listeners(root)
      focus_in = ->(event) { Focus.sync_from_focus(`#{event}.target`) }
      `#{root}.addEventListener("focusin", #{focus_in})`

      focus_out = lambda do |event|
        related = `#{event}.relatedTarget`
        # Only reconcile when focus leaves to nowhere; a move to another element
        # is handled by that element's focusin.
        Focus.sync_from_focus(nil, `#{event}.target`) if `#{related} == null`
      end
      `#{root}.addEventListener("focusout", #{focus_out})`

      key_down = ->(event) { FirstResponder.current&.key_down(Event.new(event)) }
      `#{root}.addEventListener("keydown", #{key_down})`

      key_up = ->(event) { FirstResponder.current&.key_up(Event.new(event)) }
      `#{root}.addEventListener("keyup", #{key_up})`
    end

    def watch(root)
      callback = lambda do |mutations, _observer|
        mutations.each do |mutation|
          `Array.from(#{mutation}.removedNodes)`.each do |node|
            Awakening.detach(node) if `#{node}.nodeType === 1`
          end
          `Array.from(#{mutation}.addedNodes)`.each do |node|
            Awakening.wire(node) if `#{node}.nodeType === 1`
          end
        end
      end

      @observer = `new MutationObserver(#{callback})`
      `#{@observer}.observe(#{root}, { childList: true, subtree: true })`
    end
  end
end
