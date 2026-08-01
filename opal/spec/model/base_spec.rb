# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/model"

class ModelTest < Minitest::Test
  class DraftableValue
    include Swill::Model::Drafts

    attr_accessor :id, :name

    def collect_attributes
      { name: name }
    end

    def apply_attributes(attributes)
      self.name = attributes[:name]
      self
    end
  end

  class ComposedValue
    include Swill::Observable
    include Swill::Model::Attributes
    include Swill::Model::DirtyTracking
    include Swill::Model::Identity

    attribute :name
  end

  class Member < Swill::Model::Base
    attribute :name, key: :display_name, default: "Anonymous"
    attr :age, default: 0

    def validate_age(value, _previous)
      Integer(value)
    end
  end

  class Admin < Member
    attribute :role, default: "admin"
  end

  def setup
    Member.clear
    Admin.clear
  end

  def test_declarations_defaults_keys_and_inheritance
    assert_equal "Anonymous", Member.new.name
    assert_equal %i[name age role], Admin.model_attributes.keys
    assert_equal :display_name, Admin.model_attributes[:name].key
    refute Member.model_attributes.key?(:role)
  end

  def test_validation_coerces_and_rejection_preserves_previous_value
    member = Member.new
    member.age = "4"
    assert_equal 4, member.age
    assert_raises(ArgumentError) { member.age = "four" }
    assert_equal 4, member.age
  end

  def test_attribute_changes_are_observable
    member = Member.new
    seen = []
    member.observe(:name) { |value| seen << value }
    member.name = "Ada"
    assert_equal ["Ada"], seen
  end

  def test_dirty_tracking_is_baseline_aware_and_observable
    member = Member.new
    states = []
    member.observe(:dirty?) { |value| states << value }
    member.name = "Ada"
    assert_equal [:name], member.dirty
    assert member.dirty?
    member.name = "Anonymous"
    assert_empty member.dirty
    refute member.dirty?
    assert_equal [true, false], states
  end

  def test_apply_attributes_notifies_without_marking_dirty
    member = Member.new
    seen = []
    member.observe(:name) { |value| seen << value }
    member.apply_attributes("display_name" => "Grace", "age" => 8)
    assert_equal ["Grace"], seen
    refute member.dirty?
    assert_equal({ display_name: "Grace", age: 8 }, member.collect_attributes)
  end

  def test_mark_clean_and_detached_draft
    member = Member.new
    member.id = 7
    member.name = "Ada"
    member.mark_clean!
    refute member.dirty?

    draft = member.draft
    draft.name = "Grace"
    assert_equal 7, draft.id
    assert_equal "Ada", member.name
    assert_equal [:name], draft.dirty
    refute_same member, draft
    refute Member.values.include?(draft)
  end

  def test_drafts_are_composable_without_model
    value = DraftableValue.new
    value.id = 3
    value.name = "Ada"
    draft = value.draft
    assert_instance_of DraftableValue, draft
    assert_equal [3, "Ada"], [draft.id, draft.name]
    refute_same value, draft
  end

  def test_attributes_dirty_tracking_and_identity_are_independently_composable
    ComposedValue.clear
    value = ComposedValue.new
    value.id = 8
    value.name = "Ada"
    assert_equal [:name], value.dirty
    assert_same value, ComposedValue.put(value)
    assert_same value, ComposedValue.get(8)
  end

  def test_cross_field_validation_is_overridable
    klass = Class.new(Member) do
      def validate
        age.negative? ? ArgumentError.new("negative age") : nil
      end
    end
    record = klass.new(age: -1)
    assert_instance_of ArgumentError, record.validate
  end

  def test_store_preserves_identity_refreshes_and_isolates_subclasses
    first = Member.new(display_name: "Ada")
    first.id = 1
    assert_same first, Member.put(first)

    incoming = Member.new(display_name: "Grace")
    incoming.id = 1
    assert_same first, Member.put(incoming)
    assert_equal "Grace", first.name
    assert Member.include?(1)
    refute Admin.include?(1)
    assert_equal [first], Member.values
    assert_same first, Member.remove(1)
    refute Member.include?(1)
  end
end

class ObjectBindingsTest < Minitest::Test
  class Address
    include Swill::Observable
    property :city, default: "Portland"
  end

  class Source
    include Swill::Observable
    property :address, default: -> { Address.new }
  end

  class Target
    include Swill::Observable
    include Swill::ObjectBindings
    property :label
  end

  def test_immediate_nested_sync_and_intermediate_replacement
    source = Source.new
    target = Target.new
    target.bind(:label, to: source, key_path: "address.city")
    assert_equal "Portland", target.label
    source.address.city = "Salem"
    assert_equal "Salem", target.label
    source.address = Address.new.tap { |address| address.city = "Eugene" }
    assert_equal "Eugene", target.label
    source.address.city = "Bend"
    assert_equal "Bend", target.label
  end

  def test_rebinding_unbinding_and_unbind_all
    first = Source.new
    second = Source.new.tap { |source| source.address.city = "Seattle" }
    target = Target.new
    target.bind(:label, to: first, key_path: "address.city")
    target.bind(:label, to: second, key_path: "address.city")
    first.address.city = "ignored"
    assert_equal "Seattle", target.label
    target.unbind(:label)
    second.address.city = "ignored too"
    assert_equal "Seattle", target.label
    assert_same target, target.unbind_all
  end
end
