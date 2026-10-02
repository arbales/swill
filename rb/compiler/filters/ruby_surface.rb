# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Ruby2JS extension points, not textual substitutions over generated JS.
    # Explicitly chosen semantics: Ruby truthiness, value equality, Ruby method
    # calls (even without parentheses), and shared dynamic/static value readers.
    # Wraps the built-in so framework properties and Ruby semantics take priority
    # over its type inference. Unhandled nodes flow through Pragma via super.
    module RubySurface
      include ::Ruby2JS::Filter::Pragma
      include SharedLowering
      include StaticTypes
      include CoreTypes

        def options=(options)
          super
          @knowledge = options.fetch(:knowledge)
          # Ruby2JS reserves :scope for an object supplying instance variables.
          @scope = options.fetch(:spike_scope)
          @properties = options.fetch(:properties)
          @property_types = options.fetch(:property_types)
          @compiled_class = options[:compiled_class]
          @compiled_parent = options[:compiled_parent]
          @entry = options.fetch(:entry)
          @local_types = {}
          # From the entry's own AST, not the source being converted: a
          # computed property's block is converted on its own, and an
          # instance variable means the same thing there as in a method.
          @ivar_types = {}
          infer_ivar_types(nil) if @entry["node"]
        end

        def on_class(node)
          # Lower only the header here. Constants in method bodies still
          # resolve in Ruby's source scope, not against implementation-local names.
          # Declarations have already been collected. Keep the original source and
          # locations so Pragma sees comments, including those on the final line.
          # Visibility is Ruby's: a bare `private` is dropped and `private def`
          # is the definition inside it, so every method is emitted as an
          # ordinary JavaScript method.
          body = @knowledge.statements(node.children.last).flat_map do |statement|
            statement = Knowledge.unwrap_visibility(statement)
            attribute_accessors(statement) || (class_body_statement?(statement) ? [statement] : [])
          end.map { |statement| process(statement) }
          body.reject! { |statement| statement.type == :begin && statement.children.empty? }
          s(:class, s(:const, nil, @compiled_class.to_sym),
            s(:const, nil, @compiled_parent.to_sym), s(:begin, *body))
        end

        def on_module(node)
          on_class(node)
        end

        # attr_reader :name is a native getter and attr_writer :name a native
        # setter, the form def name=(value) already takes. They are spelled
        # here rather than by the converter so the getter carries the
        # member's JavaScript name.
        def attribute_accessors(statement)
          return nil unless statement.type == :send && statement.children.first.nil?
          kind = statement.children[1]
          return nil unless %i[attr_reader attr_writer attr_accessor].include?(kind)
          statement.children[2..].flat_map do |symbol|
            name = symbol.children.first
            ivar = :"@#{name}"
            reader = statement.updated(:defget, [Knowledge.member(name).to_sym, s(:args), s(:ivar, ivar)])
            writer = statement.updated(:def, [:"#{name}=", s(:args, s(:arg, name)), s(:ivasgn, ivar, s(:lvar, name))])
            case kind
            when :attr_reader then [reader]
            when :attr_writer then [writer]
            else [reader, writer]
            end
          end
        end

        def on_def(node)
          name, args, body = node.children
          method = @entry["methods"].find { |candidate| candidate["name"] == name.to_s }
          # A ClassMethods layer compiles its methods as instance methods of
          # a placeholder; inside them self is the class.
          static = false
          unless method
            method = @entry.fetch("class_method_entries", []).find { |candidate| candidate["name"] == name.to_s }
            static = !method.nil?
          end
          previous = @local_types
          previous_method = @current_method
          previous_async = @in_async
          previous_static = @in_class_method
          @current_method = method
          @in_async = method ? method["async"] == true : false
          @in_class_method = static
          local_types_for(method, body)
          if method && method["complex"]
            args, body = complex_definition(method, args, body)
            js = Knowledge.member(name)
          else
            js, args = variant_definition(method, name, args)
          end
          # Ruby2JS's explicit method node preserves source locations for filters.
          super(node.updated(:defm, [js.to_sym, args, body]))
        ensure
          @local_types = previous
          @current_method = previous_method
          @in_async = previous_async
          @in_class_method = previous_static
        end

        # A method with optional parameters compiles to one JavaScript method
        # per arity. The definition carrying the defaults is the widest one;
        # a generated shim, which has no defaults, is the variant its own
        # parameter count names.
        def variant_definition(method, name, args)
          return [Knowledge.member(name), args] unless method && method["formals"]
          variant = if args.children.any? { |arg| arg.type == :optarg }
            Knowledge.variants(method).last
          else
            Knowledge.variant_for(method, args.children.length)
          end
          required = args.updated(nil, args.children.map do |arg|
            arg.type == :optarg ? arg.updated(:arg, [arg.children.first]) : arg
          end)
          [variant ? variant["js"] : Knowledge.member(name), required]
        end

        # The argument count says which member of a method's family a send
        # means, and which of its parameters the arguments land on.
        # A reader declared with attr_reader or attr_accessor is a native
        # getter; anything else collected is a method and is called.
        def accessor?(entry, args)
          return false unless entry["accessor"]
          raise CompileError, "#{entry['name']} is an attribute reader and takes no arguments" unless args.empty?
          true
        end

        def dispatched(entry, args)
          if entry["complex"]
            return [entry["js"].to_sym, *complex_call_arguments(entry, args)]
          end
          variant = Knowledge.variant_for(entry, args.length)
          unless variant
            accepted = Knowledge.variants(entry).map { |candidate| candidate["arity"] }.join(", ")
            raise CompileError,
              "wrong number of arguments for #{entry['name']}: #{args.length} (accepts #{accepted})"
          end
          [variant["js"].to_sym, *typed_arguments(entry, args, variant["taken"])]
        end

        def on_const(node)
          name = @knowledge.constant(node)
          return s(:const, nil, :Runtime) if name == "Swill::Runtime"
          # Built-in filters introduce JS intrinsics as locationless nodes. Source
          # constants still use the spike's namespace rules, even with these names.
          return node if !node.loc && JS_INTRINSICS.include?(name)
          if (member = @knowledge.constant_member(name, @scope, @entry))
            return s(:const, s(:const, nil, Knowledge.identifier(member[0]).to_sym), member[1].to_sym)
          end
          resolved = begin
            @knowledge.resolve(name, @scope)
          rescue CompileError
            # The handwritten runtime, the browser's own classes, and the
            # intrinsics pass through by name when no source constant matches.
            return s(:const, nil, :Runtime) if name == "Runtime"
            return node if JS_INTRINSICS.include?(name) || DOM.native?(name)
            raise
          end
          s(:const, nil, Knowledge.identifier(resolved).to_sym)
        end

        # Bare super forwards bound locals, including defaults and reassignment.
        # The incoming block is forwarded even when a named &block was replaced.
        def on_zsuper(node)
          return super unless @current_method && @current_method["complex"]

          arguments = []
          keywords = []
          @current_method.fetch("formals").each do |formal|
            value = s(:lvar, formal["name"].to_sym)
            case formal["kind"]
            when "req", "opt" then arguments << value
            when "rest" then arguments << s(:splat, value)
            when "keyreq", "key" then keywords << s(:pair, s(:sym, formal["name"].to_sym), value)
            when "keyrest" then keywords << s(:kwsplat, value)
            end
          end
          unless keywords.empty?
            arguments << s(:call, s(:const, nil, :Runtime), :keywordArguments, process(s(:hash, *keywords)))
          end
          arguments << forwarded_super_block
          node.updated(:super, arguments)
        end

        def on_super(node)
          return super unless @current_method
          # Constructors have one native entry, rather than an arity family.
          return super if @current_method["name"] == "initialize"

          name, *arguments = dispatched(@current_method, node.children)
          if @current_method["complex"] && node.children.none? { |arg| arg.type == :block_pass }
            arguments << forwarded_super_block
          end
          s(:call, s(:lvar, :super), name, *arguments)
        end

        def on_if(node)
          condition, if_true, if_false = node.children
          s(:if, ruby_truthy(condition),
            if_true && process(if_true), if_false && process(if_false))
        end

        def on_and(node)
          left, right = node.children
          logical_expression(:and, left, right)
        end

        def on_or(node)
          left, right = node.children
          logical_expression(:or, left, right)
        end

        # A block on a typed array or hash lowers through the core type
        # tables, with block parameters typed from the element or entry types.
        # A block on an untyped receiver has no lowering: only a statically
        # resolved collected method or typed collection can define its call shape.
        def on_block(node)
          return lower_in_development(node) if in_development_block?(node)
          # A block is called at a fixed arity by whatever yields to it, so an
          # optional parameter would only ever take its default.
          if node.children[1].children.any? { |arg| arg.type == :optarg }
            raise CompileError, "a block takes required arguments only"
          end
          previous_async = @in_async
          # A block or lambda is its own function: no await inside it.
          @in_async = false
          call, block_args, body = node.children
          if call.type == :send && (entry = collected_call_entry(call)) && entry["complex"]
            block_formal = entry.fetch("formals", []).find { |formal| formal["kind"] == "block" }
            type = block_formal && entry.fetch("parameters", {})[block_formal["name"]]
            callback = process_lambda(s(:block, s(:send, nil, :lambda), block_args, body), proc_parameter_types(type))
            carrier = s(:call, s(:const, nil, :Runtime), :blockArgument, callback)
            return process(call.updated(nil, [*call.children, carrier]))
          end
          lower_block(node)
        ensure
          @in_async = previous_async
        end

        def lower_block(node)
          call, args, body = node.children
          return super_block(node) unless call.type == :send
          receiver, method, *call_args = call.children
          # A block on a native receiver is a JavaScript callback, its
          # parameters typed as the DOM member declares them.
          if receiver && native_type?(static_type(receiver))
            types = native_callback_types(static_type(receiver), method, call_args.length) || []
            return with_parameter_types(args, types, body) { super_block(node) }
          end
          if receiver && dynamic_receiver?(receiver)
            raise CompileError, "block call #{method} on an untyped receiver; give #{receiver.loc.expression.source} a static type"
          end
          type = receiver && static_type(receiver)
          kind = core_kind(type)
          if kind
            lowered = lower_core_block(node, kind, type, receiver, method, call_args, args, body)
            return lowered if lowered
          end
          super_block(node)
        end

        def super_block(node)
          method(:on_block).super_method.call(node)
        end

        # T.let on an assignment is lowered here, before Pragma would erase it
        # without its check. The local's static type comes from the declared
        # type through infer_local_types.
        def on_lvasgn(node)
          name, value = node.children
          return super unless SorbetOperations.operation?(value)
          node.updated(nil, [name, process(value)])
        end

        def on_ivasgn(node)
          name, value = node.children
          return super unless SorbetOperations.operation?(value)
          node.updated(nil, [name, process(value)])
        end

        def on_defs(node)
          receiver, name, args, body = node.children
          method = @knowledge.static_method_entry(@entry["name"], name)
          previous = @local_types
          previous_method = @current_method
          previous_async = @in_async
          previous_static = @in_class_method
          @current_method = method
          @in_async = method ? method["async"] == true : false
          @in_class_method = true
          local_types_for(method, body)
          if method && method["complex"]
            args, body = complex_definition(method, args, body)
            super_defs(s(:defs, receiver, Knowledge.member(name).to_sym, args, body))
          elsif method && method["formals"]
            js, args = variant_definition(method, name, args)
            super_defs(s(:defs, receiver, js.to_sym, args, body))
          else
            lower_defs(node)
          end
        ensure
          @local_types = previous
          @current_method = previous_method
          @in_async = previous_async
          @in_class_method = previous_static
        end

        # The converter's own defs handling, reached from lower_defs.
        def super_defs(node)
          method(:on_defs).super_method.call(node)
        end

        def on_send(node)
          receiver, method, *args = node.children
          # Expand before typed dispatch; Ruby2JS's generic expansion runs
          # after our collection checks and before block parameters are typed.
          if node.type == :send && args.last&.type == :block_pass && args.last.children.first&.type == :sym
            name = args.last.children.first.children.first
            parameters = [:__swill_item]
            parameters << :__swill_other if OPERATORS.include?(name)
            body = node.updated(:send, [s(:lvar, parameters.first), name,
                     *parameters.drop(1).map { |parameter| s(:lvar, parameter) }])
            call = node.updated(nil, [receiver, method, *args[0...-1]])
            return on_block(node.updated(:block, [call, s(:args, *parameters.map { |parameter| s(:arg, parameter) }), body]))
          end
          if bare_new?(receiver, method)
            entry = @knowledge.method_entry(@entry["name"], :initialize)
            return s(:send, s(:self), :new, *complex_call_arguments(entry, args)) if entry && entry["complex"]
            return s(:send, s(:self), :new, *process_all(args))
          end
          # The lowerings below would keep the call and drop the nil guard, and
          # JavaScript's ?. yields undefined where Ruby yields nil.
          # Safe navigation reaches a member the compiler resolves statically:
          # a DOM member, or a declared property or collected method of a
          # framework class. A core value type lowers through a helper taking
          # the receiver as an argument, and an untyped receiver through
          # Runtime.read; neither is something ?. can guard.
          # A proc called through safe navigation (stop&.()) is JavaScript's
          # optional call, which skips nil as Ruby does.
          if node.type == :csend && method == :call && proc_type?(static_type(receiver))
            return s(:csend, process(receiver), :call, s(:nil), *process_all(args))
          end
          if node.type == :csend && !safe_navigable?(receiver)
            raise CompileError, "safe navigation (&.) is not lowered on #{describe_receiver(receiver)}; " \
              "guard #{receiver.loc.expression.source} with a local"
          end
          return lower_async(node) if Knowledge.async_wrapper?(node)
          if receiver.nil? && method == :__swill_variant_body
            name, *values = args
            owner = s(:const, nil, @compiled_class.to_sym)
            owner = s(:attr, owner, :prototype) unless @in_class_method
            return s(:call, s(:attr, owner, name.children.first), :call, s(:self), *process_all(values))
          end
          return lower_await(args) if receiver.nil? && method == :await
          return lower_sorbet(node) if SorbetOperations.operation?(node)
          return lower_raise(args) if receiver.nil? && method == :raise
          return lower_new(receiver, args) if constructed_from_call?(receiver, method)
          return lower_warn(args) if warn_call?(receiver, method)
          return lower_puts(args) if puts_call?(receiver, method)
          return lower_respond_to(receiver, args) if method == :respond_to?
          if receiver.nil? && method == :block_given? && args.empty? && @current_method
            block = @current_method.fetch("formals", []).find { |formal| formal["kind"] == "block" }
            name = block ? block["name"] : "_implicitBlockYield"
            return s(:send, s(:lvar, name.to_sym), :!=, s(:nil))
          end
          if receiver&.type == :self && method == :class && args.empty?
            return s(:attr, s(:self), :constructor)
          end
          if %i[== !=].include?(method)
            right = args.fetch(0)
            if native_equality?(static_type(receiver), static_type(right))
              return s(:send, process(receiver), method, process(right))
            end
            equality = s(:call, s(:const, nil, :Runtime), :isEqual, process(receiver), process(right))
            return method == :== ? equality : s(:send, equality, :!)
          end
          if method == :!
            return s(:send, ruby_truthy(receiver), :!)
          end
          if receiver && receiver.type != :self
            return receiver_send(node, receiver, method, args) || super
          end
          # In a class method self is the class: its static methods and the
          # configuration its ClassMethods provide.
          if @in_class_method && !NATIVE_SENDS.include?(method) && !OPERATORS.include?(method) &&
             (entry = @knowledge.class_member_entry(@entry["name"], method))
            return s(:call, receiver ? process(receiver) : s(:self), *dispatched(entry, args))
          end
          if @properties.include?(method.to_s) && args.empty?
            return s(:attr, receiver ? process(receiver) : s(:self), Knowledge.member(method).to_sym)
          end
          if method.to_s.end_with?("=") && @properties.include?(method.to_s.delete_suffix("="))
            return s(:send, receiver ? process(receiver) : s(:self), Knowledge.member(method).to_sym, *process_all(args))
          end
          # A collected method on self: its signature types the lambdas
          # passed to it.
          if !@in_class_method && !NATIVE_SENDS.include?(method) && !OPERATORS.include?(method) &&
             (entry = @knowledge.method_entry(@entry["name"], method))
            return s(:attr, receiver ? process(receiver) : s(:self), entry["js"].to_sym) if accessor?(entry, args)
            return s(:call, receiver ? process(receiver) : s(:self), *dispatched(entry, args))
          end
          # A browser function called bare, as Kernel's are.
          if receiver.nil? && DOM::GLOBALS.key?(method.to_s) && !NATIVE_SENDS.include?(method)
            return s(:call, nil, method, *process_all(args))
          end
          super
        end

        def on_yield(node)
          s(:call, s(:const, nil, :Runtime), :yieldBlock,
            s(:lvar, :_implicitBlockYield), *process_all(node.children))
        end

    private

        def forwarded_super_block
          block = @current_method.fetch("formals").find { |formal| formal["kind"] == "block" }
          value = s(:call, s(:const, nil, :Runtime), :argument,
                    s(:lvar, :__swill_bound), s(:str, block ? block["name"] : "__swill_block"))
          s(:call, s(:const, nil, :Runtime), :blockArgument, value)
        end

        def complex_call_arguments(entry, args)
          values = args.dup
          carried_block = values.pop if runtime_carrier?(values.last, :blockArgument)
          block = values.pop if values.last&.type == :block_pass
          keywords = if values.last&.type == :hash && !values.last.loc.expression.source.lstrip.start_with?("{")
            values.pop
          end
          processed = typed_arguments(entry, values)
          if keywords
            processed << s(:call, s(:const, nil, :Runtime), :keywordArguments, process(keywords))
          end
          if block
            value = block.children.first
            processed << s(:call, s(:const, nil, :Runtime), :blockArgument, process(value))
          end
          # on_block has already lowered and typed this carrier. Processing it
          # again would discard the block parameter types and could lower its
          # body twice.
          processed << carried_block if carried_block
          processed
        end

        def dynamic_call_arguments(args)
          complex_call_arguments({"js" => "", "parameters" => {}, "formals" => [], "complex" => true}, args)
        end

        def runtime_carrier?(node, name)
          node&.type == :call && node.children[0] == s(:const, nil, :Runtime) && node.children[1] == name
        end

        def collected_call_entry(call)
          receiver, method, = call.children
          if receiver.nil? || receiver.type == :self
            return @knowledge.class_member_entry(@entry["name"], method) if @in_class_method
            return @knowledge.method_entry(@entry["name"], method)
          end
          type = static_type(receiver)
          return @knowledge.class_member_entry(class_of_type(type), method) if class_of_type(type)
          return @knowledge.method_entry(swill_class(type), method) if swill_class(type)
          if receiver.type == :const
            name = swill_class(@knowledge.constant(receiver))
            return @knowledge.class_member_entry(name, method) if name
          end
          nil
        rescue CompileError
          nil
        end

        # Methods with rest, keywords, or blocks receive one JS rest array and
        # bind it through the runtime. Defaults remain source expressions and
        # therefore run lazily in the method's own scope.
        def complex_definition(method, args, body)
          bound = :__swill_bound
          supplied = :__swill_arguments
          original = args.children.filter_map do |arg|
            [arg.children.first.to_s, arg] if arg.children.first
          end.to_h
          statements = [
            s(:lvasgn, bound,
              s(:send, s(:const, s(:const, nil, :Swill), :Runtime), :bind_arguments,
                s(:lvar, supplied), call_signature(method)))
          ]
          method.fetch("formals", []).each do |formal|
            name = formal["name"].to_sym
            statements << s(:lvasgn, name,
              s(:send, s(:const, s(:const, nil, :Swill), :Runtime), :argument,
                s(:lvar, bound), s(:str, formal["name"])))
            next unless formal["default"]
            default = original.fetch(formal["name"]).children[1]
            omitted = s(:send, s(:const, s(:const, nil, :Swill), :Runtime), :omitted_argument?, s(:lvar, name))
            statements << s(:if, omitted, s(:lvasgn, name, default), nil)
          end
          block = method.fetch("formals", []).find { |formal| formal["kind"] == "block" }
          block_name = block ? block["name"] : "__swill_block"
          if method["implicit_block"]
            unless block
              statements << s(:lvasgn, :__swill_block,
                s(:send, s(:const, s(:const, nil, :Swill), :Runtime), :argument,
                  s(:lvar, bound), s(:str, "__swill_block")))
            end
            statements << s(:lvasgn, :_implicitBlockYield, s(:lvar, block_name.to_sym))
          end
          # The synthetic binding statements hide the original method body
          # from Ruby2JS's normal implicit-return pass. Mark the combined body
          # explicitly so a final local, await, yield, conditional, or rescue
          # keeps Ruby's return value. A constructor returns nothing: in
          # JavaScript an object it returned would replace the instance.
          tail = method["name"] == "initialize" ? body : s(:autoreturn, body)
          [s(:args, s(:restarg, supplied)), s(:begin, *statements, tail)]
        end

        def call_signature(method)
          positional = method.fetch("formals", []).select { |formal| %w[req opt rest].include?(formal["kind"]) }
          keywords = method.fetch("formals", []).select { |formal| %w[keyreq key].include?(formal["kind"]) }
          keyrest = method.fetch("formals", []).find { |formal| formal["kind"] == "keyrest" }
          block = method.fetch("formals", []).find { |formal| formal["kind"] == "block" }
          pairs = [
            s(:pair, s(:sym, :positional), s(:array, *positional.map { |formal| parameter_literal(formal) })),
            s(:pair, s(:sym, :keywords), s(:array, *keywords.map { |formal| parameter_literal(formal) })),
            s(:pair, s(:sym, :keywordRest), keyrest ? s(:str, keyrest["name"]) : s(:nil)),
            s(:pair, s(:sym, :block), s(:str, block ? block["name"] : "__swill_block"))
          ]
          s(:hash, *pairs)
        end

        def parameter_literal(formal)
          s(:hash,
            s(:pair, s(:sym, :name), s(:str, formal["name"])),
            s(:pair, s(:sym, :kind), s(:str, formal["kind"])))
        end

        # Optional chaining answers undefined where Ruby answers nil, so the
        # result passes through the runtime. The wrapper is also what keeps
        # the lowered node distinct from the source node: nodes comparing
        # equal by value are replaced by the original, whose location would
        # then decide rendering.
        def safely(node)
          s(:call, s(:const, nil, :Runtime), :nilable, node)
        end

        # A guarded hop onto a guarded hop needs only the outer normalization:
        # ?. answers undefined for nil and for undefined alike, so the inner
        # wrapper cannot change the result. Keeps a chain readable.
        def guarded(receiver)
          lowered = process(receiver)
          return lowered unless lowered.type == :call && lowered.children[1] == :nilable &&
            lowered.children[0] == s(:const, nil, :Runtime)
          lowered.children[2]
        end

        # ?. guards a member the compiler resolves statically.
        # A proc, or a value with no static type, which .() calls directly.
        def proc_type?(type)
          type.nil? || type == "T.untyped" || type.sub(/\AT\.nilable\((.*)\)\z/m, '\1').start_with?("T.proc")
        end

        def safe_navigable?(receiver)
          type = static_type(receiver)
          native_type?(type) || !swill_class(type).nil?
        end

        def describe_receiver(receiver)
          type = static_type(receiver)
          return "an untyped receiver" if type.nil? || type == "T.untyped"
          "a #{type} receiver"
        end

        # Static facts choose the operation. A receiver whose class is known gets
        # direct property access or a direct call; a core value type goes
        # through its lowering table; a receiver with no static type is dynamic
        # and reaches the runtime's metadata dispatch, the same path bindings
        # use.
        VALUE_CLASSES = %w[String Symbol Integer Float Hash NilClass].freeze

        def receiver_send(node, receiver, method, args)
          name = method.to_s
          setter = name.match?(/\A[a-z_]\w*=\z/) && args.length == 1
          base = name.delete_suffix("=")
          type = static_type(receiver)
          # Ruby's % takes the sign of the divisor and JavaScript's that of the
          # dividend, so -1 % 3 differs. Whatever the compiler cannot tell is
          # a String (whose % formats) gets Ruby's, an Integer's or a Float's.
          if method == :% && args.length == 1 && !type.to_s.include?("String")
            return s(:call, s(:const, nil, :Runtime), :modulo, process(receiver), process(args.first))
          end
          if method == :new && receiver.type == :const
            owner = swill_class(@knowledge.constant(receiver))
            constructed = owner && lower_complex_new(receiver, owner, args)
            return constructed if constructed
          end
          # nil? is defined for every value, including nil itself.
          return s(:send, process(receiver), :==, s(:nil)) if method == :nil? && args.empty?
          # An Array from another realm (a page's JSON) is still an Array.
          if %i[is_a? kind_of? instance_of?].include?(method) && args.length == 1 &&
             args.first.type == :const && @knowledge.constant(args.first) == "Array"
            return s(:call, s(:const, nil, :Array), :isArray, process(receiver))
          end
          # A string or number is a JavaScript primitive, which instanceof
          # never matches; the runtime checks value classes as T.cast does.
          if %i[is_a? kind_of? instance_of?].include?(method) && args.length == 1 &&
             args.first.type == :const && VALUE_CLASSES.include?(@knowledge.constant(args.first))
            return s(:call, s(:const, nil, :Runtime), :conforms, process(receiver), s(:str, @knowledge.constant(args.first)))
          end
          return lower_native(node, receiver, method, args, type) if native_type?(type)
          # A JavaScript intrinsic or DOM class named as the receiver: its
          # static members are native (JSON.generate is JSON.stringify).
          if receiver.type == :const && method != :new
            constant = @knowledge.constant(receiver)
            if JS_INTRINSICS.include?(constant) || DOM.native?(constant)
              return lower_native(node, receiver, method, args, constant)
            end
          end
          # A class object: new constructs it (the converter's form), and
          # its class members are called.
          if (owner = class_of_type(type))
            return nil if method == :new
            if (entry = @knowledge.class_member_entry(owner, name))
              return s(:call, process(receiver), *dispatched(entry, args))
            end
            return nil
          end
          if (klass = swill_class(type))
            # An object's class is its constructor.
            return s(:attr, process(receiver), :constructor) if method == :class && args.empty?
            # Ruby's dup of a framework object is the runtime's copy.
            if method == :dup && args.empty?
              return s(:call, s(:const, nil, :Runtime), :send, process(receiver), s(:str, "dup"))
            end
            if args.empty? && @knowledge.property_entry(klass, name)
              member = Knowledge.member(method).to_sym
              return safely(s(:cattr, guarded(receiver), member)) if node.type == :csend
              return s(:attr, process(receiver), member)
            end
            if setter && (@knowledge.property_entry(klass, base) || @knowledge.method_entry(klass, name))
              return s(:send, process(receiver), Knowledge.member(method).to_sym, process(args.first))
            end
            if (entry = @knowledge.method_entry(klass, name))
              # attr_reader compiles to a native getter, which is read.
              if accessor?(entry, args)
                return safely(s(:cattr, guarded(receiver), entry["js"].to_sym)) if node.type == :csend
                return s(:attr, process(receiver), entry["js"].to_sym)
              end
              # A location-less node is a call to the converter, whatever the
              # source's parentheses: a collected method is always called.
              if node.type == :csend
                return safely(s(:csend, guarded(receiver), *dispatched(entry, args)))
              end
              return s(:call, process(receiver), *dispatched(entry, args))
            end
            # A member the declared class lacks may be a subclass's, as an
            # application's outlet is on its Application subclass: Ruby finds it
            # on the object, so it is resolved against the object at run time.
            if node.type == :csend
              raise CompileError, "#{klass} declares no #{name}; &. reaches only members the compiler can see"
            end
            return dynamic_send(node, receiver, name, setter, base, args)
          end
          if receiver.type == :const && (constant_class = swill_class(@knowledge.constant(receiver))) &&
             (entry = @knowledge.class_member_entry(constant_class, name))
            return s(:call, process(receiver), *dispatched(entry, args))
          end
          if receiver.type == :const && method == :new && DOM.native?(@knowledge.constant(receiver))
            constant = @knowledge.constant(receiver)
            return s(:send, process(receiver), :new, *native_arguments(constant, :new, args))
          end
          if (kind = core_kind(type))
            return lower_core(node, kind, type, receiver, method, args)
          end
          if method == :call && proc_type?(type)
            return lower_call(receiver, args)
          end
          return nil unless dynamic_receiver?(receiver)
          dynamic_send(node, receiver, name, setter, base, args)
        end

        # A DOM or JavaScript receiver. The DOM table says whether a member is
        # a property or a method, whatever the source's parentheses; a member
        # it does not list is called when the source has parentheses or
        # arguments, and otherwise resolved when it runs, by Runtime.send. Operators and indexing stay with the
        # converter. Safe navigation is JavaScript's own here.
        def lower_native(node, receiver, method, args, type)
          return nil if OPERATORS.include?(method) || NATIVE_SENDS.include?(method)
          # Ruby's JSON.generate is JSON.stringify; parse is the same name.
          method = :stringify if type == "JSON" && method == :generate
          name = method.to_s
          target = process(receiver)
          args = native_arguments(type, method, args)
          if name.match?(/\A[A-Za-z_]\w*=\z/) && args.length == 1
            return s(:send, target, method, args.first)
          end
          inner = DOM.base(type)
          member = DOM.native?(inner) ? DOM.member(inner, name) : nil
          kind = member ? member[0] : nil
          return s(:attr, target, method) if %i[attr accessor].include?(kind)
          # A member the table does not list, with no arguments or parentheses,
          # may be a property or a method; the object says which when it runs.
          # Safe navigation keeps JavaScript's own read.
          if kind.nil? && args.empty? && !node.is_method?
            return s(:attr, target, method) if node.type == :csend
            return s(:call, s(:const, nil, :Runtime), :send, target, s(:str, name))
          end
          # Safe navigation is JavaScript's own; the source's parentheses stay.
          return node.updated(:csend, [target, method, *args]) if node.type == :csend
          s(:call, target, method, *args)
        end

        # Arguments to a native member, lambdas typed as the DOM table
        # declares the member's callbacks. Processed here, once.
        def native_arguments(type, method, args)
          args.each_with_index.map do |arg, index|
            if lambda_literal?(arg)
              process_lambda(arg, native_callback_types(type, method, index) || [])
            else
              process(arg)
            end
          end
        end

        # Parameter types for a block or lambda body, and the locals the body
        # assigns from them, scoped to the body.
        def with_parameter_types(args_node, types, body)
          names = args_node.children.map { |arg| arg.children.first.to_s }
          previous = @local_types
          @local_types = @local_types.dup
          names.each_with_index { |name, index| @local_types[name] = types[index] if types[index] }
          infer_local_types(body) if body
          yield
        ensure
          @local_types = previous
        end

        # Arguments to a collected method. A lambda literal passed where the
        # signature says T.proc.params(...) gets those parameter types, so
        # its body lowers as the callee will call it.
        def typed_arguments(entry, args, taken = nil)
          declared = entry.fetch("parameters", {})
          types = if taken && entry["formals"]
            Knowledge.variant_formals(entry, taken).map { |formal| declared[formal["name"]] }
          else
            declared.values
          end
          args.each_with_index.map do |arg, index|
            if lambda_literal?(arg)
              process_lambda(arg, proc_parameter_types(types[index]))
            else
              process(arg)
            end
          end
        end

        def lambda_literal?(node)
          node.type == :block && node.children.first.type == :send &&
            node.children.first.children[0..1] == [nil, :lambda]
        end

        def process_lambda(node, parameter_types)
          with_parameter_types(node.children[1], parameter_types, node.children[2]) { process(node) }
        end

        # An untyped receiver is resolved by name at run time, as Ruby would:
        # a write, a send, or an invocation checked against installed
        # metadata. A send has no arguments and no parentheses, so its name may
        # be a property or a method; parentheses, arguments, or a bang make it
        # a call. Runtime.read is key-value coding, for key paths, not this.
        # Operators, indexing, construction, and pragma-typed sends stay with
        # the converter, which knows their JavaScript form.
        def dynamic_send(node, receiver, name, setter, base, args)
          method = name.to_sym
          return nil if NATIVE_SENDS.include?(method) || OPERATORS.include?(method)
          # A node without a location was synthesized by a filter (Pragma
          # rewriting dup to slice), not written in source; it is JavaScript.
          return nil if node.loc.nil?
          return nil if %i[array hash string].any? { |kind| pragma?(node, kind) }
          runtime = s(:const, nil, :Runtime)
          return s(:call, runtime, :write, process(receiver), s(:str, base), process(args.first)) if setter
          if args.empty? && !node.is_method? && !name.end_with?("!")
            return s(:call, runtime, :send, process(receiver), s(:str, name))
          end
          s(:call, runtime, :invoke, process(receiver), s(:str, name), *dynamic_call_arguments(args))
        end

        # Constants and self are never dynamic: class-level calls and implicit
        # self resolve statically. Everything without a static type is.
        def dynamic_receiver?(receiver)
          return false if %i[const self].include?(receiver.type)
          type = static_type(receiver)
          type.nil? || type == "T.untyped"
        end

        def ruby_truthy(node)
          case truthiness_kind(static_type(node))
          when :boolean, :native
            process(node)
          when :nil
            s(:false)
          when :scalar, :nullable_scalar
            s(:send, process(node), :!=, s(:nil))
          else
            s(:call, s(:const, nil, :Runtime), :isTruthy, process(node))
          end
        end

        def logical_expression(operator, left, right)
          kind = truthiness_kind(static_type(left))
          if %i[boolean nil native].include?(kind)
            return s(operator, process(left), process(right))
          end
          if stable_value?(left) && kind == :scalar
            return operator == :and ? process(right) : process(left)
          end
          if stable_value?(left) && kind == :nullable_scalar
            condition = ruby_truthy(left)
            return operator == :and ?
              s(:if, condition, process(right), process(left)) :
              s(:if, condition, process(left), process(right))
          end
          runtime_method = operator == :and ? :logicalAnd : :logicalOr
          s(:call, s(:const, nil, :Runtime), runtime_method,
            process(left), deferred(process(right)))
        end

        def stable_value?(node)
          node && (%i[lvar str int true false nil sym].include?(node.type))
        end

        def deferred(value)
          s(:block, s(:send, nil, :lambda), s(:args), value)
        end

    end
  end
end
