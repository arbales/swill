# typed: true
# frozen_string_literal: true

module Swill
  class Bindings < Swill::Object
    extend T::Sig

    sig { params(controller: Controller).returns(Controller) }
    def wire(controller)
      controller.view().element().querySelectorAll("[bind]").forEach do |element|
        controller.register_teardown(wire_element(controller, element))
      end
      controller
    end

    sig { params(object: Swill::Object, element: T.untyped).returns(T.proc.void) }
    def wire_element(object, element)
      path = element.getAttribute("bind")
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
  end
end
