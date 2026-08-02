# backtick_javascript: true

module Swill
  # Fully stylable combobox control. Options are hashes with +value+, +label+,
  # and optional +description+ and +icon+ entries.
  class Control::CustomSelect < Control
    include Observable

    property :options, default: -> { [] }
    property :value, default: ""

    def initialize(element)
      super
      @open = false
      install_chrome
      render_options
      close(true)
    end

    def options_did_change(_previous, _options)
      render_options
    end

    def value_did_change(_previous, _value)
      sync_button
      sync_selected_option
    end

    def cancel_operation(event)
      return super unless @open

      event&.prevent_default
      close
    end

    def key_down(event)
      case event&.key
      when "ArrowDown"
        event.prevent_default
        move_selection(1) if @open
      when "ArrowUp"
        event.prevent_default
        move_selection(-1) if @open
      when "Enter", " "
        event.prevent_default
        toggle
      else
        super
      end
    end

    def teardown!
      close(true)
      `#{element}.removeEventListener("focusout", #{@focus_out_listener})` if @focus_out_listener
      `#{@button}.removeEventListener("click", #{@button_listener})` if @button && @button_listener
    end

    private

    def install_chrome
      `#{element}.classList.add("custom-select")`
      `#{element}.tabIndex = 0`
      `#{element}.setAttribute("role", "combobox")`
      `#{element}.setAttribute("aria-haspopup", "listbox")`
      `#{element}.replaceChildren()`

      @icon = create_element("span", class: "custom-select-trigger-icon", "aria-hidden": "true")
      @label = create_element("span", class: "custom-select-label")
      @button = create_element("button", type: "button", class: "custom-select-button", tabindex: "-1")
      `#{@button}.appendChild(#{@icon})`
      `#{@button}.appendChild(#{@label})`
      @popup = create_element("div", class: "custom-select-popup", role: "listbox")
      `#{element}.appendChild(#{@button})`
      `#{element}.appendChild(#{@popup})`

      @button_listener = lambda do |event|
        toggle unless `#{event}.detail === 0`
      end
      `#{@button}.addEventListener("click", #{@button_listener})`

      @focus_out_listener = lambda do |event|
        related = `#{event}.relatedTarget`
        close if !related || !`#{element}.contains(#{related})`
      end
      `#{element}.addEventListener("focusout", #{@focus_out_listener})`

      @document_pointer_listener = lambda do |event|
        close unless `#{element}.contains(#{event}.target)`
      end
    end

    def render_options
      `#{@popup}.replaceChildren()`
      options.each do |option|
        row = create_element("button", type: "button", class: "custom-select-option",
                                       role: "option", tabindex: "-1")
        `#{row}.setAttribute("data-value", #{option_value(option)})`

        icon = option_entry(option, :icon)
        if icon
          icon_node = create_element("span", class: "custom-select-icon icon-#{icon}", "aria-hidden": "true")
          `#{row}.appendChild(#{icon_node})`
        end
        text = create_element("span", class: "custom-select-option-text")
        label = create_element("span", class: "custom-select-option-label")
        `#{label}.textContent = #{option_entry(option, :label).to_s}`
        `#{text}.appendChild(#{label})`
        description = option_entry(option, :description)
        if description
          detail = create_element("span", class: "custom-select-option-description")
          `#{detail}.textContent = #{description.to_s}`
          `#{text}.appendChild(#{detail})`
        end
        `#{row}.appendChild(#{text})`

        listener = lambda do |_event|
          set_value_from_user(option_value(option))
          close
        end
        `#{row}.addEventListener("click", #{listener})`
        `#{@popup}.appendChild(#{row})`
      end
      sync_button
      sync_selected_option
    end

    def selected_option
      options.find { |option| option_value(option) == value }
    end

    def sync_button
      option = selected_option
      icon = option && option_entry(option, :icon)
      icon_class = icon ? "custom-select-trigger-icon icon-#{icon}" : "custom-select-trigger-icon"
      `#{@icon}.setAttribute("class", #{icon_class})`
      `#{@icon}.hidden = #{!icon}`
      `#{@label}.textContent = #{option ? option_entry(option, :label).to_s : ""}`
    end

    def sync_selected_option
      `Array.from(#{@popup}.children)`.each do |row|
        selected = `#{row}.getAttribute("data-value")`.to_s == value
        `#{row}.setAttribute("aria-selected", #{selected ? "true" : "false"})`
      end
    end

    def toggle
      @open ? close : open
    end

    def open
      return if @open

      @open = true
      `#{element}.classList.add("open")`
      `#{element}.setAttribute("aria-expanded", "true")`
      `#{@button}.setAttribute("aria-expanded", "true")`
      `#{@popup}.hidden = false`
      `document.addEventListener("pointerdown", #{@document_pointer_listener})`
    end

    def close(force = false)
      return unless force || @open

      @open = false
      `#{element}.classList.remove("open")`
      `#{element}.setAttribute("aria-expanded", "false")`
      `#{@button}.setAttribute("aria-expanded", "false")`
      `#{@popup}.hidden = true`
      `document.removeEventListener("pointerdown", #{@document_pointer_listener})`
    end

    def move_selection(delta)
      return if options.empty?

      current = options.index { |option| option_value(option) == value }
      index = current ? (current + delta) % options.length : 0
      set_value_from_user(option_value(options[index]))
    end

    def set_value_from_user(next_value)
      return if value == next_value

      self.value = next_value
      `#{element}.dispatchEvent(new Event("input", { bubbles: true }))`
      `#{element}.dispatchEvent(new Event("change", { bubbles: true }))`
    end

    def create_element(tag, attributes = {})
      node = `document.createElement(#{tag})`
      attributes.each { |name, value| `#{node}.setAttribute(#{name.to_s}, #{value.to_s})` }
      node
    end

    def option_value(option)
      option_entry(option, :value).to_s
    end

    def option_entry(option, name)
      Indifferent.fetch(option, name)
    end
  end
end
