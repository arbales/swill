# typed: true
# frozen_string_literal: true

module Swill
  # A single choice, presented as adjacent buttons. Assignment is silent;
  # user choices send input/change, like the other value controls.
  class Control::Segmented < Control
    extend T::Sig

    property :options, type: T::Array[T::Hash[String, T.untyped]], default: []
    property :value, type: String, default: ""
    property :disabled, type: T::Boolean, default: false

    outlet :segments, type: View
    outlet :segment_template, type: HTMLTemplateElement

    sig { params(element: Element).void }
    def initialize(element)
      super
      Swell[element].add_class("segmented").attr("role", "radiogroup")
      load_template("segmented")
      handler = ->(event) { segment_clicked(event) }
      retain(Swell[element].listen("click", handler))
      render_options
    end

    sig { params(_previous: T.untyped, _options: T.untyped).void }
    def options_did_change(_previous, _options)
      render_options
    end

    sig { params(_previous: T.untyped, _value: String).void }
    def value_did_change(_previous, _value)
      sync_selection
    end

    sig { params(_previous: T.untyped, _disabled: T::Boolean).void }
    def disabled_did_change(_previous, _disabled)
      sync_selection
    end

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

    sig { params(event: Event).void }
    def segment_clicked(event)
      button = event.target.closest("[role='radio']")
      choose(T.must(Swell[button].data_value("value"))) if button && @element.contains(button)
    end

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

    sig { override.returns(T.nilable(Element)) }
    def first_focusable_element
      T.must(segments).element.querySelector('[tabindex="0"]')
    end

    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      !disabled && !options.empty?
    end

    sig { void }
    def focus_selection
      button = first_focusable_element
      button.focus({preventScroll: true}) if button
    end

    sig { params(next_value: String).void }
    def choose(next_value)
      return if disabled || value == next_value
      self.value = next_value
      @element.dispatchEvent(Event.new("input", {bubbles: true}))
      @element.dispatchEvent(Event.new("change", {bubbles: true}))
    end
  end
end
