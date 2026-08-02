# frozen_string_literal: true

# Pure-Ruby spec for Swill::KeyPath. Runs under MRI:
#
#   ruby spec/key_path_spec.rb
#
# KeyPath is DOM-free; the bindings layer on top is exercised through the Opal
# integration check.

require_relative "../spec_helper"
require "swill/core"

class KeyPathTest < Minitest::Test
  class Address
    include Swill::Observable
    property :city, default: "Portland"
  end

  class Person
    include Swill::Observable
    property :name, default: "Ada"
    property :address, default: -> { Address.new }
  end

  def setup
    @person = Person.new
  end

  # --- read -----------------------------------------------------------------

  def test_read_single_segment
    assert_equal "Ada", Swill::KeyPath.read(@person, ["name"])
  end

  def test_read_nested
    assert_equal "Portland", Swill::KeyPath.read(@person, %w[address city])
  end

  def test_read_through_nil_intermediate_is_nil
    @person.address = nil
    assert_nil Swill::KeyPath.read(@person, %w[address city])
  end

  def test_read_unknown_segment_is_nil
    assert_nil Swill::KeyPath.read(@person, %w[address nonexistent])
  end

  def test_read_hash_keys_in_method_style_paths
    root = Person.new
    root.define_singleton_method(:states) { { "name" => "asc", role: "desc" } }
    assert_equal "asc", Swill::KeyPath.read(root, %w[states name])
    assert_equal "desc", Swill::KeyPath.read(root, %w[states role])
  end

  # --- write ----------------------------------------------------------------

  def test_write_bang_nested
    Swill::KeyPath.write!(@person, %w[address city], "Salem")
    assert_equal "Salem", @person.address.city
  end

  def test_write_bang_through_nil_intermediate_is_noop
    @person.address = nil
    Swill::KeyPath.write!(@person, %w[address city], "Salem") # must not raise
    assert_nil @person.address
  end

  def test_write_bang_without_setter_raises
    assert_raises(NoMethodError) do
      Swill::KeyPath.write!(@person, %w[missing], "x")
    end
  end

  def test_writable_distinguishes_properties_from_method_results
    assert_equal true, Swill::KeyPath.writable?(@person, %w[address city])
    assert_equal false, Swill::KeyPath.writable?(@person, %w[name upcase])
    @person.address = nil
    assert_nil Swill::KeyPath.writable?(@person, %w[address city])
  end

  def test_write_bang_rejects_method_expression
    assert_raises(NoMethodError) do
      Swill::KeyPath.write!(@person, %w[name upcase], "GRACE")
    end
  end

  def test_ruby_predicates_can_be_read_as_expression_segments
    assert_equal false, Swill::KeyPath.read(@person, %w[name blank?])
    @person.name = "  "
    assert_equal true, Swill::KeyPath.read(@person, %w[name blank?])
  end

  # --- observe --------------------------------------------------------------

  def test_observe_fires_when_leaf_changes
    fired = 0
    Swill::KeyPath.observe(@person, %w[address city]) { fired += 1 }
    @person.address.city = "Bend"
    assert_equal 1, fired
  end

  def test_observe_fires_when_intermediate_reassigned
    fired = 0
    Swill::KeyPath.observe(@person, %w[address city]) { fired += 1 }
    @person.address = Address.new
    assert_equal 1, fired
  end

  def test_observe_rehooks_to_new_subtree
    seen = []
    Swill::KeyPath.observe(@person, %w[address city]) { seen << Swill::KeyPath.read(@person, %w[address city]) }

    fresh = Address.new
    @person.address = fresh        # fires once (reassignment)
    fresh.city = "Eugene"          # fires via the re-hooked subtree
    assert_equal ["Portland", "Eugene"], seen
  end

  def test_observe_ignores_old_subtree_after_reassignment
    fired = 0
    Swill::KeyPath.observe(@person, %w[address city]) { fired += 1 }

    stale = @person.address
    @person.address = Address.new  # fired => 1
    stale.city = "Ghost"           # must NOT fire; we've moved on
    assert_equal 1, fired
  end

  def test_disposer_unsubscribes_all_levels
    fired = 0
    off = Swill::KeyPath.observe(@person, %w[address city]) { fired += 1 }
    off.call
    @person.address = Address.new
    @person.address.city = "Nope"
    assert_equal 0, fired
  end

  def test_single_segment_observe
    seen = []
    Swill::KeyPath.observe(@person, ["name"]) { seen << @person.name }
    @person.name = "Grace"
    assert_equal ["Grace"], seen
  end
end
