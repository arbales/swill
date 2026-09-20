require "minitest/autorun"
require "json"
require_relative "mri_host"
require_relative "../lib/swill/core/wire"
require_relative "../lib/swill/model/attributes"
require_relative "../lib/swill/model/relationships"
require_relative "../lib/swill/model/dirty_tracking"
require_relative "../lib/swill/model/drafts"
require_relative "../lib/swill/model/store"
require_relative "../lib/swill/model/identity"
require_relative "../lib/swill/model/relationship"
require_relative "../lib/swill/model/codec"
require_relative "../lib/swill/model/dataset"
require_relative "../lib/swill/model/base"
require_relative "../examples/models"
require_relative "../examples/records"
require_relative "../examples/concerns"

class DisconnectSource < Swill::Object
  property :count, type: Integer, default: 1
end

class DisconnectDependent < Swill::Object
  property :source, type: T.nilable(DisconnectSource), default: nil
  property :doubled, type: Integer do
    T.must(source).count * 2
  end
end

class SharedTest < Minitest::Test
  def test_model_attribute_registry_on_mri
    result = {
      record: Swill::Model::Base.model_attributes.keys,
      person: Demo::Person.model_attributes.keys,
      special: Demo::SpecialPerson.model_attributes.keys
    }
    assert_equal %w[id], result[:record]
    assert_equal %w[id name], result[:person]
    assert_equal %w[id name role], result[:special]
    refute_same Swill::Model::Base.model_attributes, Demo::Person.model_attributes
    refute_same Demo::Person.model_attributes, Demo::SpecialPerson.model_attributes
    assert_equal "job", Demo::SpecialPerson.model_attributes["role"]["key"]
    File.write("build/mri-attributes.json", JSON.pretty_generate(result) + "\n")
  end

  def test_included_declarations_validation_and_dirty_hooks_on_mri
    records = [ConcernRecord, SpecializedRecord, OtherConcernRecord].map do |klass|
      object = klass.new
      initial = object.name
      changes = []
      object.observe("dirty", ->(value) { changes << ["dirty", value] })
      object.observe("name", ->(value) { changes << ["name", value] })
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
    person.observe("dirty?", ->(value) { changes << ["dirty?", value] })
    person.observe("dirty_attributes", ->(value) { changes << ["dirty_attributes", value.map(&:to_s)] })
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

  # The same ownership contract as the browser's: the receiver is the
  # observer, and what it retains ends when it deallocs.
  def test_an_object_retains_what_it_observes_until_it_deallocs
    watcher = Demo::Person.new
    watched = Demo::SpecialPerson.new
    seen = []
    watcher.observe(watched, "name", ->(value) { seen << value })
    watcher.observe("name", ->(value) { seen << "mine #{value}" })
    watched.name = "Ada"
    watcher.name = "Grace"
    assert_equal ["Ada", "mine Grace"], seen

    watcher.dealloc
    watched.name = "Hopper"
    watcher.name = "Lovelace"
    assert_equal ["Ada", "mine Grace"], seen, "dealloc releases what the object retained"

    early = []
    owner = Demo::Person.new
    disposer = owner.retain(-> { early << :released })
    owner.release(disposer)
    owner.dealloc
    assert_equal [:released], early, "release gives one up early, and dealloc has nothing left"
  end

  def test_disconnect_invalidates_computations_on_other_objects
    source = DisconnectSource.new
    dependent = DisconnectDependent.new
    dependent.source = source
    assert_equal 2, dependent.doubled
    source.disconnect
    source.count = 2
    assert_equal 4, dependent.doubled
    source.count = 3
    assert_equal 6, dependent.doubled
  end

  def test_from_attributes_materializes_a_model_from_a_wire_hash
    person = Demo::SpecialPerson.from_attributes("name" => "Ada", "job" => " lead ")
    assert_instance_of Demo::SpecialPerson, person
    assert_equal "Ada", person.name
    assert_equal "lead", person.role, "attributes apply through validation"
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
    person.observe("label", ->(value) { changes << value })
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

class SharedModelTest < Minitest::Test
  DOCUMENT = {
    "data" => [
      {"id" => "1", "type" => "authors", "attributes" => {"name" => "Ada", "born" => 1815},
       "relationships" => {"books" => {"data" => [{"id" => "10", "type" => "books"}, {"id" => "11", "type" => "books"}]}}},
      {"id" => "2", "type" => "authors", "attributes" => {"name" => "Grace"}, "relationships" => {"books" => {"data" => []}}}
    ],
    "included" => [
      {"id" => "10", "type" => "books", "attributes" => {"title" => "Notes"},
       "relationships" => {"author" => {"data" => {"id" => "1", "type" => "authors"}}}},
      {"id" => "11", "type" => "books", "attributes" => {"title" => "Engines"},
       "relationships" => {"author" => {"data" => {"id" => "1", "type" => "authors"}}}}
    ]
  }.freeze

  def test_a_nil_for_a_non_nilable_attribute_leaves_the_declared_default_on_mri
    author = Demo::Author.parse_one({
      "data" => {"id" => "9", "type" => "authors", "attributes" => {"name" => nil, "born" => nil}}
    })
    assert_equal ["", nil], [author.name, author.born]
    refute author.dirty?, "a document applies cleanly"
    author.name = "Ada"
    author.apply_attributes({"name" => nil, "born" => 1815})
    assert_equal ["", 1815], [author.name, author.born]
    note = Demo::Note.parse_one({"id" => 5, "body" => nil})
    assert_equal "", note.body
  end

  def test_json_api_and_plain_json_codecs_on_mri
    authors = Demo::Author.parse_many(DOCUMENT)
    ada = T.must(authors.first)
    result = {}
    result["authors"] = authors.map { |author| [author.id, author.name, author.born] }
    result["books"] = ada.books.map(&:title)
    result["linked"] = ada.books.first.author.equal?(ada)
    result["loaded"] = [ada.relationship_loaded?("books"), ada.books.first.relationship_loaded?("author")]
    result["pooled"] = Demo::Author.get("1").equal?(ada) && Demo::Book.get("10").equal?(ada.books.first)
    result["clean"] = ada.dirty?
    ada.name = "Ada Lovelace"
    result["patch"] = ada.serialize(true)
    draft = Demo::Note.new
    draft.body = "Bread"
    result["post"] = draft.serialize(false)
    note = T.must(Demo::Note.parse_one({"id" => 3, "body" => "Milk"}))
    result["note"] = [note.id, note.body, Demo::Note.get("3").equal?(note)]
    assert_equal [["1", "Ada", 1815], ["2", "Grace", nil]], result["authors"]
    assert_equal %w[Notes Engines], result["books"]
    assert_equal({"data" => {"type" => "authors", "attributes" => {"name" => "Ada Lovelace"}, "id" => "1"}}, result["patch"])
    assert_equal({"body" => "Bread"}, result["post"])
    File.write("build/mri-models.json", JSON.pretty_generate(result) + "\n")
  end
end
