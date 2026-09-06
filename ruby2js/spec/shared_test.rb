require "minitest/autorun"
require "json"
require_relative "mri_adapter"
require_relative "../lib/swill/model/attributes"
require_relative "fixtures/framework"
require_relative "fixtures/models"
require_relative "fixtures/concerns"

class SharedTest < Minitest::Test
  def test_model_attribute_registry_on_mri
    result = {
      record: Record.model_attributes.keys,
      person: Demo::Person.model_attributes.keys,
      special: Demo::SpecialPerson.model_attributes.keys
    }
    assert_equal [:id], result[:record]
    assert_equal %i[id name], result[:person]
    assert_equal %i[id name role], result[:special]
    refute_same Record.model_attributes, Demo::Person.model_attributes
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
