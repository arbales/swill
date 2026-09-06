# typed: false
# frozen_string_literal: true

require "json"
require "open3"
require "ruby2js"
require "ruby2js/filter/pragma"
require "ruby2js/filter/return"

module Swill
  module Ruby2JS
  class CompileError < StandardError; end

  # Intrinsics introduced by built-in filters must not capture source classes.
  JS_INTRINSICS = %w[Object Array String Number Math JSON].freeze

  # The experiment deliberately accepts a finite, inspectable class-body DSL.
  # Never execute application Ruby to discover its declarations.
  class Knowledge
    attr_reader :entries

    def initialize(imports = [])
      @entries = imports.map { |entry| entry.merge("imported" => true) }
    end

    def self.identifier(name)
      # Ordinary names stay ordinary; namespaces use __. Escape source
      # underscores first so A::B and A__B remain distinct. The single
      # underscore in Ruby_Runtime cannot occur in an encoded source name.
      return "Ruby_#{name}" if (%w[Runtime Superclass] + JS_INTRINSICS).include?(name)
      name.split("::").map { |part| part.gsub("_", "_u") }.join("__")
    end

    def self.member(name)
      name.to_s.gsub("?", "_predicate").gsub("!", "_bang")
    end

    def collect(source, file, javascript_only: false)
      ast, comments = ::Ruby2JS.parse(source, file)
      # This shared-Ruby spike accepts type hints, not JavaScript-only control
      # pragmas (notably skip/extend, which would invalidate collected metadata).
      Array(comments[:_raw]).each do |comment|
        comment.text.scan(/#\s*Pragma:\s*(\S+)/i).flatten.each do |name|
          unless %w[array hash string].include?(name)
            raise CompileError, "unsupported spike pragma #{name}"
          end
        end
      end
      collect_scope(statements(ast), [], javascript_only)
      self
    end

    def local
      entries.reject { |entry| entry["imported"] }
    end

    def interface
      local.map { |entry| entry.reject { |key, _| key == "node" } }
    end

    def resolve(name, scope)
      parts = scope.dup
      loop do
        candidate = (parts + [name]).join("::")
        return candidate if entries.any? { |entry| entry["name"] == candidate }
        break if parts.empty?
        parts.pop
      end
      raise CompileError, "unknown constant #{name} in #{scope.join('::')}"
    end

    def constant(node)
      raise CompileError, "expected a static constant" unless node&.type == :const
      parent, name = node.children
      parent ? "#{constant(parent)}::#{name}" : name.to_s
    end

    def statements(node)
      return [] unless node
      node.type == :begin ? node.children : [node]
    end

    def method_defined?(type, method)
      entry = entries.find { |candidate| candidate["name"] == type }
      return false unless entry
      return true if entry["methods"].any? { |candidate| candidate["name"] == method.to_s }
      return false unless entry["parent"]
      method_defined?(resolve(entry["parent"], entry["scope"]), method)
    end

    private

    def collect_scope(nodes, scope, javascript_only)
      nodes.each do |node|
        if node.type == :module
          name, body = node.children
          children = statements(body)
          has_class_methods = children.any? do |child|
            child.type == :module && constant(child.children.first) == "ClassMethods"
          end
          if children.any? { |child| %i[class module].include?(child.type) } && !has_class_methods
            collect_scope(children, scope + [constant(name)], javascript_only)
          else
            collect_entry(node, scope, "mixin", javascript_only)
          end
        elsif node.type == :class
          collect_entry(node, scope, "class", javascript_only)
        else
          raise CompileError, "unsupported top-level #{node.type}: #{node.loc.expression.source}"
        end
      end
    end

    def collect_entry(node, scope, kind, javascript_only)
      name = (scope + [constant(node.children.first)]).join("::")
      raise CompileError, "reopened/duplicate constant #{name}" if entries.any? { |e| e["name"] == name }

      entry = {
        "name" => name, "identifier" => self.class.identifier(name),
        "kind" => kind, "scope" => scope, "node" => node, "javascript_only" => javascript_only,
        "parent" => kind == "class" && node.children[1] ? constant(node.children[1]) : nil,
        "includes" => [], "properties" => [], "methods" => [], "included_properties" => [],
        "class_methods" => [], "registries" => [], "settings" => []
      }
      pending_signature = nil
      statements(node.children.last).each do |child|
        if child.type == :def
          method, args, = child.children
          unless method.to_s.match?(/\A[a-z_]\w*[!?=]?\z/) &&
                 method != :method_missing && (javascript_only || method != :initialize)
            raise CompileError, "unsupported method definition #{method}"
          end
          unless args.children.all? { |arg| arg.type == :arg }
            raise CompileError, "only positional required method arguments are supported"
          end
          validate_expression!(child.children.last)
          entry["methods"] << {
            "name" => method.to_s, "js" => self.class.member(method),
            "arity" => args.children.length,
            "parameters" => signature_parameters(pending_signature)
          }
          pending_signature = nil
        elsif signature?(child)
          # Sorbet checks these; executable definitions omit annotations.
          pending_signature = child
        elsif child.type == :send && child.children[0..1] == [nil, :extend] &&
              child.children[2..] == [::Ruby2JS.parse("T::Sig").first]
          # Annotation-only extension.
        elsif child.type == :send && child.children[0..1] == [nil, :include]
          names = child.children[2..].map { |arg| constant(arg) }
          # Ruby include A, B places A before B in lookup; separate includes
          # put the last include first. Factory nesting preserves both rules.
          entry["includes"].concat(names.reverse)
          names.reverse_each do |mixin_name|
            resolved = resolve(mixin_name, scope)
            mixin = entries.find { |candidate| candidate["name"] == resolved }
            raise CompileError, "include target must be a mixin" unless mixin["kind"] == "mixin"
            # Interpret only the supported static declaration hook, never run
            # application Ruby. Each receiver owns its declaration descriptors.
            entry["properties"].concat(mixin.fetch("included_properties", []).map(&:dup))
          end
        elsif child.type == :defs && kind == "mixin"
          collect_included_hook(entry, child)
        elsif child.type == :module && kind == "mixin" &&
              constant(child.children.first) == "ClassMethods"
          collect_class_methods(entry, child)
        elsif declaration?(child)
          collect_property(entry, child)
        else
          raise CompileError, "unsupported class body in #{name}: #{child.loc.expression.source}"
        end
      end
      names = entry["properties"].map { |property| property["name"] }
      raise CompileError, "duplicate property in #{name}" unless names.uniq == names
      if entry["extends_class_methods"] && entry["class_methods"].empty? &&
         entry["registries"].empty? && entry["settings"].empty?
        raise CompileError, "ClassMethods module is missing or empty"
      end
      entries << entry
    end

    def collect_included_hook(entry, node)
      receiver, name, args, body = node.children
      unless receiver.type == :self && name == :included &&
             args.children.length == 1 && args.children.first.type == :arg
        raise CompileError, "only self.included(base) declaration hooks are supported"
      end
      if entry["included_hook"]
        raise CompileError, "duplicate included hook in #{entry['name']}"
      end
      entry["included_hook"] = true
      base = args.children.first.children.first
      declarations = {"properties" => []}
      statements(body).each do |statement|
        receiver, method, *arguments = statement.children if statement.type == :send
        if receiver&.type == :lvar && receiver.children == [base] &&
           method == :extend && arguments.length == 1 &&
           constant(arguments.first) == "ClassMethods"
          entry["extends_class_methods"] = true
        elsif receiver&.type == :lvar && receiver.children == [base] &&
              %i[property attribute].include?(method)
          collect_property(declarations, statement)
        else
          raise CompileError, "included hooks support only literal base.property/base.attribute declarations"
        end
      end
      entry["included_properties"] = declarations["properties"]
      names = entry["included_properties"].map { |property| property["name"] }
      raise CompileError, "duplicate included property" unless names.uniq == names
    end

    def collect_class_methods(entry, node)
      statements(node.children.last).each do |statement|
        if statement.type == :def
          method, args, = statement.children
          if entry["name"] == "Swill::Model::Attributes" && method == :attribute
            # `attribute` is a compile-time class-body declaration in JavaScript.
            # Its ordinary Ruby implementation remains the MRI source of truth;
            # collect_property and generated registry seeds lower that one
            # finite protocol without compiling its metaprogramming body.
            next
          end
          unless args.children.all? { |arg| arg.type == :arg }
            raise CompileError, "class methods support only positional required arguments"
          end
          validate_expression!(statement.children.last)
          entry["class_methods"] << statement
        elsif statement.type == :send && statement.children[0..1] == [nil, :extend] &&
              constant(statement.children.fetch(2)).end_with?("Declarations")
          # The compiler implements this finite declaration protocol directly.
        elsif statement.type == :send && statement.children.first.nil? &&
              %i[inheritable_registry class_setting].include?(statement.children[1])
          _, macro, name, *options = statement.children
          raise CompileError, "#{macro} name must be a literal symbol" unless name&.type == :sym
          if macro == :inheritable_registry
            initial = options.empty? ? :hash : options.first&.children&.first
            unless options.length <= 1 && options.first&.type != :block && %i[hash array].include?(initial)
              raise CompileError, "registry storage must be :hash or :array"
            end
            entry["registries"] << {"name" => name.children.first.to_s, "initial" => initial.to_s}
          else
            raise CompileError, "class_setting coercion blocks are outside this slice" unless options.empty?
            entry["settings"] << name.children.first.to_s
          end
        elsif signature?(statement)
          # Sorbet checks signatures; executable definitions omit them.
        else
          raise CompileError, "unsupported ClassMethods body: #{statement.loc.expression.source}"
        end
      end
      names = entry["registries"].map { |item| item["name"] } + entry["settings"]
      raise CompileError, "duplicate class declaration" unless names.uniq == names
    end

    def signature?(node)
      node.type == :block && node.children.first.children[0..1] == [nil, :sig]
    end

    def signature_parameters(signature)
      return {} unless signature
      params = find_send(signature.children.last, :params)
      hash = params&.children&.find { |child| child.respond_to?(:children) && child.type == :hash }
      return {} unless hash
      hash.children.to_h do |pair|
        name, type = pair.children
        [name.children.first.to_s, type.loc.expression.source]
      end.compact
    end

    def find_send(node, method)
      return unless node.respond_to?(:children)
      return node if node.type == :send && node.children[1] == method
      node.children.each do |child|
        found = find_send(child, method)
        return found if found
      end
      nil
    end

    def declaration?(node)
      call = node.type == :block ? node.children.first : node
      call.type == :send && call.children.first.nil? && %i[property attribute].include?(call.children[1])
    end

    # Validate source before filters can erase or transform it (Pragma can
    # extract type hints from T.let, which is not annotation-only on MRI).
    def validate_expression!(node)
      return unless node.respond_to?(:type)
      if node.type == :const
        name = constant(node)
        if name == "T" || name.start_with?("T::")
          raise CompileError, "unsupported runtime Sorbet construct #{name}"
        end
      elsif node.type == :send &&
            %i[public_send send __send__ const_get define_method instance_exec eval method_missing].include?(node.children[1])
        raise CompileError, "runtime reflection #{node.children[1]} is outside this spike"
      end
      node.children.each { |child| validate_expression!(child) }
    end

    def collect_property(entry, node)
      call = node.type == :block ? node.children.first : node
      _, macro, name, options = call.children
      raise CompileError, "declaration names must be literal symbols" unless name&.type == :sym
      raise CompileError, "declarations require type: and optional default:" unless options&.type == :hash
      pairs = options.children.to_h do |pair|
        key, value = pair.children
        raise CompileError, "expected literal keyword" unless key.type == :sym
        [key.children.first, value]
      end
      raise CompileError, "unknown declaration keyword" unless (pairs.keys - %i[type default key]).empty?
      type = pairs.fetch(:type) { raise CompileError, "declaration requires type:" }.loc.expression.source
      if macro == :attribute && !pairs.key?(:default)
        raise CompileError, "attribute declaration requires default:"
      end
      unless type.match?(/\A(?:String|Integer|T::Boolean|T\.nilable\((?:String|[A-Z]\w*(?:::\w+)*)\)|[A-Z]\w*(?:::\w+)*)\z/)
        raise CompileError, "unsupported declaration type #{type}"
      end
      computed = node.type == :block
      property_name = name.children.first.to_s
      unless property_name.match?(/\A[a-z_]\w*\??\z/) && (computed || !property_name.end_with?("?"))
        raise CompileError, "unsupported property name #{property_name}"
      end
      raise CompileError, "computed attributes are outside this spike" if computed && macro == :attribute
      raise CompileError, "computed default is ambiguous" if computed && pairs.key?(:default)
      if computed && !node.children[1].children.empty?
        raise CompileError, "computed blocks cannot take arguments"
      end
      default = pairs[:default]
      unless computed || default.nil? || %i[str int nil true false].include?(default.type)
        raise CompileError, "spike supports only immutable literal defaults"
      end
      wire_key = pairs[:key]
      if wire_key && !%i[sym str].include?(wire_key.type)
        raise CompileError, "attribute key must be a literal symbol or string"
      end
      validate_expression!(node.children.last) if computed
      property = {
        "name" => name.children.first.to_s, "js" => self.class.member(name.children.first),
        "type" => type, "attribute" => macro == :attribute, "computed" => computed,
        # Include comments after the final expression, where type pragmas live.
        "expression" => computed ? node.loc.begin.end.join(node.loc.end.begin).source : (default&.loc&.expression&.source || "nil")
      }
      property["key"] = wire_key ? wire_key.children.first.to_s : name.children.first.to_s if macro == :attribute
      entry["properties"] << property
    end
  end

  # Ruby2JS extension points, not textual substitutions over generated JS.
  # Explicitly chosen semantics: Ruby truthiness, value equality, Ruby method
  # calls (even without parentheses), and shared dynamic/static value readers.
  module RubySurface
    # Wrap the built-in so framework properties and Ruby semantics take priority
    # over its type inference. Unhandled nodes flow through Pragma via super.
    include ::Ruby2JS::Filter::Pragma

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
      @local_types = method ? method["parameters"].dup : {}
      infer_local_types(body).each do |local, type|
        @local_types[local] = type
      end
      # Ruby2JS's explicit method node preserves source locations for filters.
      super(node.updated(:defm, [Knowledge.member(name).to_sym, args, body]))
    ensure
      @local_types = previous
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

    def on_send(node)
      receiver, method, *args = node.children
      if receiver&.type == :self && method == :class && args.empty?
        return s(:attr, s(:self), :constructor)
      end
      if %i[strip upcase downcase blank?].include?(method) && args.empty? && receiver
        runtime_method = method == :blank? ? :isBlank : method
        return s(:call, s(:const, nil, :Runtime), runtime_method, process(receiver))
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
      if receiver && receiver.type != :self && @all_properties.include?(method.to_s) && args.empty?
        # The receiver's class may only become known at runtime. A name used
        # for a property elsewhere may be an ordinary method on this object.
        return s(:call, s(:const, nil, :Runtime), :read, process(receiver), s(:str, method.to_s))
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

    def infer_local_types(node)
      all_assignments = Hash.new { |hash, name| hash[name] = [] }
      collect_local_assignments(node, all_assignments)
      direct_assignments = @knowledge.statements(node).select { |statement| statement.type == :lvasgn }
        .group_by { |statement| statement.children.first.to_s }
      # Parameter signatures describe entry values, not later assignments.
      # Without full flow analysis, an assigned parameter is no longer static.
      all_assignments.each_key { |name| @local_types.delete(name) }
      assignments = direct_assignments.select do |name, values|
        values.length == all_assignments[name].length && first_local_reference(node, name) >= values.first.loc.expression.begin_pos
      end.transform_values { |values| values.map { |assignment| assignment.children.last } }
      inferred = {}
      loop do
        additions = assignments.filter_map do |name, values|
          types = values.map { |value| static_type(value) }.uniq
          [name, types.first] if types.length == 1 && types.first && @local_types[name] != types.first
        end.to_h
        break if additions.empty?
        @local_types.merge!(additions)
        inferred.merge!(additions)
      end
      inferred
    end

    def first_local_reference(node, name)
      positions = []
      collect_local_references(node, name, positions)
      positions.min || Float::INFINITY
    end

    def collect_local_references(node, name, positions)
      return unless node.respond_to?(:type)
      if node.type == :lvar && node.children.first.to_s == name
        positions << node.loc.expression.begin_pos
      end
      node.children.each { |child| collect_local_references(child, name, positions) }
    end

    def collect_local_assignments(node, assignments)
      return unless node.respond_to?(:type)
      if node.type == :lvasgn
        name, value = node.children
        assignments[name.to_s] << value
      end
      node.children.each { |child| collect_local_assignments(child, assignments) }
    end

    def literal_type(node)
      return unless node.respond_to?(:type)
      {
        str: "String", int: "Integer", true: "T::Boolean", false: "T::Boolean",
        nil: "NilClass", sym: "Symbol", array: "Array", hash: "Hash"
      }[node.type]
    end

    def static_type(node)
      return unless node.respond_to?(:type)
      return literal_type(node) if literal_type(node)
      return @local_types[node.children.first.to_s] if node.type == :lvar
      return "T::Boolean" if node.type == :send && %i[== != !].include?(node.children[1])
      if node.type == :send
        receiver, method, *args = node.children
        if args.empty? && (receiver.nil? || receiver.type == :self)
          return @property_types[method.to_s]
        end
      end
      nil
    end

    def truthiness_kind(type)
      return :unknown unless type
      return :boolean if type == "T::Boolean"
      return :nil if type == "NilClass"
      if (match = type.match(/\AT\.nilable\((.+)\)\z/))
        return %w[String Integer Symbol].include?(match[1]) ? :nullable_scalar : :native
      end
      return :scalar if %w[String Integer Symbol].include?(type)
      return :native if type.match?(/\A(?:Array|Hash|[A-Z]\w*(?:::\w+)*)\z/)
      :unknown
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

    def native_equality?(left_type, right_type)
      [left_type, right_type].any? { |type| type && type != "Array" && type != "T.untyped" }
    end

    def deferred(value)
      s(:block, s(:send, nil, :lambda), s(:args), value)
    end

  end

  # Last in the filter chain: only calls not lowered by a built-in reach here.
  # Do not preempt Pragma with a catch-all :call conversion.
  module RubyCalls
    include ::Ruby2JS::Filter::SEXP

    def on_send(node)
      receiver, method, *args = node.children
      return super if %i[new raise].include?(method)
      # Operators and indexing are native converter syntax, not named methods.
      return super if ::Ruby2JS::Filter::Processor::BINARY_OPERATORS.include?(method) ||
        %i[[] []=].include?(method)
      s(:call, receiver ? process(receiver) : s(:self),
        Knowledge.member(method).to_sym, *process_all(args))
    end
  end

  # Browser-only framework source uses Ruby as JavaScript syntax. It keeps
  # Ruby2JS's native DOM property/call behavior while retaining Swill's
  # collision-safe class names.
  module JavaScriptSurface
    include ::Ruby2JS::Filter::SEXP

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

      resolved = @knowledge.resolve(name, @scope)
      s(:const, nil, Knowledge.identifier(resolved).to_sym)
    end

    private

    def resolve_parameter_class(type)
      return unless type.match?(/\A[A-Z]\w*(?:::\w+)*\z/)
      @knowledge.resolve(type, @entry["scope"])
    rescue CompileError
      nil
    end
  end

  class Compiler
    attr_reader :knowledge

    def initialize(imports: [])
      @knowledge = Knowledge.new(imports)
    end

    def add(source, file: "(spike)", javascript_only: false)
      knowledge.collect(source, file, javascript_only: javascript_only)
      self
    end

    def javascript(runtime:, framework: nil)
      validate!
      # Single-module form for executable compiler fixtures. Production uses
      # modules below; both paths emit the same definitions and meta object.
      self.class.format_javascript([
        imports(runtime, framework), definitions, "const meta = #{meta_object};",
        "Runtime.install(meta);"
      ].join("\n"))
    end

    def modules(name:, runtime:, framework: nil, publish: nil)
      validate!
      references = knowledge.local.flat_map do |entry|
        [entry["identifier"], *(entry["extends_class_methods"] ? ["#{entry['identifier']}_ClassMethods"] : [])]
      end.join(", ")
      entrypoint = [
        "import {Runtime} from #{runtime.to_json};",
        "import {meta} from './#{name}.meta.mjs';"
      ]
      if publish
        entrypoint << "import * as definitions from './#{name}.classes.mjs';"
        entrypoint << "if (globalThis[#{publish.to_json}]) throw new Error('Framework already loaded');"
      end
      entrypoint << "Runtime.install(meta);"
      if publish
        entrypoint << "globalThis[#{publish.to_json}] = Object.freeze({" \
          "...definitions, Runtime, install: meta => Runtime.install(meta)});"
      end
      entrypoint << "export * from './#{name}.classes.mjs';"
      {
        "#{name}.classes.mjs" => self.class.format_javascript(
          "#{imports(runtime, framework)}\n#{definitions}"
        ),
        "#{name}.meta.mjs" => self.class.format_javascript(
          "#{imports(runtime, framework)}\n" \
          "import {#{references}} from './#{name}.classes.mjs';\n" \
          "export const meta = #{meta_object};"
        ),
        "#{name}.mjs" => self.class.format_javascript(entrypoint.join("\n"))
      }
    end

    def imports(runtime, framework)
      lines = [%{import {Runtime} from #{runtime.to_json};}]
      imported = knowledge.entries.select { |entry| entry["imported"] }
      if imported.any?
        raise CompileError, "framework import required" unless framework
        names = imported.flat_map do |entry|
          [entry["identifier"], *(entry["extends_class_methods"] ? ["#{entry['identifier']}_ClassMethods"] : [])]
        end
        lines << "import {#{names.join(', ')}} from #{framework.to_json};"
      end
      lines.join("\n")
    end

    def definitions
      lines = []
      knowledge.local.each do |entry|
        scope = entry["scope"]
        id = entry["identifier"]
        mixin = entry["kind"] == "mixin"
        parent = mixin ? "Superclass" : (entry["parent"] ? reference(entry["parent"], scope) : "Object")
        class_name = mixin ? "#{id}_Layer" : id
        source = entry["node"].loc.expression.source
        js = convert(source, entry, compiled_class: class_name, compiled_parent: parent)
        if mixin
          lines << "export function #{id}(Superclass) {\n#{js}\nreturn #{class_name};\n}"
          lines << class_method_factory(entry) if entry["extends_class_methods"]
        else
          # Ruby2JS may prepend truthiness helper declarations, so prefixing the
          # whole conversion with `export` would export a helper instead of the
          # class. Keep conversion structured and export the known declaration.
          lines << js
          lines << "export {#{id}};"
        end
      end
      lines.join("\n")
    end

    def meta_object
      groups = {"mixins" => [], "classes" => []}
      knowledge.local.each do |entry|
        mixin = entry["kind"] == "mixin"
        fields = ["#{mixin ? 'factory' : 'constructor'}: #{entry['identifier']}"]
        if mixin && entry["extends_class_methods"]
          fields << "classFactory: #{entry['identifier']}_ClassMethods"
        end
        unless mixin
          references = entry["includes"].map { |name| reference(name, entry["scope"]) }
          fields << "mixins: [#{references.join(', ')}]" unless references.empty?
          properties = entry["properties"].map do |property|
            "#{object_key(property['name'])}: #{property_js(property, entry)}"
          end
          fields << "properties: {\n#{properties.join(",\n")}\n}"
          attributes = entry["properties"].select { |property| property["attribute"] }
          if attributes.any? && included_modules(entry).include?("Swill::Model::Attributes")
            seeds = attributes.map do |property|
              "#{object_key(property['name'])}: {property: #{property['name'].to_json}, key: #{property['key'].to_json}}"
            end
            fields << "registries: {model_attributes: {\n#{seeds.join(",\n")}\n}}"
          end
        end
        methods = entry["methods"].map do |method|
          descriptor = {"arity" => method["arity"]}
          descriptor["js"] = method["js"] if method["js"] != method["name"]
          "#{object_key(method['name'])}: #{JSON.pretty_generate(descriptor)}"
        end
        fields << "methods: {\n#{methods.join(",\n")}\n}"
        groups[mixin ? "mixins" : "classes"] << "#{entry['name'].to_json}: {\n#{fields.join(",\n")}\n}"
      end
      "{\n#{groups.map { |name, entries| "#{name}: {\n#{entries.join(",\n")}\n}" }.join(",\n")}\n}"
    end

    # Use the project's existing JS parser/printer, not substitutions over
    # generated text. Formatting is part of every emission, without bundling,
    # minification, or changing the ES module boundary.
    def self.format_javascript(source)
      output, errors, status = Open3.capture3(
        "esbuild", "--loader=js", "--target=es2022", "--charset=utf8", stdin_data: source
      )
      raise CompileError, "generated JavaScript could not be formatted: #{errors}" unless status.success?
      output
    rescue Errno::ENOENT
      raise CompileError, "esbuild is required to format generated JavaScript"
    end

    def rbi
      lines = ["# typed: true", "# Generated by the spike compiler. Do not edit."]
      knowledge.local.each do |entry|
        mixin = entry["kind"] == "mixin"
        properties = mixin ? entry["included_properties"] : entry["properties"]
        unless mixin && properties.empty?
          declaration = "#{mixin ? 'module' : 'class'} #{entry['name']}"
          if !mixin && entry["parent"]
            declaration << " < #{knowledge.resolve(entry['parent'], entry['scope'])}"
          end
          lines << declaration
          lines << "  extend T::Sig"
          properties.each do |property|
            name, type = property.values_at("name", "type")
            lines << "  sig { returns(#{type}) }"
            lines << "  def #{name}; end"
            unless property["computed"]
              lines << "  sig { params(value: #{type}).returns(#{type}) }"
              lines << "  def #{name}=(value); end"
            end
          end
          lines << "end"
        end
        if mixin && entry["extends_class_methods"]
          lines << "module #{entry['name']}::ClassMethods"
          lines << "  extend T::Sig"
          entry["registries"].each do |registry|
            collection = registry["initial"] == "array" ? "T::Array[T.untyped]" : "T::Hash[T.untyped, T.untyped]"
            lines << "  sig { returns(#{collection}) }"
            lines << "  def #{registry['name']}; end"
          end
          entry["settings"].each do |name|
            lines << "  sig { params(values: T.untyped).returns(T.untyped) }"
            lines << "  def #{name}(*values); end"
          end
          lines << "end"
        end
      end
      lines.join("\n") + "\n"
    end

    # Sorbet can bind DSL blocks to the instance, but a single property macro
    # signature cannot express the different return type of every declaration.
    # Check each expression as a typed instance method as well. These methods
    # are never loaded on MRI or emitted into JavaScript.
    def type_probes
      lines = ["# typed: true", "# Generated declaration expression checks; never executed."]
      knowledge.local.select { |entry| entry["kind"] == "class" }.each do |entry|
        lines << "class #{entry['name']}"
        lines << "  extend T::Sig"
        entry["properties"].each do |property|
          lines << "  sig { returns(#{property['type']}) }"
          lines << "  def __spike_check_#{property['js']}"
          lines << property["expression"]
          lines << "  end"
        end
        lines << "end"
      end
      lines.join("\n") + "\n"
    end

    private

    def object_key(name)
      # In a JS object literal, "__proto__": value changes the prototype.
      # A computed key remains an ordinary metadata entry.
      name == "__proto__" ? "[#{name.to_json}]" : name.to_json
    end

    def validate!
      available = knowledge.entries.select { |entry| entry["imported"] }.map { |entry| entry["name"] }
      knowledge.local.each do |entry|
        parent = nil
        parent_name = entry["parent"] && knowledge.resolve(entry["parent"], entry["scope"])
        if parent_name && !available.include?(parent_name)
          raise CompileError, "superclass must be defined before #{entry['name']}"
        end
        if parent_name
          parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
          raise CompileError, "superclass must be a class" unless parent["kind"] == "class"
        end
        ancestors = parent ? included_modules(parent) : []
        entry["includes"].each do |name|
          resolved = knowledge.resolve(name, entry["scope"])
          raise CompileError, "mixin must be defined before #{entry['name']}" unless available.include?(resolved)
          target = knowledge.entries.find { |e| e["name"] == resolved }
          raise CompileError, "include target must be a mixin" unless target["kind"] == "mixin"
          raise CompileError, "duplicate include requires Ruby ancestor deduplication" if ancestors.include?(resolved)
          ancestors << resolved
        end
        if entry["kind"] == "mixin" && (entry["properties"].any? || entry["includes"].any?)
          raise CompileError, "spike mixins support instance methods only"
        end
        if entry["extends_class_methods"] && entry["class_methods"].empty? &&
           entry["registries"].empty? && entry["settings"].empty?
          raise CompileError, "ClassMethods module is missing or empty"
        end
        members = entry["properties"].map { |p| [p["js"], p["name"]] } +
          entry["methods"].map { |m| [m["js"], m["name"]] }
        raise CompileError, "colliding members in #{entry['name']}" unless members.map(&:first).uniq.length == members.length
        if entry["methods"].any? { |method| inherited_properties(entry).include?(method["name"]) }
          raise CompileError, "method/property overlap requires explicit lowering"
        end
        available << entry["name"]
      end
    end

    def reference(name, scope)
      resolved = knowledge.resolve(name, scope)
      Knowledge.identifier(resolved)
    end

    def convert(source, entry, compiled_class: nil, compiled_parent: nil)
      filters = entry["javascript_only"] ?
        [JavaScriptSurface, ::Ruby2JS::Filter::Return] :
        [RubySurface, ::Ruby2JS::Filter::Return, RubyCalls]
      ::Ruby2JS.convert(source, filters: filters,
                      eslevel: 2022, comparison: :identity, truthy: :js,
                      underscored_private: true,
                      knowledge: knowledge, spike_scope: entry["scope"],
                      entry: entry,
                      compiled_class: compiled_class, compiled_parent: compiled_parent,
                      properties: inherited_properties(entry),
                      property_types: inherited_property_types(entry),
                      all_properties: knowledge.entries.flat_map do |e|
                        (e["properties"] + e.fetch("included_properties", [])).map { |p| p["name"] }
                      end).to_s
    end

    def inherited_properties(entry)
      own = (entry["properties"] + entry.fetch("included_properties", [])).map { |property| property["name"] }
      return own if entry["parent"].nil?
      parent_name = knowledge.resolve(entry["parent"], entry["scope"])
      parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
      inherited_properties(parent) + own
    end

    def inherited_property_types(entry)
      own = (entry["properties"] + entry.fetch("included_properties", []))
        .to_h { |property| [property["name"], property["type"]] }
      return own if entry["parent"].nil?
      parent_name = knowledge.resolve(entry["parent"], entry["scope"])
      parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
      inherited_property_types(parent).merge(own)
    end

    def included_modules(entry)
      own = entry["includes"].map { |name| knowledge.resolve(name, entry["scope"]) }
      return own if entry["parent"].nil?
      parent_name = knowledge.resolve(entry["parent"], entry["scope"])
      parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
      included_modules(parent) + own
    end

    def property_js(property, entry)
      function = "#{property['computed'] ? 'compute' : 'default'}_#{property['js']}"
      expression = convert("def #{function}()\n#{property['expression']}\nend", entry)
      # A converted property function is embedded as an object value rather than
      # emitted at module scope, so contain any converter prelude and return the
      # named function.
      unless expression.lstrip.start_with?("function ")
        expression = "(() => {\n#{expression}\nreturn #{function};\n})()"
      end
      metadata = property.reject do |key, _|
        %w[expression name computed].include?(key) || (key == "js" && property["js"] == property["name"])
      end.map do |key, value|
        "#{key}: #{value.to_json}"
      end
      metadata << "#{property['computed'] ? 'compute' : 'defaultValue'}: #{expression}"
      "{\n#{metadata.join(",\n")}\n}"
    end

    def class_method_factory(entry)
      id = entry["identifier"]
      class_name = "#{id}_ClassMethods_Layer"
      methods = entry["class_methods"].map(&:loc).map { |location| location.expression.source }
      source = "class Placeholder < Object\n#{methods.join("\n")}\nend"
      js = convert(source, entry, compiled_class: class_name, compiled_parent: "Object")
      declarations = entry["registries"].map do |registry|
        name = registry["name"]
        "#{Knowledge.member(name)}() { return Runtime.inheritableRegistry(this, " \
          "#{name.to_json}, #{registry['initial'].to_json}); }"
      end
      declarations.concat(entry["settings"].map do |name|
        "#{Knowledge.member(name)}(...values) { return Runtime.classSetting(this, #{name.to_json}, values); }"
      end)
      unless declarations.empty?
        insertion = declarations.join("\n")
        js = js.sub(/\n}\s*\z/, "\n#{insertion}\n}")
      end
      <<~JS
        export function #{id}_ClassMethods(Superclass) {
          #{js}
          Object.setPrototypeOf(#{class_name}.prototype, Superclass);
          return #{class_name}.prototype;
        }
      JS
    end
  end
  end
end

# Transitional compatibility for callers of the spike API. New code should use
# Swill::Ruby2JS; this alias can be removed once downstream experiments migrate.
Spike = Swill::Ruby2JS unless defined?(Spike)
