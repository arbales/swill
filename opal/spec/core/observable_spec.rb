# frozen_string_literal: true

# Pure-Ruby spec for Swill::Observable. Runs under MRI (no Opal/DOM needed):
#
#   ruby spec/observable_spec.rb
#
# Observable has no backtick-JavaScript, so it loads and runs natively. The
# DOM-touching layers (bindings, outlets, responder/focus) get exercised
# separately through the Opal build + Node DOM shim.

require_relative "../spec_helper"
require "swill/core"

class ObservableTest < Minitest::Test
  class Person
    include Swill::Observable

    property :first, default: "Ada"
    property :last
    property :tags, default: -> { [] }

    property(:full_name) { "#{first} #{last}" }

    attr_reader :full_name_changes

    def initialize
      @full_name_changes = []
    end

    def full_name_did_change(previous, value)
      @full_name_changes << [previous, value]
    end
  end

  def setup
    @person = Person.new
  end

  # --- properties -----------------------------------------------------------

  def test_static_default
    assert_equal "Ada", @person.first
  end

  def test_lambda_default_is_per_instance
    a = Person.new
    b = Person.new
    a.tags << :x
    assert_equal [:x], a.tags
    assert_equal [], b.tags, "lambda default must not share state across instances"
  end

  def test_nil_default
    assert_nil @person.last
  end

  def test_set_and_get
    @person.first = "Grace"
    assert_equal "Grace", @person.first
  end

  def test_observe_fires_on_change
    seen = []
    @person.observe(:first) { |value| seen << value }
    @person.first = "Grace"
    assert_equal ["Grace"], seen
  end

  def test_setting_equal_value_does_not_notify
    seen = []
    @person.observe(:first) { |value| seen << value }
    @person.first = "Ada" # already the default
    assert_empty seen
  end

  def test_unsubscribe
    seen = []
    off = @person.observe(:first) { |value| seen << value }
    off.call
    @person.first = "Grace"
    assert_empty seen
  end

  def test_did_change_callback_convention
    @person.last = "Lovelace"
    @person.first = "Grace"
    # full_name depends on first/last; callback only fires once it's observed.
  end

  # --- derived properties ---------------------------------------------------

  def test_derived_property_value
    @person.last = "Lovelace"
    assert_equal "Ada Lovelace", @person.full_name
  end

  def test_derived_property_memoizes
    klass = Class.new do
      include Swill::Observable
      property :n, default: 1
      define_singleton_method(:bump) {} # no-op, keep shape obvious
    end
    counter = []
    klass.property(:doubled) do
      counter << :compute
      n * 2
    end
    obj = klass.new
    2.times { obj.doubled }
    assert_equal [:compute], counter, "second read should hit the cache"
  end

  def test_derived_property_recomputes_after_dependency_changes
    @person.last = "Lovelace"
    assert_equal "Ada Lovelace", @person.full_name
    @person.first = "Grace"
    assert_equal "Grace Lovelace", @person.full_name
  end

  def test_derived_property_lazy_until_read
    counter = []
    klass = Class.new do
      include Swill::Observable
      property :n, default: 1
    end
    klass.property(:doubled) do
      counter << :compute
      n * 2
    end
    obj = klass.new
    obj.doubled            # compute #1
    obj.n = 2              # invalidate; nobody observes => stay lazy
    obj.n = 3              # still lazy, no recompute
    assert_equal [:compute], counter
    assert_equal 6, obj.doubled # compute #2 on demand
    assert_equal %i[compute compute], counter
  end

  def test_derived_property_pushes_to_observers_eagerly
    @person.last = "Lovelace"
    seen = []
    @person.observe(:full_name) { |value| seen << value }
    @person.first = "Grace"
    assert_equal ["Grace Lovelace"], seen
    assert_equal [["Ada Lovelace", "Grace Lovelace"]], @person.full_name_changes
  end

  def test_derived_property_chain
    klass = Class.new do
      include Swill::Observable
      property :base, default: 1
    end
    klass.property(:doubled) { base * 2 }
    klass.property(:quadrupled) { doubled * 2 }
    obj = klass.new

    seen = []
    obj.observe(:quadrupled) { |value| seen << value }
    assert_equal 4, obj.quadrupled
    obj.base = 5
    assert_equal [20], seen, "change must propagate base -> doubled -> quadrupled"
    assert_equal 20, obj.quadrupled
  end

  def test_computed_alias_still_works
    klass = Class.new do
      include Swill::Observable
      property :n, default: 2
      computed(:doubled) { n * 2 }
    end

    assert_equal 4, klass.new.doubled
  end

  def test_derived_property_can_use_predicate_name
    klass = Class.new do
      include Swill::Observable
      property :email, default: ""

      property :email_blank? do
        email.strip.empty?
      end
    end

    assert_equal true, klass.new.email_blank?
    refute_respond_to klass.new, :"email_blank?="
  end

  def test_derived_property_rejects_default
    assert_raises(ArgumentError) do
      Class.new do
        include Swill::Observable
        property(:answer, default: 42) { 1 }
      end
    end
  end

  def test_stored_property_rejects_predicate_name
    assert_raises(ArgumentError) do
      Class.new do
        include Swill::Observable
        property :ready?
      end
    end
  end

  # --- inherited configuration ---------------------------------------------

  def test_subclass_inherits_and_extends_declarations
    child = Class.new(Person) do
      property :email
    end
    assert_includes child.observable_properties.keys, :first, "inherits parent property"
    assert_includes child.observable_properties.keys, :email, "adds its own"
    refute_includes Person.observable_properties.keys, :email, "parent is not polluted"
  end

  def test_subclass_inherits_derived_property
    child = Class.new(Person)
    obj = child.new
    obj.last = "Hopper"
    assert_equal "Ada Hopper", obj.full_name
  end

  # --- property vs attr_accessor coexistence -------------------------------

  def test_plain_attr_accessor_still_works
    klass = Class.new do
      include Swill::Observable
      attr_accessor :note
    end
    obj = klass.new
    obj.note = "hi"
    assert_equal "hi", obj.note, "attr_accessor must still define a working accessor"
  end

  def test_plain_accessor_without_overlap_is_silent
    assert_silent do
      Class.new do
        include Swill::Observable
        property :a
        attr_accessor :b
      end
    end
  end

  def test_attr_accessor_over_property_warns
    assert_output(nil, /:title.*plain accessor/m) do
      Class.new do
        include Swill::Observable
        property :title
        attr_accessor :title
      end
    end
  end

  def test_property_over_plain_accessor_warns
    assert_output(nil, /:title.*plain accessor/m) do
      Class.new do
        include Swill::Observable
        attr_accessor :title
        property :title
      end
    end
  end

  def test_derived_property_over_plain_accessor_warns
    assert_output(nil, /:total.*plain accessor/m) do
      Class.new do
        include Swill::Observable
        attr_reader :total
        property(:total) { 1 }
      end
    end
  end
end
