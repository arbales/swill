# typed: true
# frozen_string_literal: true

module Swill
  class Awakening < Swill::Object
    extend T::Sig

    sig { params(root: T.untyped).returns(T::Array[Controller]) }
    def wire(root)
      controllers = []
      root.querySelectorAll("[controller]").forEach do |element|
        name = element.getAttribute("controller")
        controller_class = Runtime.resolve(name)
        controller = controller_class.new()
        controller.attach(element)
        controllers.push(controller)

        awaken(controller)
        wire_actions(controller)
      end
      controllers
    end

    sig { params(controller: Controller).void }
    def awaken(controller)
      controller.view_did_load
      controller.awake_from_dom
      controller.controller_did_load
      controller.view_will_appear
      controller.view_did_appear
    end

    sig { params(controller: Controller).void }
    def wire_actions(controller)
      controller.view().element().querySelectorAll("[data-action]").forEach do |element|
        action = element.getAttribute("data-action")
        handler = ->(event) { controller.perform_action(action, element, event) }
        element.addEventListener("click", handler)
        controller.register_teardown(
          ->() { element.removeEventListener("click", handler) }
        )
      end
    end
  end
end
