# frozen_string_literal: true

require "minitest/autorun"
require_relative "../lib/swill/observable"
require_relative "../lib/swill/key_path"
require_relative "../lib/swill/object_bindings"
require_relative "../lib/swill/model_store"
require_relative "../lib/swill/model_codec"
require_relative "../lib/swill/model_drafts"
require_relative "../lib/swill/model_attributes"
require_relative "../lib/swill/model_dirty_tracking"
require_relative "../lib/swill/model_identity"
require_relative "../lib/swill/model_dataset"
require_relative "../lib/swill/model_persistence"
require_relative "../lib/swill/model"
require_relative "../lib/swill/json_api_codec"

class ModelCodecTest < Minitest::Test
  class Member < Swill::Model::Base
    json_api_type "members"
    attribute :name, key: :display_name, default: "Anonymous"
    attribute :age, default: 0
  end

  class Team < Swill::Model::Base
    json_api_type "teams"
    codec Swill::Model::JSONAPI
    attribute :title
  end

  def setup
    Member.clear
    Team.clear
  end

  def test_plain_json_single_collection_pooling_and_serialization
    member = Swill::Model::PlainJSON.parse_one(Member, "id" => 1, "display_name" => "Ada", "age" => 4)
    assert_same member, Swill::Model::PlainJSON.parse_one(Member, id: 1, display_name: "Grace")
    assert_equal "Grace", member.name
    assert_equal 2, Swill::Model::PlainJSON.parse_many(Member, [{ id: 1 }, { id: 2 }]).length
    member.name = "Katherine"
    assert_equal({ display_name: "Katherine" }, Swill::Model::PlainJSON.serialize(member, dirty_only: true))
    assert_equal({ display_name: "Katherine", age: 4 }, Swill::Model::PlainJSON.serialize(member))
  end

  def test_plain_json_rejects_wrong_shapes
    assert_raises(ArgumentError) { Swill::Model::PlainJSON.parse_one(Member, []) }
    assert_raises(ArgumentError) { Swill::Model::PlainJSON.parse_many(Member, {}) }
  end

  def test_json_api_single_collection_included_pooling_and_identity
    payload = {
      data: { type: "members", id: "1", attributes: { display_name: "Ada", age: 5 } },
      included: [{ type: "teams", id: "9", attributes: { title: "Core" } }]
    }
    member = Swill::Model::JSONAPI.parse_one(Member, payload)
    assert_equal "Ada", member.name
    assert_equal "Core", Team.get("9").title
    assert_same member, Swill::Model::JSONAPI.parse_one(Member, data: payload[:data])
    assert_equal [member], Swill::Model::JSONAPI.parse_many(Member, data: [payload[:data]])
  end

  def test_json_api_serializes_full_and_dirty_documents
    team = Team.new(title: "Core")
    team.id = "9"
    team.mark_clean!
    team.title = "Framework"
    assert_equal({ data: { type: "teams", id: "9", attributes: { title: "Framework" } } }, team.serialize)
    assert_equal({ data: { type: "teams", id: "9", attributes: { title: "Framework" } } },
                 team.serialize(dirty_only: true))
    team.mark_clean!
    assert_equal({}, team.serialize(dirty_only: true)[:data][:attributes])
  end

  def test_json_api_rejects_malformed_shapes_unknown_types_and_wrong_cardinality
    assert_raises(ArgumentError) { Swill::Model::JSONAPI.parse_one(Member, {}) }
    assert_raises(ArgumentError) { Swill::Model::JSONAPI.parse_one(Member, data: []) }
    assert_raises(ArgumentError) { Swill::Model::JSONAPI.parse_many(Member, data: nil) }
    assert_raises(ArgumentError) do
      Swill::Model::JSONAPI.parse_one(Member, data: { type: "unknown", id: "1" })
    end
    assert_raises(ArgumentError) do
      Swill::Model::JSONAPI.parse_one(Member, data: { type: "members", attributes: {} })
    end
  end
end
