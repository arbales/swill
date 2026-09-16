# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Browser-only framework source uses Ruby as JavaScript syntax. A receiver
    # whose class the compiler knows (a signature parameter, an inferred
    # local, an instance variable assigned one class, a class constant) gets
    # its declared properties read and written and its collected methods
    # called; anything else keeps Ruby2JS's native DOM property/call
    # behavior, while retaining Swill's collision-safe class names.
    module JavaScriptSurface
      include ::Ruby2JS::Filter::SEXP
      include SharedLowering
      include StaticTypes
      include CoreTypes

        def options=(options)
          super
          @knowledge = options.fetch(:knowledge)
          @scope = options.fetch(:spike_scope)
          @compiled_class = options[:compiled_class]
          @compiled_parent = options[:compiled_parent]
          @entry = options.fetch(:entry)
          @properties = options.fetch(:properties)
          @property_types = options.fetch(:property_types)
          @local_types = {}
          @ivar_types = {}
        end

        def on_class(node)
          return super unless @compiled_class

          infer_ivar_types(node)
          body = @knowledge.statements(node.children.last).select { |statement| class_body_statement?(statement) }
            .map { |statement| process(statement) }
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
          super(node.updated(:defm, [Knowledge.member(name).to_sym, args, body]))
        ensure
          @local_types = previous
          @current_method = previous_method
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
          return lower_sorbet(node) if SorbetOperations.operation?(node)
          return lower_raise(args) if receiver.nil? && method == :raise
          return lower_new(receiver, args) if constructed_from_call?(receiver, method)
          return lower_call(receiver, args) if method == :call && receiver && receiver.type != :self
          return lower_warn(args) if warn_call?(receiver, method)
          return lower_respond_to(receiver, args) if method == :respond_to?
          lowered = typed_send(node, receiver, method, args)
          return lowered if lowered
          if receiver && !%i[self const].include?(receiver.type)
            lowered = lower_ruby_query(receiver, method, args)
            return lowered if lowered
          end
          lowered = lower_ruby_member(node, receiver, method, args)
          return lowered if lowered
          super
        end

        def on_const(node)
          name = @knowledge.constant(node)
          return node if !node.loc && JS_INTRINSICS.include?(name)
          return s(:const, nil, :Runtime) if name == "Runtime"

          resolved = begin
            @knowledge.resolve(name, @scope)
          rescue CompileError
            # Browser-boundary code may use a JavaScript intrinsic such as JSON
            # when no source constant of that name is in scope.
            return node if JS_INTRINSICS.include?(name)
            raise
          end
          s(:const, nil, Knowledge.identifier(resolved).to_sym)
        end

    private

        # A receiver whose class is known: a declared property reads or
        # writes, a collected method calls, with or without parentheses, and
        # a class constant's static method calls. A member the class does not
        # declare falls through to the rules for unknown receivers.
        def typed_send(node, receiver, method, args)
          name = method.to_s
          if receiver && receiver.type == :const
            klass = swill_class(@knowledge.constant(receiver))
            static = klass && @knowledge.static_method_entry(klass, name)
            return static ? s(:call, process(receiver), static["js"].to_sym, *process_all(args)) : nil
          end
          klass = receiver.nil? || receiver.type == :self ? @entry["name"] : swill_class(static_type(receiver))
          return nil unless klass
          target = receiver ? process(receiver) : s(:self)
          member = Knowledge.member(name).to_sym
          if name.match?(/\A[a-z_]\w*=\z/) && args.length == 1
            base = name.delete_suffix("=")
            known = @knowledge.property_entry(klass, base) || @knowledge.method_entry(klass, name)
            return known ? s(:send, target, member, process(args.first)) : nil
          end
          return s(:attr, target, member) if args.empty? && @knowledge.property_entry(klass, name)
          entry = @knowledge.method_entry(klass, name)
          return nil unless entry
          return s(:csend, target, entry["js"].to_sym, *process_all(args)) if node.type == :csend
          s(:call, target, entry["js"].to_sym, *process_all(args))
        end

        # The DOM has no snake_case names, so a snake_case send is a Ruby
        # member (a declared property on self, a static method on a class, or
        # a member of a receiver whose class is not known) and takes its
        # JavaScript spelling: a call with parentheses or arguments, a
        # property read without, a property write for name=. Safe navigation
        # keeps its guard.
        def lower_ruby_member(node, receiver, method, args)
          name = method.to_s
          return nil if RUBY_CORE_QUERIES.include?(method)
          return nil unless name.include?("_") && !name.start_with?("_")
          member = Knowledge.member(method).to_sym
          target = receiver ? process(receiver) : s(:self)
          return s(:send, target, member, *process_all(args)) if name.end_with?("=")
          return s(:csend, target, member, *process_all(args)) if node.type == :csend
          return s(:attr, target, member) if args.empty? && !node.is_method?
          s(:call, target, member, *process_all(args))
        end

    end
  end
end
