# typed: true
# frozen_string_literal: true

module Swill
  class Actions < Swill::Object
    extend T::Sig

    sig { params(controller: Controller).returns(Controller) }
    def wire(controller)
      controller.view().element().querySelectorAll("[data-action]").forEach do |element|
        controller.register_teardown(wire_element(controller, element))
      end
      controller
    end

    sig { params(controller: Controller, element: T.untyped).returns(T.proc.void) }
    def wire_element(controller, element)
      if element.__swill_action__
        return ->() {}
      end

      specification = element.getAttribute("data-action").trim()
      if specification.length == 0
        return ->() {}
      end
      separator = specification.indexOf(":")
      if separator >= 0
        event_name = specification.slice(0, separator)
        action_name = specification.slice(separator + 1)
      else
        event_name = "click"
        action_name = specification
      end

      handler = ->(event) { controller.perform_action(action_name, element, event) }
      element.__swill_action__ = true
      element.addEventListener(event_name, handler)
      ->() do
        element.removeEventListener(event_name, handler)
        element.__swill_action__ = false
      end
    end
  end
end
