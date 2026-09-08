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
      end
      controllers
    end

    sig { params(controller: Controller).void }
    def awaken(controller)
      controller.view_did_load
      Bindings.new.wire(controller)
      Actions.new.wire(controller)
      controller.awake_from_dom
      controller.controller_did_load
      controller.view_will_appear
      controller.view_did_appear
    end
  end
end
