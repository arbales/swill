# backtick_javascript: true

module Swill
  module Awakening
    module_function

    def wire(root)
      controllers = []
      parent = nearest_controller(`#{root}.parentElement`)
      walk(root, parent, controllers)

      controllers.reverse_each do |controller|
        controller.view_did_load
        Bindings.wire(controller)
        Actions.wire(controller)
        controller.awake_from_dom
      end

      controllers.each(&:controller_did_load)
      controllers.reverse_each(&:view_will_appear)
      controllers.reverse_each(&:view_did_appear)

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
        controllers << controller
      end

      owner = controller || parent
      `Array.from(#{element}.children)`.each do |child|
        walk(child, owner, controllers)
      end
    rescue NameError => error
      `console.warn("[Swill] " + #{error.message}, #{element})`
    end

    def constant(name)
      name.split("::").reject(&:empty?).inject(Object) do |scope, part|
        scope.const_get(part)
      end
    end

    def controller_for(element)
      return nil unless element

      `#{element}.__swill_controller__ || nil`
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
