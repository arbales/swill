require "minitest/autorun"
require "json"
require_relative "mri_adapter"
require_relative "../lib/swill/model/attributes"
require_relative "../lib/swill/model/dirty_tracking"
require_relative "../lib/swill/model/drafts"
require_relative "../lib/swill/model/base"
require_relative "../examples/models"
require_relative "../examples/concerns"

class SharedTest < Minitest::Test
  def test_model_attribute_registry_on_mri
    result = {
      record: Swill::Model::Base.model_attributes.keys,
      person: Demo::Person.model_attributes.keys,
      special: Demo::SpecialPerson.model_attributes.keys
    }
    assert_equal [:id], result[:record]
    assert_equal %i[id name], result[:person]
    assert_equal %i[id name role], result[:special]
    refute_same Swill::Model::Base.model_attributes, Demo::Person.model_attributes
    refute_same Demo::Person.model_attributes, Demo::SpecialPerson.model_attributes
    assert_equal :job, Demo::SpecialPerson.model_attributes[:role][:key]
    File.write("build/mri-attributes.json", JSON.pretty_generate(result) + "\n")
  end

  def test_included_declarations_validation_and_dirty_hooks_on_mri
    records = [ConcernRecord, SpecializedRecord, OtherConcernRecord].map do |klass|
      object = klass.new
      initial = object.name
      changes = []
      object.observe(:dirty) { |value| changes << ["dirty", value] }
      object.observe(:name) { |value| changes << ["name", value] }
      object.name = " #{initial} " # Coerced equality does not mark dirty.
      unchanged = [object.name, object.dirty, object.baseline]
      object.name = " Changed "
      changed = [object.name, object.dirty, object.baseline]
      error = assert_raises(RuntimeError) { object.name = " " }
      rejected = [error.message, object.name, object.dirty, object.baseline]
      object.name = initial
      restored = [object.name, object.dirty, object.baseline]
      assert_equal [initial, false, nil], unchanged
      assert_equal ["Changed", true, initial], changed
      assert_equal [initial, false, initial], restored
      {initial: initial, unchanged: unchanged, changed: changed,
       rejected: rejected, restored: restored, changes: changes}
    end
    assert_equal ["Ada", "Grace", "Ada"], records.map { |record| record[:initial] }
    File.write("build/mri-concerns.json", JSON.pretty_generate(records) + "\n")
  end

  def test_dirty_tracking_and_validation_on_mri
    person = Demo::SpecialPerson.new
    changes = []
    person.observe(:dirty?) { |value| changes << ["dirty?", value] }
    person.observe(:dirty_attributes) { |value| changes << ["dirty_attributes", value.map(&:to_s)] }
    steps = []
    steps << [person.dirty?, person.dirty.map(&:to_s)]
    person.name = "Ada"
    steps << [person.dirty?, person.dirty.map(&:to_s)]
    person.role = " writer "
    steps << [person.role, person.dirty.map(&:to_s)]
    person.name = ""
    steps << [person.dirty?, person.dirty.map(&:to_s)]
    error = assert_raises(RuntimeError) { person.role = "  " }
    steps << [error.message, person.role, person.dirty.map(&:to_s)]
    person.apply_attributes(name: "Grace")
    steps << [person.name, person.dirty?, person.dirty.map(&:to_s)]
    draft = person.draft
    steps << [draft.name, draft.role, draft.dirty?]
    person.mark_clean!
    steps << [person.dirty?, person.dirty.map(&:to_s)]
    person.role = "editor"
    steps << [person.dirty?, person.dirty.map(&:to_s)]
    assert_equal [false, []], steps[0]
    assert_equal ["writer", %w[name role]], steps[2]
    assert_equal [true, %w[role]], steps[3]
    File.write("build/mri-dirty.json", JSON.pretty_generate("steps" => steps, "changes" => changes) + "\n")
  end

  def test_draft_is_shared_ruby_orchestration
    person = Demo::SpecialPerson.new
    person.id = "42"
    person.name = "Ada"
    person.loud = true
    draft = person.draft

    assert_instance_of Demo::SpecialPerson, draft
    assert_equal "42", draft.id
    assert_equal "Ada", draft.name
    assert_equal "editor", draft.role
    assert_equal false, draft.loud
  end

  def test_shared_model_contract_on_mri
    person = Demo::SpecialPerson.new
    changes = []
    person.observe(:label) { |value| changes << value }
    person.id = "42"
    renamed = person.rename(" Ada ")
    person.loud = true
    result = {
      "renamed" => renamed,
      "greeting" => person.greeting,
      "id" => person.id,
      "role" => person.role,
      "changes" => changes,
      "truth" => [person.ruby_truth(0), person.ruby_truth(nil)],
      "or" => [person.ruby_or(""), person.ruby_or(nil)]
    }
    assert_equal "[<Ada>]", renamed
    assert_equal ["[<Ada>]", "[<ADA>]"], changes
    File.write("build/mri-result.json", JSON.pretty_generate(result) + "\n")
  end
end
