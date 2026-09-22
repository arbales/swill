# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "json"
require_relative "fixtures/data/server"

class DataTest < Minitest::Test
  def setup
    @schema = Swill::Data::Schema.new([
                                        DataFixture::Comment, DataFixture::Post, DataFixture::User
                                      ])
    omniscient = Sequel::Privacy::ViewerContext.omniscient(:data_test_actor)
    actor = DataFixture::User.for_vc(omniscient).with_pk(1)
    vc = Sequel::Privacy::ViewerContext.for_actor(actor)
    actor.reset_viewer_context(vc, :authenticated_connection)
    @dispatcher = Swill::Data::Dispatcher.new(
      schema: @schema, viewer_context: vc, actor: actor, scope_token: "actor-1"
    )
    @dispatcher.call("type" => "HELLO", "protocol_version" => 1, "schema_hash" => @schema.hash)
  end

  def test_protocol_round_trips_references_and_temporal_values
    value = {
      "reference" => Swill::Data::Protocol::Reference.new("DataFixture::Post", "1"),
      "nil" => nil,
      "time" => Time.utc(2026, 1, 2, 3, 4, 5),
      "date" => Date.new(2026, 1, 2)
    }
    assert_equal value, Swill::Data::Protocol.unpack(Swill::Data::Protocol.pack(value))
  end

  def test_swill_and_sorbet_signatures_normalize_to_protocol_types
    operations = @schema.models
    assert_equal "optional", operations.dig("DataFixture::User", "operations", "current_user", "returns", "kind")
    assert_equal "String", operations.dig("DataFixture::User", "operations", "first_by_email",
                                           "parameters", 0, "type", "name")
    assert_equal "Boolean", operations.dig("DataFixture::Post", "operations", "publish!", "returns", "name")
    assert_equal Swill::Data::Types.dump(Swill::Data::Optional[DataFixture::User]),
                 Swill::Data::Types.dump(Swill::Data::Types.parse("T.nilable(DataFixture::User)"))
  end

  def test_client_schema_is_closed_and_writes_are_an_explicit_subset
    user = @schema.models.fetch("DataFixture::User")
    assert_equal %w[avatar email id name], user.fetch("fields").keys
    refute_includes user.fetch("fields"), "surprise"
    assert_equal %w[avatar email name], user.fetch("writable_fields")

    hidden = @dispatcher.call("type" => "GET", "request_id" => 20, "generation" => 20,
                              "demands" => [{ "model" => "DataFixture::User", "id" => "1",
                                              "fields" => ["surprise"] }])
    assert_equal "unknown_field", hidden.dig("error", "code")
  end

  def test_distant_lifecycle_uses_writable_fields_and_privacy_actions
    created = @dispatcher.call(
      "type" => "CREATE", "request_id" => 21, "generation" => 21,
      "model" => "DataFixture::Comment",
      "attributes" => { "post_id" => 1, "author_id" => 1, "body" => "Draft" }
    )
    assert_equal "RETURN", created["type"]
    reference = created.fetch("value")
    assert_instance_of Swill::Data::Protocol::Reference, reference
    id = reference.id
    assert_equal "Draft", DataFixture::DB[:comments].where(id: id).get(:body)

    rejected = @dispatcher.call(
      "type" => "UPDATE", "request_id" => 22, "generation" => 22,
      "model" => "DataFixture::Comment", "id" => id,
      "attributes" => { "id" => 999 }
    )
    assert_equal "invalid_attributes", rejected.dig("error", "code")
    assert_equal id.to_i, DataFixture::DB[:comments].where(id: id).get(:id)

    updated = @dispatcher.call(
      "type" => "UPDATE", "request_id" => 23, "generation" => 23,
      "model" => "DataFixture::Comment", "id" => id,
      "attributes" => { "body" => "Accepted" }
    )
    assert_equal "Accepted", updated.fetch("patches").first.dig("fields", "body")

    deleted = @dispatcher.call(
      "type" => "DELETE", "request_id" => 24, "generation" => 24,
      "model" => "DataFixture::Comment", "id" => id
    )
    assert_equal "RETURN", deleted["type"]
    assert_nil DataFixture::DB[:comments].where(id: id).first
  ensure
    DataFixture::DB[:comments].where(body: %w[Draft Accepted]).delete
  end

  def test_distant_lifecycle_rolls_back_validation_and_authorization_failures
    invalid = @dispatcher.call(
      "type" => "CREATE", "request_id" => 25, "generation" => 25,
      "model" => "DataFixture::Comment",
      "attributes" => { "post_id" => 1, "author_id" => 1, "body" => "invalid" }
    )
    assert_equal "validation_failed", invalid.dig("error", "code")
    assert_nil DataFixture::DB[:comments].where(body: "invalid").first

    denied = @dispatcher.call(
      "type" => "CREATE", "request_id" => 26, "generation" => 26,
      "model" => "DataFixture::User",
      "attributes" => { "email" => "denied@example.test", "name" => "Denied" }
    )
    assert_equal "unauthorized", denied.dig("error", "code")
    assert_nil DataFixture::DB[:users].where(email: "denied@example.test").first
  ensure
    DataFixture::DB[:comments].where(body: "invalid").delete
    DataFixture::DB[:users].where(email: "denied@example.test").delete
  end

  def test_connection_context_reuses_the_viewer_and_resets_policy_caches
    context = @dispatcher.context
    viewer = context.viewer_context
    context.use do
      Sequel::Privacy.cache[:outer] = true
      context.use { refute Sequel::Privacy.cache.key?(:outer) }
      assert Sequel::Privacy.cache[:outer]
    end
    context.use { assert_empty Sequel::Privacy.cache }
    assert_same viewer, context.viewer_context
  end

  def test_query_returns_refs_and_nested_projection_patches
    response = @dispatcher.call("type" => "QUERY", "request_id" => 1, "generation" => 4,
                                "model" => "DataFixture::Post", "name" => "search",
                                "arguments" => ["Objects"], "keywords" => {})
    assert_equal "RESULT", response["type"]
    assert_equal [Swill::Data::Protocol::Reference.new("DataFixture::Post", "1")], response["value"]
    post = response["patches"].find { |patch| patch["model"] == "DataFixture::Post" }
    author = response["patches"].find { |patch| patch["model"] == "DataFixture::User" }
    assert_nil post.dig("fields", "excerpt"), "an included nil remains present"
    assert_equal "Ada", author.dig("fields", "name")
    assert_equal "ada.png", author.dig("fields", "avatar")
  end

  def test_rest_and_keyword_arguments_bind_and_validate
    response = @dispatcher.call("type" => "RESOLVE", "request_id" => 10, "generation" => 10,
                                "model" => "DataFixture::User", "name" => "lookup",
                                "arguments" => ["ada@example.test"],
                                "keywords" => { "exact" => true, "limit" => 1, "unused" => "ok" })
    assert_equal "RETURN", response["type"]
    assert_equal Swill::Data::Protocol::Reference.new("DataFixture::User", "1"), response["value"]

    missing = @dispatcher.call("type" => "RESOLVE", "request_id" => 11, "generation" => 11,
                               "model" => "DataFixture::User", "name" => "lookup",
                               "arguments" => [], "keywords" => {})
    assert_equal "invalid_arguments", missing.dig("error", "code")
  end

  def test_denied_value_and_legitimate_nil_have_the_same_wire_value
    response = @dispatcher.call("type" => "GET", "request_id" => 2, "generation" => 5,
                                "demands" => [{ "model" => "DataFixture::User", "id" => "2", "fields" => ["avatar"] }])
    assert_nil response.fetch("patches").first.fetch("fields").fetch("avatar")
  end

  def test_relationship_hydration_encodes_references
    response = @dispatcher.call("type" => "GET", "request_id" => 12, "generation" => 12,
                                "demands" => [{ "model" => "DataFixture::Post", "id" => "1",
                                                "fields" => ["comments"] }])
    post = response.fetch("patches").find { |patch| patch["model"] == "DataFixture::Post" }
    comments = post.dig("fields", "comments")
    assert_equal [Swill::Data::Protocol::Reference.new("DataFixture::Comment", "1")], comments
    assert Swill::Data::Protocol.pack(response), "the response is MessagePack encodable"
  end

  def test_command_applies_declared_changes_after_success
    response = @dispatcher.call("type" => "COMMAND", "request_id" => 3, "generation" => 6,
                                "model" => "DataFixture::Post", "id" => "1", "name" => "publish!",
                                "arguments" => [], "keywords" => {})
    assert_equal true, response["value"]
    assert_equal true, response.fetch("patches").first.dig("fields", "published")
    assert_instance_of Time, response.fetch("patches").first.dig("fields", "published_at")
  end

  def test_invalid_command_result_rolls_back_the_transaction
    DataFixture::DB[:posts].where(id: 1).update(published: false)
    response = @dispatcher.call("type" => "COMMAND", "request_id" => 13, "generation" => 13,
                                "model" => "DataFixture::Post", "id" => "1", "name" => "invalid_publish!",
                                "arguments" => [], "keywords" => {})
    assert_equal "type_mismatch", response.dig("error", "code")
    assert_equal false, DataFixture::DB[:posts].where(id: 1).get(:published)
  end

  def test_handshake_and_schema_reject_untrusted_names
    bad = Swill::Data::Dispatcher.new(schema: @schema, viewer_context: nil, actor: nil, scope_token: "x")
    mismatch = bad.call("type" => "HELLO", "protocol_version" => 1, "schema_hash" => "wrong")
    assert_equal "schema_mismatch", mismatch.dig("error", "code")

    unknown = @dispatcher.call("type" => "GET", "request_id" => 4, "generation" => 7,
                               "demands" => [{ "model" => "DataFixture::User", "id" => "1", "fields" => ["destroy"] }])
    assert_equal "unknown_field", unknown.dig("error", "code")

    undeclared = @dispatcher.call("type" => "QUERY", "request_id" => 5, "generation" => 8,
                                  "model" => "DataFixture::Post", "name" => "where",
                                  "arguments" => [], "keywords" => {})
    assert_equal "unknown_operation", undeclared.dig("error", "code")

    invalid = @dispatcher.call("type" => "QUERY", "request_id" => 6, "generation" => 9,
                               "model" => "DataFixture::Post", "name" => "search",
                               "arguments" => [12], "keywords" => {})
    assert_equal "type_mismatch", invalid.dig("error", "code")
  end

  def test_generation_is_deterministic_and_check_detects_drift
    Dir.mktmpdir do |root|
      generator = Swill::Data::Generator.new(File.expand_path("fixtures/data/server.rb", __dir__), root: root)
      generator.instance_variable_set(:@schema, @schema)
      paths = generator.generate
      assert generator.check
      assert(paths.any? { |path| path.end_with?("schema.json") })
      proxy = paths.find { |path| path.end_with?("data_fixture/post.rb") }
      proxy_source = File.read(proxy)
      assert_includes proxy_source, "class Post < Swill::Model::DistantObject"
      assert_includes proxy_source, 'model_name "DataFixture::Post"'
      assert_includes proxy_source, "attribute :title"
      assert_includes proxy_source, "has_one :author"
      refute_includes proxy_source, "remote_"
      assert_includes proxy_source,
                      "async def self.search(text, published = Swill::Runtime.omitted_argument)"
      user_proxy = paths.find { |path| path.end_with?("data_fixture/user.rb") }
      assert_includes File.read(user_proxy), "async def self.lookup(*emails, exact:, limit: Swill::Runtime.omitted_argument, **options)"
      generated_rbis = paths.select { |path| path.end_with?(".rbi") }.map { |path| File.read(path) }
      refute generated_rbis.any? { |source| source.include?("T.unsafe") }
      File.write(proxy, "stale")
      assert_raises(ArgumentError) { generator.check }
    end
  end

  def test_data_block_parameters_are_rejected_explicitly
    DataFixture::DB.create_table(:blocked_operations) { primary_key :id }
    klass = Class.new(Sequel::Model(DataFixture::DB[:blocked_operations]))
    DataFixture.const_set(:BlockedOperation, klass)
    klass.extend(Swill::Sig)
    klass.client_model fields: []
    klass.singleton_class.class_eval do
      define_method(:stream) { |_value = nil, &_block| nil }
    end
    klass.sig { params(value: T.untyped, block: T.untyped).returns(T.untyped) }
    klass.singleton_class.class_eval do
      define_method(:stream) { |value = nil, &block| block&.call(value) }
    end
    klass.resolver :stream

    error = assert_raises(ArgumentError) { Swill::Data::Schema.new([klass]) }
    assert_includes error.message, "DataFixture::BlockedOperation.stream"
    assert_includes error.message, "block"
  ensure
    DataFixture.send(:remove_const, :BlockedOperation) if DataFixture.const_defined?(:BlockedOperation, false)
    DataFixture::DB.drop_table?(:blocked_operations)
  end
end
