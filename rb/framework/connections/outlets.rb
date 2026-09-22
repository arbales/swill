# typed: true
# frozen_string_literal: true

module Swill
  # What markup connects: outlets, actions, and bindings. Interface Builder
  # archives a connector object per connection and sends it establishConnection
  # as the nib loads; here the attributes are read from the document instead, so
  # there is nothing to archive and nothing to be an instance of. These are
  # functions over a controller and its region.
  module Connections
    # Connects a controller's declared outlets to the elements in its owned
    # region that carry an outlet attribute. A child controller's root is a
    # candidate; nothing inside it is. Values are a
    # child controller, a view, an inert template element, or decoded JSON.
    module Outlets
      extend T::Sig

      sig { params(controller: Controller).returns(Controller) }
      def self.establish(controller)
        declared = T.let(Runtime.outlets(controller), T::Array[T.untyped])
        return controller if declared.empty?
        by_name = T.let({}, T::Hash[String, T.untyped])
        declared.each { |descriptor| by_name[descriptor.name] = descriptor }
        connected = T.let({}, T::Hash[String, T::Boolean])
        candidates(controller.view.element).each do |element|
          name = T.must(element.getAttribute("outlet"))
          raise "Undeclared outlet: #{name}" unless by_name[name]
          raise "Duplicate outlet: #{name}" if connected[name]
          connected[name] = true
          Runtime.write(controller, name, value_for(controller, by_name[name], element))
        end
        declared.each do |descriptor|
          raise "Unresolved outlet: #{descriptor.name}" if !descriptor.optional && !connected[descriptor.name]
        end
        controller
      end

      # Everything under root carrying outlet, the root itself aside. A child
      # controller counts: it can be an outlet of its parent.
      sig { params(root: Element).returns(T::Array[Element]) }
      def self.candidates(root)
        found = T.let([], T::Array[Element])
        DOM.each_owned(root, false, ->(element, _controller_root) do
          found << element if element.hasAttribute("outlet")
        end)
        found
      end

      # The element decides what the value is: decoded JSON, the inert
      # template, a child controller, or a view. The declaration decides what it
      # must be: a typed outlet's value is checked against the declared type,
      # shallowly, as T.cast checks, so a mismatch fails here by outlet name
      # rather than at first use.
      sig { params(controller: Controller, descriptor: T.untyped, element: Element).returns(T.untyped) }
      def self.value_for(controller, descriptor, element)
        name = descriptor.name
        value = materialize(controller, name, element)
        typed = descriptor.type && descriptor.type != "T.untyped"
        raise "Outlet #{name} expects #{descriptor.type}" if typed && !Runtime.conforms(value, descriptor.type)
        value
      end

      sig { params(controller: Controller, name: String, element: Element).returns(T.untyped) }
      def self.materialize(controller, name, element)
        return decode(controller, name, element) if element.tagName == "SCRIPT" && element.type == "application/json"
        return element if element.tagName == "TEMPLATE"
        view = element.__swill_view__
        raise "Outlet #{name} is not a managed element" unless view
        owner = view.controller_value
        owner ? owner : view
      end

      sig { params(controller: Controller, name: String, element: Element).returns(T.untyped) }
      def self.decode(controller, name, element)
        text = element.textContent.strip
        controller.decode_outlet_data(name, text.empty? ? nil : JSON.parse(text))
      end
    end
  end
end
