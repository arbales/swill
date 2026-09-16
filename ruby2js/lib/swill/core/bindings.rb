# typed: true
# frozen_string_literal: true

module Swill
  # Wires markup bindings for one controller's owned region, or for a region
  # such as a list row that belongs to a plain object.
  #
  #   bind="path"        two-way for form controls, one-way for text
  #   bind-prop="path"   one-way DOM property
  #
  # Paths resolve under the controller's binding_root; a leading @ ignores it.
  # A bind on a child controller's root belongs to this controller and feeds
  # the child's represented_object; bind-* on a controller root belongs to
  # that controller itself.
  class Bindings < Swill::Object
    extend T::Sig
    include Ownership

    sig { params(controller: Controller).returns(Controller) }
    def wire(controller)
      root = controller.view.element
      prefix = controller.binding_root
      disposers = T.let([], T::Array[T.proc.void])
      wire_properties(controller, prefix, root, disposers)
      wire_region(controller, prefix, root, disposers)
      controller.register_teardown(release(disposers))
      controller
    end

    # A region owned by an object rather than a controller: paths resolve
    # directly against the object, and the region's root may carry bind
    # itself (bind="@" is the object). When that root is a controller's,
    # only its represented object comes from here; the controller wires the
    # rest as its own region. Returns the disposer.
    sig { params(object: Swill::Object, element: Element).returns(T.proc.void) }
    def wire_object(object, element)
      disposers = T.let([], T::Array[T.proc.void])
      disposers << wire_element(object, element, nil) if element.hasAttribute("bind")
      unless element.hasAttribute("controller")
        wire_properties(object, nil, element, disposers)
        wire_region(object, nil, element, disposers)
      end
      release(disposers)
    end

    sig { params(object: Swill::Object, prefix: T.nilable(Symbol), element: Element, disposers: T::Array[T.proc.void]).void }
    def wire_region(object, prefix, element, disposers)
      each_child(element, ->(child) do
        disposers << wire_element(object, child, prefix) if child.hasAttribute("bind")
        unless child.hasAttribute("controller")
          wire_properties(object, prefix, child, disposers)
          wire_region(object, prefix, child, disposers)
        end
      end)
    end

    sig { params(object: Swill::Object, prefix: T.nilable(Symbol), element: Element, disposers: T::Array[T.proc.void]).void }
    def wire_properties(object, prefix, element, disposers)
      element.getAttributeNames.each do |name|
        next unless name.start_with?("bind-")
        property = T.must(name.slice(5, name.length))
        disposers << wire_property(object, prefix, element, property, T.must(element.getAttribute(name)))
      end
    end

    sig { params(disposers: T::Array[T.proc.void]).returns(T.proc.void) }
    def release(disposers)
      ->() { disposers.each { |dispose| dispose.() } }
    end

    sig { params(prefix: T.nilable(Symbol), path: String).returns(String) }
    def resolve_path(prefix, path)
      return path.slice(1, path.length) || "" if path[0] == "@"
      return path if prefix == nil
      path.length == 0 ? "#{prefix}" : "#{prefix}.#{path}"
    end

    # A value binding. On a child controller's root the value becomes the
    # child's represented object; otherwise it renders into the element.
    sig { params(object: Swill::Object, element: Element, prefix: T.nilable(Symbol)).returns(T.proc.void) }
    def wire_element(object, element, prefix)
      path = resolve_path(prefix, T.must(element.getAttribute("bind")))
      view = element.__swill_view__
      child = view ? view.controller_value : nil
      return wire_represented_object(object, child, path) if child
      form_control = element.matches("input, textarea, select")
      writable = form_control && !element.hasAttribute("readonly")
      checkbox = element.type == "checkbox"
      Runtime.assertWritablePath(object, path) if writable

      render = ->(_value) do
        value = Runtime.readPath(object, path)
        if checkbox
          element.checked = Runtime.isTruthy(value)
        elsif form_control
          element.value = value == nil ? "" : value
        else
          element.textContent = value == nil ? "" : value
        end
      end
      render.(nil)

      dispose = Runtime.observePath(object, path, render)
      event_name = element.matches("select") || checkbox ? "change" : "input"
      handler = ->(event) do
        value = checkbox ? element.checked : element.value
        Runtime.writePath(object, path, value)
      end
      element.addEventListener(event_name, handler) if writable

      ->() do
        dispose.()
        element.removeEventListener(event_name, handler) if writable
      end
    end

    sig { params(object: Swill::Object, child: Controller, path: String).returns(T.proc.void) }
    def wire_represented_object(object, child, path)
      sync = ->(value) { child.represented_object = value }
      sync.(Runtime.readPath(object, path))
      Runtime.observePath(object, path, sync)
    end

    sig { params(object: Swill::Object, prefix: T.nilable(Symbol), element: Element, property: String, path: String).returns(T.proc.void) }
    def wire_property(object, prefix, element, property, path)
      resolved = resolve_path(prefix, path)
      name = property == "readonly" ? "readOnly" : property
      render = ->(value) { write_property(element, name, value) }
      render.(Runtime.readPath(object, resolved))
      Runtime.observePath(object, resolved, render)
    end

    sig { params(element: Element, property: String, value: T.untyped).void }
    def write_property(element, property, value)
      if property.start_with?("data-") || property.start_with?("aria-")
        if value == nil || value == ""
          element.removeAttribute(property)
        else
          element.setAttribute(property, value)
        end
        return
      end
      if (property == "href" || property == "src") && value == nil
        element.removeAttribute(property)
        element[property] = ""
        return
      end
      element[property] = boolean_property?(property) ? Runtime.isTruthy(value) : value
    end

    sig { params(property: String).returns(T::Boolean) }
    def boolean_property?(property)
      case property
      when "disabled", "checked", "hidden", "readOnly", "required", "open" then true
      else false
      end
    end
  end
end
