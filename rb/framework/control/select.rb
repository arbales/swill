# typed: true
# frozen_string_literal: true

module Swill
  # `Control::Select` presents a string value through a native select element.
  # Options supplied by the application follow those present in the markup.
  # Changing the selection updates `value`; assigning `value` updates
  # the select.
  #
  #     <select klass="Swill::Control::Select" bind="name">
  #       <option value="">Choose a name</option>
  #     </select>
  #
  # See [Controls](rdoc-ref:doc/controls.md) for options and value bindings.
  class Control::Select < Control
    extend T::Sig

    # The strings used to create options after those present at construction.
    # Each string supplies an option's label and value. Assigning a new array
    # replaces the generated options and reapplies `value`. The default is [].
    property :options, type: T::Array[String], default: []
    # The selected value. User changes update it; assignment writes the
    # select's value. Replacing `options` preserves this property even when
    # no option matches. The declaration default is ""; construction reads
    # the element's initial value.
    property :value, type: String, default: ""

    # Creates a control for the select `element`, preserves its initial child
    # options, and reads its value. If the value is empty and a value attribute
    # exists, uses that attribute. Listens for selection changes until unload.
    sig { params(element: Element).void }
    def initialize(element)
      super
      @template_option_count = element.children.length
      initial = element.value
      initial = element.getAttribute("value").to_s if initial.empty? && element.hasAttribute("value")
      self.value = initial
      handler = ->(_event) { self.value = element.value }
      element.addEventListener("change", handler)
      retain(->() { element.removeEventListener("change", handler) })
    end

    # Removes generated options and releases the control's connections.
    # Options present at construction remain for a subsequent awakening.
    # An override should call `super` to preserve cleanup.
    sig { override.void }
    def unload
      children = @element.children
      children[@template_option_count].remove while children.length > @template_option_count
      super
    end

    # Invoked after `options` changes to replace generated options and reapply
    # `value`. An override should call `super` to preserve rendering.
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

    # Invoked after `value` changes to update the select element.
    # An override should call `super` to preserve the display update.
    sig { params(_previous: T.untyped, _value: String).void }
    def value_did_change(_previous, _value)
      sync_value
    end

    # Assigns `value` to the select element when it differs from the displayed
    # value. The browser determines the selection when no option matches.
    sig { void }
    def sync_value
      @element.value = value if @element.value != value
    end
  end
end
