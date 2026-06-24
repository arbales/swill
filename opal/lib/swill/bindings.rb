# backtick_javascript: true

module Swill
  module Bindings
    module_function

    def wire(controller, root = controller.view.element)
      root_prefix = controller.respond_to?(:binding_root) ? controller.binding_root.to_s : ""

      owned_bound_elements(controller, root).each do |element|
        next if `#{element}.__swill_bindings__`

        disposers = []
        `#{element}.__swill_bindings__ = #{disposers}`

        value_path = `#{element}.getAttribute("bind")`
        if value_path && !value_path.to_s.empty?
          disposers << wire_value_binding(controller, root_prefix, element, value_path.to_s)
        end

        attribute_names(element).each do |name|
          next unless name.start_with?("bind-")

          prop = name.delete_prefix("bind-")
          path = `#{element}.getAttribute(#{name})`.to_s
          disposers << wire_property_binding(controller, root_prefix, element, prop, path)
        end

        controller.register_teardown do
          disposers.each(&:call)
          `#{element}.__swill_bindings__ = null`
        end
      end
    end

    def wire_value_binding(controller, root_prefix, element, path)
      segments = resolve_segments(root_prefix, path)
      sync = -> { write_value(element, KeyPath.read(controller, segments)) }
      sync.call

      off = KeyPath.observe(controller, segments, &sync)
      input_off = wire_input(controller, element, segments)

      lambda do
        off.call
        input_off&.call
      end
    end

    def wire_property_binding(controller, root_prefix, element, prop, path)
      segments = resolve_segments(root_prefix, path)
      prop = normalize_property(prop)
      sync = -> { write_property(element, prop, KeyPath.read(controller, segments)) }
      sync.call

      KeyPath.observe(controller, segments, &sync)
    end

    def wire_input(controller, element, segments)
      return unless writable?(controller, segments) && form_control?(element)

      event_name = `#{element}.tagName === "SELECT" || #{element}.type === "checkbox" ? "change" : "input"`
      listener = lambda do |_event|
        KeyPath.write(controller, segments, read_element(element))
      end
      `#{element}.addEventListener(#{event_name}, #{listener})`
      -> { `#{element}.removeEventListener(#{event_name}, #{listener})` }
    end

    def owned_bound_elements(controller, root)
      owned_elements(controller, root, "*").select { |element| binding_element?(element) }
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

    def binding_element?(element)
      return true if `#{element}.hasAttribute("bind")`

      attribute_names(element).any? { |name| name.start_with?("bind-") }
    end

    def attribute_names(element)
      `const attrs = #{element}.attributes || {};
       if (typeof attrs.length === "number") return Array.from(attrs).map((attr) => attr.name);
       return Object.keys(attrs);`
    end

    def resolve_segments(root_prefix, path)
      path = path.to_s
      if path.start_with?("@")
        stripped = path[1..]
        return [] if stripped.nil? || stripped.empty?

        return stripped.split(".")
      end

      prefix = root_prefix.empty? ? [] : root_prefix.split(".")
      suffix = path.empty? ? [] : path.split(".")
      prefix + suffix
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

    def write_value(element, value)
      controller = View.controller_for(element)
      if controller && controller.respond_to?(:represented_object=)
        controller.represented_object = value unless value.nil?
        return
      end

      if `#{element}.type === "checkbox"`
        `#{element}.checked = !!#{value}`
      elsif form_control?(element)
        `#{element}.value = #{value.nil? ? "" : value.to_s}`
      else
        `#{element}.textContent = #{value.nil? ? "" : value.to_s}`
      end
    end

    def normalize_property(prop)
      prop == "readonly" ? "readOnly" : prop
    end

    def write_property(element, prop, value)
      if prop.start_with?("data-") || prop.start_with?("aria-")
        if value.nil? || value == ""
          `#{element}.removeAttribute(#{prop})`
        else
          `#{element}.setAttribute(#{prop}, #{value.to_s})`
        end
        return
      end

      if %w[href src].include?(prop) && value.nil?
        `#{element}.removeAttribute(#{prop.to_s.downcase})`
        `#{element}[#{prop}] = ""`
        return
      end

      if boolean_property?(prop)
        `#{element}[#{prop}] = !!#{value}`
      else
        `#{element}[#{prop}] = #{value}`
      end
    end

    def boolean_property?(prop)
      %w[disabled checked hidden readOnly required open].include?(prop)
    end
  end
end
