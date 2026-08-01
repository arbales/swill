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
      @windows = []
      scan_window_templates
      prepare_window_containers(root)
      before_launch
      Awakening.wire(root)
      register_window_containers(root)
      watch(root)
      install_event_listeners(root)
      after_launch
      self
    end

    # Cocoa puts this transition on NSWindow. Until Swill has a Window object,
    # the application owns it. Explicit requests honor the responder's policy
    # gate before entering the first-responder state machine.
    def make_first_responder(responder)
      return false if responder && !responder.accepts_first_responder?

      FirstResponder.make(responder)
    end

    def show_window(name, into: `document.body`)
      scan_window_templates
      saved_first_responder = FirstResponder.current
      controller = instantiate_window(name.to_s, into)
      root = controller.view.element

      `#{root}.show && #{root}.show()`

      FirstResponder.make(controller)

      promise_state = `{}`
      promise = `new Promise(function(done) { #{promise_state}.resolve = done; })`
      @windows << {
        name: name.to_s,
        root: root,
        controller: controller,
        saved_first_responder: saved_first_responder,
        resolve: `#{promise_state}.resolve`
      }
      promise
    end

    def load_window_content(window_name, content_name)
      scan_window_templates
      container = window_container(window_name.to_s)
      raise ArgumentError, %(Application: no window container "#{window_name}") unless container

      previous = FirstResponder.current
      detach_window_content(container)
      `#{container}.replaceChildren()`

      node = clone_window_content(content_name.to_s)
      `#{container}.appendChild(#{node})`
      controllers = Awakening.wire(container)
      controller = top_controller_in(container, controllers)

      entry = window_entry_for_root(container)
      if entry
        entry[:controller] = controller
        entry[:content_name] = content_name.to_s
      else
        @windows << {
          name: window_name.to_s,
          content_name: content_name.to_s,
          root: container,
          controller: controller,
          saved_first_responder: nil,
          resolve: nil
        }
      end

      `#{container}.setAttribute("name", #{content_name.to_s})`
      if controller
        FirstResponder.make(controller)
      elsif previous && Focus.responder_element(previous) && `#{Focus.responder_element(previous)}.parentElement`
        FirstResponder.make(previous)
      end

      controller
    end

    def dismiss(controller)
      index = @windows.find_index do |window|
        window[:controller].equal?(controller) ||
          `#{window[:root]}.contains(#{controller.view.element})`
      end
      return unless index

      entry = @windows.delete_at(index)
      root = entry[:root]
      `#{root}.close && #{root}.close()`
      Awakening.detach(root)
      `#{root}.remove()`

      previous = entry[:saved_first_responder]
      if previous && Focus.responder_element(previous) && `#{Focus.responder_element(previous)}.parentElement`
        FirstResponder.make(previous)
      end

      `#{entry[:resolve]} && #{entry[:resolve]}()`
      nil
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

    def scan_window_templates
      @window_templates ||= {}
      `Array.from(document.querySelectorAll("template"))`.each do |template|
        name = `#{template}.getAttribute("name")`
        next unless name

        for_window = `#{template}.getAttribute("for") === "window"`
        body_child = `#{template}.parentElement === document.body`
        @window_templates[name.to_s] = template if for_window || body_child
      end
    end

    def prepare_window_containers(root)
      window_containers(root).each do |container|
        next if `#{container}.children.length > 0`

        window_name = element_attribute(container, "window")
        content_name = element_attribute(container, "name") || window_name
        next unless content_name && @window_templates[content_name.to_s]

        `#{container}.appendChild(#{clone_window_content(content_name.to_s)})`
        `#{container}.setAttribute("name", #{content_name.to_s})`
      end
    end

    def register_window_containers(root)
      window_containers(root).each do |container|
        name = element_attribute(container, "window")
        next unless name

        entry = window_entry_for_root(container)
        next if entry

        @windows << {
          name: name.to_s,
          content_name: element_attribute(container, "name")&.to_s,
          root: container,
          controller: top_controller_in(container, Awakening.controllers_within(container)),
          saved_first_responder: nil,
          resolve: nil
        }
      end
    end

    def window_containers(root)
      containers = []
      containers << root if `#{root}.hasAttribute && #{root}.hasAttribute("window")`
      `Array.from(#{root}.querySelectorAll("[window]"))`.each { |container| containers << container }
      containers
    end

    def window_container(name)
      found = nil
      window_containers(@root).each do |container|
        if element_attribute(container, "window") == name
          found = container
          break
        end
      end
      found
    end

    def instantiate_window(name, into)
      template = @window_templates[name]
      raise ArgumentError, %(Application: no window template "#{name}") unless template

      node = clone_window_content(name)
      raise ArgumentError, %(Application: empty window template "#{name}") unless node

      `#{into}.appendChild(#{node})`
      controllers = Awakening.wire(node)
      controller = Awakening.controller_for(node) || controllers.first
      raise ArgumentError, %(Application: window "#{name}" root has no controller attribute) unless controller

      controller
    end

    def clone_window_content(name)
      template = @window_templates[name]
      raise ArgumentError, %(Application: no window content template "#{name}") unless template

      `const content = #{template}.content;
       const node = content && content.firstElementChild
         ? content.firstElementChild
         : #{template}.children[0];
       return node ? node.cloneNode(true) : null;`
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

    def window_entry_for_root(root)
      @windows.find { |window| `#{window[:root]} === #{root}` }
    end

    def element_attribute(element, name)
      value = `#{element}.getAttribute(#{name})`
      value && value.to_s
    end

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
