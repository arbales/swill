# typed: true
# frozen_string_literal: true

module Swill
  # `Control::TextField` presents text through an input element. Its `value`
  # follows typing and updates the input when assigned. The control can wrap
  # an input or an element containing one.
  #
  #     <input klass="Swill::Control::TextField" bind="name">
  #
  # See [Controls](rdoc-ref:doc/controls.md) for value bindings and focus.
  class Control::TextField < Control
    extend T::Sig

    # The text displayed by the input. Typing updates this property; assigning
    # it updates the input. The declaration default is ""; construction reads
    # the input's initial value.
    property :value, type: String, default: ""

    # Creates a control for `element`, reads its input's value, and listens for
    # input events. If the value is empty and a value attribute exists, uses
    # that attribute. With no input, leaves `value` at its default and registers
    # no listener. See `#input_element`.
    sig { params(element: Element).void }
    def initialize(element)
      super
      input = input_element
      return unless input
      initial = input.value
      initial = input.getAttribute("value").to_s if initial.empty? && input.hasAttribute("value")
      self.value = initial
      handler = ->(event) { input_did_change(event) }
      input.addEventListener("input", handler)
      retain(->() { input.removeEventListener("input", handler) })
    end

    # Invoked after `value` changes to update the input when one is present.
    # An override should call `super` to preserve the display update.
    sig { params(_previous: T.untyped, value: String).void }
    def value_did_change(_previous, value)
      input = input_element
      input.value = value if input && input.value != value
    end

    # Copies the input's value to `value` when `event` originated at that input.
    # Events from other elements leave the value unchanged.
    sig { params(event: Event).void }
    def input_did_change(event)
      input = input_element
      self.value = input.value if input && event.target == input
    end

    # Returns the wrapped element when it is an input, otherwise its first
    # input descendant. Returns nil when neither is present.
    sig { returns(T.nilable(Element)) }
    def input_element
      @element.tagName == "INPUT" ? @element : @element.querySelector("input")
    end
  end
end
