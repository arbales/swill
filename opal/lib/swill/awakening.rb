# backtick_javascript: true

module Swill
  module Awakening
    module_function

    def wire(root)
      controllers = []
      parent = nearest_controller(`#{root}.parentElement`)
      walk(root, parent, controllers)

      controllers.reverse_each do |controller|
        controller.before_load
        Outlets.connect(controller)
        Bindings.wire(controller)
        Actions.wire(controller)
        controller.after_load
      end

      controllers.reverse_each(&:before_appear)
      controllers.reverse_each(&:after_appear)

      if controllers.empty? && parent
        Bindings.wire(parent, root)
        Actions.wire(parent, root)
      end

      controllers
    end

    def walk(element, parent, controllers)
      controller = controller_for(element)

      if !controller && `#{element}.hasAttribute("controller")`
        name = `#{element}.getAttribute("controller")`.to_s
        controller_class = constant(name)
        unless controller_class <= Controller
          raise TypeError, "#{name} is not a Swill::Controller"
        end

        controller = controller_class.new
        controller.parent = parent
        controller.attach(element)
        # Link the child's root view into the parent's sparse view tree so
        # owner() and the view hierarchy mirror the controller nesting.
        parent.view.adopt_subview(controller.view) if parent
        controllers << controller
      end

      owner = controller || parent
      `Array.from(#{element}.children)`.each do |child|
        walk(child, owner, controllers)
      end
    rescue NameError => error
      `console.warn("[Swill] " + #{error.message}, #{element})`
    end

    # Tear down a subtree being removed from the DOM: clear the first responder
    # if it lives inside, then for every controller in the subtree fire
    # before_disappear, release its bindings/actions, and fire after_disappear.
    # The symmetric counterpart to wire.
    def detach(node)
      controllers = controllers_within(node)
      return controllers if controllers.empty?

      clear_first_responder_within(node)

      controllers.each do |controller|
        controller.before_disappear
        controller.teardown!
        controller.view&.remove_from_superview if controller.view&.superview
        controller.after_disappear
      end

      controllers
    end

    def controllers_within(node)
      found = []
      own = View.controller_for(node)
      found << own if own
      `Array.from(#{node}.querySelectorAll("[controller]"))`.each do |element|
        nested = View.controller_for(element)
        found << nested if nested
      end
      found
    end

    def clear_first_responder_within(node)
      responder = FirstResponder.current
      return unless responder

      element = Focus.responder_element(responder)
      return unless element

      FirstResponder.install(nil) if `#{node} === #{element} || #{node}.contains(#{element})`
    end

    def constant(name)
      name.split("::").reject(&:empty?).inject(Object) do |scope, part|
        scope.const_get(part)
      end
    end

    def controller_for(element)
      View.controller_for(element)
    end

    def nearest_controller(element)
      node = element
      while node
        controller = controller_for(node)
        return controller if controller
        node = `#{node}.parentElement`
      end
      nil
    end
  end
end
