# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Browser-only framework source uses Ruby as JavaScript syntax. It keeps
    # Ruby2JS's native DOM property/call behavior while retaining Swill's
    # collision-safe class names.
    module JavaScriptSurface
      include ::Ruby2JS::Filter::SEXP
      include SharedLowering

        def options=(options)
          super
          @knowledge = options.fetch(:knowledge)
          @scope = options.fetch(:spike_scope)
          @compiled_class = options[:compiled_class]
          @compiled_parent = options[:compiled_parent]
          @entry = options.fetch(:entry)
          @parameter_types = {}
        end

        def on_class(node)
          return super unless @compiled_class

          body = @knowledge.statements(node.children.last).select { |statement| statement.type == :def }
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
          previous = @parameter_types
          @parameter_types = method ? method["parameters"] : {}
          super(node.updated(:defm, [Knowledge.member(name).to_sym, args, body]))
        ensure
          @parameter_types = previous
        end

        def on_send(node)
          receiver, method, *args = node.children
          return lower_raise(args) if receiver.nil? && method == :raise
          return lower_new(receiver, args) if constructed_from_call?(receiver, method)
          return lower_call(receiver, args) if method == :call && receiver && receiver.type != :self
          ruby_call =
            if receiver.nil?
              @knowledge.method_defined?(@entry["name"], method)
            elsif receiver.type == :lvar && (type = @parameter_types[receiver.children.first.to_s])
              resolved = resolve_parameter_class(type)
              resolved && @knowledge.method_defined?(resolved, method)
            else
              false
            end
          if ruby_call
            return s(:call, receiver ? process(receiver) : s(:self),
              Knowledge.member(method).to_sym, *process_all(args))
          end
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

        def resolve_parameter_class(type)
          type = type.sub(/\AT\.nilable\((.+)\)\z/, '\1')
          return unless type.match?(/\A[A-Z]\w*(?:::\w+)*\z/)
          @knowledge.resolve(type, @entry["scope"])
        rescue CompileError
          nil
        end

    end
  end
end
