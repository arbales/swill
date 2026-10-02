# frozen_string_literal: true

require "ruby2js"

module Swill
  module Ruby2JS
    # Corrections to the upstream converter, kept as narrow as its own
    # handlers, until they are fixed there.
    module ConverterPatches
      # Ruby2JS declares a local where it is first assigned as a statement.
      # One first assigned inside an expression, as in `if (match = find)` or
      # `(owner = element) && owner.contains?(other)`, it emits as a bare
      # assignment to an undeclared name, which strict mode rejects as a
      # ReferenceError, and records the name as declared so no later
      # assignment declares it either. Such a local is declared at the top of its scope
      # instead, the way Ruby2JS already declares one first assigned in an
      # `if` branch: marked pending, and declared as the scope closes.
      def on_lvasgn(name, value = nil)
        declared = @vars.key?(name)
        super
        # Upstream records it as declared although it wrote no `let`. A
        # binding with no value, such as a rescued error, is declared by its
        # own construct.
        @vars[name] = :pending if value && !declared && @state != :statement && @vars[name] == true
      end
    end
  end
end

Ruby2JS::Converter.prepend(Swill::Ruby2JS::ConverterPatches)
