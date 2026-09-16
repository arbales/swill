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
          @ivar_types = {}
        end

        def on_class(node)
          # Lower only the header here. Constants in method bodies still
          # resolve in Ruby's source scope, not against implementation-local names.
          # Declarations have already been collected. Keep the original source and
          # locations so Pragma sees comments, including those on the final line.
          infer_ivar_types(node)
          body = @knowledge.statements(node.children.last).select do |statement|
            class_body_statement?(statement)
          end.map { |statement| process(statement) }
          body.reject! { |statement| statement.type == :begin && statement.children.empty? }
          s(:class, s(:const, nil, @compiled_class.to_sym),
            s(:const, nil, @compiled_parent.to_sym), s(:begin, *body))
        end

        def on_module(node)
          on_class(node)
        end

        def on_def(node)
          name, args, body = node.children
          method = @entry["methods"].find { |candidate| candidate["name"] == name.to_s }
          previous = @local_types
          previous_method = @current_method
          @current_method = method
          local_types_for(method, body)
          # Ruby2JS's explicit method node preserves source locations for filters.
          super(node.updated(:defm, [Knowledge.member(name).to_sym, args, body]))
        ensure
          @local_types = previous
          @current_method = previous_method
        end

        def on_const(node)
          name = @knowledge.constant(node)
          return s(:const, nil, :Runtime) if name == "Swill::Runtime"
          # Built-in filters introduce JS intrinsics as locationless nodes. Source
          # constants still use the spike's namespace rules, even with these names.
          return node if !node.loc && JS_INTRINSICS.include?(name)
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
        # A block on an untyped receiver has no lowering: collected methods
        # take no blocks, so only a collection can receive one, and its type
        # must be declared.
        def on_block(node)
          call, args, body = node.children
          return super unless call.type == :send
          receiver, method, *call_args = call.children
          # A block on a native receiver is a JavaScript callback, its
          # parameters typed as the DOM member declares them.
          if receiver && native_type?(static_type(receiver))
            types = native_callback_types(static_type(receiver), method, call_args.length) || []
            return with_parameter_types(args, types, body) { super(node) }
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
          super
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
          _, name, _, body = node.children
          method = @entry["static_methods"].find { |candidate| candidate["name"] == name.to_s }
          previous = @local_types
          previous_method = @current_method
          @current_method = method
          local_types_for(method, body)
          lower_defs(node)
        ensure
          @local_types = previous
          @current_method = previous_method
        end

        # The converter's own defs handling, reached from lower_defs.
        def super_defs(node)
          method(:on_defs).super_method.call(node)
        end

        def on_send(node)
          receiver, method, *args = node.children
          return s(:send, s(:self), :new, *process_all(args)) if bare_new?(receiver, method)
          # The lowerings below would keep the call and drop the nil guard, and
          # JavaScript's ?. yields undefined where Ruby yields nil.
          if node.type == :csend && !native_type?(static_type(receiver))
            raise CompileError, "safe navigation (&.) is not lowered on a Ruby receiver; guard #{receiver.loc.expression.source} with a local"
          end
          return lower_sorbet(node) if SorbetOperations.operation?(node)
          return lower_raise(args) if receiver.nil? && method == :raise
          return lower_new(receiver, args) if constructed_from_call?(receiver, method)
          return lower_warn(args) if warn_call?(receiver, method)
          return lower_respond_to(receiver, args) if method == :respond_to?
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
          if @properties.include?(method.to_s) && args.empty?
            return s(:attr, receiver ? process(receiver) : s(:self), Knowledge.member(method).to_sym)
          end
          if method.to_s.end_with?("=") && @properties.include?(method.to_s.delete_suffix("="))
            return s(:send, receiver ? process(receiver) : s(:self), Knowledge.member(method).to_sym, *process_all(args))
          end
          # A collected method on self: its signature types the lambdas
          # passed to it.
          if !NATIVE_SENDS.include?(method) && !OPERATORS.include?(method) &&
             (entry = @knowledge.method_entry(@entry["name"], method))
            return s(:call, receiver ? process(receiver) : s(:self), entry["js"].to_sym, *typed_arguments(entry, args))
          end
          super
        end

    private

        # Static facts choose the operation. A receiver whose class is known gets
        # direct property access or a direct call; a core value type goes
        # through its lowering table; a receiver with no static type is dynamic
        # and reaches the runtime's metadata dispatch, the same path bindings
        # use.
        def receiver_send(node, receiver, method, args)
          name = method.to_s
          setter = name.match?(/\A[a-z_]\w*=\z/) && args.length == 1
          base = name.delete_suffix("=")
          type = static_type(receiver)
          # nil? is defined for every value, including nil itself.
          return s(:send, process(receiver), :==, s(:nil)) if method == :nil? && args.empty?
          return lower_native(node, receiver, method, args, type) if native_type?(type)
          if (klass = swill_class(type))
            if args.empty? && @knowledge.property_entry(klass, name)
              return s(:attr, process(receiver), Knowledge.member(method).to_sym)
            end
            if setter && (@knowledge.property_entry(klass, base) || @knowledge.method_entry(klass, name))
              return s(:send, process(receiver), Knowledge.member(method).to_sym, process(args.first))
            end
            if (entry = @knowledge.method_entry(klass, name))
              return s(:call, process(receiver), entry["js"].to_sym, *typed_arguments(entry, args))
            end
            return nil
          end
          if receiver.type == :const && (constant_class = swill_class(@knowledge.constant(receiver))) &&
             (entry = @knowledge.static_method_entry(constant_class, name))
            return s(:call, process(receiver), entry["js"].to_sym, *typed_arguments(entry, args))
          end
          if receiver.type == :const && method == :new && DOM.native?(@knowledge.constant(receiver))
            constant = @knowledge.constant(receiver)
            return s(:send, process(receiver), :new, *native_arguments(constant, :new, args))
          end
          if (kind = core_kind(type))
            return lower_core(node, kind, type, receiver, method, args)
          end
          if method == :call && (type.nil? || type == "T.untyped" || type.start_with?("T.proc"))
            return lower_call(receiver, args)
          end
          return nil unless dynamic_receiver?(receiver)
          dynamic_send(node, receiver, name, setter, base, args)
        end

        # A DOM or JavaScript receiver. The DOM table says whether a member is
        # a property or a method, whatever the source's parentheses; a member
        # it does not list follows them. Operators and indexing stay with the
        # converter. Safe navigation is JavaScript's own here.
        def lower_native(node, receiver, method, args, type)
          name = method.to_s
          return nil if OPERATORS.include?(method) || NATIVE_SENDS.include?(method)
          target = process(receiver)
          args = native_arguments(type, method, args)
          if name.match?(/\A[A-Za-z_]\w*=\z/) && args.length == 1
            return s(:send, target, method, args.first)
          end
          inner = type[/\AT\.nilable\((.+)\)\z/, 1] || type
          member = inner == "JavaScript" ? nil : DOM.member(inner, name)
          kind = member ? member[0] : nil
          return s(:attr, target, method) if %i[attr accessor].include?(kind)
          return s(:attr, target, method) if kind.nil? && args.empty? && !node.is_method?
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
        def typed_arguments(entry, args)
          types = entry.fetch("parameters", {}).values
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
        # a read, a write, or an invocation checked against installed metadata.
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
          return s(:call, runtime, :read, process(receiver), s(:str, name)) if args.empty?
          s(:call, runtime, :invoke, process(receiver), s(:str, name), *process_all(args))
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
