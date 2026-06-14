# backtick_javascript: true

module Swill
  module Bindings
    module_function

    def wire(controller, root = controller.view.element)
      owned_elements(controller, root, "[bind]").each do |element|
        next if `#{element}.__swill_binding__`

        path = `#{element}.getAttribute("bind")`.to_s
        next if path.empty?

        `#{element}.__swill_binding__ = true`
        sync = ->(value) { write_element(element, value) }
        sync.call(controller.public_send(path))
        controller.observe(path, &sync)

        next unless writable?(controller, path) && form_control?(element)

        event_name = `#{element}.tagName === "SELECT" || #{element}.type === "checkbox" ? "change" : "input"`
        listener = lambda do |_event|
          controller.public_send("#{path}=", read_element(element))
        end
        `#{element}.addEventListener(#{event_name}, #{listener})`
      end
    end

    def owned_elements(controller, root, selector)
      elements = []
      elements << root if `#{root}.matches(#{selector})`
      nodes = `Array.from(#{root}.querySelectorAll(#{selector}))`

      nodes.each do |element|
        boundary = `#{element}.closest("[controller]")`
        owner = boundary ? `#{boundary}.__swill_controller__` : controller
        elements << element if owner == controller
      end

      elements
    end

    def form_control?(element)
      `#{element}.matches("input, textarea, select")`
    end

    def writable?(controller, path)
      controller.respond_to?("#{path}=")
    end

    def read_element(element)
      return `#{element}.checked` if `#{element}.type === "checkbox"`

      `#{element}.value`
    end

    def write_element(element, value)
      if `#{element}.type === "checkbox"`
        `#{element}.checked = !!#{value}`
      elsif form_control?(element)
        `#{element}.value = #{value.nil? ? "" : value.to_s}`
      else
        `#{element}.textContent = #{value.nil? ? "" : value.to_s}`
      end
    end
  end
end
