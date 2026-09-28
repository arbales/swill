# typed: true
# frozen_string_literal: true

module Swill
  # `Control::CustomSelect` presents a choice with a button and a popup list
  # of options. An option has a value and label, and can include a description
  # and icon. The control builds its contents from the custom select template.
  #
  #     <div klass="Swill::Control::CustomSelect" bind="selected_person"
  #          aria-label="Person"></div>
  #
  # See [Controls](rdoc-ref:doc/controls.md) for options, value bindings, and
  # keyboard behavior.
  class Control::CustomSelect < Control
    extend T::Sig

    # :section: Configuring the Choice
    # Options, selection, and the elements supplied by the template.

    # The option hashes, with "value" and "label" entries and optional
    # "description" and "icon" entries. Values are compared as strings.
    # Assigning the array rebuilds the list and preserves `value`.
    # The default is [].
    property :options, type: T::Array[T::Hash[String, T.untyped]], default: []
    # The chosen option's value as a string. Assignment updates the label,
    # icon, and selected state without dispatching input or change events.
    # An unmatched value leaves the button label empty. The default is "".
    # See `#selected_option` and `#choose`.
    property :value, type: String, default: ""

    # The view wrapping the button that opens and closes the popup.
    # Connected during template loading; nil before it is connected.
    outlet :button, type: View
    # The view displaying the selected option's icon in the button.
    # Connected during template loading; nil before it is connected.
    outlet :icon, type: View
    # The view displaying the selected option's label in the button.
    # Connected during template loading; nil before it is connected.
    outlet :label, type: View
    # The view containing the option list. Connected during template loading;
    # nil before it is connected. See `#open` and `#close`.
    outlet :popup, type: View
    # The template cloned for each option. Connected during template loading;
    # nil before it is connected.
    outlet :option_template, type: HTMLTemplateElement

    # Creates the control, loads its template, and installs its event handlers.
    # The popup is initially closed.
    sig { params(element: Element).void }
    def initialize(element)
      super
      @open = T.let(false, T::Boolean)
      @document_pointer_down = ->(event) { document_pointer_down(event) }
      install_chrome
      choices = T.must(popup).element
      handler = ->(event) { option_clicked(event) }
      retain(Swell[choices].listen("click", handler))
      render_options
      apply_open(false)
    end

    # :section: Handling Changes and Events
    # Responding to property changes, keys, and pointer events.

    # Invoked after `options` changes to rebuild the popup and update the
    # button. An override should call `super` to preserve rendering.
    sig { params(_previous: T.untyped, _options: T.untyped).void }
    def options_did_change(_previous, _options)
      render_options
    end

    # Invoked after `value` changes to update the button and selected option.
    # An override should call `super` to preserve these updates.
    sig { params(_previous: T.untyped, _value: String).void }
    def value_did_change(_previous, _value)
      sync_button
      sync_selected_option
    end

    # Invoked for Escape. Closes an open popup and prevents the default event
    # behavior. With the popup closed, passes the event to `super`.
    sig { override.params(event: KeyboardEvent).void }
    def cancel_operation(event)
      return super unless @open
      event.preventDefault
      close
    end

    # Invoked for a key event. Enter and Space toggle the popup. Up and Down
    # choose the adjacent option while the popup is open; choosing closes it.
    # Other keys pass to `super`. An override should pass unhandled keys to
    # `super`.
    sig { override.params(event: KeyboardEvent).void }
    def key_down(event)
      case event.key
      when "ArrowDown"
        event.preventDefault
        move_selection(1) if @open
      when "ArrowUp"
        event.preventDefault
        move_selection(-1) if @open
      when "Enter", " "
        event.preventDefault
        toggle
      else
        super
      end
    end

    # Loads the custom select template and configures the root as a focusable
    # combobox. Installs handlers for closing the popup when focus or a pointer
    # press moves outside the control. Called during construction.
    sig { void }
    def install_chrome
      root = @element
      Swell[@element].add_class('custom-select')
                     .attr('tabindex', '0')
                     .attr('role', 'combobox')
                     .aria('haspopup', 'listbox')
      load_template("custom_select")
      focus_handler = ->(event) { focus_out(event) }
      retain(Swell[root].listen("focusout", focus_handler))
      retain(-> { root.ownerDocument.removeEventListener("pointerdown", @document_pointer_down) })
    end

    # Toggles the popup for a pointer click. Ignores clicks with event detail
    # zero; keyboard activation is handled by `#key_down`.
    sig { params(_sender: T.untyped, event: MouseEvent).void }
    def button_clicked(_sender, event)
      toggle unless event.detail == 0
    end

    # Closes the popup when focus leaves the control or has no next element.
    sig { params(event: Event).void }
    def focus_out(event)
      next_element = event.relatedTarget
      close if next_element == nil || !@element.contains(next_element)
    end

    # Closes the popup when the pointer press occurs outside the control.
    sig { params(event: Event).void }
    def document_pointer_down(event)
      close unless @element.contains(event.target)
    end

    # :section: Presenting Options
    # Displaying labels, icons, descriptions, and selected state.

    # Rebuilds the option rows and updates the button and selected state.
    # An icon name adds the class "icon-name". A nil description or icon hides
    # its corresponding element.
    sig { void }
    def render_options
      container = T.must(popup).element
      container.replaceChildren
      options.each do |option|
        row = clone_template(T.must(option_template))
        Swell[row].data("value", option_value(option)).toggle_class("has-icon", option["icon"] != nil)
        icon_name = option["icon"]
        icon_element = T.must(row.querySelector(".custom-select-icon"))
        icon_element.hidden = icon_name == nil
        icon_element.classList.add("icon-#{icon_name}") if icon_name
        Swell[row].find!(".custom-select-option-label").text(option["label"])
        Swell[row].find!(".custom-select-option-description")
                  .text(option["description"]).prop("hidden", option["description"] == nil)
        container.appendChild(row)
      end
      sync_button
      sync_selected_option
    end

    # Chooses the value of the clicked option within the popup.
    # Clicks outside an option leave the value unchanged. See `#choose`.
    sig { params(event: Event).void }
    def option_clicked(event)
      row = event.target.closest("[role='option']")
      choose(T.must(Swell[row].data_value("value"))) if row && T.must(popup).element.contains(row)
    end

    # Returns the first option whose string value equals `value`, or nil
    # when none matches.
    sig { returns(T.nilable(T::Hash[String, T.untyped])) }
    def selected_option
      options.find { |option| option_value(option) == value }
    end

    # Updates the button label and icon from `#selected_option`. With no
    # matching option, clears the label and hides the icon.
    sig { void }
    def sync_button
      option = selected_option
      icon_name = option ? option["icon"] : nil
      T.must(self.icon).element.setAttribute("class", icon_name ? "custom-select-trigger-icon icon-#{icon_name}" : "custom-select-trigger-icon")
      T.must(self.icon).element.hidden = icon_name == nil
      T.must(button).element.classList.toggle("has-icon", icon_name != nil)
      T.must(label).element.textContent = option ? option["label"].to_s : ""
    end

    # Updates aria-selected on each option row according to `value`.
    sig { void }
    def sync_selected_option
      T.must(popup).element.querySelectorAll("[role='option']").forEach(->(row) do
        dom = Swell[row]
        dom.aria("selected", dom.data_value("value") == value)
      end)
    end

    # :section: Opening and Choosing
    # Controlling popup visibility and choosing a value.

    # Opens a closed popup or closes an open popup. See `#open` and `#close`.
    sig { void }
    def toggle
      @open ? close : open
    end

    # Opens the popup and begins listening for pointer presses outside the
    # control. Does nothing when already open. See `#close`.
    sig { void }
    def open
      apply_open(true) unless @open
    end

    # Closes the popup and stops listening for outside pointer presses.
    # Does nothing when already closed. See `#open`.
    sig { void }
    def close
      apply_open(false) if @open
    end

    # Sets popup visibility, the root's open class, and expanded attributes
    # from `open`. Updates the document listener for outside pointer presses.
    sig { params(open: T::Boolean).void }
    def apply_open(open)
      @open = open
      Swell[@element].toggle_class("open", open).aria("expanded", open)
      Swell[T.must(button).element].aria("expanded", open)
      Swell[T.must(popup).element].prop("hidden", !open)
      document = @element.ownerDocument
      if open
        document.addEventListener("pointerdown", @document_pointer_down)
      else
        document.removeEventListener("pointerdown", @document_pointer_down)
      end
    end

    # Chooses the option `delta` positions from the current selection,
    # wrapping at either end. Chooses the first option when no value matches,
    # and does nothing when there are no options. See `#choose`.
    sig { params(delta: Integer).void }
    def move_selection(delta)
      return if options.empty?
      current = -1
      options.each_with_index { |option, index| current = index if option_value(option) == value }
      index = current < 0 ? 0 : (current + delta) % options.length
      choose(option_value(T.must(options[index])))
    end

    # Closes the popup and assigns `next_value`. If the value changes,
    # dispatches bubbling input and change events. Accepts a string even when
    # no option matches; assign `value` directly to update selection without
    # dispatching DOM events.
    sig { params(next_value: String).void }
    def choose(next_value)
      close
      return if value == next_value
      self.value = next_value
      @element.dispatchEvent(Event.new("input", {bubbles: true}))
      @element.dispatchEvent(Event.new("change", {bubbles: true}))
    end

    # Returns the string form of the option's "value" entry, or an empty
    # string when it is nil.
    sig { params(option: T::Hash[String, T.untyped]).returns(String) }
    def option_value(option)
      option["value"].to_s
    end
  end
end
