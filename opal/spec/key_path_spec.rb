# frozen_string_literal: true

# Pure-Ruby spec for Swill::KeyPath. Runs under MRI:
#
#   ruby spec/key_path_spec.rb
#
# KeyPath is DOM-free; the bindings layer on top is exercised through the Opal
# integration check.

require "minitest/autorun"
require_relative "../lib/swill/observable"
require_relative "../lib/swill/key_path"

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

  # --- write ----------------------------------------------------------------

  def test_write_nested
    Swill::KeyPath.write(@person, %w[address city], "Salem")
    assert_equal "Salem", @person.address.city
  end

  def test_write_through_nil_intermediate_is_noop
    @person.address = nil
    Swill::KeyPath.write(@person, %w[address city], "Salem") # must not raise
    assert_nil @person.address
  end

  def test_write_without_setter_is_noop
    # `address` has a setter, but reading-only leaf with no setter is a no-op.
    Swill::KeyPath.write(@person, %w[missing], "x") # must not raise
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
