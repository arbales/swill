# typed: true
# frozen_string_literal: true

module Swill
  # A native <select>. Options already in the markup stay as a prefix;
  # assigning options replaces only what follows them. value follows the
  # selection and writes it when assigned.
  class Control::Select < Control
    extend T::Sig

    property :options, type: T::Array[String], default: []
    property :value, type: String, default: ""

    sig { params(element: Element).void }
    def initialize(element)
      super(element)
      @template_option_count = element.children.length
      initial = element.value
      initial = element.getAttribute("value").to_s if initial.empty? && element.hasAttribute("value")
      self.value = initial
      element.addEventListener("change", ->(_event) { self.value = element.value })
    end

    sig { params(_previous: T.untyped, values: T::Array[String]).void }
    def options_did_change(_previous, values)
      children = @element.children
      children[@template_option_count].remove while children.length > @template_option_count
      values.each do |value|
        option = @element.ownerDocument.createElement("option")
        option.value = value
        option.textContent = value
        @element.appendChild(option)
      end
      sync_value
    end

    sig { params(_previous: T.untyped, _value: String).void }
    def value_did_change(_previous, _value)
      sync_value
    end

    sig { void }
    def sync_value
      @element.value = value if @element.value != value
    end
  end
end
