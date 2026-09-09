# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Last in the filter chain: only calls not lowered by a built-in reach here.
    # Do not preempt Pragma with a catch-all :call conversion.
    module RubyCalls
      include ::Ruby2JS::Filter::SEXP

        def on_send(node)
          receiver, method, *args = node.children
          return super if %i[new raise lambda proc].include?(method)
          # Operators and indexing are native converter syntax, not named methods.
          return super if ::Ruby2JS::Filter::Processor::BINARY_OPERATORS.include?(method) ||
            %i[[] []=].include?(method)
          s(:call, receiver ? process(receiver) : s(:self),
            Knowledge.member(method).to_sym, *process_all(args))
        end

    end
  end
end
