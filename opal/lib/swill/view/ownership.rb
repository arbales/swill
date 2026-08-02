# backtick_javascript: true

module Swill
  # The one subtree-ownership walk. A wiring target owns its root and every
  # descendant above nested [controller] boundaries; walking from a generated
  # fragment's root (a list row) naturally scopes ownership to the fragment
  # even though a controller sits above it in the DOM.
  module Ownership
    module_function

    # Call +block+ with the owned elements under +root+, stopping descent at
    # nested [controller] boundaries. The boundary element itself is yielded
    # only when +include_boundaries+ — outlets may name a child controller,
    # bindings never cross into one.
    def each_owned(root, include_root: true, include_boundaries: false, &block)
      block.call(root) if include_root
      walk = lambda do |element|
        `Array.from(#{element}.children)`.each do |child|
          if `#{child}.hasAttribute("controller")`
            block.call(child) if include_boundaries
          else
            block.call(child)
            walk.call(child)
          end
        end
      end
      walk.call(root)
    end

    def owned_matching(root, selector, include_root: true, include_boundaries: false)
      found = []
      each_owned(root, include_root: include_root, include_boundaries: include_boundaries) do |element|
        found << element if `#{element}.matches(#{selector})`
      end
      found
    end
  end
end
