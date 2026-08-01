# backtick_javascript: true

module Swill
  # NSTextField-style observable wrapper for an input or input-containing view.
  class TextField < Control
    include Observable

    property :value, default: ""

    def initialize(element)
      super
      input = input_element
      if input
        initial = `#{input}.value`
        initial = `#{input}.getAttribute("value")` if (initial.nil? || initial == "") && `#{input}.hasAttribute("value")`
        self.value = initial.to_s
      end
      @input_listener = lambda do |event|
        target = `#{event}.target`
        self.value = `#{target}.value`.to_s if `#{target} === #{input_element}`
      end
      `#{input}.addEventListener("input", #{@input_listener})` if input
    end

    def value_did_change(_previous, value)
      input = input_element
      `#{input}.value = #{value.to_s}` if input && `#{input}.value !== #{value.to_s}`
    end

    def teardown!
      input = input_element
      `#{input}.removeEventListener("input", #{@input_listener})` if input && @input_listener
    end

    private

    def input_element
      `#{element}.tagName === "INPUT" ? #{element} : #{element}.querySelector("input")`
    end
  end
end
