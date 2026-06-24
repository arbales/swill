# frozen_string_literal: true

module Swill
  # Read, write, and observe a dotted key path such as "address.city" across a
  # graph of objects. Pure Ruby — no DOM — so the bindings layer can sit on top
  # and this can be tested under MRI directly.
  #
  # Traversal is duck-typed: each segment is an ordinary reader (public_send),
  # writes go through the leaf's setter, and observation uses any segment owner
  # that responds to `observe` (i.e. includes Swill::Observable). Intermediate
  # objects that are not observable simply don't propagate their own
  # reassignment — the same pragmatic limit the TypeScript path bindings have.
  module KeyPath
    module_function

    # Walk the path from +root+. Returns nil if any intermediate is nil or does
    # not expose the next segment.
    def read(root, segments)
      node = root
      segments.each do |segment|
        return nil if node.nil?

        node = node.respond_to?(segment) ? node.public_send(segment) : nil
      end
      node
    end

    # Assign +value+ at the end of the path. No-op when the path is empty, an
    # intermediate is nil, or the leaf owner has no setter.
    def write(root, segments, value)
      return if segments.empty?

      *leading, last = segments
      target = read(root, leading)
      return if target.nil?

      setter = "#{last}="
      target.public_send(setter, value) if target.respond_to?(setter)
    end

    # Subscribe to changes anywhere along the path. +on_change+ is called when
    # the leaf value may have changed — either because the leaf itself changed
    # or because an intermediate was reassigned, in which case the downstream
    # segments are re-subscribed against the new subtree. Returns a lambda that
    # unsubscribes everything.
    def observe(root, segments, &on_change)
      return -> {} if segments.empty?

      disposers = Array.new(segments.length)

      rehook = nil
      rehook = lambda do |start_level|
        (start_level...segments.length).each do |level|
          disposers[level]&.call
          disposers[level] = nil
        end

        owner = read(root, segments[0...start_level])
        (start_level...segments.length).each do |level|
          break if owner.nil?

          if owner.respond_to?(:observe)
            captured = owner
            disposers[level] = captured.observe(segments[level]) do
              on_change.call
              rehook.call(level + 1)
            end
          end

          segment = segments[level]
          owner = owner.respond_to?(segment) ? owner.public_send(segment) : nil
        end
      end

      rehook.call(0)
      lambda do
        disposers.each { |disposer| disposer&.call }
        disposers.fill(nil)
      end
    end
  end
end
