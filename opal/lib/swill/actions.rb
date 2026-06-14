# backtick_javascript: true

module Swill
  module Actions
    module_function

    def wire(controller, root = controller.view.element)
      Bindings.owned_elements(controller, root, "[data-action]").each do |element|
        next if `#{element}.__swill_action__`

        specification = `#{element}.getAttribute("data-action")`.to_s.strip
        next if specification.empty?

        event_name, action_name = parse(specification)
        listener = lambda do |event|
          controller.perform_action(action_name, element, event)
        end

        `#{element}.__swill_action__ = true`
        `#{element}.addEventListener(#{event_name}, #{listener})`
      end
    end

    def parse(specification)
      return specification.split(":", 2) if specification.include?(":")

      ["click", specification]
    end
  end
end
