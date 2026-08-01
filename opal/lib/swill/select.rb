# backtick_javascript: true

module Swill
  # Observable wrapper for a native <select>. Options already present in the
  # markup are retained as a prefix; assigning +options+ replaces only the
  # programmatic suffix, matching the TypeScript control.
  class Select < Control
    include Observable

    property :options, default: -> { [] }
    property :value, default: ""

    def initialize(element)
      super
      @template_option_count = `#{element}.children.length`
      initial = `#{element}.value`
      initial = `#{element}.getAttribute("value")` if (initial.nil? || initial == "") && `#{element}.hasAttribute("value")`
      self.value = initial.to_s
      @change_listener = lambda { |_event| self.value = `#{element}.value`.to_s }
      `#{element}.addEventListener("change", #{@change_listener})`
    end

    def options_did_change(_previous, values)
      while `#{element}.children.length > #{@template_option_count}`
        `#{element}.children[#{@template_option_count}].remove()`
      end

      values.each do |value|
        option = `document.createElement("option")`
        `#{option}.value = #{value.to_s}`
        `#{option}.textContent = #{value.to_s}`
        `#{element}.appendChild(#{option})`
      end
      sync_value
    end

    def value_did_change(_previous, _value)
      sync_value
    end

    def teardown!
      `#{element}.removeEventListener("change", #{@change_listener})` if @change_listener
    end

    private

    def sync_value
      `#{element}.value = #{value.to_s}` if `#{element}.value !== #{value.to_s}`
    end
  end
end
