# typed: true
# frozen_string_literal: true

module Swill
  # Turns server HTML into objects. One walk creates a View for each managed
  # element, adopts it into the nearest view, and attaches controllers; the
  # lifecycle then runs children first so a parent's awake_from_dom sees wired
  # children. Elements with only bind or data-action stay raw DOM.
  class Awakening < Swill::Object
    extend T::Sig
    include Ownership

    # Returns the new controllers in document order. Awakening a fragment that
    # already sits under a live view adopts it into that view's tree.
    sig { params(root: T.untyped).returns(T.untyped) }
    def wire(root)
      controllers = awaken(root)
      finish(controllers)
      controllers
    end

    # The load phase only: view_did_load, outlets, bindings, actions, and
    # awake_from_dom, children first. The application restores window state
    # between this and finish.
    sig { params(root: T.untyped).returns(T.untyped) }
    def awaken(root)
      controllers = []
      walk(root, nearest_view(root.parentElement), controllers)
      each_reversed(controllers, ->(controller) { load(controller) })
      controllers
    end

    # controller_did_load once per controller, then appearance.
    sig { params(controllers: T.untyped).void }
    def finish(controllers)
      each_reversed(controllers, ->(controller) { controller.controller_did_load() })
      each_reversed(controllers, ->(controller) { controller.view_will_appear() })
      each_reversed(controllers, ->(controller) { controller.view_did_appear() })
    end

    sig { params(controller: Controller).void }
    def load(controller)
      controller.view_did_load
      Outlets.new.connect(controller)
      Bindings.new.wire(controller)
      Actions.new.wire(controller)
      controller.awake_from_dom
    end

    sig { params(element: T.untyped, owner: T.nilable(View), controllers: T.untyped).void }
    def walk(element, owner, controllers)
      view = nil
      if managed?(element)
        view = element.__swill_view__ || create_view(element)
        owner.adopt_subview(view) if owner && !view.superview()
        if element.hasAttribute("controller") && !view.controller_value()
          controller_class = Runtime.resolve(element.getAttribute("controller"))
          controller = controller_class.new()
          controller.attach(element)
          controllers.push(controller)
        end
      end
      next_owner = view || owner
      each_child(element, ->(child) { walk(child, next_owner, controllers) })
    end

    # A live element with klass, controller, or outlet. Templates and JSON
    # scripts are inert content, never objects.
    sig { params(element: T.untyped).returns(T::Boolean) }
    def managed?(element)
      return false unless element.nodeType == 1
      return false if element.tagName == "TEMPLATE" || element.tagName == "SCRIPT"
      element.hasAttribute("klass") || element.hasAttribute("controller") || element.hasAttribute("outlet")
    end

    # klass names a View subclass; a plain managed element gets a plain View.
    sig { params(element: T.untyped).returns(View) }
    def create_view(element)
      name = element.getAttribute("klass")
      return View.new(element) unless name
      view_class = Runtime.resolve(name)
      view = view_class.new(element)
      raise "#{name} is not a Swill::View" unless view.is_a?(View)
      view
    end

    # Every controller in a subtree in document order, the node included.
    sig { params(node: T.untyped).returns(T.untyped) }
    def controllers_within(node)
      found = []
      collect_controllers(node, found)
      found
    end

    sig { params(element: T.untyped, found: T.untyped).void }
    def collect_controllers(element, found)
      view = element.__swill_view__
      controller = view ? view.controller_value() : nil
      found.push(controller) if controller
      each_child(element, ->(child) { collect_controllers(child, found) })
    end

    # The counterpart of wire for a subtree being removed. Teardown recurses
    # into descendants and is idempotent, so document order is fine.
    sig { params(node: T.untyped).void }
    def detach(node)
      controllers_within(node).forEach { |controller| controller.teardown() }
    end

    sig { params(element: T.untyped).returns(T.nilable(View)) }
    def nearest_view(element)
      return nil unless element
      view = element.__swill_view__
      view ? view : nearest_view(element.parentElement)
    end

    sig { params(controllers: T.untyped, callback: T.proc.params(controller: T.untyped).void).void }
    def each_reversed(controllers, callback)
      index = controllers.length - 1
      while index >= 0
        callback.(controllers[index])
        index -= 1
      end
    end
  end
end
