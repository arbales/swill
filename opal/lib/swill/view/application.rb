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
      @window_restoration = {}
      @applying_fragment_state = false
      scan_window_templates
      prepare_window_containers(root)
      before_launch
      controllers = Awakening.wire(root, appear: false)
      register_window_containers(root)
      restore_window_states
      Awakening.activate(controllers)
      watch(root)
      install_event_listeners(root)
      install_fragment_routing
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

    def load_window_content(window_name, content_name, history: :push)
      scan_window_templates
      container = window_container(window_name.to_s)
      raise ArgumentError, %(Application: no window container "#{window_name}") unless container

      previous = FirstResponder.current
      detach_window_content(container)
      `#{container}.replaceChildren()`

      node = clone_window_content(content_name.to_s)
      `#{container}.appendChild(#{node})`
      controllers = Awakening.wire(container, appear: false)
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
      write_fragment_param(window_name.to_s, content_name.to_s, history)
      restore_window_state(window_entry_for_root(container), prune_stale: history != :none, write_content: history != :none)
      Awakening.activate(controllers)
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
        window_name = element_attribute(container, "window")
        default_name = element_attribute(container, "name") || window_name
        if `#{container}.children.length > 0`
          first = `#{container}.firstElementChild`
          @captured_window_contents[default_name.to_s] ||= `#{first}.cloneNode(true)` if first && default_name
        end

        requested = fragment_params[window_name.to_s]
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

    def restore_window_states
      @windows.each { |entry| restore_window_state(entry, prune_stale: false, write_content: true) }
    end

    def restore_window_state(entry, prune_stale:, write_content:)
      return unless entry && entry[:name]

      name = entry[:name]
      stale_keys = dispose_window_restoration(name)
      controller = entry[:controller]
      declarations = controller ? controller.class.restorable_state_declarations : []
      keys = declarations.map { |declaration| scoped_fragment_key(name, declaration.key) }

      write_fragment_param(name, entry[:content_name], :replace) if write_content && entry[:content_name]
      if prune_stale
        (stale_keys - keys).each { |key| write_fragment_param(key, nil, :replace) }
      end

      unless controller
        @window_restoration[name] = { disposers: [], keys: keys }
        return
      end

      values = {}
      params = fragment_params
      declarations.each do |declaration|
        scoped = scoped_fragment_key(name, declaration.key)
        values[declaration.key] = params[scoped] if params.key?(scoped)
      end

      @applying_fragment_state = true
      controller.restore_state(Restoration::Coder.new(values))
      @applying_fragment_state = false

      disposers = declarations.map do |declaration|
        segments = declaration.path.split(".")
        KeyPath.observe(controller, segments) { invalidate_restorable_state(controller) }
      end
      @window_restoration[name] = { disposers: disposers, keys: keys }
    ensure
      @applying_fragment_state = false
    end

    def invalidate_restorable_state(controller)
      entry = @windows.find { |candidate| candidate[:controller].equal?(controller) }
      return unless entry && !@applying_fragment_state

      coder = Restoration::Coder.new
      controller.encode_restorable_state(coder)
      coder.encoded.each do |key, value|
        write_fragment_param(scoped_fragment_key(entry[:name], key), fragment_value(value), :replace)
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
      captured = @captured_window_contents[name]
      return `#{captured}.cloneNode(true)` if captured
      raise ArgumentError, %(Application: no window content template "#{name}") unless template

      `const content = #{template}.content;
       const node = content && content.firstElementChild
         ? content.firstElementChild
         : #{template}.children[0];
       return node ? node.cloneNode(true) : null;`
    end

    def window_content?(name)
      name && (@window_templates.key?(name.to_s) || @captured_window_contents.key?(name.to_s))
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

    def dispose_window_restoration(name)
      state = @window_restoration.delete(name)
      return [] unless state

      state[:disposers].each(&:call)
      state[:keys]
    end

    def scoped_fragment_key(window_name, key)
      "#{window_name}.#{key}"
    end

    def fragment_params
      params = {}
      return params unless `typeof window !== "undefined" && window.location`

      raw = `window.location.hash.replace(/^#/, "")`
      search = `new URLSearchParams(#{raw})`
      collect = ->(value, key) { params[key.to_s] = value.to_s }
      `#{search}.forEach(#{collect})`
      params
    end

    def fragment_value(value)
      return nil if value.nil? || value == ""

      value.to_s
    end

    def write_fragment_param(key, value, history)
      return if history == :none || @applying_fragment_state
      return unless `typeof window !== "undefined" && window.location && window.history`

      raw = `window.location.hash.replace(/^#/, "")`
      params = `new URLSearchParams(#{raw})`
      if value.nil?
        `#{params}.delete(#{key})`
      else
        `#{params}.set(#{key}, #{value.to_s})`
      end
      query = `#{params}.toString()`
      next_url = `window.location.pathname + window.location.search + (#{query} ? "#" + #{query} : "")`
      current = `window.location.pathname + window.location.search + window.location.hash`
      return if next_url == current

      if history == :push
        `window.history.pushState(null, "", #{next_url})`
      else
        `window.history.replaceState(null, "", #{next_url})`
      end
    end

    def install_fragment_routing
      return unless `typeof window !== "undefined" && window.addEventListener`
      return if @fragment_routing_installed

      callback = ->(_event) { apply_fragment_to_windows }
      `window.addEventListener("popstate", #{callback})`
      `window.addEventListener("hashchange", #{callback})`
      @fragment_routing_installed = true
    end

    def apply_fragment_to_windows
      params = fragment_params
      @windows.dup.each do |entry|
        requested = params[entry[:name]]
        if requested && requested != entry[:content_name]
          if window_content?(requested)
            load_window_content(entry[:name], requested, history: :none)
          else
            warn(%([Swill] window="#{entry[:name]}" requested unknown content "#{requested}"))
          end
        else
          restore_window_state(entry, prune_stale: false, write_content: false)
        end
      end
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
