# typed: true
# frozen_string_literal: true

module Swill
  # A `View` wraps one managed element and does the DOM work its controller
  # leaves to it. Only managed elements have a view: controller roots,
  # outlets, and elements awakened with `klass`. Views form a sparse tree that
  # mirrors controller nesting; elements between them are not wrapped.
  #
  # A view is responsible for:
  #
  # - its element, and the controller rooted at it, if any;
  # - its place in the view tree, through which a view finds its owner;
  # - reading and changing its element's subtree for its owner;
  # - focus within its element.
  #
  # See [Awakening](rdoc-ref:doc/awakening.md) for which elements become
  # managed.
  class View < Responder
    extend T::Sig

    # :section: Wrapping an Element
    # A view, its element, and the controller rooted there.

    # Creates the view for `element`, marking the element managed. An element
    # holds at most one view; `View.of` finds it.
    sig { params(element: Element).void }
    def initialize(element)
      super()
      @owns_content = T.let(false, T::Boolean)
      @element = element
      @controller = T.let(nil, T.nilable(Controller))
      @superview = T.let(nil, T.nilable(View))
      @subviews = T.let([], T::Array[View])
      element.__swill_view__ = self
    end

    # Template internals have their own connections, but stay in the view tree.
    sig { returns(T::Boolean) }
    def owns_content?
      @owns_content
    end

    sig { void }
    def unload
      owning_controller = @controller
      if owning_controller
        owning_controller.unload
        return
      end
      Application.shared.release_first_responder(@element) if Application.running?
      @subviews.dup.each(&:unload) # FIXME: Why do we need to dup this?
      dealloc
      remove_from_superview
      @element.__swill_view__ = nil
    end

    # The element this view wraps.
    sig { returns(Element) }
    attr_reader :element

    # Returns the controller rooted at this view, or nil when the view is not
    # a controller root. `owner` finds the controller a view belongs to.
    sig { returns(T.nilable(Controller)) }
    def controller_value
      @controller
    end

    sig { params(controller: T.nilable(Controller)).returns(T.nilable(Controller)) }
    attr_writer :controller # :nodoc:

    # :section: Forming the View Tree
    # Adoption links views into the tree that ownership is read from.

    # The view that adopted this one, or nil for a view outside the tree.
    sig { returns(T.nilable(View)) }
    attr_reader :superview

    # The views this one adopted, in adoption order; an empty array when there
    # are none.
    sig { returns(T::Array[View]) }
    attr_reader :subviews

    # Returns the controller this view belongs to: the controller rooted here,
    # or else the superview's owner. Returns nil for a view outside any
    # controller's region.
    sig { returns(T.nilable(Controller)) }
    def owner
      own = @controller
      return own if own

      @superview&.owner
    end

    # Adopts `child` as a subview, releasing it from any previous superview,
    # and returns it. Adoption changes the view tree only; it does not move
    # or awaken elements.
    sig { params(child: View).returns(View) }
    def adopt_subview(child)
      previous = child.superview()
      previous&.release_subview(child)
      child.assign_superview(self)
      @subviews << child
      child
    end

    # Releases `child` from this view's subviews, leaving it with no superview.
    sig { params(child: View).void }
    def release_subview(child)
      @subviews = @subviews.reject { |candidate| candidate == child }
      child.assign_superview(nil)
    end

    # Releases this view from its superview, if it has one.
    sig { void }
    def remove_from_superview
      superview = @superview
      superview&.release_subview(self)
    end

    # Set by adopt_subview and release_subview, which keep both sides consistent.
    sig { params(superview: T.nilable(View)).void }
    def assign_superview(superview) # :nodoc:
      @superview = superview
    end

    # :section: Working with Elements
    # Reading and changing this view's element and its subtree.

    # Returns the view wrapping `element`, or nil when the element is not
    # managed.
    sig { params(element: Element).returns(T.nilable(View)) }
    def self.of(element)
      element.__swill_view__
    end

    # Returns the controller rooted at `element`, or nil when none is.
    sig { params(element: Element).returns(T.nilable(Controller)) }
    def self.controller_for(element)
      view = View.of(element)
      view&.controller_value
    end

    # Returns whether this view's element carries the attribute `name`.
    sig { params(name: String).returns(T::Boolean) }
    def has_attribute?(name)
      @element.hasAttribute(name)
    end

    # Returns whether `element` lies within this view's element.
    sig { params(element: Element).returns(T::Boolean) }
    def contains?(element)
      @element.contains(element)
    end

    # A fresh template root, or a blank div when the template has no element.
    sig { params(template: HTMLTemplateElement).returns(Element) }
    def clone_template(template)
      node = template.content.firstElementChild
      node ? node.cloneNode(true) : @element.ownerDocument.createElement("div")
    end

    # Appends `element` as the last child of this view's element.
    sig { params(element: Element).void }
    def append(element)
      @element.appendChild(element)
    end

    # Inserts `element` immediately after `anchor`.
    sig { params(anchor: Element, element: Element).void }
    def insert_after(anchor, element)
      anchor.after(element)
    end

    # Removes `element` from the document.
    sig { params(element: Element).void }
    def remove(element)
      element.remove
    end

    # Returns the direct child of this view's element that contains
    # `element`, or nil when `element` is not within this view.
    sig { params(element: Element).returns(T.nilable(Element)) }
    def child_containing(element)
      node = T.let(element, T.nilable(Element))
      node = node.parentElement while node && node.parentElement != @element
      node
    end

    # Adds the class `name` to `element` when `on` is true, and removes it
    # otherwise.
    sig { params(element: Element, name: String, on: T::Boolean).void }
    def mark(element, name, on)
      element.classList.toggle(name, on)
    end

    # Marks `element` selected or not, as the `selected` class.
    sig { params(element: Element, on: T::Boolean).void }
    def mark_selected(element, on)
      mark(element, "selected", on)
    end

    # Scrolls the nearest scrolling ancestor just far enough to bring
    # `element` into view.
    sig { params(element: Element).void }
    def reveal(element)
      element.scrollIntoView({ block: "nearest" })
    end

    # Clears the browser's text selection, as before a shift-click extends
    # a list selection.
    sig { void }
    def clear_text_selection
      selection = @element.ownerDocument.getSelection
      selection&.removeAllRanges()
    end

    # Adds an event listener for `type` on this view's element and returns
    # a callable that removes it. A controller retains the callable so the
    # listener is removed when it unloads.
    sig { params(type: String, handler: T.untyped, capture: T::Boolean).returns(T.proc.void) }
    def listen(type, handler, capture: false)
      @element.addEventListener(type, handler, capture)
      -> { @element.removeEventListener(type, handler, capture) }
    end

    # :section: Focusing
    # What is focusable within this view, and the view as a responder.

    # Returns the selector that decides what counts as focusable within this
    # view. The default is `"input, select, textarea, button, [tabindex]"`.
    # Override it to widen or narrow the set.
    sig { returns(String) }
    def focusable_selector
      "input, select, textarea, button, [tabindex]"
    end

    # Gives this view's element a tab stop, `tabindex="0"`, unless it already
    # has one, so keyboard focus can reach it.
    sig { void }
    def ensure_focusable
      @element.setAttribute("tabindex", "0") unless @element.hasAttribute("tabindex")
    end

    # Returns this view's element when it matches `focusable_selector`, else
    # its default button, the descendant marked with the `default` class, as
    # a window's default button takes the keyboard first, else its first
    # focusable descendant. Returns nil when nothing within it is focusable.
    sig { returns(T.nilable(Element)) }
    def first_focusable_element
      return @element if @element.matches(focusable_selector)

      @element.querySelector(".default") || @element.querySelector(focusable_selector)
    end

    # Focuses `first_focusable_element` without scrolling, if there is one.
    sig { void }
    def focus_element
      target = first_focusable_element
      target&.focus({ preventScroll: true })
    end

    # Blurs `first_focusable_element`, if there is one.
    sig { void }
    def blur_element
      target = first_focusable_element
      target&.blur()
    end

    # Returns the controller rooted at this view, or else its superview. The
    # chain leaves the view tree at the first controller it meets.
    sig { override.returns(T.nilable(Responder)) }
    def next_responder
      @controller || @superview
    end

    # Returns true: a view always accepts first responder.
    sig { override.returns(T::Boolean) }
    def accepts_first_responder?
      true
    end

    # Focuses `first_focusable_element` and returns true.
    sig { override.returns(T::Boolean) }
    def become_first_responder # rubocop:disable Naming/PredicateMethod
      focus_element
      true
    end

    # :section: Accessibility
    # What assistive technology is told about the view, as NSAccessibility
    # tells it about an NSView.

    # Writes the view's ARIA roles, states and labels onto its element and
    # the parts it draws. This is the one place Swill writes them, and it
    # never reads them back: behavior and styles follow the view's own state
    # and classes, so ARIA is decoration for screen readers alone.
    #
    # The default labels a window by its title bar. A subclass overrides it,
    # calling `super`, and calls it again whenever what it describes changes;
    # a window's view is updated as the window opens.
    sig { void }
    def update_accessibility
      header = @element.firstElementChild
      return unless header && header.classList.contains("window-title")

      identifier = header.firstElementChild&.getAttribute("id")
      @element.setAttribute("aria-labelledby", identifier) if identifier
    end
  end
end
