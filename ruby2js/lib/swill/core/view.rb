# typed: true
# frozen_string_literal: true

module Swill
  # The DOM boundary. Only managed elements get a View: controller roots today,
  # outlets and components later. Views link into a sparse tree that mirrors
  # controller nesting without wrapping every DOM node.
  class View < Responder
    extend T::Sig

    sig { params(element: T.untyped).void }
    def initialize(element)
      super()
      @element = element
      @controller = nil
      @superview = nil
      @subviews = []
      element.__swill_view__ = self
    end

    sig { returns(T.untyped) }
    def element
      @element
    end

    sig { returns(T.nilable(Controller)) }
    def controller_value
      @controller
    end

    sig { params(controller: T.nilable(Controller)).returns(T.nilable(Controller)) }
    def controller=(controller)
      @controller = controller
    end

    sig { returns(T.nilable(View)) }
    def superview
      @superview
    end

    # Adopted child views in adoption order, as a JavaScript array.
    sig { returns(T.untyped) }
    def subviews
      @subviews
    end

    # The nearest controller through the sparse tree: this view's own
    # controller when it is a controller root, else the superview's owner.
    sig { returns(T.nilable(Controller)) }
    def owner
      own = @controller
      return own if own
      superview = @superview
      superview ? superview.owner() : nil
    end

    sig { params(child: View).returns(View) }
    def adopt_subview(child)
      previous = child.superview()
      previous.release_subview(child) if previous
      child.assign_superview(self)
      @subviews.push(child)
      child
    end

    sig { params(child: View).void }
    def release_subview(child)
      @subviews = @subviews.filter { |candidate| candidate != child }
      child.assign_superview(nil)
    end

    sig { void }
    def remove_from_superview
      superview = @superview
      superview.release_subview(self) if superview
    end

    # Tree-internal; adopt_subview and release_subview keep both sides consistent.
    sig { params(superview: T.nilable(View)).void }
    def assign_superview(superview)
      @superview = superview
    end

    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      @controller || @superview
    end

    # ---- focus ----

    sig { returns(String) }
    def focusable_selector
      "input, select, textarea, button, [tabindex]"
    end

    # This element when it is focusable, else its first focusable descendant.
    sig { returns(T.untyped) }
    def first_focusable_element
      @element.matches(focusable_selector) ? @element : @element.querySelector(focusable_selector)
    end

    sig { void }
    def focus_element
      target = first_focusable_element
      target.focus() if target
    end

    sig { void }
    def blur_element
      target = first_focusable_element
      target.blur() if target
    end

    # A view wraps a focusable element, so it accepts by default; becoming
    # first responder focuses it.
    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      true
    end

    sig { override.returns(T::Boolean) }
    def become_first_responder
      focus_element
      true
    end
  end
end
