# frozen_string_literal: true

# Pure-Ruby spec for Swill::Sig — the wire-surface signature decorator.
#
#   ruby spec/sig_spec.rb
#
# Covers coercion (the boundary job), the scalar-smuggling guard, the type
# vocabulary, descriptor round-tripping (server -> client manifest -> client),
# and the decorator surface.

require "minitest/autorun"
require_relative "../lib/swill/sig"

class SigTest < Minitest::Test
  include Swill

  # --- scalar primitives ----------------------------------------------------

  def test_string_passthrough
    assert_equal "hi", Sig::Type.of(String).coerce("hi")
  end

  def test_string_rejects_non_string
    assert_raises(Sig::Error) { Sig::Type.of(String).coerce(5) }
  end

  def test_integer_from_int_and_numeric_string
    assert_equal 5, Sig::Type.of(Integer).coerce(5)
    assert_equal(-7, Sig::Type.of(Integer).coerce("-7"))
  end

  def test_integer_rejects_garbage
    assert_raises(Sig::Error) { Sig::Type.of(Integer).coerce("1.5") }
    assert_raises(Sig::Error) { Sig::Type.of(Integer).coerce("x") }
  end

  def test_float_from_numeric_and_string
    assert_in_delta 1.5, Sig::Type.of(Float).coerce("1.5")
    assert_in_delta 2.0, Sig::Type.of(Float).coerce(2)
  end

  def test_float_rejects_garbage
    assert_raises(Sig::Error) { Sig::Type.of(Float).coerce("nope") }
  end

  def test_scalar_guard_rejects_containers
    assert_raises(Sig::Error) { Sig::Type.of(String).coerce(%w[a b]) }
    assert_raises(Sig::Error) { Sig::Type.of(Integer).coerce({ "a" => 1 }) }
  end

  def test_unknown_token
    assert_raises(Sig::Error) { Sig::Type.of(Object) }
  end

  # --- boolean / date / decimal ---------------------------------------------

  def test_boolean
    assert_equal true, T.boolean.coerce(true)
    assert_equal false, T.boolean.coerce(false)
    assert_raises(Sig::Error) { T.boolean.coerce("true") }
  end

  def test_date
    require "date"
    assert_equal Date.new(2026, 6, 24), T.date.coerce("2026-06-24")
    assert_raises(Sig::Error) { T.date.coerce("2026-13-01") }
    assert_raises(Sig::Error) { T.date.coerce(20260624) }
  end

  def test_decimal
    require "bigdecimal"
    assert_equal BigDecimal("9.99"), T.decimal.coerce("9.99")
    assert_equal BigDecimal("5"), T.decimal.coerce(5)
    assert_raises(Sig::Error) { T.decimal.coerce(1.5) }  # Float rejected
    assert_raises(Sig::Error) { T.decimal.coerce("nope") }
  end

  # --- combinators ----------------------------------------------------------

  def test_nilable
    type = T.nilable(String)
    assert_nil type.coerce(nil)
    assert_equal "x", type.coerce("x")
    assert_raises(Sig::Error) { type.coerce(3) }
  end

  def test_array
    type = T.array(Integer)
    assert_equal [1, 2, 3], type.coerce([1, "2", 3])
    assert_raises(Sig::Error) { type.coerce("not an array") }
  end

  def test_enum_returns_preexisting_symbol
    type = T.enum("favorite", "liked")
    assert_equal :favorite, type.coerce("favorite")
    assert_raises(Sig::Error) { type.coerce("loathed") }
  end

  def test_enum_does_not_intern_untrusted_string
    before = Symbol.all_symbols.size
    type = T.enum("a", "b")
    assert_raises(Sig::Error) { type.coerce("definitely_not_a_known_symbol_zzz") }
    assert_equal before, Symbol.all_symbols.size, "must not intern client strings"
  end

  # --- Signature.coerce -----------------------------------------------------

  def build(**params)
    Sig::Signature.new(params.transform_values { |type| Sig::Type.of(type) })
  end

  def test_coerce_symbol_and_string_keys
    sig = build(name: String, n: Integer)
    assert_equal({ name: "Ada", n: 4 }, sig.coerce("name" => "Ada", "n" => "4"))
    assert_equal({ name: "Ada", n: 4 }, sig.coerce(name: "Ada", n: 4))
  end

  def test_coerce_rejects_unknown_params
    assert_raises(Sig::Error) { build(name: String).coerce("name" => "x", "extra" => 1) }
  end

  def test_coerce_missing_key_reaches_type
    # Non-nilable String receives nil -> its guard raises.
    assert_raises(Sig::Error) { build(name: String).coerce({}) }
    # Nilable tolerates the absence.
    assert_equal({ name: nil }, build(name: T.nilable(String)).coerce({}))
  end

  # --- descriptor round-trip ------------------------------------------------

  def test_descriptor_roundtrip_rebuilds_equivalent_signature
    sig = build(name: String, tags: T.array(String), verdict: T.enum("a", "b"),
                when: T.nilable(T.date))

    rebuilt = Sig::Signature.from_descriptor(sig.descriptor)
    raw = { "name" => "x", "tags" => %w[a b], "verdict" => "a", "when" => nil }
    assert_equal sig.coerce(raw), rebuilt.coerce(raw)
    assert_equal sig.descriptor, rebuilt.descriptor
  end

  # --- decorator surface ----------------------------------------------------

  module Commands
    extend Swill::Sig

    § name: String
    def rename(name:)
      name
    end

    params verdict: Swill::T.enum("favorite", "liked")
    def set_verdict(verdict:)
      verdict
    end

    def untyped; end
  end

  def test_signature_for_binds_to_next_method
    assert Commands.signature_for(:rename)
    assert_equal({ name: "Friends" }, Commands.signature_for(:rename).coerce("name" => "Friends"))
  end

  def test_untyped_method_has_no_signature
    assert_nil Commands.signature_for(:untyped)
  end

  def test_sig_manifest_is_plain_data
    manifest = Commands.sig_manifest
    assert_equal %i[rename set_verdict].sort, manifest.keys.sort
    assert_equal :string, manifest[:rename][:params][:name]
    assert_equal [:enum, %i[favorite liked]], manifest[:set_verdict][:params][:verdict]
  end
end
