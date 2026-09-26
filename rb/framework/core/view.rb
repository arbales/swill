# typed: true
# frozen_string_literal: true

module Swill
  # The DOM boundary. Only managed elements get a View: controller roots today,
  # outlets and components later. Views link into a sparse tree that mirrors
  # controller nesting without wrapping every DOM node.
  class View < Responder
    extend T::Sig

    # Wraps +element+, marking it managed.
    sig { params(element: Element).void }
    def initialize(element)
      super()
      @element = element
      @controller = T.let(nil, T.nilable(Controller))
      @superview = T.let(nil, T.nilable(View))
      @subviews = T.let([], T::Array[View])
      element.__swill_view__ = self
    end

    # The element this view wraps.
    sig { returns(Element) }
    attr_reader :element

    # The controller rooted here, or nil when this view is not a controller
    # root. Use #owner to find the controller a view belongs to.
    sig { returns(T.nilable(Controller)) }
    def controller_value
      @controller
    end

    sig { params(controller: T.nilable(Controller)).returns(T.nilable(Controller)) }
    attr_writer :controller # :nodoc:

    # The view that adopted this one, or nil.
    sig { returns(T.nilable(View)) }
    attr_reader :superview

    # Adopted child views in adoption order.
    sig { returns(T::Array[View]) }
    attr_reader :subviews

    # The nearest controller through the sparse tree: this view's own
    # controller when it is a controller root, else the superview's owner.
    sig { returns(T.nilable(Controller)) }
    def owner
      own = @controller
      return own if own
      @superview&.owner
    end

    # Takes +child+ into this view, releasing it from any previous superview.
    # Structural only: it does not awaken or lay anything out.
    sig { params(child: View).returns(View) }
    def adopt_subview(child)
      previous = child.superview()
      previous.release_subview(child) if previous
      child.assign_superview(self)
      @subviews << child
      child
    end

    # Drops +child+ from this view.
    sig { params(child: View).void }
    def release_subview(child)
      @subviews = @subviews.select { |candidate| candidate != child }
      child.assign_superview(nil)
    end

    # Drops this view from its superview, if it has one.
    sig { void }
    def remove_from_superview
      superview = @superview
      superview.release_subview(self) if superview
    end

    # Tree-internal; adopt_subview and release_subview keep both sides consistent.
    sig { params(superview: T.nilable(View)).void }
    def assign_superview(superview) # :nodoc:
      @superview = superview
    end

    # The controller rooted here, else the superview.
    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      @controller || @superview
    end

    # ---- elements: the DOM work a controller leaves to its view ----

    # The View on an element, or nil when it has none.
    sig { params(element: Element).returns(T.nilable(View)) }
    def self.of(element)
      element.__swill_view__
    end

    # The controller rooted at an element, or nil.
    sig { params(element: Element).returns(T.nilable(Controller)) }
    def self.controller_for(element)
      view = View.of(element)
      view ? view.controller_value() : nil
    end

    # Whether the element carries +name+.
    sig { params(name: String).returns(T::Boolean) }
    def has_attribute?(name)
      @element.hasAttribute(name)
    end

    # Whether +element+ lies within this view's element.
    sig { params(element: Element).returns(T::Boolean) }
    def contains?(element)
      @element.contains(element)
    end

    # A fresh element from an inert template's content, or nil when the
    # template has none.
    sig { params(template: HTMLTemplateElement).returns(T.nilable(Element)) }
    def clone_template(template)
      node = template.content.firstElementChild
      node ? node.cloneNode(true) : nil
    end

    # Appends +element+ to this view's element.
    sig { params(element: Element).void }
    def append(element)
      @element.appendChild(element)
    end

    # Inserts +element+ after +anchor+.
    sig { params(anchor: Element, element: Element).void }
    def insert_after(anchor, element)
      anchor.after(element)
    end

    # Removes +element+ from the document.
    sig { params(element: Element).void }
    def remove(element)
      element.remove
    end

    # The direct child of this view's element that contains element, or nil.
    sig { params(element: Element).returns(T.nilable(Element)) }
    def child_containing(element)
      node = T.let(element, T.nilable(Element))
      node = node.parentElement while node && node.parentElement != @element
      node
    end

    # A state class on a child element.
    sig { params(element: Element, name: String, on: T::Boolean).void }
    def mark(element, name, on)
      element.classList.toggle(name, on)
    end

    # The selected state, as a class and for assistive technology.
    sig { params(element: Element, on: T::Boolean).void }
    def mark_selected(element, on)
      mark(element, "selected", on)
      element.setAttribute("aria-selected", on ? "true" : "false")
    end

    # Scrolls the nearest ancestor just far enough to bring +element+ into view.
    sig { params(element: Element).void }
    def reveal(element)
      element.scrollIntoView({block: "nearest"})
    end

    # Keyboard focus needs a tab stop.
    sig { void }
    def ensure_focusable
      @element.setAttribute("tabindex", "0") unless @element.hasAttribute("tabindex")
    end

    # Drop the browser's text selection, as before a shift-click sweep.
    sig { void }
    def clear_text_selection
      selection = @element.ownerDocument.getSelection
      selection.removeAllRanges if selection
    end

    # An event listener on this view's element; the returned callable
    # removes it.
    sig { params(type: String, handler: T.untyped, capture: T::Boolean).returns(T.proc.void) }
    def listen(type, handler, capture: false)
      @element.addEventListener(type, handler, capture)
      ->() { @element.removeEventListener(type, handler, capture) }
    end

    # ---- focus ----

    # The selector deciding what counts as focusable. Override to widen it.
    sig { returns(String) }
    def focusable_selector
      "input, select, textarea, button, [tabindex]"
    end

    # This element when it is focusable, else its first focusable descendant.
    sig { returns(T.nilable(Element)) }
    def first_focusable_element
      @element.matches(focusable_selector) ? @element : @element.querySelector(focusable_selector)
    end

    # Focuses the first focusable element, if there is one.
    sig { void }
    def focus_element
      target = first_focusable_element
      target.focus({preventScroll: true}) if target
    end

    # Blurs the first focusable element, if there is one.
    sig { void }
    def blur_element
      target = first_focusable_element
      target.blur if target
    end

    # A view wraps a focusable element, so it accepts by default; becoming
    # first responder focuses it.
    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      true
    end

    # Focuses the element.
    sig { override.returns(T::Boolean) }
    def become_first_responder
      focus_element
      true
    end
  end
end
