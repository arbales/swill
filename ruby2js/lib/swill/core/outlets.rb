# typed: true
# frozen_string_literal: true

module Swill
  # Connects a controller's declared outlets to the elements in its owned
  # region that carry an outlet attribute. A child controller's root is a
  # candidate even though it is a boundary; nothing inside it is. Values are a
  # child controller, a view, an inert template element, or decoded JSON.
  class Outlets < Swill::Object
    extend T::Sig
    include Ownership

    sig { params(controller: Controller).returns(Controller) }
    def connect(controller)
      declared = Runtime.outlets(controller)
      return controller if declared.length == 0
      by_name = {}
      declared.forEach { |descriptor| by_name[descriptor.name] = descriptor }
      connected = {}
      candidates(controller.view().element()).forEach do |element|
        name = element.getAttribute("outlet")
        raise "Undeclared outlet: #{name}" unless by_name[name]
        raise "Duplicate outlet: #{name}" if connected[name]
        connected[name] = true
        Runtime.write(controller, name, value_for(controller, name, element))
      end
      declared.forEach do |descriptor|
        raise "Unresolved outlet: #{descriptor.name}" if !descriptor.optional && !connected[descriptor.name]
      end
      controller
    end

    # Owned descendants carrying an outlet attribute, plus boundary elements
    # themselves. The root is never its own outlet.
    sig { params(root: T.untyped).returns(T.untyped) }
    def candidates(root)
      found = []
      collect(root, found)
      found
    end

    sig { params(element: T.untyped, found: T.untyped).void }
    def collect(element, found)
      each_child(element, ->(child) do
        found.push(child) if child.hasAttribute("outlet")
        collect(child, found) unless child.hasAttribute("controller")
      end)
    end

    sig { params(controller: Controller, name: String, element: T.untyped).returns(T.untyped) }
    def value_for(controller, name, element)
      if element.tagName == "SCRIPT" && element.type == "application/json"
        text = element.textContent.trim()
        return controller.decode_outlet_data(name, text.length == 0 ? nil : JSON.parse(text))
      end
      return element if element.tagName == "TEMPLATE"
      view = element.__swill_view__
      raise "Outlet #{name} is not a managed element" unless view
      owner = view.controller_value()
      owner ? owner : view
    end
  end
end
