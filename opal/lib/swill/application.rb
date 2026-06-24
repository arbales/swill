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
      before_launch
      Awakening.wire(root)
      watch(root)
      install_event_listeners(root)
      after_launch
      self
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
