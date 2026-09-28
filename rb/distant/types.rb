# frozen_string_literal: true

module Swill
  module Distant
    # One immutable protocol type. The schema uses this representation instead
    # of leaking Sorbet or a particular Ruby type system onto the wire.
    class Type
      attr_reader :kind, :name, :members

      def initialize(kind, name: nil, members: [])
        @kind = kind.to_s.freeze
        @name = name&.to_s&.freeze
        @members = members.freeze
        freeze
      end

      def to_h
        { "kind" => kind }.tap do |result|
          result["name"] = name if name
          result["members"] = members.map { |member| Types.dump(member) } unless members.empty?
        end
      end

      def ==(other)
        other.is_a?(Type) && to_h == other.to_h
      end
    end

    # Protocol types that have no direct Sorbet spelling.
    class Generic
      def initialize(kind)
        @kind = kind
      end

      def [](*members)
        normalized = if @kind == "enum"
          members.map { |member| Type.new("literal", name: member.to_s) }
        else
          members.map { |member| Types.normalize(member) }
        end
        Type.new(@kind, members: normalized)
      end
    end

    module Types
      PRIMITIVES = %w[String Integer Float Boolean Time Date].freeze

      module_function

      def normalize(value)
        return value if value.is_a?(Type)

        name = value.respond_to?(:name) ? value.name : value.to_s
        return Type.new("primitive", name: name) if PRIMITIVES.include?(name)
        if defined?(Swill::Distant::Value) && value.is_a?(Class) && value <= Swill::Distant::Value
          return Type.new("value", name: name)
        end
        return Type.new("model", name: name) if value.is_a?(Class) || value.is_a?(Module)

        parse(name)
      end

      def parse(text)
        source = text.to_s.gsub("T::Boolean", "Boolean").strip
        if (inner = wrapped(source, "T.nilable"))
          Type.new("optional", members: [parse(inner)])
        elsif (inner = wrapped(source, "T::Array"))
          Type.new("array", members: [parse(inner)])
        elsif (inner = wrapped(source, "T.any"))
          Type.new("union", members: split(inner).map { |item| parse(item) })
        elsif (inner = wrapped(source, "Array"))
          Type.new("array", members: [parse(inner)])
        elsif (inner = wrapped(source, "ResultSet"))
          Type.new("result_set", members: [parse(inner)])
        elsif (inner = wrapped(source, "ModelRef"))
          Type.new("model_ref", members: [parse(inner)])
        elsif PRIMITIVES.include?(source)
          Type.new("primitive", name: source)
        elsif source.empty? || source == "T.untyped"
          Type.new("dynamic")
        else
          Type.new("model", name: source)
        end
      end

      def dump(type)
        normalize(type).to_h
      end

      def wrapped(source, name)
        square = "#{name}["
        round = "#{name}("
        if source.start_with?(square) && source.end_with?("]")
          source[square.length...-1]
        elsif source.start_with?(round) && source.end_with?(")")
          source[round.length...-1]
        end
      end

      def split(source)
        depth = 0
        start = 0
        parts = []
        source.each_char.with_index do |character, index|
          depth += 1 if character == "[" || character == "("
          depth -= 1 if character == "]" || character == ")"
          next unless character == "," && depth.zero?

          parts << source[start...index].strip
          start = index + 1
        end
        parts << source[start..].strip
      end
    end

    ResultSet = Generic.new("result_set")
    ModelRef = Generic.new("model_ref")
    Enum = Generic.new("enum")
  end
end
