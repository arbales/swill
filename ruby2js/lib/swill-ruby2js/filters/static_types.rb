# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Static type facts for the shared Ruby surface: what a node's type is and
    # which JavaScript operation that type justifies.
    module StaticTypes

        # Predicates every receiver answers, typed even when the receiver is not.
        BOOLEAN_READERS = %i[blank? present? empty? nil?].freeze
        SCALARS = %w[String Integer Float Symbol].freeze

    private

        def array_type?(type)
          return false unless type
          type == "Array" || type.start_with?("T::Array[")
        end

        def swill_class(type)
          return nil unless type
          name = type.sub(/\AT\.nilable\((.+)\)\z/, '\1')
          return nil unless name.match?(/\A[A-Z]\w*(?:::\w+)*\z/)
          resolved = @knowledge.resolve(name, @entry["name"].split("::"))
          @knowledge.entries.any? { |entry| entry["name"] == resolved } ? resolved : nil
        rescue CompileError
          nil
        end

        def return_type(method)
          type = method && method["returns"]
          type == "void" ? nil : type
        end

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

        # Local types for a method or static method body: its signature's
        # parameters, then inferred assignments.
        def local_types_for(entry_method, body)
          @local_types = entry_method ? entry_method["parameters"].dup : {}
          infer_local_types(body).each { |local, type| @local_types[local] = type }
        end

        # An instance variable assigned, anywhere in the class or its
        # ancestors and mixins, only values of one static class (or nil) has
        # that class, nilable since it starts unset. Anything else has no
        # type. Each assignment is typed in its own method's context.
        def infer_ivar_types(_class_node)
          @ivar_types = {}
          found = Hash.new { |hash, name| hash[name] = [] }
          entries_with_ivars(@entry).each do |entry|
            # An imported entry describes an interface, not source.
            next unless entry["node"]
            previous_entry = @entry
            @entry = entry
            @knowledge.statements(entry["node"].children.last).each do |statement|
              next unless %i[def defs].include?(statement.type)
              static = statement.type == :defs
              name = static ? statement.children[1] : statement.children[0]
              entry_method = entry.fetch(static ? "static_methods" : "methods", []).find { |candidate| candidate["name"] == name.to_s }
              body = statement.children.last
              previous = @local_types
              local_types_for(entry_method, body)
              assignments = Hash.new { |hash, key| hash[key] = [] }
              collect_ivar_assignments(body, assignments)
              assignments.each { |ivar, values| found[ivar].concat(values.map { |value| static_type(value) }) }
              @local_types = previous
            end
            @entry = previous_entry
          end
          @ivar_types = found.each_with_object({}) do |(name, kinds), types|
            next if kinds.any?(&:nil?)
            classes = kinds.map { |kind| canonical(kind[/\AT\.nilable\((.+)\)\z/, 1] || kind) }.uniq - ["NilClass"]
            next unless classes.length == 1 && swill_class(classes.first)
            types[name] = "T.nilable(#{classes.first})"
          end
        end

        # The entry, its mixins, and its superclass chain, as collected.
        def entries_with_ivars(entry)
          related = [entry]
          entry["includes"].each do |name|
            mixin = @knowledge.entries.find { |candidate| candidate["name"] == @knowledge.resolve(name, entry["scope"]) }
            related << mixin if mixin
          end
          if entry["parent"]
            parent = @knowledge.entries.find { |candidate| candidate["name"] == @knowledge.resolve(entry["parent"], entry["scope"]) }
            related.concat(entries_with_ivars(parent)) if parent
          end
          related
        rescue CompileError
          related
        end

        def collect_ivar_assignments(node, assignments)
          return unless node.respond_to?(:type)
          if node.type == :ivasgn
            name, value = node.children
            assignments[name.to_s] << value if value
          end
          node.children.each { |child| collect_ivar_assignments(child, assignments) }
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
            str: "String", int: "Integer", float: "Float", true: "T::Boolean", false: "T::Boolean",
            nil: "NilClass", sym: "Symbol", array: "Array", hash: "Hash"
          }[node.type]
        end

        def static_type(node)
          return unless node.respond_to?(:type)
          return literal_type(node) if literal_type(node)
          case node.type
          when :dstr then "String"
          when :begin then node.children.length == 1 ? static_type(node.children.first) : nil
          when :or then or_type(*node.children)
          when :lvar then @local_types[node.children.first.to_s]
          when :ivar then @ivar_types[node.children.first.to_s]
          when :super, :zsuper then return_type(@current_method)
          when :block
            call = node.children.first
            return nil unless call.type == :send
            receiver, method, *call_args = call.children
            return nil unless receiver && call_args.empty?
            core_block_result_type(static_type(receiver), method)
          when :send
            return sorbet_operation_type(node) if SorbetOperations.operation?(node)
            receiver, method, *args = node.children
            # Constructing a collected class yields that class; its static
            # methods yield their signature's return type.
            if receiver&.type == :const
              klass = swill_class(@knowledge.constant(receiver))
              return klass if klass && method == :new
              return klass ? return_type(@knowledge.static_method_entry(klass, method)) : nil
            end
            return "T::Boolean" if %i[== != ! < > <= >=].include?(method)
            return "T::Boolean" if BOOLEAN_READERS.include?(method) && args.empty? && receiver
            if receiver.nil? || receiver.type == :self
              return @property_types[method.to_s] if args.empty? && @property_types.key?(method.to_s)
              return return_type(@knowledge.method_entry(@entry["name"], method))
            end
            receiver_type = static_type(receiver)
            core = core_result_type(receiver_type, method, args)
            return core if core
            klass = swill_class(receiver_type)
            return nil unless klass
            property = @knowledge.property_entry(klass, method)
            return property["type"] if property && args.empty?
            return_type(@knowledge.method_entry(klass, method))
          end
        end

        # left || right: a nil left yields the right, so a nilable class on the
        # left with the same class on the right is that class; the same class
        # on both sides, nilable or not, keeps the right's nilability.
        def or_type(left, right)
          left_type = static_type(left)
          right_type = static_type(right)
          return nil unless left_type && right_type
          inner = left_type[/\AT\.nilable\((.+)\)\z/, 1] || left_type
          right_inner = right_type[/\AT\.nilable\((.+)\)\z/, 1] || right_type
          canonical(inner) == canonical(right_inner) ? right_type : nil
        end

        # A framework class by its full name, so View and Swill::View agree.
        def canonical(type)
          swill_class(type) || type
        end

        # T.must strips nilability, T.unsafe forgets the type, and the checked
        # operations assert theirs.
        def sorbet_operation_type(node)
          method = node.children[1]
          value, type = SorbetOperations.arguments(node)
          case method
          when :must
            inner = static_type(value)
            return nil if inner.nil? || inner == "NilClass"
            inner[/\AT\.nilable\((.+)\)\z/, 1] || inner
          when :unsafe then "T.untyped"
          when :absurd then nil
          else type
          end
        end

        def truthiness_kind(type)
          return :unknown unless type
          return :boolean if type == "T::Boolean"
          return :nil if type == "NilClass"
          if (match = type.match(/\AT\.nilable\((.+)\)\z/))
            return SCALARS.include?(match[1]) ? :nullable_scalar : :native
          end
          return :scalar if SCALARS.include?(type)
          return :native if type.start_with?("T::Array[", "T::Hash[")
          return :native if type.match?(/\A(?:Array|Hash|[A-Z]\w*(?:::\w+)*)\z/)
          :unknown
        end

        # Ruby == is identity for framework objects and value equality for scalars,
        # which JavaScript === also provides. Everything else needs isEqual.
        def native_equality?(left_type, right_type)
          [left_type, right_type].any? { |type| identity_comparable?(type) }
        end

        def identity_comparable?(type)
          return false unless type
          return true if %w[String Integer Float Symbol T::Boolean NilClass].include?(type)
          inner = type[/\AT\.nilable\((.+)\)\z/, 1]
          return identity_comparable?(inner) if inner
          !swill_class(type).nil?
        end

    end
  end
end
