# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Lowerings both surfaces share.
    module SharedLowering
      include ::Ruby2JS::Filter::SEXP
      include SorbetOperations

        # Ruby exceptions become JavaScript Error objects so browsers keep stack
        # traces and callers can tell errors from thrown values. Rescued errors
        # can be rethrown unchanged, preserving their identity and details.
        def lower_raise(args)
          if args.length == 1 && static_type(args.first) == "Error"
            return s(:send, nil, :raise, process(args.first))
          end
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

        # Methods, and on a class its static methods, either possibly wrapped
        # in async; a mixin's def self.included is interpreted at collection,
        # never compiled.
        # A mixin's own `def self.` is a module function rather than a member of
        # the layer, and is emitted separately onto the factory; the included
        # hook is a declaration, not code. Both are dropped from the body here.
        def class_body_statement?(statement)
          statement = statement.children[2] if Knowledge.async_wrapper?(statement)
          return true if statement.type == :def
          if statement.type == :casgn && !Knowledge.type_member_node?(statement)
            return @entry["kind"] == "class" || module_function_body?
          end
          return false unless statement.type == :defs
          @entry["kind"] == "class" || module_function_body?
        end

        # True while converting a module's functions into the statics of the
        # throwaway class they are lifted from.
        def module_function_body?
          @compiled_class.to_s.end_with?("_Functions")
        end

        # async def compiles to an async method, whose body may await; the
        # node is built without a location so the converter sees a method,
        # not a getter.
        def lower_async(node)
          inner = node.children[2]
          if inner.type == :def
            lowered = on_def(inner)
            s(:async, *lowered.children)
          else
            lowered = on_defs(inner)
            s(:asyncs, *lowered.children)
          end
        end

        # await is JavaScript's; it belongs inside an async method, and not
        # inside a block or lambda there, whose function is not the method.
        def lower_await(args)
          raise CompileError, "await takes one expression" unless args.length == 1
          raise CompileError, "await outside an async method; declare the method with async def" unless @in_async
          s(:send, nil, :await, process(args.first))
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
