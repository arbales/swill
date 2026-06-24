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
        segments = path.split(".")

        sync = -> { write_element(element, KeyPath.read(controller, segments)) }
        sync.call
        off = KeyPath.observe(controller, segments, &sync)
        controller.register_teardown do
          off.call
          `#{element}.__swill_binding__ = false`
        end

        next unless writable?(controller, segments) && form_control?(element)

        event_name = `#{element}.tagName === "SELECT" || #{element}.type === "checkbox" ? "change" : "input"`
        listener = lambda do |_event|
          KeyPath.write(controller, segments, read_element(element))
        end
        `#{element}.addEventListener(#{event_name}, #{listener})`
        controller.register_teardown { `#{element}.removeEventListener(#{event_name}, #{listener})` }
      end
    end

    def owned_elements(controller, root, selector)
      elements = []
      elements << root if `#{root}.matches(#{selector})`
      nodes = `Array.from(#{root}.querySelectorAll(#{selector}))`

      nodes.each do |element|
        boundary = `#{element}.closest("[controller]")`
        owner = boundary ? View.controller_for(boundary) : controller
        elements << element if owner == controller
      end

      elements
    end

    def form_control?(element)
      `#{element}.matches("input, textarea, select")`
    end

    # Two-way only when the leaf's owner currently exists and exposes a setter.
    # Evaluated once at wire time; a path whose intermediate appears later stays
    # read-only until rewired.
    def writable?(controller, segments)
      *leading, last = segments
      target = KeyPath.read(controller, leading)
      !target.nil? && target.respond_to?("#{last}=")
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
