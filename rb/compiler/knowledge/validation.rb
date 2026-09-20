# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # What a method body may contain. Declarations are no longer read here:
    # the class body runs, and the compiler reflects on what it declared.
    class Knowledge
      private

        # Validate source before filters can erase or transform it (Pragma can
        # extract type hints from T.let, which is not annotation-only on MRI).
        def validate_expression!(node)
          return unless node.respond_to?(:type)
          # T.must and the other compiled Sorbet operations: the value is
          # validated; the type argument is annotation, checked for shape here.
          if SorbetOperations.operation?(node)
            value, = SorbetOperations.arguments(node)
            return validate_expression!(value)
          end
          if node.type == :const
            name = constant(node)
            if name == "T" || name.start_with?("T::")
              raise CompileError, "unsupported runtime Sorbet construct #{name}"
            end
          elsif node.type == :send &&
                %i[public_send send __send__ const_get define_method instance_exec eval method_missing].include?(node.children[1])
            raise CompileError, "runtime reflection #{node.children[1]} is outside this spike"
          end
          node.children.each { |child| validate_expression!(child) }
        end

    end
  end
end
