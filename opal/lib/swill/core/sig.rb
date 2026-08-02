# frozen_string_literal: true

# TODO: We need to support DateTime as well.
#
# Swill::Sig — a tiny, Swill-owned signature decorator for the shared
# client/server wire surface. It is deliberately *not* Sorbet:
#
# - It records signatures as introspectable metadata; it does not wrap
#   methods. Validation happens once, at the wire dispatch boundary, where
#   untrusted input enters. Trusted internal calls pay nothing.
# - Authoring (`§ name: String` + `method_added`) runs on the server (MRI).
#   The client never authors sigs; it receives a plain-data manifest
#   (`sig_manifest`) and rebuilds signatures from it.
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
#     § name: String
#     def rename(name:)
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
    # raw decoded value (#coerce), encode a coerced value back to a wire-safe
    # JSON value (#encode), and describe itself as plain data (#descriptor).
    class Type
      # Most scalars are JSON-native and pass through; date and decimal
      # override with their canonical string forms.
      def encode(value)
        value
      end

      # Resolve a token used in a sig (a Ruby class like String, or a Type
      # instance from Swill::T) into a Type.
      def self.of(token)
        return token if token.is_a?(Type)

        name = SCALAR_CLASSES[token]
        name && SCALARS[name] or
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
          SCALARS[name] or
            raise Error, "unknown type descriptor: #{desc.inspect}"
        end
      end
    end

    # Every scalar leaf type is a Primitive: a wire-descriptor name plus a
    # coercion block. The scalar-smuggling guard runs once here, so a block
    # only ever sees a scalar. The block must be an expression (no `return`).
    class Primitive < Type
      def initialize(name, encode: nil, &coercer)
        @name = name
        @coercer = coercer
        @encoder = encode
      end

      def coerce(value)
        @coercer.call(Type.scalar!(value))
      end

      def encode(value)
        @encoder ? @encoder.call(value) : value
      end

      def descriptor
        @name
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

      def encode(value)
        value.nil? ? nil : @inner.encode(value)
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

      def encode(value)
        value.map { |element| @inner.encode(element) }
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

      def encode(value)
        value.to_s
      end

      def descriptor
        [:enum, @values]
      end
    end

    # The scalar vocabulary, defined once and keyed by wire descriptor. Stored
    # instances are stateless, so they are shared (Type.of, from_descriptor, and
    # Swill::T all hand back the same object).
    SCALARS = {
      string: Primitive.new(:string) do |value|
        raise Error, "expected a string, got #{value.class}" unless value.is_a?(String)

        value
      end,
      integer: Primitive.new(:integer) do |value|
        if value.is_a?(Integer)
          value
        elsif value.is_a?(String) && value.match?(/\A-?\d+\z/)
          value.to_i
        else
          raise Error, "expected an integer, got #{value.inspect}"
        end
      end,
      float: Primitive.new(:float) do |value|
        if value.is_a?(Numeric)
          value.to_f
        elsif value.is_a?(String) && value.match?(/\A-?\d+(\.\d+)?\z/)
          value.to_f
        else
          raise Error, "expected a float, got #{value.inspect}"
        end
      end,
      boolean: Primitive.new(:boolean) do |value|
        if value == true || value == false
          value
        else
          raise Error, "expected a boolean, got #{value.inspect}"
        end
      end,
      # Date and BigDecimal are resolved at coerce time and deliberately not
      # required here — a static require would compile Opal's date and
      # bigdecimal stdlibs into every client bundle. Callers using these
      # types require "date"/"bigdecimal" (and, on the client,
      # "swill/core/iso8601" for the Date.iso8601 polyfill) themselves.
      date: Primitive.new(:date, encode: ->(value) { value.iso8601 }) do |value|
        raise Error, "expected an ISO-8601 date string, got #{value.class}" unless value.is_a?(String)

        begin
          Date.iso8601(value)
        rescue ArgumentError
          raise Error, "invalid date: #{value.inspect}"
        end
      end,
      # Money and other exact decimals. Rejects Float to avoid binary
      # floating-point drift.
      decimal: Primitive.new(:decimal, encode: ->(value) { value.to_s("F") }) do |value|
        if value.is_a?(Integer)
          BigDecimal(value.to_s)
        elsif value.is_a?(String) && value.match?(/\A-?\d+(\.\d+)?\z/)
          BigDecimal(value)
        else
          raise Error, "expected a decimal string, got #{value.inspect}"
        end
      end,
    }.freeze

    # The Ruby classes that may be written directly in a sig, mapped to their
    # descriptor. Everything else comes through Swill::T.
    SCALAR_CLASSES = { String => :string, Integer => :integer, Float => :float }.freeze

    # A resolved signature: typed params. The wire layer's only job at the
    # boundary is `coerce`.
    class Signature
      attr_reader :params

      def initialize(params)
        @params = params # { Symbol => Type }
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

      # Encode a coerced params hash back to wire-safe JSON values, each
      # param through its own type.
      def encode(params)
        params.each_with_object({}) do |(name, value), out|
          type = @params[name]
          out[name] = type ? type.encode(value) : value
        end
      end

      # Plain-data form for the client manifest.
      def descriptor
        {
          params: @params.each_with_object({}) { |(name, type), out| out[name] = type.descriptor },
        }
      end

      # Rebuild a Signature from a (trusted, server-authored) descriptor.
      def self.from_descriptor(desc)
        raw_params = desc[:params] || desc["params"] || {}
        params = raw_params.each_with_object({}) do |(name, type_desc), out|
          out[name.to_sym] = Type.from_descriptor(type_desc)
        end

        new(params)
      end

      private

      def value_for(raw, name)
        Indifferent.fetch(raw, name)
      end
    end

    # The decorator surface (`extend Swill::Sig`, `§ name: String`,
    # sig_manifest) lives in swill/core/sig/authoring — required by server
    # code and specs, never from swill/core, so the client bundle carries
    # only the types and Signature.
  end

  # The type combinators. Primitive classes (String, Integer, Float) are used
  # directly in a sig; everything else comes from here.
  module T
    module_function

    def boolean = Sig::SCALARS[:boolean]
    def date    = Sig::SCALARS[:date]
    def decimal = Sig::SCALARS[:decimal]

    def nilable(inner) = Sig::Nilable.new(Sig::Type.of(inner))
    def array(inner)   = Sig::ArrayOf.new(Sig::Type.of(inner))
    def enum(*values)  = Sig::Enum.new(values)
  end
end
