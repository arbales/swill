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

    # Walks the elements a controller owns. An element carrying controller is a
    # child controller's root: it is visited, with +controller_root+ true, but
    # not descended into. +include_root+ visits root as well.
    sig do
      params(root: Element, include_root: T::Boolean,
             callback: T.proc.params(element: Element, controller_root: T::Boolean).void).void
    end
    def self.each_owned(root, include_root, callback)
      callback.(root, false) if include_root
      DOM.each_child(root, ->(child) do
        if child.hasAttribute("controller")
          callback.(child, true)
        else
          DOM.each_owned(child, true, callback)
        end
      end)
    end

    # Owned elements matching +selector+, child controller roots excluded.
    sig { params(root: Element, selector: String).returns(T::Array[Element]) }
    def self.owned_matching(root, selector)
      found = T.let([], T::Array[Element])
      DOM.each_owned(root, true, ->(element, controller_root) do
        found << element if !controller_root && element.matches(selector)
      end)
      found
    end
  end
end
