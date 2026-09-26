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

    sig { params(element: Element).void }
    def initialize(element)
      super
      @open = T.let(false, T::Boolean)
      @document_pointer_down = ->(event) { document_pointer_down(event) }
      install_chrome
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
      root.classList.add("custom-select")
      root.setAttribute("tabindex", "0")
      root.setAttribute("role", "combobox")
      root.setAttribute("aria-haspopup", "listbox")
      root.replaceChildren
      @icon = create_element("span", {"class" => "custom-select-trigger-icon", "aria-hidden" => "true"})
      @label = create_element("span", {"class" => "custom-select-label"})
      button = create_element("button", {"type" => "button", "class" => "custom-select-button", "tabindex" => "-1"})
      button.appendChild(@icon)
      button.appendChild(@label)
      button.addEventListener("click", ->(event) { button_clicked(event) })
      @button = button
      @popup = create_element("div", {"class" => "custom-select-popup", "role" => "listbox"})
      root.appendChild(button)
      root.appendChild(@popup)
      root.addEventListener("focusout", ->(event) { focus_out(event) })
    end

    # Called when a user clicks on the button to open or close the control.
    sig { params(event: MouseEvent).void }
    def button_clicked(event)
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
      @popup.replaceChildren
      options.each do |option|
        row = create_element("button", {"type" => "button", "class" => "custom-select-option", "role" => "option", "tabindex" => "-1"})
        row.setAttribute("data-value", option_value(option))
        icon = option["icon"]
        if icon
          row.classList.add("has-icon")
          row.appendChild(create_element("span", {"class" => "custom-select-icon icon-#{icon}", "aria-hidden" => "true"}))
        end
        text = create_element("span", {"class" => "custom-select-option-text"})
        label = create_element("span", {"class" => "custom-select-option-label"})
        label.textContent = option["label"].to_s
        text.appendChild(label)
        description = option["description"]
        if description
          detail = create_element("span", {"class" => "custom-select-option-description"})
          detail.textContent = description.to_s
          text.appendChild(detail)
        end
        row.appendChild(text)
        row.addEventListener("click", ->(_event) { choose(option_value(option)) })
        @popup.appendChild(row)
      end
      sync_button
      sync_selected_option
    end

    # Returns the currently selected option or nil if nothing is selected.
    sig { returns(T.nilable(T::Hash[String, T.untyped])) }
    def selected_option
      options.find { |option| option_value(option) == value }
    end

    sig { void }
    def sync_button
      option = selected_option
      icon = option ? option["icon"] : nil
      @icon.setAttribute("class", icon ? "custom-select-trigger-icon icon-#{icon}" : "custom-select-trigger-icon")
      @icon.hidden = icon == nil
      @label.textContent = option ? option["label"].to_s : ""
    end

    sig { void }
    def sync_selected_option
      @popup.querySelectorAll("[role='option']").forEach do |row|
        row.setAttribute("aria-selected", row.getAttribute("data-value") == value ? "true" : "false")
      end
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
      @element.classList.toggle("open", open)
      @element.setAttribute("aria-expanded", open ? "true" : "false")
      @button.setAttribute("aria-expanded", open ? "true" : "false")
      @popup.hidden = !open
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

    sig { params(tag: String, attributes: T::Hash[String, String]).returns(Element) }
    def create_element(tag, attributes)
      node = @element.ownerDocument.createElement(tag)
      attributes.each { |name, attribute| node.setAttribute(name, attribute) }
      node
    end

    sig { params(option: T::Hash[String, T.untyped]).returns(String) }
    def option_value(option)
      option["value"].to_s
    end
  end
end
