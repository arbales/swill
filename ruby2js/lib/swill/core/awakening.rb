# typed: true
# frozen_string_literal: true

module Swill
  # Turns server HTML into controllers. One walk creates each controller and
  # links it into the sparse view tree of its nearest owner; the lifecycle then
  # runs children first so a parent's awake_from_dom sees wired children.
  class Awakening < Swill::Object
    extend T::Sig
    include Ownership

    # Returns the new controllers in document order. Awakening a fragment that
    # already sits under a live controller adopts it into that controller.
    sig { params(root: T.untyped).returns(T.untyped) }
    def wire(root)
      controllers = []
      walk(root, nearest_controller(root.parentElement), controllers)
      each_reversed(controllers, ->(controller) { load(controller) })
      each_reversed(controllers, ->(controller) { controller.controller_did_load() })
      each_reversed(controllers, ->(controller) { controller.view_will_appear() })
      each_reversed(controllers, ->(controller) { controller.view_did_appear() })
      controllers
    end

    sig { params(controller: Controller).void }
    def load(controller)
      controller.view_did_load
      Bindings.new.wire(controller)
      Actions.new.wire(controller)
      controller.awake_from_dom
    end

    sig { params(element: T.untyped, parent: T.nilable(Controller), controllers: T.untyped).void }
    def walk(element, parent, controllers)
      controller = nil
      if element.nodeType == 1 && element.hasAttribute("controller") && !controller_for(element)
        controller_class = Runtime.resolve(element.getAttribute("controller"))
        controller = controller_class.new()
        controller.attach(element)
        parent.view().adopt_subview(controller.view()) if parent
        controllers.push(controller)
      end
      owner = controller || parent
      each_child(element, ->(child) { walk(child, owner, controllers) })
    end

    sig { params(element: T.untyped).returns(T.nilable(Controller)) }
    def controller_for(element)
      view = element.__swill_view__
      view ? view.controller_value() : nil
    end

    sig { params(element: T.untyped).returns(T.nilable(Controller)) }
    def nearest_controller(element)
      return nil unless element
      controller = controller_for(element)
      controller ? controller : nearest_controller(element.parentElement)
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
