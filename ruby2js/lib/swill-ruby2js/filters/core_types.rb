# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Lowerings for Ruby's core value types on the shared surface: what a
    # method on a String, Symbol, Integer, Float, Boolean, nil, Array, or Hash
    # receiver compiles to, and the static type of the result. Where Ruby and
    # JavaScript agree the JavaScript form is emitted; where they differ, a
    # runtime helper in values.mjs carries Ruby's rule. A method outside these
    # tables has no lowering and is rejected, so a gap is a build error rather
    # than a call to a JavaScript method that does not exist.
    module CoreTypes
      include ::Ruby2JS::Filter::SEXP

        # Sends the converter owns whatever the receiver: construction,
        # exceptions, callables, indexing, and unary operators.
        NATIVE_SENDS = %i[new raise lambda proc [] []= -@ +@ ! =~ !~].freeze
        OPERATORS = ::Ruby2JS::Filter::Processor::BINARY_OPERATORS

        # Each entry: [arities, result type, form]. A result of :receiver is
        # the receiver's own type without nilability; :element and
        # :nilable_element come from T::Array[X]; :keys, :values, :value, and
        # :nilable_value from T::Hash[K, V]. Forms: [:self], [:attr, name],
        # [:call, name], [:runtime, helper], [:custom, method].
        BOOLEAN = "T::Boolean"

        STRING = {
          to_s: [0, "String", [:self]],
          to_sym: [0, "Symbol", [:self]],
          dup: [0, "String", [:self]],
          length: [0, "Integer", [:attr, :length]],
          size: [0, "Integer", [:attr, :length]],
          empty?: [0, BOOLEAN, [:runtime, :isEmpty]],
          blank?: [0, BOOLEAN, [:runtime, :isBlank]],
          present?: [0, BOOLEAN, [:runtime, :isPresent]],
          strip: [0, "String", [:runtime, :strip]],
          upcase: [0, "String", [:runtime, :upcase]],
          downcase: [0, "String", [:runtime, :downcase]],
          capitalize: [0, "String", [:runtime, :capitalize]],
          include?: [1, BOOLEAN, [:call, :includes]],
          start_with?: [1, BOOLEAN, [:call, :startsWith]],
          end_with?: [1, BOOLEAN, [:call, :endsWith]],
          to_i: [0, "Integer", [:runtime, :toInteger]],
          to_f: [0, "Float", [:runtime, :toFloat]],
          chars: [0, "T::Array[String]", [:custom, :array_from]],
          split: [0..1, "T::Array[String]", [:runtime, :split]],
          slice: [1..2, "T.nilable(String)", [:runtime, :slice]]
        }.freeze

        SYMBOL = {
          to_s: [0, "String", [:self]],
          to_sym: [0, "Symbol", [:self]]
        }.freeze

        INTEGER = {
          to_s: [0, "String", [:runtime, :stringify]],
          to_i: [0, "Integer", [:self]],
          to_f: [0, "Float", [:self]],
          zero?: [0, BOOLEAN, [:custom, :zero]],
          positive?: [0, BOOLEAN, [:custom, :positive]],
          negative?: [0, BOOLEAN, [:custom, :negative]],
          even?: [0, BOOLEAN, [:custom, :even]],
          odd?: [0, BOOLEAN, [:custom, :odd]],
          abs: [0, "Integer", [:custom, :abs]],
          clamp: [2, "Integer", [:runtime, :clamp]],
          between?: [2, BOOLEAN, [:runtime, :between]],
          # Only with an Integer divisor; otherwise the native operator.
          "/": [1, "Integer", [:runtime, :intDiv]],
          "%": [1, "Integer", [:runtime, :modulo]]
        }.transform_keys(&:to_sym).freeze

        FLOAT = {
          to_s: [0, "String", [:runtime, :stringify]],
          to_i: [0, "Integer", [:custom, :truncate]],
          to_f: [0, "Float", [:self]],
          floor: [0, "Integer", [:custom, :floor]],
          ceil: [0, "Integer", [:custom, :ceil]],
          round: [0, "Integer", [:custom, :round]],
          zero?: [0, BOOLEAN, [:custom, :zero]],
          positive?: [0, BOOLEAN, [:custom, :positive]],
          negative?: [0, BOOLEAN, [:custom, :negative]],
          abs: [0, "Float", [:custom, :abs]],
          clamp: [2, "Float", [:runtime, :clamp]],
          between?: [2, BOOLEAN, [:runtime, :between]]
        }.freeze

        BOOLEAN_TYPE = {
          to_s: [0, "String", [:runtime, :stringify]]
        }.freeze

        NIL = {
          to_s: [0, "String", [:runtime, :stringify]],
          to_a: [0, "Array", [:custom, :empty_array]],
          to_i: [0, "Integer", [:custom, :zero_literal]]
        }.freeze

        ARRAY = {
          to_a: [0, :receiver, [:self]],
          dup: [0, :receiver, [:call, :slice]],
          length: [0, "Integer", [:attr, :length]],
          size: [0, "Integer", [:attr, :length]],
          count: [0, "Integer", [:attr, :length]],
          empty?: [0, BOOLEAN, [:runtime, :isEmpty]],
          blank?: [0, BOOLEAN, [:runtime, :isBlank]],
          present?: [0, BOOLEAN, [:runtime, :isPresent]],
          first: [0, :nilable_element, [:custom, :first]],
          last: [0, :nilable_element, [:custom, :last]],
          include?: [1, BOOLEAN, [:call, :includes]],
          index: [1, "T.nilable(Integer)", [:runtime, :indexOf]],
          push: [1, :receiver, [:runtime, :append]],
          "<<": [1, :receiver, [:runtime, :append]],
          unshift: [1, :receiver, [:runtime, :prepend]],
          pop: [0, :nilable_element, [:call, :pop]],
          shift: [0, :nilable_element, [:call, :shift]],
          join: [0..1, "String", [:custom, :join]],
          reverse: [0, :receiver, [:runtime, :reverse]],
          sort: [0, :receiver, [:runtime, :sort]],
          uniq: [0, :receiver, [:runtime, :uniq]],
          compact: [0, :receiver, [:runtime, :compact]],
          flatten: [0, "Array", [:runtime, :flatten]],
          sum: [0, "Integer", [:runtime, :sum]],
          min: [0, :nilable_element, [:runtime, :min]],
          max: [0, :nilable_element, [:runtime, :max]],
          take: [1, :receiver, [:custom, :take]],
          drop: [1, :receiver, [:custom, :drop]],
          "+": [1, :receiver, [:call, :concat]],
          "-": [1, :receiver, [:runtime, :difference]]
        }.transform_keys(&:to_sym).freeze

        HASH = {
          to_h: [0, :receiver, [:self]],
          dup: [0, :receiver, [:custom, :copy_object]],
          length: [0, "Integer", [:custom, :key_count]],
          size: [0, "Integer", [:custom, :key_count]],
          count: [0, "Integer", [:custom, :key_count]],
          empty?: [0, BOOLEAN, [:runtime, :isEmpty]],
          blank?: [0, BOOLEAN, [:runtime, :isBlank]],
          present?: [0, BOOLEAN, [:runtime, :isPresent]],
          key?: [1, BOOLEAN, [:custom, :has_key]],
          has_key?: [1, BOOLEAN, [:custom, :has_key]],
          include?: [1, BOOLEAN, [:custom, :has_key]],
          keys: [0, :keys, [:custom, :keys]],
          values: [0, :values, [:custom, :values]],
          fetch: [1..2, :value, [:runtime, :fetch]],
          delete: [1, :nilable_value, [:runtime, :deleteKey]],
          merge: [1, :receiver, [:custom, :merge]]
        }.freeze

        TABLES = {
          string: STRING, symbol: SYMBOL, integer: INTEGER, float: FLOAT,
          boolean: BOOLEAN_TYPE, nil: NIL, array: ARRAY, hash: HASH
        }.freeze

        # Block methods: [target, result type, body mode, post]. The target is
        # a JavaScript method or [:runtime, helper] taking the arrow function.
        # Body modes: :plain, :truthy (the last expression is read with Ruby
        # truthiness, since JavaScript's filter and find use its own), and
        # :negated. Post: :negate, :length, or :from_entries.
        ARRAY_BLOCKS = {
          each: [:forEach, :receiver, :plain],
          each_with_index: [:forEach, :receiver, :plain],
          map: [:map, "T::Array[T.untyped]", :plain],
          flat_map: [:flatMap, "T::Array[T.untyped]", :plain],
          select: [:filter, :receiver, :truthy],
          filter: [:filter, :receiver, :truthy],
          reject: [:filter, :receiver, :negated],
          find: [:find, :nilable_element, :truthy],
          detect: [:find, :nilable_element, :truthy],
          any?: [:some, BOOLEAN, :truthy],
          all?: [:every, BOOLEAN, :truthy],
          none?: [:some, BOOLEAN, :truthy, :negate],
          count: [:filter, "Integer", :truthy, :length],
          sort_by: [[:runtime, :sortBy], :receiver, :plain],
          min_by: [[:runtime, :minBy], :nilable_element, :plain],
          max_by: [[:runtime, :maxBy], :nilable_element, :plain]
        }.freeze

        # Hash blocks iterate Object.entries; |key, value| destructures each
        # pair, and a single parameter receives the pair as Ruby does.
        HASH_BLOCKS = {
          each: [:forEach, :receiver, :plain],
          map: [:map, "T::Array[T.untyped]", :plain],
          select: [:filter, :receiver, :truthy, :from_entries],
          filter: [:filter, :receiver, :truthy, :from_entries],
          reject: [:filter, :receiver, :negated, :from_entries],
          any?: [:some, BOOLEAN, :truthy],
          all?: [:every, BOOLEAN, :truthy],
          count: [:filter, "Integer", :truthy, :length]
        }.freeze

        def core_kind(type)
          return nil unless type
          inner = type[/\AT\.nilable\((.+)\)\z/, 1] || type
          case inner
          when "String" then :string
          when "Symbol" then :symbol
          when "Integer" then :integer
          when "Float" then :float
          when "T::Boolean" then :boolean
          when "NilClass" then :nil
          else
            return :array if inner == "Array" || inner.start_with?("T::Array[")
            return :hash if inner == "Hash" || inner.start_with?("T::Hash[")
            nil
          end
        end

        def lower_core(node, kind, type, receiver, method, args)
          # A synthesized node came from a filter, and a pragma names the
          # JavaScript form itself; both belong to the converter.
          return nil if node.loc.nil? || %i[array hash string].any? { |pragma| pragma?(node, pragma) }
          entry = TABLES.fetch(kind)[method]
          entry = nil if kind == :integer && %i[/ %].include?(method) && static_type(args.first) != "Integer"
          if entry.nil?
            return nil if NATIVE_SENDS.include?(method) || OPERATORS.include?(method)
            raise CompileError, "no lowering for #{type}##{method}; docs/compiler.md lists the core type methods"
          end
          arities, _result, form = entry
          unless arities === args.length
            raise CompileError, "#{type}##{method} takes #{arities} argument(s), not #{args.length}"
          end
          # to_s on a receiver that may be nil is "", as nil.to_s is.
          form = [:runtime, :stringify] if method == :to_s && type.start_with?("T.nilable(")
          emit_core(form, process(receiver), process_all(args))
        end

        def lower_core_block(node, kind, type, receiver, method, call_args, args, body)
          return nil if node.loc.nil?
          table = {array: ARRAY_BLOCKS, hash: HASH_BLOCKS}[kind]
          entry = table && call_args.empty? && table[method]
          unless entry
            raise CompileError, "no lowering for #{type}##{method} with a block; docs/compiler.md lists the core type methods"
          end
          target, _result, mode, post = entry
          previous = @local_types
          @local_types = previous.dup
          args = s(:args, s(:mlhs, *args.children)) if kind == :hash && args.children.length == 2
          type_block_parameters(kind, type, method, args)
          body_node =
            case mode
            when :truthy then truthy_body(body, false)
            when :negated then truthy_body(body, true)
            else body ? process(body) : s(:begin)
            end
          subject = process(receiver)
          subject = s(:call, s(:const, nil, :Object), :entries, subject) if kind == :hash
          call =
            if target.is_a?(Array)
              s(:call, s(:const, nil, :Runtime), target[1], subject, s(:block, s(:send, nil, :lambda), args, body_node))
            else
              s(:block, s(:call, subject, target), args, body_node)
            end
          case post
          when :negate then s(:send, s(:begin, call), :!)
          when :length then s(:attr, call, :length)
          when :from_entries then s(:call, s(:const, nil, :Object), :fromEntries, call)
          else call
          end
        ensure
          @local_types = previous if previous
        end

        # The static type a core method or block returns, or nil.
        def core_result_type(type, method, args)
          kind = core_kind(type)
          return nil unless kind
          entry = TABLES.fetch(kind)[method]
          return nil unless entry && entry[0] === args.length
          return nil if kind == :integer && %i[/ %].include?(method) && static_type(args.first) != "Integer"
          resolve_core_result(entry[1], type)
        end

        def core_block_result_type(type, method)
          table = {array: ARRAY_BLOCKS, hash: HASH_BLOCKS}[core_kind(type)]
          entry = table && table[method]
          entry ? resolve_core_result(entry[1], type) : nil
        end

    private

        def emit_core(form, receiver, args)
          case form.first
          when :self then receiver
          when :attr then s(:attr, receiver, form[1])
          when :call then s(:call, receiver, form[1], *args)
          when :runtime then s(:call, s(:const, nil, :Runtime), form[1], receiver, *args)
          when :custom then send("core_#{form[1]}", receiver, args)
          end
        end

        def type_block_parameters(kind, type, method, args)
          parameters = args.children.flat_map { |arg| arg.type == :mlhs ? arg.children : [arg] }
          names = parameters.map { |arg| arg.children.first.to_s }
          if kind == :array
            element = element_type(type)
            @local_types[names[0]] = element if names[0] && element
            @local_types[names[1]] = "Integer" if method == :each_with_index && names[1]
          elsif names.length >= 2
            key, value = hash_types(type)
            @local_types[names[0]] = key if key
            @local_types[names[1]] = value if value
          end
        end

        # A block whose result JavaScript tests for truthiness: the last
        # expression is read with Ruby truthiness so 0 and "" stay true.
        def truthy_body(body, negate)
          return s(:nil) unless body
          if body.type == :begin && body.children.length > 1
            *rest, last = body.children
            s(:begin, *rest.map { |statement| process(statement) }, truthy_expression(last, negate))
          else
            truthy_expression(body, negate)
          end
        end

        def truthy_expression(node, negate)
          expression = ruby_truthy(node)
          negate ? s(:send, s(:begin, expression), :!) : expression
        end

        def resolve_core_result(result, type)
          inner = type[/\AT\.nilable\((.+)\)\z/, 1] || type
          case result
          when :receiver then inner
          when :element then element_type(inner) || "T.untyped"
          when :nilable_element then nilable_of(element_type(inner))
          when :keys then "T::Array[#{hash_types(inner)[0] || 'T.untyped'}]"
          when :values then "T::Array[#{hash_types(inner)[1] || 'T.untyped'}]"
          when :value then hash_types(inner)[1] || "T.untyped"
          when :nilable_value then nilable_of(hash_types(inner)[1])
          else result
          end
        end

        def nilable_of(type)
          return "T.untyped" if type.nil? || type == "T.untyped"
          type.start_with?("T.nilable(") ? type : "T.nilable(#{type})"
        end

        def element_type(type)
          type[/\AT::Array\[(.+)\]\z/, 1]
        end

        def hash_types(type)
          inside = type[/\AT::Hash\[(.+)\]\z/, 1]
          return [nil, nil] unless inside
          key, value = inside.split(",", 2)
          [key&.strip, value&.strip]
        end

        # ---- custom forms ----

        def javascript(name)
          s(:const, nil, name)
        end

        def core_array_from(receiver, _args) = s(:call, javascript(:Array), :from, receiver)
        def core_zero(receiver, _args) = s(:send, receiver, :==, s(:int, 0))
        def core_positive(receiver, _args) = s(:send, receiver, :>, s(:int, 0))
        def core_negative(receiver, _args) = s(:send, receiver, :<, s(:int, 0))
        def core_even(receiver, _args) = s(:send, s(:send, receiver, :%, s(:int, 2)), :==, s(:int, 0))
        def core_odd(receiver, _args) = s(:send, s(:send, receiver, :%, s(:int, 2)), :!=, s(:int, 0))
        def core_abs(receiver, _args) = s(:call, javascript(:Math), :abs, receiver)
        def core_truncate(receiver, _args) = s(:call, javascript(:Math), :trunc, receiver)
        def core_floor(receiver, _args) = s(:call, javascript(:Math), :floor, receiver)
        def core_ceil(receiver, _args) = s(:call, javascript(:Math), :ceil, receiver)
        def core_round(receiver, _args) = s(:call, javascript(:Math), :round, receiver)
        def core_empty_array(_receiver, _args) = s(:array)
        def core_zero_literal(_receiver, _args) = s(:int, 0)
        def core_first(receiver, _args) = s(:send, receiver, :[], s(:int, 0))
        def core_last(receiver, _args) = s(:call, receiver, :at, s(:int, -1))
        def core_join(receiver, args) = s(:call, receiver, :join, args.first || s(:str, ""))
        def core_take(receiver, args) = s(:call, receiver, :slice, s(:int, 0), args.first)
        def core_drop(receiver, args) = s(:call, receiver, :slice, args.first)
        def core_copy_object(receiver, _args) = s(:call, javascript(:Object), :assign, s(:hash), receiver)
        def core_key_count(receiver, _args) = s(:attr, s(:call, javascript(:Object), :keys, receiver), :length)
        def core_has_key(receiver, args) = s(:call, javascript(:Object), :hasOwn, receiver, args.first)
        def core_keys(receiver, _args) = s(:call, javascript(:Object), :keys, receiver)
        def core_values(receiver, _args) = s(:call, javascript(:Object), :values, receiver)
        def core_merge(receiver, args) = s(:call, javascript(:Object), :assign, s(:hash), receiver, args.first)
    end
  end
end
