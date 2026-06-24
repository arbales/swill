# backtick_javascript: true

module Swill
  class Controller < Responder
    # `property`, `computed`, `observe`, and `notify_change` all come from
    # Observable. `property` is the observable accessor; plain `attr_accessor`
    # remains for non-reactive state, and Observable warns if a name is
    # declared both ways (see its docs).
    include Observable
    include Outlets

    attr_reader :view
    attr_accessor :parent

    def initialize
      @parent = nil
    end

    # Coercion hook for JSON-payload outlets (`<script type="application/json"
    # outlet="name">`). Override to build a value object from the parsed data.
    def decode_outlet_data(_name, value)
      value
    end

    def binding_root
      ""
    end

    def attach(element)
      @view = View.for(element) || View.new(element)
      @view.controller = self
      self
    end

    def next_responder
      parent || FirstResponder.chain_top
    end

    # Bindings and actions register undo callbacks here so detaching the
    # controller's subtree can release observers and DOM listeners.
    def register_teardown(&block)
      (@teardowns ||= []) << block
    end

    def teardown!
      (@teardowns || []).each(&:call)
      @teardowns = []
    end

    # Lifecycle hooks — Sequel's hook structure (override the method, call
    # `super`) with Cocoa lifecycle nouns. Empty stubs here; subclasses
    # override.
    #
    # Load is once-per-attachment and brackets outlet/binding/action wiring:
    #   before_load  — the view is in the DOM; outlets and bindings are NOT yet
    #                  connected. Set up state that does not depend on them.
    #   after_load   — outlets, bindings, and actions are wired; the controller
    #                  is fully awake (Cocoa's awakeFromNib moment).
    #
    # Appear is repeatable (a controller may appear, disappear, and reappear):
    #   before_appear / after_appear / before_disappear / after_disappear.
    def before_load; end
    def after_load; end
    def before_appear; end
    def after_appear; end
    def before_disappear; end
    def after_disappear; end
  end
end
