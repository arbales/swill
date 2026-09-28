# typed: true
# frozen_string_literal: true

module Swill
  # A stylable select: a button showing the chosen option and a listbox of
  # the rest, built inside the element it is given. Options are hashes with
  # "value" and "label", and optionally "description" and "icon". value
  # follows the choice; a user's choice also dispatches input and change on
  # the element, as a native select would. Enter and Space toggle the
  # listbox, arrows move within it, Escape closes it, and so does focus or a
  # pointer leaving the control.
  class Control::CustomSelect < Control
    extend T::Sig

    property :options, type: T::Array[T::Hash[String, T.untyped]], default: []
    property :value, type: String, default: ""

    outlet :button, type: View
    outlet :icon, type: View
    outlet :label, type: View
    outlet :popup, type: View
    outlet :option_template, type: HTMLTemplateElement

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

    # Called by KVO when the options have changed, rerenders the options.
    sig { params(_previous: T.untyped, _options: T.untyped).void }
    def options_did_change(_previous, _options)
      render_options
    end

    # Called when the value of the control changes,
    # updating the button and selection state of the control.
    sig { params(_previous: T.untyped, _value: String).void }
    def value_did_change(_previous, _value)
      sync_button
      sync_selected_option
    end

    # Called when a user presses Escape, closing the control.
    sig { override.params(event: KeyboardEvent).void }
    def cancel_operation(event)
      return super unless @open
      event.preventDefault
      close
    end

    # Called when the user types, handling arrow keys and Enter.
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

    # Called when a user clicks on the button to open or close the control.
    sig { params(_sender: T.untyped, event: MouseEvent).void }
    def button_clicked(_sender, event)
      toggle unless event.detail == 0
    end

    sig { params(event: Event).void }
    def focus_out(event)
      next_element = event.relatedTarget
      close if next_element == nil || !@element.contains(next_element)
    end

    sig { params(event: Event).void }
    def document_pointer_down(event)
      close unless @element.contains(event.target)
    end

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

    sig { params(event: Event).void }
    def option_clicked(event)
      row = event.target.closest("[role='option']")
      choose(T.must(Swell[row].data_value("value"))) if row && T.must(popup).element.contains(row)
    end

    # Returns the currently selected option or nil if nothing is selected.
    sig { returns(T.nilable(T::Hash[String, T.untyped])) }
    def selected_option
      options.find { |option| option_value(option) == value }
    end

    sig { void }
    def sync_button
      option = selected_option
      icon_name = option ? option["icon"] : nil
      T.must(self.icon).element.setAttribute("class", icon_name ? "custom-select-trigger-icon icon-#{icon_name}" : "custom-select-trigger-icon")
      T.must(self.icon).element.hidden = icon_name == nil
      T.must(button).element.classList.toggle("has-icon", icon_name != nil)
      T.must(label).element.textContent = option ? option["label"].to_s : ""
    end

    sig { void }
    def sync_selected_option
      T.must(popup).element.querySelectorAll("[role='option']").forEach(->(row) do
        dom = Swell[row]
        dom.aria("selected", dom.data_value("value") == value)
      end)
    end

    # ---- open and closed ----

    sig { void }
    def toggle
      @open ? close : open
    end

    sig { void }
    def open
      apply_open(true) unless @open
    end

    sig { void }
    def close
      apply_open(false) if @open
    end

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

    sig { params(delta: Integer).void }
    def move_selection(delta)
      return if options.empty?
      current = -1
      options.each_with_index { |option, index| current = index if option_value(option) == value }
      index = current < 0 ? 0 : (current + delta) % options.length
      choose(option_value(T.must(options[index])))
    end

    # A user's choice: the value, then the events a native select sends.
    sig { params(next_value: String).void }
    def choose(next_value)
      close
      return if value == next_value
      self.value = next_value
      @element.dispatchEvent(Event.new("input", {bubbles: true}))
      @element.dispatchEvent(Event.new("change", {bubbles: true}))
    end

    sig { params(option: T::Hash[String, T.untyped]).returns(String) }
    def option_value(option)
      option["value"].to_s
    end
  end
end
