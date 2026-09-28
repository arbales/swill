# frozen_string_literal: true

module Swill
  module Distant
    # A `Type` describes a value that crosses the connection: a field, a
    # remote method's parameter or its result. It is the schema's type, not
    # Sorbet's or Ruby's, so client and server agree on it whatever either
    # loaded. The kinds are `primitive` (`String`, `Integer`, `Float`,
    # `Boolean`, `Time`, `Date`), `optional`, `array`, `union`, `enum` with
    # `literal` members, `result_set`, `model` and `model_ref` naming a
    # server model, `value` naming a `Value` subclass, and `dynamic` for
    # `T.untyped`. `Types` normalizes one from a Sorbet type or its string
    # spelling, from the facade `swill/server` supplies without Sorbet, or
    # from a reflected column; the `Schema` writes it into the payload, the
    # generator renders it into the client RBI, and the `Validator` checks
    # values against it.
    #
    # A type is immutable, and two types with the same `to_h` are equal.
    # Application code writes Sorbet spellings and the `Generic` constants
    # rather than constructing types directly:
    #
    #     fields body: T.nilable(String)
    #     query :search, returns: Swill::Distant::ResultSet[Post]
    #
    # See [Server Data](rdoc-ref:doc/server_data.md).
    class Type
      # The kind, one of the strings listed on the class.
      attr_reader :kind

      # The name for a `primitive`, `model`, `model_ref`, `value` or
      # `literal` type; nil for the others.
      attr_reader :name

      # The member types of an `optional`, `array`, `union`, `enum`,
      # `result_set` or `model_ref` type, in declaration order; an empty
      # array for the others.
      attr_reader :members

      # Creates a frozen type of `kind` with `name` and `members`, both
      # optional. `Types.normalize` and the `Generic` constants are the usual
      # constructors.
      def initialize(kind, name: nil, members: [])
        @kind = kind.to_s.freeze
        @name = name&.to_s&.freeze
        @members = members.freeze
        freeze
      end

      # Returns the type as the schema encodes it: a Hash with `"kind"`,
      # `"name"` when the type has one, and `"members"` as encoded Hashes
      # when it has any.
      def to_h
        { "kind" => kind }.tap do |result|
          result["name"] = name if name
          result["members"] = members.map { |member| Types.dump(member) } unless members.empty?
        end
      end

      # Returns true when `other` is a `Type` with the same encoding.
      def ==(other)
        other.is_a?(Type) && to_h == other.to_h
      end
    end

    # A `Generic` builds a `Type` for a kind that has no Sorbet spelling.
    # `ResultSet`, `ModelRef` and `Enum` are its instances; each takes its
    # members in square brackets, as `Swill::Distant::ResultSet[Post]` or
    # `Swill::Distant::Enum[:found, :missing]`. See
    # [Server Data](rdoc-ref:doc/server_data.md).
    class Generic
      # Creates a builder for types of `kind`.
      def initialize(kind)
        @kind = kind
      end

      # Returns a `Type` of this kind with `members`. For `Enum`, each member
      # becomes a `literal` type named by its string; for the others, each
      # member is normalized with `Types.normalize`.
      def [](*members)
        normalized = if @kind == "enum"
          members.map { |member| Type.new("literal", name: member.to_s) }
        else
          members.map { |member| Types.normalize(member) }
        end
        Type.new(@kind, members: normalized)
      end
    end

    # `Types` turns a Sorbet type, a class or a string spelling into a
    # `Type`. The `Interface` normalizes explicit field types, the `Schema`
    # parses reflected column types and Sorbet signatures, and the facade
    # normalizes the arguments of `T.nilable` and `T.any`. See
    # [Server Data](rdoc-ref:doc/server_data.md).
    module Types
      # The names of the primitive types, as they appear in `Type#name`.
      PRIMITIVES = %w[String Integer Float Boolean Time Date].freeze

      module_function

      # Returns the `Type` for `value`: `value` itself when it is a `Type`; a
      # `primitive` when its name is in `PRIMITIVES`; a `value` type for a
      # `Value` subclass; a `model` type for any other class or module; and
      # otherwise the result of parsing its string with `parse`.
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

      # Returns the `Type` spelled by `text`, the string form of a Sorbet
      # type: `T.nilable(X)` is `optional`, `T::Array[X]` and `Array[X]` are
      # `array`, `T.any(X, Y)` is `union`, `ResultSet[X]` and `ModelRef[X]`
      # are their kinds, `T::Boolean` and the other primitive names are
      # `primitive`, an empty string and `T.untyped` are `dynamic`, and any
      # other name is a `model`. Members are parsed recursively.
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

      # Returns `type` normalized and encoded as the schema's Hash form, as
      # `Type#to_h` returns it.
      def dump(type)
        normalize(type).to_h
      end

      # Returns the text inside `name[...]` or `name(...)` when `source` is
      # wrapped by `name`, or nil.
      def wrapped(source, name)
        square = "#{name}["
        round = "#{name}("
        if source.start_with?(square) && source.end_with?("]")
          source[square.length...-1]
        elsif source.start_with?(round) && source.end_with?(")")
          source[round.length...-1]
        end
      end

      # Splits `source` on the commas outside brackets and parentheses, so
      # the members of `T.any` keep their own nested types.
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

      private_class_method :wrapped, :split
    end

    # Builds a `result_set` type: `ResultSet[Post]` is the return type of a
    # query, loaded in the browser as a `Swill::Model::ResultSet`.
    ResultSet = Generic.new("result_set")

    # Builds a `model_ref` type: `ModelRef[Post]` is a reference to a model
    # sent by identity, without its fields.
    ModelRef = Generic.new("model_ref")

    # Builds an `enum` type: `Enum[:found, :missing]` accepts the named
    # literals, compared by their string form.
    Enum = Generic.new("enum")
  end
end
