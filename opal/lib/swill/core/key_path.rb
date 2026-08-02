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
      segments.reduce(root) { |node, segment| step(node, segment) }
    end

    # Read one segment off +node+. nil if +node+ is nil or has no such reader.
    def step(node, segment)
      return nil if node.nil?

      if node.is_a?(Hash)
        key = Indifferent.locate(node, segment)
        return node[key] unless key.nil?
      end

      node.respond_to?(segment) ? node.public_send(segment) : nil
    end

    # Whether the path currently resolves to a Ruby writer. +nil+ means an
    # intermediate object has not appeared yet, so callers should validate
    # again when accepting a future write.
    def writable?(root, segments)
      return false if segments.empty?

      *leading, last = segments
      target = read(root, leading)
      return nil if target.nil?

      target.respond_to?("#{last}=")
    end

    def write!(root, segments, value)
      writable = writable?(root, segments)
      raise NoMethodError, "binding path #{segments.join('.').inspect} is not writable" if writable == false
      return if writable.nil?

      *leading, last = segments
      read(root, leading).public_send("#{last}=", value)
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
      rehook = lambda do |from|
        (from...segments.length).each do |level|
          disposers[level]&.call
          disposers[level] = nil
        end

        owner = read(root, segments[0...from])
        (from...segments.length).each do |level|
          break if owner.nil?

          if owner.respond_to?(:observe)
            disposers[level] = owner.observe(segments[level]) do
              on_change.call
              rehook.call(level + 1)
            end
          end

          owner = step(owner, segments[level])
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
