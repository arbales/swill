# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Lowerings both surfaces share.
    module SharedLowering
      include ::Ruby2JS::Filter::SEXP

        # Ruby exceptions become JavaScript Error objects so browsers keep stack
        # traces and callers can tell errors from thrown values. Only a literal
        # message is supported; other forms fail closed.
        def lower_raise(args)
          unless args.length == 1 && %i[str dstr].include?(args.first.type)
            raise CompileError, "raise supports only a literal message string"
          end
          s(:send, nil, :raise, s(:const, nil, :Error), process(args.first))
        end

        # Ruby invokes a callable with `call` or `.()`; JavaScript calls the value.
        # A local is called directly. Any other receiver uses Function.prototype.call
        # with an explicit null receiver, which Ruby2JS would otherwise emit with
        # the first argument in the receiver position.
        def lower_call(receiver, args)
          if receiver.type == :lvar
            s(:call, nil, receiver.children.first, *process_all(args))
          else
            s(:send, process(receiver), :call, s(:nil), *process_all(args))
          end
        end

        # `expression.new(args)` where the class comes from a call. JavaScript's
        # `new a.b(x)(y)` constructs `a.b`, so the receiver must be parenthesized.
        def lower_new(receiver, args)
          s(:send, s(:begin, process(receiver)), :new, *process_all(args))
        end

        def constructed_from_call?(receiver, method)
          method == :new && receiver && %i[send call].include?(receiver.type)
        end

    end
  end
end
