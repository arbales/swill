# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Static type facts for the shared Ruby surface: what a node's type is and
    # which JavaScript operation that type justifies.
    module StaticTypes

        STRING_READERS = {strip: :strip, upcase: :upcase, downcase: :downcase,
                          blank?: :isBlank, present?: :isPresent, empty?: :isEmpty}.freeze
        BOOLEAN_READERS = %i[blank? present? empty? nil?].freeze
        # Ruby collection idioms with one JavaScript array equivalent, applied only
        # to receivers whose static type is an array.
        ARRAY_BLOCK_METHODS = {each: :forEach, map: :map, select: :filter}.freeze

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

        def string_type?(type)
          %w[String T.nilable(String)].include?(type)
        end

        def collection_type?(type)
          return false unless type
          type == "Array" || type == "Hash" || type.start_with?("T::Array[", "T::Hash[")
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
          case node.type
          when :dstr then "String"
          when :begin then node.children.length == 1 ? static_type(node.children.first) : nil
          when :lvar then @local_types[node.children.first.to_s]
          when :super, :zsuper then return_type(@current_method)
          when :send
            receiver, method, *args = node.children
            return "T::Boolean" if %i[== != !].include?(method)
            return "T::Boolean" if BOOLEAN_READERS.include?(method) && args.empty? && receiver
            if receiver.nil? || receiver.type == :self
              return @property_types[method.to_s] if args.empty? && @property_types.key?(method.to_s)
              return return_type(@knowledge.method_entry(@entry["name"], method))
            end
            receiver_type = static_type(receiver)
            if string_type?(receiver_type) && args.empty? && STRING_READERS.key?(method)
              return "String"
            end
            klass = swill_class(receiver_type)
            return nil unless klass
            property = @knowledge.property_entry(klass, method)
            return property["type"] if property && args.empty?
            return_type(@knowledge.method_entry(klass, method))
          end
        end

        def truthiness_kind(type)
          return :unknown unless type
          return :boolean if type == "T::Boolean"
          return :nil if type == "NilClass"
          if (match = type.match(/\AT\.nilable\((.+)\)\z/))
            return %w[String Integer Symbol].include?(match[1]) ? :nullable_scalar : :native
          end
          return :scalar if %w[String Integer Symbol].include?(type)
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
