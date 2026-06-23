# frozen_string_literal: true

# Swill::Sig — a tiny, Swill-owned signature decorator for the shared
# client/server wire surface. It is deliberately *not* Sorbet:
#
# - It records signatures as introspectable metadata; it does not wrap
#   methods. Validation happens once, at the wire dispatch boundary, where
#   untrusted input enters. Trusted internal calls pay nothing.
# - Authoring (`sig { ... }` + `method_added`) runs on the server (MRI). The
#   client never authors sigs; it receives a plain-data manifest (`sig_manifest`)
#   and rebuilds signatures from it. So Opal's `method_added` support is not
#   load-bearing.
# - A declared type both *enforces structure* (a scalar type rejects arrays and
#   hashes — the scalar-smuggling guard) and *coerces* (via the value's own
#   rules). There is no type that means "column name" or "operator", so params
#   cannot be structure.
#
# Usage:
#
#   module MailingList::Commands
#     extend Swill::Sig
#
#     sig { params(name: String).void }
#     def rename(name)
#       self.name = name
#       save_changes
#     end
#   end
#
#   sig = MailingList::Commands.signature_for(:rename)
#   sig.coerce({ "name" => "Friends of Swill" })  # => { name: "Friends of Swill" }

module Swill
  module Sig
    # Raised when an untrusted value cannot be coerced to its declared type.
    # The wire layer renders this as a typed error response, never a 500.
    class Error < StandardError; end

    # Base class for the small type vocabulary. A Type knows how to coerce a
    # raw decoded value and how to describe itself as plain data.
    class Type
      def coerce(_value)
        raise NotImplementedError
      end

      def descriptor
        raise NotImplementedError
      end

      # Resolve a token used in a sig (a Ruby class like String, or a Type
      # instance from Swill::T) into a Type.
      def self.of(token)
        return token if token.is_a?(Type)

        PRIMITIVES[token] or
          raise Error, "unknown sig type: #{token.inspect} (use a primitive class or Swill::T.*)"
      end

      # Reject containers where a scalar is expected. This is the
      # scalar-smuggling guard: e.g. ["OR","WA"] sent where "OR" was declared
      # would otherwise silently become an IN(...) predicate downstream.
      def self.scalar!(value)
        if value.is_a?(Array) || value.is_a?(Hash)
          raise Error, "expected a scalar value, got #{value.class}"
        end

        value
      end

      # Rebuild a Type from its plain-data descriptor. The manifest is
      # server-authored (trusted), so symbolizing names here is safe.
      def self.from_descriptor(desc)
        if desc.is_a?(Array)
          kind, arg = desc
          kind = kind.to_sym if kind.is_a?(String)

          case kind
          when :nilable then Nilable.new(from_descriptor(arg))
          when :array   then ArrayOf.new(from_descriptor(arg))
          when :enum    then Enum.new(arg)
          else raise Error, "unknown type descriptor: #{desc.inspect}"
          end
        else
          name = desc.is_a?(String) ? desc.to_sym : desc
          PRIMITIVES_BY_NAME[name] or
            raise Error, "unknown type descriptor: #{desc.inspect}"
        end
      end
    end

    # A scalar primitive backed by a coercion block. The block must be an
    # expression (no `return`) — it is stored and called later.
    class Primitive < Type
      def initialize(name, &coercer)
        @name = name
        @coercer = coercer
      end

      def coerce(value)
        @coercer.call(value)
      end

      def descriptor
        @name
      end
    end

    class Boolean < Type
      def coerce(value)
        value = Type.scalar!(value)
        return value if value == true || value == false

        raise Error, "expected a boolean, got #{value.inspect}"
      end

      def descriptor
        :boolean
      end
    end

    class DateType < Type
      def coerce(value)
        value = Type.scalar!(value)
        raise Error, "expected an ISO-8601 date string, got #{value.class}" unless value.is_a?(String)

        require "date"
        begin
          Date.iso8601(value)
        rescue ArgumentError
          raise Error, "invalid date: #{value.inspect}"
        end
      end

      def descriptor
        :date
      end
    end

    # Money and other exact decimals. Rejects Float input to avoid binary
    # floating-point drift.
    class DecimalType < Type
      def coerce(value)
        value = Type.scalar!(value)
        require "bigdecimal"

        if value.is_a?(Integer)
          BigDecimal(value.to_s)
        elsif value.is_a?(String) && value.match?(/\A-?\d+(\.\d+)?\z/)
          BigDecimal(value)
        else
          raise Error, "expected a decimal string, got #{value.inspect}"
        end
      end

      def descriptor
        :decimal
      end
    end

    class Nilable < Type
      def initialize(inner)
        @inner = inner
      end

      def coerce(value)
        return nil if value.nil?

        @inner.coerce(value)
      end

      def descriptor
        [:nilable, @inner.descriptor]
      end
    end

    class ArrayOf < Type
      def initialize(inner)
        @inner = inner
      end

      def coerce(value)
        raise Error, "expected an array, got #{value.class}" unless value.is_a?(Array)

        value.map { |element| @inner.coerce(element) }
      end

      def descriptor
        [:array, @inner.descriptor]
      end
    end

    class Enum < Type
      def initialize(values)
        @values = values.map { |value| value.to_s.to_sym }
      end

      def coerce(value)
        candidate = Type.scalar!(value).to_s
        # Return the pre-existing symbol from the fixed allowlist; never
        # intern the untrusted client string (symbol-table DoS guard).
        match = @values.find { |allowed| allowed.to_s == candidate }
        match or raise Error, "expected one of #{@values.inspect}, got #{candidate.inspect}"
      end

      def descriptor
        [:enum, @values]
      end
    end

    PRIMITIVES = {
      String => Primitive.new(:string) do |value|
        value = Type.scalar!(value)
        raise Error, "expected a string, got #{value.class}" unless value.is_a?(String)

        value
      end,
      Integer => Primitive.new(:integer) do |value|
        value = Type.scalar!(value)
        if value.is_a?(Integer)
          value
        elsif value.is_a?(String) && value.match?(/\A-?\d+\z/)
          value.to_i
        else
          raise Error, "expected an integer, got #{value.inspect}"
        end
      end,
      Float => Primitive.new(:float) do |value|
        value = Type.scalar!(value)
        if value.is_a?(Numeric)
          value.to_f
        elsif value.is_a?(String) && value.match?(/\A-?\d+(\.\d+)?\z/)
          value.to_f
        else
          raise Error, "expected a float, got #{value.inspect}"
        end
      end,
    }.freeze

    PRIMITIVES_BY_NAME = {
      string: PRIMITIVES[String],
      integer: PRIMITIVES[Integer],
      float: PRIMITIVES[Float],
      boolean: Boolean.new,
      date: DateType.new,
      decimal: DecimalType.new,
    }.freeze

    # Collects the result of a `sig { ... }` block. `params`, `returns`, and
    # `void` chain and return self.
    class SigBuilder
      def params(**types)
        @params = types
        self
      end

      def returns(type)
        @returns = type
        self
      end

      def void
        @returns = :void
        self
      end

      def to_signature
        resolved = (@params || {}).each_with_object({}) do |(name, token), out|
          out[name] = Type.of(token)
        end

        result = @returns
        result = Type.of(result) unless result.nil? || result == :void

        Signature.new(resolved, result)
      end
    end

    # A resolved signature: typed params plus a return marker. The wire layer's
    # only job at the boundary is `coerce`.
    class Signature
      attr_reader :params, :returns

      def initialize(params, returns)
        @params = params   # { Symbol => Type }
        @returns = returns # Type | :void | nil
      end

      # Coerce an untrusted wire hash (string- or symbol-keyed) into a typed
      # keyword hash, or raise Swill::Sig::Error. Unknown keys are rejected
      # (default-deny on the param surface); missing keys reach their type,
      # which decides (e.g. a non-nilable type raises).
      def coerce(raw)
        raw ||= {}

        unknown = raw.keys.map(&:to_s) - @params.keys.map(&:to_s)
        raise Error, "unexpected params: #{unknown.join(', ')}" unless unknown.empty?

        @params.each_with_object({}) do |(name, type), out|
          out[name] = type.coerce(value_for(raw, name))
        end
      end

      # Plain-data form for the client manifest.
      def descriptor
        {
          params: @params.each_with_object({}) { |(name, type), out| out[name] = type.descriptor },
          returns: @returns.is_a?(Type) ? @returns.descriptor : @returns,
        }
      end

      # Rebuild a Signature from a (trusted, server-authored) descriptor.
      def self.from_descriptor(desc)
        raw_params = desc[:params] || desc["params"] || {}
        params = raw_params.each_with_object({}) do |(name, type_desc), out|
          out[name.to_sym] = Type.from_descriptor(type_desc)
        end

        result = desc[:returns] || desc["returns"]
        result = result.to_sym if result.is_a?(String)
        result = Type.from_descriptor(result) unless result.nil? || result == :void

        new(params, result)
      end

      private

      def value_for(raw, name)
        raw.key?(name) ? raw[name] : raw[name.to_s]
      end
    end

    # ---- the decorator surface (extended into a command/query module) ----

    def self.extended(base)
      base.instance_variable_set(:@__swill_pending_sig__, nil)
      base.instance_variable_set(:@__swill_signatures__, {})
    end

    def sig(&block)
      builder = SigBuilder.new
      builder.instance_exec(&block)
      @__swill_pending_sig__ = builder.to_signature
    end

    # Binds a pending `sig` to the method defined immediately after it. Only
    # ever runs on MRI; the client builds from the manifest instead.
    def method_added(name)
      if @__swill_pending_sig__
        @__swill_signatures__[name] = @__swill_pending_sig__
        @__swill_pending_sig__ = nil
      end
      super
    end

    def signature_for(name)
      @__swill_signatures__[name]
    end

    def signatures
      @__swill_signatures__.dup
    end

    # Plain-data manifest of every sig in this module, for shipping to the
    # client. { method_name => signature_descriptor }.
    def sig_manifest
      @__swill_signatures__.each_with_object({}) do |(name, signature), out|
        out[name] = signature.descriptor
      end
    end
  end

  # The type combinators. Primitive classes (String, Integer, Float) are used
  # directly in a sig; everything else comes from here.
  module T
    module_function

    def boolean
      Sig::Boolean.new
    end

    def date
      Sig::DateType.new
    end

    def decimal
      Sig::DecimalType.new
    end

    def nilable(inner)
      Sig::Nilable.new(Sig::Type.of(inner))
    end

    def array(inner)
      Sig::ArrayOf.new(Sig::Type.of(inner))
    end

    def enum(*values)
      Sig::Enum.new(values)
    end
  end
end
