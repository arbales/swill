# typed: true
# frozen_string_literal: true

module Swill
  # `Control::Segmented` presents a choice as adjacent buttons. Each option
  # supplies a value and label. Clicking a button or selecting with the keyboard
  # updates `value` and dispatches input and change events.
  #
  #     <div klass="Swill::Control::Segmented" bind="selected_person"
  #          aria-label="Person"></div>
  #
  # See [Controls](rdoc-ref:doc/controls.md) for options, bindings, and keyboard
  # behavior.
  class Control::Segmented < Control
    extend T::Sig

    # :section: Configuring the Choice
    # Options, selection, and availability.

    # The option hashes, with "value" and "label" entries. Values are compared
    # as strings. Assigning the array rebuilds the buttons and preserves
    # `value`. The default is [].
    property :options, type: T::Array[T::Hash[String, T.untyped]], default: []
    # The chosen option's value as a string. Assignment updates selection and
    # focusability without dispatching input or change events. An unmatched
    # value leaves all buttons unchecked. The default is "". See `#choose`.
    property :value, type: String, default: ""
    # Whether the control rejects choices and keyboard input. When true, its
    # buttons are disabled and removed from the tab order. The default is false.
    property :disabled, type: T::Boolean, default: false

    # The view containing the option buttons, connected by the segmented
    # template during construction. It is nil until the template is loaded.
    outlet :segments, type: View
    # The template cloned for each option button, connected during
    # construction. It is nil until the segmented template is loaded.
    outlet :segment_template, type: HTMLTemplateElement

    # Creates the control, loads the segmented template, and listens for clicks.
    # Sets the root's class to include "segmented" and its role to "radiogroup".
    sig { params(element: Element).void }
    def initialize(element)
      super
      Swell[element].add_class("segmented").attr("role", "radiogroup")
      load_template("segmented")
      handler = ->(event) { segment_clicked(event) }
      retain(Swell[element].listen("click", handler))
      render_options
    end

    # :section: Updating the Presentation
    # Rebuilding buttons and reflecting changes in control state.

    # Invoked after `options` changes to rebuild the buttons. An override
    # should call `super` to preserve rendering.
    sig { params(_previous: T.untyped, _options: T.untyped).void }
    def options_did_change(_previous, _options)
      render_options
    end

    # Invoked after `value` changes to update checked state and the tab order.
    # An override should call `super` to preserve these updates.
    sig { params(_previous: T.untyped, _value: String).void }
    def value_did_change(_previous, _value)
      sync_selection
    end

    # Invoked after `disabled` changes to update button availability and the
    # tab order. An override should call `super` to preserve these updates.
    sig { params(_previous: T.untyped, _disabled: T::Boolean).void }
    def disabled_did_change(_previous, _disabled)
      sync_selection
    end

    # Replaces the buttons with one per option and updates their selection
    # state. If focus was inside the buttons, moves it to the selected button
    # or the first button when no option matches.
    sig { void }
    def render_options
      container = T.must(segments).element
      focused = container.contains(@element.ownerDocument.activeElement)
      container.replaceChildren
      options.each do |option|
        button = clone_template(T.must(segment_template))
        Swell[button].text(option["label"]).data("value", option["value"].to_s)
        container.appendChild(button)
      end
      sync_selection
      focus_selection if focused
    end

    # Updates each button's checked state, disabled state, and tabindex.
    # The selected button, or the first when no option matches, gets tabindex
    # zero when enabled. Updates aria-disabled on the root.
    sig { void }
    def sync_selection
      buttons = T.must(segments).element.children
      selected = options.find { |option| option["value"].to_s == value }
      index = 0
      while index < buttons.length
        button = T.must(buttons[index])
        dom = Swell[button]
        checked = dom.data_value("value") == value
        dom.aria("checked", checked)
        button.setAttribute("tabindex", !disabled && (checked || (!selected && index == 0)) ? "0" : "-1")
        button.disabled = disabled
        index += 1
      end
      Swell[@element].aria("disabled", disabled)
    end

    # :section: Choosing and Focusing
    # Selecting an option from a click, a key event, or an explicit call.

    # Chooses the value of the clicked radio button within this control.
    # Clicks outside a radio button leave the value unchanged. See `#choose`.
    sig { params(event: Event).void }
    def segment_clicked(event)
      button = event.target.closest("[role='radio']")
      choose(T.must(Swell[button].data_value("value"))) if button && @element.contains(button)
    end

    # Invoked for a key event. Arrow keys choose the previous or next option,
    # wrapping at either end; Home and End choose the first or last option.
    # Moves focus to the chosen button. Disabled controls ignore key events.
    # Enter and Space retain native button activation; other keys pass to
    # `super`. An override should pass unhandled keys to `super`.
    sig { override.params(event: KeyboardEvent).void }
    def key_down(event)
      return if disabled
      case event.key
      when "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"
        return if options.empty?
        event.preventDefault
        index = 0
        options.each_with_index { |option, position| index = position if option["value"].to_s == value }
        case event.key
        when "Home" then index = 0
        when "End" then index = options.length - 1
        when "ArrowLeft", "ArrowUp" then index = (index - 1) % options.length
        else index = (index + 1) % options.length
        end
        choose(T.must(options[index])["value"].to_s)
        focus_selection
      when "Enter", " "
        # Let the focused native button activate itself.
        return
      else
        super
      end
    end

    # Returns the button with tabindex zero, or nil when no button has a tab
    # stop. See `#focus_selection`.
    sig { override.returns(T.nilable(Element)) }
    def first_focusable_element
      T.must(segments).element.querySelector('[tabindex="0"]')
    end

    # Returns whether the control is enabled and has at least one option.
    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      !disabled && !options.empty?
    end

    # Focuses the button returned by `#first_focusable_element` without
    # scrolling. Does nothing when there is no such button.
    sig { void }
    def focus_selection
      button = first_focusable_element
      button.focus({preventScroll: true}) if button
    end

    # Assigns `next_value` and dispatches bubbling input and change events.
    # Does nothing when disabled or when the value is unchanged. Accepts a
    # string even when no option matches; assign `value` directly to update
    # selection without dispatching DOM events.
    sig { params(next_value: String).void }
    def choose(next_value)
      return if disabled || value == next_value
      self.value = next_value
      @element.dispatchEvent(Event.new("input", {bubbles: true}))
      @element.dispatchEvent(Event.new("change", {bubbles: true}))
    end
  end
end
