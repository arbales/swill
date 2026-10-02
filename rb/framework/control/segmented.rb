# typed: true
# frozen_string_literal: true

module Swill
  # `Control::Segmented` presents a choice as adjacent buttons. Each option
  # supplies a value and label. Clicking a button or selecting with the keyboard
  # updates `value` and dispatches input and change events.
  #
  #     <div klass="Swill::Control::Segmented" bind="selected_person"></div>
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
    # Sets the root's class to include "segmented".
    sig { params(element: Element).void }
    def initialize(element)
      super
      Swell[element].add_class("segmented")
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

    # Updates each button's checked state, as the `checked` class, its
    # disabled state, and its tabindex. The selected button, or the first when
    # no option matches, gets tabindex zero when enabled.
    sig { void }
    def sync_selection
      buttons = T.must(segments).element.children
      selected = options.find { |option| option["value"].to_s == value }
      index = 0
      while index < buttons.length
        button = T.must(buttons[index])
        dom = Swell[button]
        checked = dom.data_value("value") == value
        dom.toggle_class("checked", checked)
        button.setAttribute("tabindex", !disabled && (checked || (!selected && index == 0)) ? "0" : "-1")
        button.disabled = disabled
        index += 1
      end
      update_accessibility
    end

    # A radio group of radio buttons, each checked or not.
    sig { override.void }
    def update_accessibility
      super
      Swell[@element].attr("role", "radiogroup").aria("disabled", disabled)
      buttons = T.must(segments).element.children
      index = 0
      while index < buttons.length
        button = T.must(buttons[index])
        Swell[button].attr("role", "radio").aria("checked", button.classList.contains("checked"))
        index += 1
      end
    end

    # :section: Choosing and Focusing
    # Selecting an option from a click, a key event, or an explicit call.

    # Chooses the value of the clicked radio button within this control.
    # Clicks outside a radio button leave the value unchanged. See `#choose`.
    sig { params(event: Event).void }
    def segment_clicked(event)
      button = event.target.closest(".segmented-option")
      choose(T.must(Swell[button].data_value("value"))) if button && @element.contains(button)
    end

    # Left and Right move focus to the previous and next segment, wrapping at
    # either end, without choosing it; Space and Enter press the focused
    # native button, which chooses. Up and Down are not the control's, and
    # go up the responder chain. A disabled or empty control passes these
    # keys on too.
    sig { override.params(event: KeyboardEvent).void }
    def move_left(event)
      return super unless movable?
      focus_adjacent(event, -1)
    end

    # Right moves focus to the next segment.
    sig { override.params(event: KeyboardEvent).void }
    def move_right(event)
      return super unless movable?
      focus_adjacent(event, 1)
    end

    # Home moves focus to the first segment.
    sig { override.params(event: KeyboardEvent).void }
    def move_to_beginning_of_document(event)
      return super unless movable?
      focus_segment_at(event, 0)
    end

    # End moves focus to the last segment.
    sig { override.params(event: KeyboardEvent).void }
    def move_to_end_of_document(event)
      return super unless movable?
      focus_segment_at(event, T.must(segments).element.children.length - 1)
    end

    # Whether the arrows, Home and End move among the segments: the control
    # is enabled and has some.
    sig { returns(T::Boolean) }
    def movable?
      !disabled && T.must(segments).element.children.length > 0
    end

    # Moves focus +delta+ segments from the focused one, or from the
    # chosen one when focus is elsewhere, wrapping.
    sig { params(event: KeyboardEvent, delta: Integer).void }
    def focus_adjacent(event, delta) # :nodoc:
      buttons = T.must(segments).element.children
      active = @element.ownerDocument.activeElement
      current = T.let(-1, Integer)
      chosen = T.let(0, Integer)
      index = 0
      while index < buttons.length
        button = T.must(buttons[index])
        current = index if button == active
        chosen = index if button.classList.contains("checked")
        index += 1
      end
      focus_segment_at(event, ((current < 0 ? chosen : current) + delta) % buttons.length)
    end

    # Focuses the segment at +index+ and gives it the control's tab stop,
    # leaving the choice alone.
    sig { params(event: KeyboardEvent, index: Integer).void }
    def focus_segment_at(event, index) # :nodoc:
      buttons = T.must(segments).element.children
      event.preventDefault
      position = 0
      while position < buttons.length
        T.must(buttons[position]).setAttribute("tabindex", position == index ? "0" : "-1")
        position += 1
      end
      DOM.focus(T.must(buttons[index]))
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
      DOM.focus(button) if button
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
