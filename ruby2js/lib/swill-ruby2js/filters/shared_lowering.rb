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
          super_defs(node.updated(:defs, [receiver, Knowledge.member(name).to_sym, args, body]))
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

        # Ruby forms with no JavaScript spelling, on a receiver whose class is
        # not known: nil? is a null check; a predicate name (dirty?, empty?)
        # and the core value methods JavaScript lacks (index, first, dup, ...)
        # go through the runtime's dynamic dispatch, which knows declared
        # members and carries Ruby's rule for plain values.
        RUBY_CORE_QUERIES = %i[is_a? kind_of? instance_of? respond_to? equal? eql?].freeze
        RUBY_VALUE_SENDS = %i[index first last dup compact uniq reverse sum min max take drop
                              to_s to_i to_f to_sym strip upcase downcase capitalize].freeze

        def lower_ruby_query(receiver, method, args)
          return nil if RUBY_CORE_QUERIES.include?(method)
          name = method.to_s
          if method == :nil? && args.empty?
            return s(:send, process(receiver), :==, s(:nil))
          end
          return nil unless name.end_with?("?") || RUBY_VALUE_SENDS.include?(method)
          runtime = s(:const, nil, :Runtime)
          return s(:call, runtime, :read, process(receiver), s(:str, name)) if args.empty?
          s(:call, runtime, :invoke, process(receiver), s(:str, name), *process_all(args))
        end

    end
  end
end
