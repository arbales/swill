# typed: true
# frozen_string_literal: true

module Swill
  # Controllers in Swill are perhaps most accurately described as View
  # Controllers. They represent an Object, via `represented_object` to a View
  # or region of Elements, and relationships to other controllers.
  #
  # Implementations of Controller also blend management of objects and collections
  # of objects -- something Cocoa does with its Array and Object Controllers.
  #
  # Ruby supports the inclusion of modules and re-opening classes more easily
  # than Objective-C did, so co-locating these behaviors obviates the need for
  # intermediate classes and Controllers.
  #
  # Controllers declare properties that applications may use to manage user interface
  # elements, like a search query. And Outlets that allow the easy connection of
  # Views and Elements to the controller.
  #
  #     class SearchController < Swill::Controller
  #       outlet :results, type: tSwill::View
  #       property :query, type: String, default: ""
  #       restorable :query, key: :q
  #
  #       def awake_from_dom
  #         observe(:query, ->(value) { reload })
  #       end
  #     end
  #
  # See the Lifecycle guide for when each hook runs, and
  # the Bindings guide for how markup reaches these properties.
  class Controller < Responder
    extend T::Sig
    include ObjectBindings

    # An outlet is a property connected, at awakening, to the element in this
    # controller's owned region that carries a matching outlet attribute.
    # Unconnected until then, so its reader is nilable. Declared here rather
    # than on Swill::Object because only a controller owns a region.
    macro def self.outlet(name, type:, optional: false, &computed)
      property name, type: Swill::Runtime.optional_type(type), default: nil,
                     outlet: true, optional: optional, &computed
    end

    # restorable :query, key: :q — a bindable path whose value the
    # application keeps in the URL fragment. The leaf type is derived when the
    # class is compiled; the runtime checks the path at installation.
    macro def self.restorable(path, key: path)
      declare_restoration(path, key: key)
    end

    # The object a parent binding assigns through bind="path" on this
    # controller root. Editors resolve their own bindings under it.
    property :represented_object, type: T.untyped, default: nil

    # Property under which bind paths in this region resolve; nil binds
    # against the controller itself. A leading @ in markup always ignores it.
    sig { returns(T.nilable(Symbol)) }
    def binding_root
      nil
    end

    # Adopts +element+ as this controller's root view. Answers self.
    sig { params(element: Element).returns(Controller) }
    def attach(element)
      @view = View.of(element) || View.new(element)
      @view.controller = self
      self
    end

    # The root view of this controller's region.
    sig { returns(View) }
    def view
      @view
    end

    # Ownership is derived from the sparse view tree and never stored twice.
    sig { returns(T.nilable(Controller)) }
    def parent
      @view.superview&.owner
    end

    # Direct child controllers in tree order.
    sig { returns(T::Array[Controller]) }
    def child_controllers
      found = T.let([], T::Array[Controller])
      collect_child_controllers(@view, found)
      found
    end

    # The one application running on this page.
    sig { returns(Application) }
    def application
      Application.shared
    end

    # A nested controller answers to its parent; a root controller answers to
    # the application, which is the top of the responder chain.
    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      parent || application
    end

    # Observe a notification for as long as this controller is loaded.
    sig { params(name: String, callback: T.proc.params(notification: Notification).void).void }
    def observe_notification(name, callback)
      retain(NotificationCenter.default.add_observer(name, callback))
    end

    # True when the region holds something focusable.
    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      @view.first_focusable_element != nil
    end

    # Focuses the first focusable element in the region.
    sig { override.returns(T::Boolean) }
    def become_first_responder
      return false unless super
      @view.focus_element
      true
    end

    # Blurs the focused element. Answers false to refuse the change.
    sig { override.params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      return false unless super(next_responder)
      @view.blur_element
      true
    end

    # Releases this controller's bindings, everything it retained, and its own
    # observation state, then its descendants, exactly once. The element keeps
    # its View, so the region can be awakened again later. Calling it twice is
    # harmless.
    sig { void }
    def unload
      return if @view.controller_value != self
      view_will_disappear
      application.release_first_responder(@view.element)
      unbind_all
      dealloc
      child_controllers.each { |child| child.unload }
      # Plain outlet views are released too; re-awakening adopts them again.
      @view.subviews.each { |subview| @view.release_subview(subview) }
      @view.remove_from_superview
      @view.controller = nil
      view_did_disappear
    end

    # Coercion hook for JSON outlets: turn parsed data into value objects
    # before the outlet is assigned. nil means the script was empty.
    sig { params(name: String, value: T.untyped).returns(T.untyped) }
    def decode_outlet_data(name, value)
      value
    end

    # Outlets are connected, and no binding has fired yet: state set here is
    # what bindings push first.
    sig { void }
    def view_did_load; end

    # Bindings have pushed their initial values, actions are live, and child
    # controllers are wired.
    sig { void }
    def awake_from_dom; end

    # Runs on a window controller after fragment values were applied to its
    # restorable paths and before controller_did_load. restored is true
    # when at least one value was applied.
    sig { params(restored: T::Boolean).void }
    def controller_did_restore(restored); end

    # The whole region, including any restored values, is in place. Runs once
    # per controller instance.
    sig { void }
    def controller_did_load; end

    # The region is about to appear. Runs each time it is awakened.
    sig { void }
    def view_will_appear; end

    # The region has appeared.
    sig { void }
    def view_did_appear; end

    # The region is about to go away, before anything it owns is released.
    sig { void }
    def view_will_disappear; end

    # The region is gone and everything it owned has been released.
    sig { void }
    def view_did_disappear; end

    sig { params(view: View, found: T::Array[Controller]).void }
    def collect_child_controllers(view, found) # :nodoc:
      view.subviews.each do |subview|
        controller = subview.controller_value
        if controller
          found << controller
        else
          collect_child_controllers(subview, found)
        end
      end
    end
  end
end
