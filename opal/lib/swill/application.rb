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
      before_launch
      Awakening.wire(root)
      watch(root)
      install_event_listeners(root)
      after_launch
      self
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

    def dismiss(controller)
      entry = @windows.find do |window|
        window[:controller].equal?(controller) ||
          `#{window[:root]}.contains(#{controller.view.element})`
      end
      return unless entry

      @windows.delete(entry)
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

    def instantiate_window(name, into)
      template = @window_templates[name]
      raise ArgumentError, %(Application: no window template "#{name}") unless template

      node = clone_template_root(template)
      raise ArgumentError, %(Application: empty window template "#{name}") unless node

      `#{into}.appendChild(#{node})`
      controllers = Awakening.wire(node)
      controller = Awakening.controller_for(node) || controllers.first
      raise ArgumentError, %(Application: window "#{name}" root has no controller attribute) unless controller

      controller
    end

    def clone_template_root(template)
      `const content = #{template}.content;
       const node = content && content.firstElementChild
         ? content.firstElementChild
         : #{template}.children[0];
       return node ? node.cloneNode(true) : null;`
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
