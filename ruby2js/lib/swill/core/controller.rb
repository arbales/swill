# typed: true
# frozen_string_literal: true

module Swill
  class Controller < Responder
    extend T::Sig
    include ObjectBindings

    # The object a parent binding assigns through bind="path" on this
    # controller root. Editors resolve their own bindings under it.
    property :represented_object, type: T.untyped, default: nil

    # Property under which bind paths in this region resolve; nil binds
    # against the controller itself. A leading @ in markup always ignores it.
    sig { returns(T.nilable(Symbol)) }
    def binding_root
      nil
    end

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

    # The application whose root contains this controller, found through the
    # DOM so fragments awakened later and multiple applications both work.
    sig { returns(T.nilable(Application)) }
    def application
      nearest_application(@view.element())
    end

    # A nested controller answers to its parent; a root controller answers to
    # the application, which is the top of the responder chain.
    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      parent || application
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
      unbind_all
      dispose
      child_controllers.forEach { |child| child.teardown() }
      # Plain outlet views are released too; re-awakening adopts them again.
      @view.subviews().forEach { |subview| @view.release_subview(subview) }
      @view.remove_from_superview()
      @view.controller = nil
      view_did_disappear
    end

    # Coercion hook for JSON outlets: turn parsed data into value objects
    # before the outlet is assigned. nil means the script was empty.
    sig { params(name: String, value: T.untyped).returns(T.untyped) }
    def decode_outlet_data(name, value)
      value
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

    sig { params(element: T.untyped).returns(T.nilable(Application)) }
    def nearest_application(element)
      return nil unless element
      found = element.__swill_application__
      found ? found : nearest_application(element.parentElement)
    end

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
