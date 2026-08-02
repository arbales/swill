# backtick_javascript: true

module Swill
  class BindingError < StandardError; end

  module Bindings
    module_function

    def wire(controller, root = controller.view.element)
      root_prefix = controller.respond_to?(:binding_root) ? controller.binding_root.to_s : ""

      Ownership.each_owned(root) do |element|
        next unless binding_element?(element)

        disposers = wire_element(controller, root_prefix, element)
        next unless disposers

        controller.register_teardown do
          disposers.each(&:call)
          `#{element}.__swill_bindings__ = null`
        end
      end
    end

    # Wire a generated subtree directly to an ordinary observable object.
    # The caller owns the returned disposer and must invoke it before removal.
    def wire_object(object, root)
      wired = []
      Ownership.each_owned(root) do |element|
        next unless binding_element?(element)

        disposers = wire_element(object, "", element)
        wired << [element, disposers] if disposers
      end
      lambda do
        wired.each do |element, disposers|
          disposers.each(&:call)
          `#{element}.__swill_bindings__ = null`
        end
      end
    end

    # Wire one element's bind/bind-* attributes against +target+. Returns the
    # element's disposers, or nil when it is already wired. The element also
    # carries the disposers as __swill_bindings__, which doubles as the
    # already-wired marker.
    def wire_element(target, root_prefix, element)
      return nil if `#{element}.__swill_bindings__`

      disposers = []
      `#{element}.__swill_bindings__ = #{disposers}`

      value_path = `#{element}.getAttribute("bind")`
      if value_path && !value_path.to_s.empty?
        disposers << wire_value_binding(target, root_prefix, element, value_path.to_s)
      end

      attribute_names(element).each do |name|
        next unless name.start_with?("bind-")

        prop = name.delete_prefix("bind-")
        path = `#{element}.getAttribute(#{name})`.to_s
        disposers << wire_property_binding(target, root_prefix, element, prop, path)
      end
      disposers
    end

    def wire_value_binding(controller, root_prefix, element, path)
      segments = resolve_segments(root_prefix, path)
      validate_writable_binding!(controller, element, segments, path)
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
      return if read_only?(element)
      return unless writable_control?(element)

      event_name = `#{element}.tagName === "SELECT" || #{element}.type === "checkbox" ? "change" : "input"`
      listener = lambda do |_event|
        unless KeyPath.writable?(controller, segments)
          raise BindingError, %(binding "#{segments.join('.')}" is not writable)
        end
        KeyPath.write!(controller, segments, read_element(element))
      end
      `#{element}.addEventListener(#{event_name}, #{listener})`
      -> { `#{element}.removeEventListener(#{event_name}, #{listener})` }
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

    def writable_control?(element)
      form_control?(element) || (View.for(element)&.respond_to?(:value=))
    end

    def read_only?(element)
      `#{element}.hasAttribute("readonly")`
    end

    def validate_writable_binding!(controller, element, segments, path)
      return unless writable_control?(element)
      return if read_only?(element)
      return unless KeyPath.writable?(controller, segments) == false

      raise BindingError,
            %(#{element_name(element)} binding "#{path}" is not writable; add readonly or bind to an assignable property)
    end

    def element_name(element)
      `#{element}.tagName`.to_s.downcase
    end

    def read_element(element)
      return `#{element}.checked` if `#{element}.type === "checkbox"`

      component = View.for(element)
      return component.value if component&.respond_to?(:value)

      `#{element}.value`
    end

    def write_value(element, value)
      controller = View.controller_for(element)
      if controller && controller.respond_to?(:represented_object=)
        controller.represented_object = value unless value.nil?
        return
      end


      component = View.for(element)
      if component&.respond_to?(:value=)
        component.value = value.nil? ? "" : value.to_s
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
