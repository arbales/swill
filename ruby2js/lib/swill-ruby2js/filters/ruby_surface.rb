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

        def options=(options)
          super
          @knowledge = options.fetch(:knowledge)
          # Ruby2JS reserves :scope for an object supplying instance variables.
          @scope = options.fetch(:spike_scope)
          @properties = options.fetch(:properties)
          @property_types = options.fetch(:property_types)
          @all_properties = options.fetch(:all_properties)
          @compiled_class = options[:compiled_class]
          @compiled_parent = options[:compiled_parent]
          @entry = options.fetch(:entry)
          @local_types = {}
        end

        def on_class(node)
          # Lower only the header here. Constants in method bodies still
          # resolve in Ruby's source scope, not against implementation-local names.
          # Declarations have already been collected. Keep the original source and
          # locations so Pragma sees comments, including those on the final line.
          body = @knowledge.statements(node.children.last).select do |statement|
            statement.type == :def
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
          @local_types = method ? method["parameters"].dup : {}
          infer_local_types(body).each do |local, type|
            @local_types[local] = type
          end
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
          resolved = @knowledge.resolve(name, @scope)
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

        # Array iteration on a typed array receiver; block parameters take the
        # element type so their own calls lower statically.
        def on_block(node)
          call, args, body = node.children
          receiver, method, *call_args = call.children
          target = ARRAY_BLOCK_METHODS[method]
          return super unless target && receiver && call_args.empty? && array_type?(static_type(receiver))
          element_type = static_type(receiver)[/\AT::Array\[(.+)\]\z/, 1]
          previous = @local_types
          @local_types = previous.dup
          args.children.each { |arg| @local_types[arg.children.first.to_s] = element_type } if element_type
          s(:block, s(:call, process(receiver), target), args, process(body))
        ensure
          @local_types = previous if previous
        end

        def on_send(node)
          receiver, method, *args = node.children
          return lower_raise(args) if receiver.nil? && method == :raise
          return lower_new(receiver, args) if constructed_from_call?(receiver, method)
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
            return receiver_send(receiver, method, args) || super
          end
          if @properties.include?(method.to_s) && args.empty?
            return s(:attr, receiver ? process(receiver) : s(:self), Knowledge.member(method).to_sym)
          end
          if method.to_s.end_with?("=") && @properties.include?(method.to_s.delete_suffix("="))
            return s(:send, receiver ? process(receiver) : s(:self), Knowledge.member(method).to_sym, *process_all(args))
          end
          super
        end

    private

        # Static facts choose the operation. A receiver whose class is known gets
        # direct property access or a direct call; a String receiver gets the
        # shared value readers; only a receiver with no static type reaches the
        # runtime reader, which is the same dynamic path bindings use.
        def receiver_send(receiver, method, args)
          name = method.to_s
          setter = name.match?(/\A[a-z_]\w*=\z/) && args.length == 1
          base = name.delete_suffix("=")
          type = static_type(receiver)
          # nil? is defined for every value, including nil itself.
          return s(:send, process(receiver), :==, s(:nil)) if method == :nil? && args.empty?
          if (klass = swill_class(type))
            if args.empty? && @knowledge.property_entry(klass, name)
              return s(:attr, process(receiver), Knowledge.member(method).to_sym)
            end
            if setter && @knowledge.property_entry(klass, base)
              return s(:send, process(receiver), method, process(args.first))
            end
            if @knowledge.method_entry(klass, name)
              return s(:call, process(receiver), Knowledge.member(method).to_sym, *process_all(args))
            end
            return nil
          end
          if string_type?(type)
            reader = STRING_READERS[method]
            return reader && args.empty? ? s(:call, s(:const, nil, :Runtime), reader, process(receiver)) : nil
          end
          if collection_type?(type) && %i[empty? blank? present?].include?(method) && args.empty?
            return s(:call, s(:const, nil, :Runtime), STRING_READERS.fetch(method), process(receiver))
          end
          if array_type?(type)
            lowered = array_send(receiver, method, args)
            return lowered if lowered
          end
          return nil unless type.nil? || type == "T.untyped" || type.start_with?("T.proc")
          return lower_call(receiver, args) if method == :call
          if args.empty? && (@all_properties.include?(name) || STRING_READERS.key?(method))
            return s(:call, s(:const, nil, :Runtime), :read, process(receiver), s(:str, name))
          end
          if setter && @all_properties.include?(base)
            return s(:call, s(:const, nil, :Runtime), :write, process(receiver), s(:str, base), process(args.first))
          end
          nil
        end

        def array_send(receiver, method, args)
          case method
          when :include? then args.length == 1 ? s(:call, process(receiver), :includes, process(args.first)) : nil
          when :size, :length then args.empty? ? s(:attr, process(receiver), :length) : nil
          when :first then args.empty? ? s(:send, process(receiver), :[], s(:int, 0)) : nil
          when :last then args.empty? ? s(:call, process(receiver), :at, s(:int, -1)) : nil
          end
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
