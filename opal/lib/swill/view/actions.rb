# backtick_javascript: true

module Swill
  module Actions
    module_function

    def wire(controller, root = controller.view.element)
      disposers = wire_elements(controller, Ownership.owned_matching(root, "[data-action]"))
      controller.register_teardown { disposers.each(&:call) }
    end

    # Wire actions in a generated subtree, returning a disposer owned by the
    # caller. Lists use this for rows whose lifetime is shorter than their
    # controller's lifetime.
    def wire_object(controller, root)
      elements = []
      elements << root if `#{root}.matches("[data-action]")`
      `Array.from(#{root}.querySelectorAll("[data-action]"))`.each { |element| elements << element }
      disposers = wire_elements(controller, elements)
      -> { disposers.each(&:call) }
    end

    def wire_elements(controller, elements)
      elements.filter_map do |element|
        next if `#{element}.__swill_action__`

        specification = `#{element}.getAttribute("data-action")`.to_s.strip
        next if specification.empty?

        event_name, action_name = parse(specification)
        listener = lambda do |event|
          controller.perform_action(action_name, element, event)
        end

        `#{element}.__swill_action__ = true`
        `#{element}.addEventListener(#{event_name}, #{listener})`
        lambda do
          `#{element}.removeEventListener(#{event_name}, #{listener})`
          `#{element}.__swill_action__ = false`
        end
      end
    end

    def parse(specification)
      return specification.split(":", 2) if specification.include?(":")

      ["click", specification]
    end
  end
end
