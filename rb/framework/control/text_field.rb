# typed: true
# frozen_string_literal: true

module Swill
  # NSTextField analog over an <input>, or an element containing one. value
  # follows the input as the user types and writes the input when assigned.
  # Reached from markup with klass="Swill::Control::TextField".
  class Control::TextField < Control
    extend T::Sig

    property :value, type: String, default: ""

    sig { params(element: Element).void }
    def initialize(element)
      super
      input = input_element
      return unless input
      initial = input.value
      initial = input.getAttribute("value").to_s if initial.empty? && input.hasAttribute("value")
      self.value = initial
      input.addEventListener("input", ->(event) { input_did_change(event) })
    end

    sig { params(_previous: T.untyped, value: String).void }
    def value_did_change(_previous, value)
      input = input_element
      input.value = value if input && input.value != value
    end

    sig { params(event: Event).void }
    def input_did_change(event)
      input = input_element
      self.value = input.value if input && event.target == input
    end

    sig { returns(T.nilable(Element)) }
    def input_element
      @element.tagName == "INPUT" ? @element : @element.querySelector("input")
    end
  end
end
