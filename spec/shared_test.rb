require "minitest/autorun"
require "json"
require_relative "mri_host"
require_relative "../rb/framework/core/wire"
require_relative "../rb/framework/model/attributes"
require_relative "../rb/framework/model/dirty_tracking"
require_relative "../rb/framework/model/drafts"
require_relative "../rb/framework/model/base"
require_relative "../rb/framework/model/editable"
require_relative "../rb/framework/model/relationships"
require_relative "../rb/framework/model/store"
require_relative "../rb/framework/model/identity"
require_relative "../rb/framework/core/object_bindings"
require_relative "../rb/framework/core/collection_arrangement"
require_relative "../rb/framework/model/collection"
require_relative "../rb/framework/model/distant_client"
require_relative "../rb/framework/model/distant_data"
require_relative "../rb/framework/model/distant_object"
require_relative "../rb/framework/model/relationship"
require_relative "../rb/framework/model/codec"
require_relative "../rb/framework/model/dataset"
require_relative "../rb/framework/model/resource"
require_relative "../examples/rb/models"
require_relative "../examples/rb/records"
require_relative "../examples/rb/concerns"

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
  class RelatedRecord < Swill::Model::DistantObject
    many_to_one :parent, class: "SharedTest::RelatedRecord"
    one_to_many :children, class: "SharedTest::RelatedRecord"
  end

  def test_distant_relationships_are_read_only_and_observable_on_mri
    record = RelatedRecord.new
    children = record.children
    assert children.records.frozen?
    assert_raises(RuntimeError) { record.parent = record }
    assert_raises(RuntimeError) { record.children = [] }
    assert_raises(RuntimeError) { children.records = [] }
    assert_raises(RuntimeError) { children.replace([]) }
    assert_raises(FrozenError) { children.records << record }
    record.apply_data_field("parent", record, 1, false)
    assert_same record, record.parent
    record.begin_data_field_load("children", false)
    assert children.loading?
    record.fail_data_field("children", "failed")
    assert_equal "failed", children.error
    refute children.loading?
    record.apply_data_field("children", [record], 1, false)
    assert_same children, record.children
    assert_same record, children.first
    assert children.loaded?
    assert_nil children.error
    assert_raises(FrozenError) { children.records.clear }
  end

  def test_observation_interest_follows_live_computed_observers_on_mri
    source = DisconnectSource.new
    dependent = DisconnectDependent.new
    dependent.source = source
    assert_equal 2, dependent.doubled
    refute Swill::Runtime.observed(source, "count")
    stop = Swill::Runtime.observe(dependent, "doubled", ->(_value) {})
    assert Swill::Runtime.observed(source, "count")
    stop.call
    refute Swill::Runtime.observed(source, "count")
  end

  def test_invalidated_relationships_keep_loaded_contents_on_mri
    record = RelatedRecord.new
    record.apply_data_field("children", [record], 1, false)
    children = record.children
    record.invalidate_data_field("children", 3)
    record.apply_data_field("children", [], 2, false)
    assert children.loaded?
    assert children.stale?
    assert_equal [record], children.records
    record.begin_data_field_load("children", false)
    record.data_request_started("children", 4)
    record.fail_data_field("children", "older failure", 2)
    assert children.loading?
    assert_nil children.error
    record.apply_data_field("children", [], 4, false)
    refute children.stale?
    assert children.loaded?
  end

  class FilteredArray < Swill::ArrayController
    property :query, type: String, default: ""

    def includes_object?(object)
      object.name.downcase.include?(query.downcase)
    end
  end

  def test_array_controller_filter_selection_and_computed_writers_on_mri
    ada = Demo::Person.new
    ada.id = "1"
    ada.name = "Ada"
    grace = Demo::Person.new
    grace.id = "2"
    grace.name = "Grace"
    controller = FilteredArray.new
    controller.content = [grace, ada]
    controller.sort("name", "ascending")
    assert_equal [ada, grace], controller.arranged_objects
    controller.selected_objects = [grace]
    assert_equal "2", controller.selected_object_id
    controller.query = "ada"
    assert_equal [ada], controller.arranged_objects
    assert_nil controller.selected_object
    controller.selected_object_id = "1"
    assert_same ada, controller.selected_object
    controller.dealloc
  end

  def test_relationship_controller_is_lazy_shared_and_released_on_mri
    record = RelatedRecord.new
    controller = record.children_controller
    assert_same controller, record.children_controller
    refute record.field_loaded?(:children)
    record.apply_data_field("children", [record], 1, false)
    assert_equal [record], controller.arranged_objects
    record.reset_data_fields
    assert_nil controller.content
    refute_same controller, record.children_controller
  end

  def test_model_strategies_share_only_the_explicit_base_layers
    base = Swill::Model::Base.new
    editable = Swill::Model::Editable.new
    resource = Swill::Model::Resource.new
    distant = Swill::Model::DistantObject.new

    refute_respond_to base, :dirty?
    assert_respond_to editable, :dirty?
    assert_respond_to resource.class, :endpoint
    refute_respond_to resource.class, :data_model_name
    assert_respond_to distant.class, :data_model_name
    refute_respond_to distant.class, :endpoint
    refute_respond_to distant.class, :store

    distant.id = "1"
    copy = distant.draft
    refute distant.draft?
    assert copy.draft?
    assert_equal "1", copy.id
  end

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
