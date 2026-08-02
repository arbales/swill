# backtick_javascript: true

module Swill
  # One presented window: a named [window] container or a template-
  # instantiated dialog. Owns its root element, current controller and content
  # name, the first responder to restore on dismissal, the close promise
  # resolver, and the fragment-restoration subscriptions for its controller.
  #
  # TODO(per-window FR): when responder chains become per-window, chain_top
  # and the current first responder land here (see core/responder.rb).
  class Window
    attr_reader :name, :root
    attr_accessor :controller, :content_name, :saved_first_responder, :close_resolver

    def initialize(name:, root:, controller: nil, content_name: nil,
                   saved_first_responder: nil, close_resolver: nil)
      @name = name.to_s
      @root = root
      @controller = controller
      @content_name = content_name
      @saved_first_responder = saved_first_responder
      @close_resolver = close_resolver
      @restoration_disposers = []
      @restoration_keys = []
    end

    def root?(element)
      `#{@root} === #{element}`
    end

    # A named [window] container with replaceable content, as opposed to a
    # template-instantiated dialog.
    def container?
      `#{@root}.hasAttribute && #{@root}.hasAttribute("window")`
    end

    def contains_controller?(candidate)
      controller.equal?(candidate) || `#{@root}.contains(#{candidate.view.element})`
    end

    # Tear down the window's subtree, restore the saved first responder, and
    # resolve the close promise.
    def dismiss
      dispose_restoration
      `#{@root}.close && #{@root}.close()`
      Awakening.detach(@root)
      `#{@root}.remove()`
      restore_saved_first_responder
      close_resolver&.call
      nil
    end

    def restore_saved_first_responder
      previous = saved_first_responder
      element = previous && Focus.responder_element(previous)
      FirstResponder.make(previous) if element && `#{element}.parentElement`
    end

    # ---- fragment restoration ----
    #
    # The window's own fragment param is its bare name (workspace=pane-two);
    # controller state params are scoped under it (workspace.q=beer).

    def scoped_key(key)
      "#{name}.#{key}"
    end

    def declarations
      controller ? controller.class.restorable_state_declarations : []
    end

    # Apply fragment params to the controller and re-subscribe its restorable
    # paths. Returns nothing; stale scoped keys left by a previous controller
    # are pruned when +prune_stale+.
    def restore_state(router, prune_stale:, write_content:)
      stale_keys = dispose_restoration
      keys = declarations.map { |declaration| scoped_key(declaration.key) }
      @restoration_keys = keys

      router.write(name, content_name, :replace) if write_content && content_name
      (stale_keys - keys).each { |key| router.write(key, nil, :replace) } if prune_stale
      return unless controller

      params = router.params
      values = {}
      declarations.each do |declaration|
        scoped = scoped_key(declaration.key)
        values[declaration.key] = params[scoped] if params.key?(scoped)
      end

      router.suspend_writes do
        controller.restore_state(Restoration::Coder.new(values))
      end

      @restoration_disposers = declarations.map do |declaration|
        segments = declaration.path.split(".")
        KeyPath.observe(controller, segments) { write_current_state(router) }
      end
    end

    # Push the controller's current restorable state into the fragment.
    def write_current_state(router)
      return unless controller

      coder = Restoration::Coder.new
      controller.encode_restorable_state(coder)
      coder.encoded.each do |key, value|
        value = nil if value == ""
        router.write(scoped_key(key), value, :replace)
      end
    end

    private

    # Release the current restoration subscriptions; returns the scoped keys
    # they covered so a caller can prune ones the next controller won't own.
    def dispose_restoration
      disposers = @restoration_disposers
      keys = @restoration_keys
      @restoration_disposers = []
      @restoration_keys = []
      disposers.each(&:call)
      keys
    end
  end
end
