# backtick_javascript: true

module Swill
  class View < Responder
    include HTMLAttributes
    FOCUSABLE = "input, select, textarea, button, [tabindex]"

    attr_reader :element, :subviews
    attr_accessor :controller, :superview

    def initialize(element)
      @element = element
      @controller = nil
      @superview = nil
      @subviews = []
      apply_html_attributes(element)
      `#{element}.__swill_view__ = #{self}`
    end

    def next_responder
      controller || superview
    end

    # The nearest containing controller, walking up the sparse View tree. For a
    # controller's root view this is its own controller.
    def owner
      view = self
      while view
        return view.controller if view.controller

        view = view.superview
      end
      nil
    end

    # ---- sparse view tree ----
    #
    # Only View-managed elements are linked here (controller roots, controls,
    # outlets), not every DOM node. adopt/release keep both sides consistent.

    def adopt_subview(child)
      child.detach_from_superview
      child.superview = self
      @subviews << child unless @subviews.include?(child)
      child
    end

    def release_subview(child)
      return unless child.superview.equal?(self)

      @subviews.delete(child)
      child.superview = nil
    end

    def remove_from_superview
      detach_from_superview
      `#{element}.remove()`
    end

    # The element to actually focus: this element if it is focusable, otherwise
    # the first focusable descendant.
    def first_focusable_element
      `#{element}.matches(#{FOCUSABLE}) ? #{element} : #{element}.querySelector(#{FOCUSABLE})`
    end

    def focus_element
      target = first_focusable_element
      `#{target} && #{target}.focus()`
    end

    def blur_element
      target = first_focusable_element
      `#{target} && #{target}.blur && #{target}.blur()`
    end

    def focused?
      `document.activeElement === #{first_focusable_element}`
    end

    # A view wraps a focusable element, so unlike a bare responder it accepts
    # first responder status by default — Cocoa controls likewise override
    # acceptsFirstResponder to true. Subclasses override to refuse.
    def accepts_first_responder?
      true
    end

    # Becoming first responder focuses the view's element. Gated on
    # accepts_first_responder? so a refusing subclass neither focuses nor claims.
    def become_first_responder
      return false unless accepts_first_responder?

      focus_element
      true
    end

    def self.for(element)
      return nil unless element

      `#{element}.__swill_view__ || nil`
    end

    # The controller that owns +element+, via its View. There is no separate
    # element→controller back-pointer: a View is the element's representative
    # and already holds its controller, so this is the single source of truth.
    def self.controller_for(element)
      view = self.for(element)
      view && view.controller
    end

    protected

    def detach_from_superview
      superview&.release_subview(self)
    end
  end
end
