# backtick_javascript: true

require "json"

module Swill
  # Outlets connect a controller to specific elements in its owned subtree,
  # named by an `outlet="name"` attribute in markup and declared with `outlet`
  # in the class body:
  #
  #   class SearchController < Swill::Controller
  #     outlet :query_field
  #     outlet :results, optional: true
  #   end
  #
  #   <form controller="SearchController">
  #     <input outlet="query_field" />
  #   </form>
  #
  # Connection runs once during awakening, between `before_load` and
  # `after_load`, so `after_load` can use them. An outlet may resolve to a JSON
  # data payload, a template element, a child controller, or — for an ordinary
  # element — a View wrapping it, so DOM access stays inside a View. Unresolved
  # non-optional outlets warn.
  module Outlets
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      def outlet(name, optional: false)
        name = name.to_sym
        outlets[name] = { optional: optional }
        attr_accessor name
      end

      def outlets
        @outlets ||= {}
      end

      def inherited(subclass)
        super
        subclass.instance_variable_set(:@outlets, outlets.dup)
      end
    end

    module_function

    def connect(controller)
      declared = controller.class.outlets
      return if declared.empty?

      remaining = declared.dup
      owned_outlet_elements(controller).each do |element|
        break if remaining.empty?

        name = `#{element}.getAttribute("outlet")`.to_s.to_sym
        next unless remaining.key?(name)

        controller.public_send("#{name}=", value_for(controller, name, element))
        remaining.delete(name)
      end

      report_unresolved(controller, remaining)
    end

    # Elements in the controller's subtree carrying an `outlet` attribute. Like
    # binding ownership it stops at child-controller boundaries, but unlike it
    # the boundary element itself is still a candidate: an outlet often names a
    # child controller, and the `outlet` and `controller` attributes share that
    # element.
    def owned_outlet_elements(controller)
      found = []
      collect = lambda do |element|
        `Array.from(#{element}.children)`.each do |child|
          found << child if `#{child}.hasAttribute("outlet")`
          collect.call(child) unless `#{child}.hasAttribute("controller")`
        end
      end
      collect.call(controller.view.element)
      found
    end

    def value_for(controller, name, element)
      if `#{element}.tagName === "SCRIPT" && #{element}.type === "application/json"`
        return decode_json(controller, name, element)
      end

      return element if `#{element}.tagName === "TEMPLATE"`

      child = View.controller_for(element)
      return child if child

      # Wrap the element in a View and adopt it into the owning controller's
      # view tree, so owner() resolves and key events bubble from the outlet up
      # to the controller.
      view = View.for(element) || View.new(element)
      controller.view.adopt_subview(view) unless view.superview
      view
    end

    def decode_json(controller, name, element)
      text = `(#{element}.textContent || "").trim()`
      return controller.decode_outlet_data(name, nil) if text.empty?

      begin
        controller.decode_outlet_data(name, JSON.parse(text))
      rescue StandardError
        `console.warn("[Swill] invalid JSON outlet", #{element})`
        controller.decode_outlet_data(name, nil)
      end
    end

    def report_unresolved(controller, remaining)
      required = remaining.reject { |_name, options| options[:optional] }
      return if required.empty?

      names = required.keys.join(", ")
      `console.warn("[Swill] " + #{controller.class.name} + ": unresolved outlets: " + #{names})`
    end
  end
end
