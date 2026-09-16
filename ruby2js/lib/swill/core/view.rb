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

    # ---- elements: the DOM work a controller leaves to its view ----

    # The View on an element, or nil when it has none.
    sig { params(element: T.untyped).returns(T.nilable(View)) }
    def self.of(element)
      element.__swill_view__ || nil
    end

    # The controller rooted at an element, or nil.
    sig { params(element: T.untyped).returns(T.nilable(Controller)) }
    def self.controller_for(element)
      view = View.of(element)
      view ? view.controller_value() : nil
    end

    sig { params(name: String).returns(T::Boolean) }
    def has_attribute?(name)
      @element.hasAttribute(name)
    end

    sig { params(element: T.untyped).returns(T::Boolean) }
    def contains?(element)
      @element.contains(element)
    end

    # A fresh element from an inert template's content, or nil when the
    # template has none.
    sig { params(template: T.untyped).returns(T.untyped) }
    def clone_template(template)
      node = template.content.firstElementChild
      node ? node.cloneNode(true) : nil
    end

    sig { params(element: T.untyped).void }
    def append(element)
      @element.appendChild(element)
    end

    sig { params(anchor: T.untyped, element: T.untyped).void }
    def insert_after(anchor, element)
      anchor.after(element)
    end

    sig { params(element: T.untyped).void }
    def remove(element)
      element.remove()
    end

    # The direct child of this view's element that contains element, or nil.
    sig { params(element: T.untyped).returns(T.untyped) }
    def child_containing(element)
      node = element
      node = node.parentElement while node && node.parentElement != @element
      node
    end

    # A state class on a child element.
    sig { params(element: T.untyped, name: String, on: T::Boolean).void }
    def mark(element, name, on)
      element.classList.toggle(name, on)
    end

    # The selected state, as a class and for assistive technology.
    sig { params(element: T.untyped, on: T::Boolean).void }
    def mark_selected(element, on)
      mark(element, "selected", on)
      element.setAttribute("aria-selected", on ? "true" : "false")
    end

    sig { params(element: T.untyped).void }
    def reveal(element)
      element.scrollIntoView({block: "nearest"}) if element.scrollIntoView
    end

    # Keyboard focus needs a tab stop.
    sig { void }
    def ensure_focusable
      @element.setAttribute("tabindex", "0") unless @element.hasAttribute("tabindex")
    end

    # Drop the browser's text selection, as before a shift-click sweep.
    sig { void }
    def clear_text_selection
      owner_document = @element.ownerDocument
      selection = owner_document.getSelection ? owner_document.getSelection() : nil
      selection.removeAllRanges() if selection
    end

    # An event listener on this view's element; the returned callable
    # removes it.
    sig { params(type: String, handler: T.untyped, capture: T::Boolean).returns(T.proc.void) }
    def listen(type, handler, capture)
      @element.addEventListener(type, handler, capture)
      ->() { @element.removeEventListener(type, handler, capture) }
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
