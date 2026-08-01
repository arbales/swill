# frozen_string_literal: true

require_relative "dataset_spec"

class ModelPersistenceTest < Minitest::Test
  class Record < Swill::Model::Base
    codec Swill::Model::JSONAPI
    json_api_type "persistence_records"
    endpoint "/records"
    attribute :name
  end

  class FakeWire
    attr_reader :requests

    def initialize(*responses)
      @responses = responses
      @requests = []
    end

    def request_json(method, url, body: nil, params: {})
      @requests << { method: method, url: url, body: body, params: params }
      ModelDatasetTest::ImmediatePromise.new(value: @responses.shift)
    end

    def resolved(value)
      ModelDatasetTest::ImmediatePromise.new(value: value)
    end
  end

  def setup
    Record.clear
  end

  def document(id, name)
    { data: { type: "persistence_records", id: id, attributes: { name: name } } }
  end

  def test_update_sends_dirty_json_api_attributes_and_marks_clean
    record = Record.parse_one(document("a b", "Before"))
    record.name = "Local"
    wire = FakeWire.new(document("a b", "Saved"))

    resolved = nil
    record.save(wire: wire).then { |value| resolved = value }

    assert_equal "PATCH", wire.requests.first[:method]
    assert_equal "/records/a%20b", wire.requests.first[:url]
    assert_equal({ data: { type: "persistence_records", id: "a b", attributes: { name: "Local" } } },
                 wire.requests.first[:body])
    assert_same record, resolved
    assert_equal "Saved", record.name
    refute record.dirty?
  end

  def test_create_adopts_server_id_and_becomes_canonical
    record = Record.new(name: "New")
    wire = FakeWire.new(document("9", "Created"))
    record.save(wire: wire)
    assert_equal "POST", wire.requests.first[:method]
    assert_equal "/records", wire.requests.first[:url]
    assert_equal "9", record.id
    assert_same record, Record.get("9")
  end

  def test_reload_refreshes_and_delete_removes_identity
    record = Record.parse_one(document("9", "Old"))
    wire = FakeWire.new(document("9", "Fresh"), nil)
    record.reload(wire: wire)
    assert_equal "Fresh", record.name
    record.delete(wire: wire)
    assert_equal %w[GET DELETE], wire.requests.map { |request| request[:method] }
    refute Record.include?("9")
  end

  def test_validation_prevents_request
    klass = Class.new(Record) do
      def validate
        ArgumentError.new("invalid")
      end
    end
    wire = FakeWire.new
    assert_raises(ArgumentError) { klass.new(name: "No").save(wire: wire) }
    assert_empty wire.requests
  end

  def test_clean_save_and_unsaved_delete_are_noops
    record = Record.new(name: "Clean")
    record.id = "1"
    Record.put(record)
    record.mark_clean!
    unsaved = Record.new(name: "Unsaved")
    wire = FakeWire.new
    resolved = []
    record.save(wire: wire).then { |value| resolved << value }
    unsaved.delete(wire: wire).then { |value| resolved << value }
    assert_equal [record, unsaved], resolved
    assert_empty wire.requests
  end
end
