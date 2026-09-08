# typed: true
# frozen_string_literal: true

module Swill
  class Controller < Responder
    extend T::Sig

    sig { params(element: T.untyped).returns(Controller) }
    def attach(element)
      @view = element.__swill_view__ || View.new(element)
      @view.controller = self
      @teardowns = []
      self
    end

    sig { returns(View) }
    def view
      @view
    end

    # Ownership is derived from the sparse view tree and never stored twice.
    sig { returns(T.nilable(Controller)) }
    def parent
      superview = @view.superview()
      superview ? superview.owner() : nil
    end

    # Direct child controllers in tree order, as a JavaScript array.
    sig { returns(T.untyped) }
    def child_controllers
      found = []
      collect_child_controllers(@view, found)
      found
    end

    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      parent
    end

    sig { params(dispose: T.proc.void).void }
    def register_teardown(dispose)
      @teardowns.push(dispose)
    end

    # Releases this controller's listeners and observers, then its descendants,
    # exactly once. The element keeps its View, so the region can be awakened
    # again later.
    sig { void }
    def teardown
      return if @view.controller_value() != self
      view_will_disappear
      @teardowns.forEach { |dispose| dispose.() }
      @teardowns = []
      dispose
      child_controllers.forEach { |child| child.teardown() }
      @view.remove_from_superview()
      @view.controller = nil
      view_did_disappear
    end

    sig { void }
    def view_did_load; end

    sig { void }
    def awake_from_dom; end

    sig { void }
    def controller_did_load; end

    sig { void }
    def view_will_appear; end

    sig { void }
    def view_did_appear; end

    sig { void }
    def view_will_disappear; end

    sig { void }
    def view_did_disappear; end

    sig { params(view: View, found: T.untyped).void }
    def collect_child_controllers(view, found)
      view.subviews().forEach do |subview|
        controller = subview.controller_value()
        if controller
          found.push(controller)
        else
          collect_child_controllers(subview, found)
        end
      end
    end
  end
end
