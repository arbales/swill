# typed: true
# frozen_string_literal: true

module Swill
  # A `Controller` manages a region of elements and presents a represented
  # object to it. It is responsible for:
  #
  # - the outlets connected from its region, and the properties its region
  #   binds to;
  # - the bindings it establishes in Ruby, through `ObjectBindings`;
  # - the observations and child controllers it retains, released together
  #   when it unloads;
  # - its place in the responder chain, and the first responder within its
  #   region.
  #
  # A controller is created from markup: an element carrying `controller`
  # becomes the root of its region, and the region runs to the next such
  # element. A search controller declares an outlet for its results, a
  # property for its query, and keeps the query in the URL:
  #
  #     class SearchController < Swill::Controller
  #       outlet :results, type: Swill::View
  #       property :query, type: String, default: ""
  #       restorable :query, key: :q
  #
  #       def awake_from_dom
  #         observe(:query, ->(value) { reload })
  #       end
  #     end
  #
  # See [Awakening](rdoc-ref:doc/awakening.md) for how a region is formed,
  # [Lifecycle](rdoc-ref:doc/lifecycle.md) for when each hook runs, and
  # [Bindings](rdoc-ref:doc/bindings.md) for how markup reaches properties.
  class Controller < Responder
    extend T::Sig
    include ObjectBindings
    include OutletOwner

    # :section: Declaring Outlets and Restorable Paths
    # Class-level declarations beyond `property`.

    # Declares a bindable `path` whose value the application keeps in the URL
    # fragment under `key`, which defaults to the path itself. The value's
    # type is derived when the class is compiled; the path is checked when the
    # runtime installs the class. `controller_did_restore` reports whether a
    # value was applied.
    macro def self.restorable(path, key: path)
      declare_restoration(path, key: key)
    end

    # :section: Presenting an Object
    # The object this controller's region binds to.

    # The object this controller presents. A parent controller assigns it
    # through `bind="path"` on this controller's root element; nil until then.
    # Bindings within the region resolve under `binding_root`, which by
    # default is the controller itself.
    property :represented_object, type: T.untyped, default: nil

    # Returns the property under which `bind` paths in this region resolve,
    # or nil to resolve them against the controller itself. A path beginning
    # with `@` in markup ignores the root. The default is nil; override it to
    # bind a region to the represented object directly.
    sig { returns(T.nilable(Symbol)) }
    def binding_root
      nil
    end

    # :section: Locating the Region
    # This controller's view, and the controllers around it.

    # Adopts `element` as this controller's root view, creating a `View` for
    # it when it has none, and returns the controller. The awakener calls
    # this for an element carrying `controller`.
    sig { params(element: Element).returns(Controller) }
    def attach(element)
      @view = View.of(element) || View.new(element)
      @view.controller = self
      self
    end

    # The root view of this controller's region.
    sig { returns(View) }
    attr_reader :view

    # Returns the controller that owns the containing region, or nil for a
    # root controller.
    sig { returns(T.nilable(Controller)) }
    def parent
      @view.superview&.owner
    end

    # Returns the controllers rooted directly within this region, in document
    # order; an empty array when there are none.
    sig { returns(T::Array[Controller]) }
    def child_controllers
      found = T.let([], T::Array[Controller])
      collect_child_controllers(@view, found)
      found
    end

    # Returns the application running on this page.
    sig { returns(Application) }
    def application
      Application.shared
    end

    # :section: Responding
    # This controller's place in the responder chain.

    # Returns the parent controller, or the application for a root
    # controller. The application ends the chain.
    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      parent || application
    end

    # Observes the notification named `name` until this controller unloads.
    # `callback` receives each `Notification` posted under that name.
    sig { params(name: String, callback: T.proc.params(notification: Notification).void).void }
    def observe_notification(name, callback)
      retain(NotificationCenter.default.add_observer(name, callback))
    end

    # Returns whether the region contains a focusable element, as `View`
    # decides it. A controller with nothing to focus refuses first responder.
    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      @view.first_focusable_element != nil
    end

    # Focuses the first focusable element in the region and returns true.
    # Returns false, focusing nothing, when the current first responder
    # refuses to resign.
    sig { override.returns(T::Boolean) }
    def become_first_responder
      return false unless super
      @view.focus_element
      true
    end

    # Blurs the region's focused element and returns true. Override to return
    # false, which refuses the change and keeps this controller first
    # responder.
    sig { override.params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      return false unless super
      @view.blur_element
      true
    end

    # :section: Loading and Unloading
    # The hooks that run as a region awakens and goes away, in the order they
    # run. Each hook's default implementation does nothing.

    # Releases everything this controller holds, then unloads its child
    # controllers. Bindings, retained observations, and the controller's own
    # observers are released; the region's views are dropped from the view
    # tree, though each element keeps its `View`, so the region can awaken
    # again. `view_will_disappear` runs first and `view_did_disappear` last.
    # A second call does nothing.
    sig { void }
    def unload
      return if @view.controller_value != self
      view_will_disappear
      application.release_first_responder(@view.element)
      unbind_all
      dealloc
      child_controllers.each { |child| child.unload }
      # Plain outlet views are released too; re-awakening adopts them again.
      @view.subviews.dup.each { |subview| subview.unload }
      @view.remove_from_superview
      @view.controller = nil
      view_did_disappear
    end

    # Invoked after the region's outlets are connected and before any binding
    # is established. State set here is what bindings push first.
    sig { void }
    def view_did_load; end

    # Invoked after every binding in the region has pushed its initial value,
    # every `data-action` has its handler installed, and every child
    # controller has awakened.
    sig { void }
    def awake_from_dom; end

    # Invoked on a window's controller after values from the URL fragment
    # were applied to its restorable paths, and before `controller_did_load`.
    # `restored` is true when at least one value was applied.
    sig { params(restored: T::Boolean).void }
    def controller_did_restore(restored); end

    # Invoked once per controller instance, after the whole region, including
    # any restored values, is in place.
    sig { void }
    def controller_did_load; end

    # Invoked before the region appears, each time it awakens.
    sig { void }
    def view_will_appear; end

    # Invoked after the region has appeared.
    sig { void }
    def view_did_appear; end

    # Invoked as `unload` begins, before anything the controller holds is
    # released.
    sig { void }
    def view_will_disappear; end

    # Invoked as `unload` ends, after everything the controller held has been
    # released.
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
