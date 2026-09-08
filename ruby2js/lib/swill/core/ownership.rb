# typed: true
# frozen_string_literal: true

module Swill
  # The one subtree-ownership walk. A wiring target owns its root and every
  # descendant above nested [controller] boundaries. Elements with only bind or
  # data-action attributes stay raw DOM; the walk never creates objects.
  module Ownership
    extend T::Sig

    sig { params(element: T.untyped, callback: T.proc.params(child: T.untyped).void).void }
    def each_child(element, callback)
      children = element.children
      index = 0
      while index < children.length
        callback.(children[index])
        index += 1
      end
    end

    # Visit root and its owned descendants. A nested controller root is a
    # boundary: neither it nor anything inside it belongs to this owner.
    sig { params(root: T.untyped, callback: T.proc.params(element: T.untyped).void).void }
    def each_owned(root, callback)
      callback.(root)
      each_child(root, ->(child) do
        each_owned(child, callback) unless child.hasAttribute("controller")
      end)
    end

    sig { params(root: T.untyped, selector: String).returns(T.untyped) }
    def owned_matching(root, selector)
      found = []
      each_owned(root, ->(element) do
        found.push(element) if element.matches(selector)
      end)
      found
    end
  end
end
