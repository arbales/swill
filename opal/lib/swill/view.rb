# backtick_javascript: true

module Swill
  class View < Responder
    attr_reader :element
    attr_accessor :controller, :superview

    def initialize(element)
      @element = element
      @controller = nil
      @superview = nil
      `#{element}.__swill_view__ = #{self}`
    end

    def next_responder
      controller || superview
    end

    def focus
      target = `#{element}.matches("input, select, textarea, button, [tabindex]") ? #{element} : #{element}.querySelector("input, select, textarea, button, [tabindex]")`
      `#{target} && #{target}.focus()`
    end

    def self.for(element)
      `#{element}.__swill_view__ || nil`
    end
  end
end
