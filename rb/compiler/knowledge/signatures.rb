# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Sorbet signatures and source ranges read for lowering.
    class Knowledge
      private

        # sig { ... }, or T::Sig::WithoutRuntime.sig { ... }, which is the
        # only way to type a method whose optional parameters come first:
        # sorbet-runtime refuses to wrap one, though Sorbet checks it.
        def signature?(node)
          return false unless node.type == :block
          call = node.children.first
          return false unless call.type == :send && call.children[1] == :sig
          receiver = call.children.first
          receiver.nil? || (receiver.type == :const && constant(receiver) == "T::Sig::WithoutRuntime")
        end

        def signature_parameters(signature)
          return {} unless signature
          params = find_send(signature.children.last, :params)
          hash = params&.children&.find { |child| child.respond_to?(:children) && child.type == :hash }
          return {} unless hash
          hash.children.to_h do |pair|
            name, type = pair.children
            [name.children.first.to_s, type.loc.expression.source]
          end.compact
        end

        def signature_return(signature)
          return nil unless signature
          body = signature.children.last
          # Follow the signature chain, not proc types nested in its arguments.
          while body&.type == :send
            receiver, method, type = body.children
            return "void" if method == :void
            return type&.loc&.expression&.source if method == :returns
            body = receiver
          end
          nil
        end

        # The block body from its first expression to its closer, including
        # trailing comments where type pragmas live. Only expression ranges are
        # used: the parser gem and Ruby2JS's Prism walker both provide them, while
        # their opener/closer token locations differ.
        def block_body_source(node)
          range = node.loc.expression
          body = node.children.last
          return "nil" unless body
          closer = range.source.end_with?("}") ? 1 : 3
          range.class.new(range.source_buffer, body.loc.expression.begin_pos, range.end_pos - closer).source
        end

        def find_send(node, method)
          return unless node.respond_to?(:children)
          return node if node.type == :send && node.children[1] == method
          node.children.each do |child|
            found = find_send(child, method)
            return found if found
          end
          nil
        end

    end
  end
end
