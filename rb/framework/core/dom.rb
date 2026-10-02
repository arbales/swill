# typed: true
# frozen_string_literal: true

module Swill
  # Walking the document. An element that owns its element — a View — keeps its
  # DOM work as methods there; these take an element rather than being on one.
  module DOM
    extend T::Sig

    # An element's children are an HTMLCollection, not an array.
    sig { params(element: Element, callback: T.proc.params(child: Element).void).void }
    def self.each_child(element, callback)
      children = element.children
      index = 0
      while index < children.length
        callback.(children[index])
        index += 1
      end
    end

    # Focuses +element+ without scrolling to it, the one way the framework
    # moves focus. See `DOM.focus_revealing` for a move the user made, which
    # should bring the element into view.
    sig { params(element: Element).void }
    def self.focus(element)
      element.focus({preventScroll: true})
    end

    # Focuses +element+ and scrolls it into view, as the browser does when
    # Tab moves to it.
    sig { params(element: Element).void }
    def self.focus_revealing(element)
      element.focus
    end

    # Walks one connection region. Child controllers and templated controls
    # are visited as boundaries, but their internals belong to them.
    # +include_root+ visits root as well.
    sig do
      params(root: Element, include_root: T::Boolean,
             callback: T.proc.params(element: Element, controller_root: T::Boolean).void).void
    end
    def self.each_owned(root, include_root, callback)
      callback.(root, false) if include_root
      DOM.each_child(root, ->(child) do
        view = child.__swill_view__
        if child.hasAttribute("controller") || (view && view.owns_content?)
          callback.(child, true)
        else
          DOM.each_owned(child, true, callback)
        end
      end)
    end

    # Whether the element a key event targets handles the key itself, the way
    # Cocoa's field editor keeps the keys that edit text. Such a key is
    # finished: nothing in the chain sees it. A field keeps what moves within
    # its text; Enter, Escape and Tab, and Up and Down in a single line, are
    # commands for the chain. A composition in progress belongs to the input
    # method whatever the key.
    sig { params(event: KeyboardEvent).returns(T::Boolean) }
    def self.handles_key?(event)
      return true if event.isComposing
      element = event.target
      key = event.key
      tag = element.tagName
      if tag == "TEXTAREA" || element.isContentEditable
        return key != "Escape" && key != "Tab"
      end
      if tag == "SELECT"
        return key != "Enter" && key != "Escape" && key != "Tab"
      end
      return key == "Enter" || key == " " if tag == "BUTTON"
      return false unless tag == "INPUT"
      case element.type
      when "button", "submit", "reset" then key == "Enter" || key == " "
      when "checkbox" then key == " "
      when "radio" then key == " " || key.start_with?("Arrow")
      when "range" then key.start_with?("Arrow") || key == "Home" || key == "End"
      when "", "text", "search", "email", "url", "tel", "password"
        !["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown"].include?(key)
      else
        # Number and date inputs step with Up and Down.
        key != "Enter" && key != "Escape" && key != "Tab"
      end
    end

    # Owned elements matching +selector+, child controller roots excluded.
    sig { params(root: Element, selector: String).returns(T::Array[Element]) }
    def self.owned_matching(root, selector)
      found = T.let([], T::Array[Element])
      DOM.each_owned(root, true, ->(element, _controller_root) do
        found << element if (element == root || !element.hasAttribute("controller")) && element.matches(selector)
      end)
      found
    end
  end
end
