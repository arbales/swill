# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Lowerings both surfaces share.
    module SharedLowering
      include ::Ruby2JS::Filter::SEXP
      include SorbetOperations

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

        # respond_to? asks the installed metadata, never the JavaScript object
        # shape; the name must be a literal so the question stays static.
        def lower_respond_to(receiver, args)
          unless args.length == 1 && %i[sym str].include?(args.first.type)
            raise CompileError, "respond_to? requires a literal method name"
          end
          s(:call, s(:const, nil, :Runtime), :respondsTo,
            receiver ? process(receiver) : s(:self), s(:str, args.first.children.first.to_s))
        end

        # A static method keeps its JavaScript spelling; while its body is
        # lowered, a bare new means the class itself.
        def lower_defs(node)
          receiver, name, args, body = node.children
          previous = @in_class_method
          @in_class_method = true
          # A location-less node is a method to the converter; with the
          # source location a zero-argument def self.x would become a
          # static getter.
          super_defs(s(:defs, receiver, Knowledge.member(name).to_sym, args, body))
        ensure
          @in_class_method = previous
        end

        # Methods, and on a class its static methods; a mixin's def self.included
        # is interpreted at collection, never compiled.
        def class_body_statement?(statement)
          statement.type == :def || (statement.type == :defs && @entry["kind"] == "class")
        end

        def bare_new?(receiver, method)
          receiver.nil? && method == :new && @in_class_method
        end

        # Kernel#warn, unless the entry defines its own.
        def warn_call?(receiver, method)
          receiver.nil? && method == :warn && !@knowledge.method_defined?(@entry["name"], :warn)
        end

        def lower_warn(args)
          raise CompileError, "warn takes one message" unless args.length == 1
          s(:call, s(:const, nil, :Runtime), :warn, process(args.first))
        end

    end
  end
end
