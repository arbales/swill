# typed: true
# frozen_string_literal: true

module Swill
  class Actions < Swill::Object
    extend T::Sig
    include Ownership

    sig { params(controller: Controller).returns(Controller) }
    def wire(controller)
      controller.register_teardown(wire_into(controller, controller.view().element()))
      controller
    end

    # Actions in element's owned region dispatch from controller, as a list
    # row's do from its list. Returns the disposer; elements already wired
    # are left to their owner.
    sig { params(controller: Controller, element: Element).returns(T.proc.void) }
    def wire_into(controller, element)
      disposers = owned_matching(element, "[data-action]").map { |target| wire_element(controller, target) }
      ->() { disposers.each { |dispose| dispose.() } }
    end

    # data-action="name" on click, or "event:name".
    sig { params(controller: Controller, element: Element).returns(T.proc.void) }
    def wire_element(controller, element)
      return ->() {} if element.__swill_action__
      attribute = element.getAttribute("data-action")
      specification = attribute ? attribute.strip : ""
      return ->() {} if specification.empty?
      if specification.include?(":")
        parts = specification.split(":")
        event_name = T.must(parts[0])
        action_name = T.must(parts[1])
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
