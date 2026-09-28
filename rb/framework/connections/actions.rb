# typed: true
# frozen_string_literal: true

module Swill
  module Connections
    # Connects elements carrying data-action to the responder chain, so a
    # control need not know which object implements what it sends.
    #
    # An element already connected is left to whoever connected it: a list row
    # awakened inside another region keeps its own list as the sender.
    module Actions
      extend T::Sig

      sig { params(controller: Controller).returns(Controller) }
      def self.establish(controller)
        controller.retain(establish_in(controller.view.element, controller))
        controller
      end

      # Actions in +element+'s owned region dispatch from +controller+, as a
      # list row's do from its list. Answers the disposer.
      sig { params(element: Element, controller: Responder, include_root: T::Boolean).returns(T.proc.void) }
      def self.establish_in(element, controller, include_root: true)
        disposers = DOM.owned_matching(element, "[data-action]").map do |target|
          target == element && !include_root ? ->() {} : connect(target, controller)
        end
        ->() { disposers.each { |dispose| dispose.() } }
      end

      # One element to one action. The attribute is "event:action", or an
      # action alone, which means click. Answers the disposer that severs it.
      sig { params(element: Element, controller: Responder).returns(T.proc.void) }
      def self.connect(element, controller)
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
end
