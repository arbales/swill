# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Sorbet's runtime operations, compiled instead of bundled: the finite set
    # of `T` methods executable code may use. Each keeps sorbet-runtime's
    # behavior (a failed check raises) and tells the static typer what the
    # expression's type is, so `T.must(person).name` lowers like a typed
    # local. Any other `T` construct is rejected at collection.
    module SorbetOperations
      include ::Ruby2JS::Filter::SEXP

        # method => [arity, whether the last argument is a type]
        OPERATIONS = {
          must: [1, false], unsafe: [1, false], absurd: [1, false],
          cast: [2, true], let: [2, true], assert_type!: [2, true]
        }.freeze

        # The types a check can name: the declaration types plus Float,
        # Symbol, NilClass, and T.untyped. Unions, procs, and generics other
        # than Array and Hash are not checkable here.
        TYPE = /\A(?:String|Integer|Float|Symbol|NilClass|T::Boolean|T\.untyped|T\.nilable\((?:String|Integer|Float|Symbol|[A-Z]\w*(?:::\w+)*)\)|T::(?:Array|Hash)\[[\w:., ]+\]|[A-Z]\w*(?:::\w+)*)\z/

        def self.operation?(node)
          return false unless node.respond_to?(:type) && node.type == :send
          receiver, method, = node.children
          receiver.respond_to?(:type) && receiver.type == :const &&
            receiver.children == [nil, :T] && OPERATIONS.key?(method)
        end

        # [value node, type text or nil]; raises for the wrong shape.
        def self.arguments(node)
          _, method, *args = node.children
          arity, typed = OPERATIONS.fetch(method)
          unless args.length == arity
            raise CompileError, "T.#{method} takes #{arity} argument(s), not #{args.length}"
          end
          return [args.first, nil] unless typed
          type = type_text(args.last)
          unless type&.match?(TYPE)
            raise CompileError, "unsupported type in T.#{method}: #{args.last.loc.expression.source}"
          end
          [args.first, type]
        end

        def self.type_text(node)
          return nil unless node.respond_to?(:loc) && node.loc&.expression
          node.loc.expression.source.gsub(/\s+/, "").gsub(",", ", ")
        end

        def lower_sorbet(node)
          return nil unless SorbetOperations.operation?(node)
          method = node.children[1]
          value, type = SorbetOperations.arguments(node)
          runtime = s(:const, nil, :Runtime)
          case method
          when :must then s(:call, runtime, :must, process(value))
          when :absurd then s(:call, runtime, :absurd, process(value))
          when :unsafe then process(value)
          else s(:call, runtime, :cast, process(value), s(:str, checkable_type(type, method)))
          end
        end

    private

        # The runtime checks a class type by name, so a constant is resolved
        # to the name the class is installed under. Element types of Array and
        # Hash are not checked, as in sorbet-runtime, and stay as written.
        def checkable_type(type, method)
          inner = type[/\AT\.nilable\((.+)\)\z/, 1] || type
          return type unless inner.match?(/\A[A-Z]\w*(?:::\w+)*\z/) && !%w[String Integer Float Symbol NilClass].include?(inner)
          resolved = begin
            @knowledge.resolve(inner, @scope)
          rescue CompileError
            nil
          end
          entry = resolved && @knowledge.entries.find { |candidate| candidate["name"] == resolved }
          if entry
            raise CompileError, "T.#{method} to #{inner}: a mixin is not checkable" unless entry["kind"] == "class"
            return type.sub(inner, resolved)
          end
          return type if @entry["javascript_only"] && JS_INTRINSICS.include?(inner)
          raise CompileError, "T.#{method} to #{inner}: not a class the runtime can check"
        end

    end
  end
end
