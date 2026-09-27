# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "json"
require "open3"
require_relative "fixtures/data/server"

DataFixture::DB.create_table(:plain_records) do
  primary_key :id
  String :name, null: false
end

module DataFixture
  class PlainRecord < Sequel::Model(DB[:plain_records])
    client_model fields: [:name], writable: [:name]
  end
end

class DataTest < Minitest::Test
  def test_server_entrypoint_supplies_sorbet_syntax_without_loading_sorbet
    source = <<~'RUBY'
      require "json"
      require "sequel"
      require "swill/server"

      DB = Sequel.sqlite
      DB.create_table(:facade_records) do
        primary_key :id
        String :name
      end
      Swill::Data.install(Sequel::Model)

      class FacadeRecord < Sequel::Model(DB[:facade_records])
        extend T::Sig
        client_model fields: {name: T.nilable(String)}

        sig { params(name: String).returns(T.nilable(FacadeRecord)) }
        def self.named(name)
          first(name: name)
        end
        command :named, on: :class
      end

      data_schema = Swill::Data::Schema.new([FacadeRecord])
      schema = data_schema.models.fetch("FacadeRecord")
      dispatcher = Swill::Data::Dispatcher.new(
        schema: data_schema, viewer_context: nil, actor: nil, scope_token: "plain"
      )
      dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Data::PROTOCOL_VERSION, "schema_hash" => data_schema.hash)
      reply = dispatcher.call(
        "type" => "COMMAND", "request_id" => 1, "generation" => 1,
        "model" => "FacadeRecord", "name" => "named", "arguments" => ["missing"], "keywords" => {}
      )
      puts JSON.generate({
        sorbet: $LOADED_FEATURES.any? { |path| path.include?("sorbet-runtime") },
        privacy: $LOADED_FEATURES.any? { |path| path.include?("sequel-privacy") },
        field: schema.dig("fields", "name", "type", "kind"),
        result: schema.dig("operations", "named", "returns", "kind"),
        reply: reply["type"],
        boolean: T::Boolean.name,
        array: T::Array[String].kind,
        union: T.any(String, Integer).kind,
        dynamic: T.untyped.kind
      })
    RUBY
    output, status = Open3.capture2e("ruby", "-Irb", "-e", source)
    assert status.success?, output
    assert_equal({
                   "sorbet" => false, "privacy" => false, "field" => "optional", "result" => "optional",
                   "reply" => "RETURN", "boolean" => "Boolean", "array" => "array",
                   "union" => "union", "dynamic" => "dynamic"
                 },
                 JSON.parse(output))
  end

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
    @dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Data::PROTOCOL_VERSION, "schema_hash" => @schema.hash)
  end

  def test_clients_without_invalidation_support_fail_the_handshake
    response = @dispatcher.call("type" => "HELLO", "protocol_version" => 1, "schema_hash" => @schema.hash)
    assert_equal "schema_mismatch", response.dig("error", "code")
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
    lookup = operations.dig("DataFixture::User", "operations", "lookup", "parameters")
    lookup_types = lookup.map do |parameter|
      type = parameter.fetch("type")
      type["name"] || type.fetch("kind")
    end
    assert_equal %w[String Boolean Integer dynamic], lookup_types
    assert_equal Swill::Data::Types.dump(T.nilable(DataFixture::User)),
                 Swill::Data::Types.dump(Swill::Data::Types.parse("T.nilable(DataFixture::User)"))
    nested = Swill::Data::Types.parse("T.any(T.nilable(String), T::Array[Integer])")
    assert_equal %w[optional array], nested.members.map(&:kind)
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

  def test_create_supports_a_plain_sequel_model
    schema = Swill::Data::Schema.new([DataFixture::PlainRecord])
    dispatcher = Swill::Data::Dispatcher.new(
      schema: schema, viewer_context: nil, actor: nil, scope_token: "plain"
    )
    dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Data::PROTOCOL_VERSION, "schema_hash" => schema.hash)

    created = dispatcher.call(
      "type" => "CREATE", "request_id" => 27, "generation" => 27,
      "model" => "DataFixture::PlainRecord", "attributes" => { "name" => "Plain" }
    )

    assert_equal "RETURN", created["type"]
    assert_equal "Plain", DataFixture::DB[:plain_records].get(:name)
  ensure
    DataFixture::DB[:plain_records].delete
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

  def test_class_command_returns_a_typed_value_without_an_id
    operation = @schema.models.dig("DataFixture::Post", "operations", "lookup_title")
    assert_equal "class", operation.fetch("target")
    assert_equal false, operation.fetch("transaction")
    assert_equal "value", operation.dig("returns", "kind")

    response = @dispatcher.call("type" => "COMMAND", "request_id" => 30, "generation" => 30,
                                "model" => "DataFixture::Post", "name" => "lookup_title",
                                "arguments" => ["Distributed Objects"], "keywords" => {})
    assert_equal "RETURN", response["type"]
    assert_equal "DataFixture::PostLookup", response.dig("value", "$value", 0)
    assert_equal "found", response.dig("value", "$value", 1, "status").to_s
    assert_instance_of Swill::Data::Protocol::Reference, response.dig("value", "$value", 1, "post")
    assert_equal "Distributed Objects", response.fetch("patches").first.dig("fields", "title")
  end

  def move_author(**keywords)
    @dispatcher.call("type" => "COMMAND", "request_id" => 70, "generation" => 70,
                     "model" => "DataFixture::Post", "id" => "1", "name" => "move_to_author!",
                     "arguments" => [2], "keywords" => keywords.transform_keys(&:to_s))
  end

  def test_mutation_effects_address_both_owners_and_refresh_through_privacy
    DataFixture::DB[:posts].where(id: 1).update(published: false)
    response = move_author(replace: true)
    assert_equal "RETURN", response["type"], response.inspect
    assert_equal [{"model" => "DataFixture::User", "id" => "1", "generation" => 70,
                   "fields" => ["posts"]}], response["invalidations"]
    user = response["patches"].find { |patch| patch["model"] == "DataFixture::User" && patch["id"] == "2" && patch["fields"].key?("posts") }
    assert_equal [Swill::Data::Protocol::Reference.new("DataFixture::Post", "1")], user.dig("fields", "posts")
    assert_equal [], user.dig("fields", "published_posts"), "scoped membership is queried, not inferred"
    assert_nil user.dig("fields", "avatar"), "refresh respects denied-read nils"
    post = response["patches"].find { |patch| patch.dig("fields", "author_id") }
    assert_equal 2, post.dig("fields", "author_id")
    assert_equal Swill::Data::Protocol::Reference.new("DataFixture::User", "2"), post.dig("fields", "author")
  ensure
    DataFixture::DB[:posts].where(id: 1).update(author_id: 1)
  end

  def test_failed_effects_roll_back_and_do_not_leak_to_the_next_call
    [:fail, :hidden].each do |option|
      response = move_author(**{option => true})
      assert_equal "ERROR", response["type"], response.inspect
      refute response.key?("invalidations")
      assert_equal 1, DataFixture::DB[:posts].where(id: 1).get(:author_id)
    end
    response = @dispatcher.call("type" => "COMMAND", "request_id" => 71, "generation" => 71,
                                "model" => "DataFixture::Post", "id" => "1", "name" => "publish!",
                                "arguments" => [], "keywords" => {})
    refute response.key?("invalidations")
    assert response["patches"].all? { |patch| patch["model"] == "DataFixture::Post" }
  end

  def test_effect_queues_are_isolated_across_fibers_and_nested_operations
    context = @dispatcher.context
    first = Fiber.new do
      context.use do
        context.invalidate(DataFixture::User.for_vc(context.viewer_context).with_pk!(1), :posts)
        Fiber.yield
        context.effects.map { |effect| effect[:id] }
      end
    end
    first.resume
    context.use do
      assert_empty context.effects
      context.refresh(DataFixture::User.for_vc(context.viewer_context).with_pk!(2), :posts)
      context.use { assert_empty context.effects }
      assert_equal ["2"], context.effects.map { |effect| effect[:id] }
    end
    assert_equal ["1"], first.resume
    assert_raises(RuntimeError) { context.effects }
  end

  def test_command_changes_and_preload_follow_different_models
    response = @dispatcher.call("type" => "COMMAND", "request_id" => 40, "generation" => 40,
                                "model" => "DataFixture::Post", "id" => "1", "name" => "publish_author!",
                                "arguments" => [], "keywords" => {})
    assert_equal "RETURN", response["type"], response.inspect
    assert_equal Swill::Data::Protocol::Reference.new("DataFixture::User", "1"), response["value"]
    author = response.fetch("patches").find { |patch| patch["model"] == "DataFixture::User" }
    post = response.fetch("patches").find { |patch| patch["model"] == "DataFixture::Post" }
    assert_equal({"name" => "Ada"}, author.fetch("fields"))
    assert_equal({"published" => true}, post.fetch("fields"))
  end

  def test_projection_validation_uses_the_return_type
    declaration = DataFixture::Post.swill_data_operations.fetch("publish_author!")
    original = declaration.fetch("projection")
    declaration["projection"] = [:title]
    error = assert_raises(ArgumentError) do
      Swill::Data::Schema.new([DataFixture::Comment, DataFixture::Post, DataFixture::User])
    end
    assert_includes error.message, "DataFixture::User.title"
  ensure
    declaration["projection"] = original
  end

  def test_class_commands_reject_receiver_changes
    klass = Class.new.extend(Swill::Data::Declarations)
    error = assert_raises(ArgumentError) { klass.command(:publish, on: :class, changes: [:title]) }
    assert_includes error.message, "class commands have no receiver"
  end

  def test_non_nilable_fields_stay_non_nilable
    assert_equal({"kind" => "primitive", "name" => "String"},
                 @schema.models.dig("DataFixture::User", "fields", "name", "type"))
    assert_equal "optional", @schema.models.dig("DataFixture::User", "fields", "avatar", "type", "kind")
  end

  def test_command_transaction_can_be_owned_by_the_application
    wrapped = @dispatcher.call("type" => "COMMAND", "request_id" => 31, "generation" => 31,
                               "model" => "DataFixture::Post", "name" => "wrapped_transaction?",
                               "arguments" => [], "keywords" => {})
    unwrapped = @dispatcher.call("type" => "COMMAND", "request_id" => 32, "generation" => 32,
                                 "model" => "DataFixture::Post", "name" => "unwrapped_transaction?",
                                 "arguments" => [], "keywords" => {})
    assert_equal true, wrapped.fetch("value")
    assert_equal false, unwrapped.fetch("value")
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
    mismatch = bad.call("type" => "HELLO", "protocol_version" => Swill::Data::PROTOCOL_VERSION, "schema_hash" => "wrong")
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

  def test_relationship_schema_preserves_association_type_and_reflected_cardinality
    reflection_class = Struct.new(:type, :associated_class, :plural) do
      def returns_array?
        plural
      end
    end
    reflections = %i[many_to_one one_to_one one_to_many many_to_many one_through_one].to_h do |type|
      [type, reflection_class.new(type, DataFixture::User, %i[one_to_many many_to_many].include?(type))]
    end
    model = Struct.new(:association_reflections, :name).new(reflections, "Example")
    declaration = {"relationships" => reflections.keys.map(&:to_s)}
    relationships = @schema.send(:relationships, model, declaration)
    reflections.each do |type, reflection|
      assert_equal type.to_s, relationships[type.to_s]["association"]
      assert_equal(reflection.returns_array? ? "many" : "one", relationships[type.to_s]["kind"])
    end
    # Cardinality comes from the reflection, independently of its type name.
    reflections[:one_to_many].plural = false
    assert_equal "one", @schema.send(:relationships, model, declaration)["one_to_many"]["kind"]
    reflections[:one_to_many].type = :unsupported_plugin_type
    assert_raises(ArgumentError) { @schema.send(:relationships, model, declaration) }
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
      assert_includes proxy_source, 'many_to_one :author, class: "DataFixture::User"'
      refute_includes proxy_source, "remote_"
      rbi = paths.find { |path| path.end_with?("data_fixture/post.rbi") }
      assert_includes File.read(rbi), "T.nilable(DataFixture::User)"
      assert_includes File.read(rbi), "Swill::Model::RelationshipCollection[DataFixture::Comment]"
      refute_includes File.read(rbi), "def author="
      assert_includes proxy_source,
                      "async def self.search(text, published = Swill::Runtime.omitted_argument)"
      assert_includes proxy_source, "async def self.lookup_title(title)"
      assert_includes proxy_source, ".class_command(data_model_name, \"lookup_title\""
      value_proxy = paths.find { |path| path.end_with?("data_fixture/post_lookup.rb") }
      assert_includes File.read(value_proxy), "class PostLookup < Swill::Object"
      assert_includes File.read(value_proxy), "property :status"
      schema_source = paths.find { |path| path.end_with?("generated/schema.rb") }
      assert_includes File.read(schema_source), "module DataSchema"
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
    klass.extend(T::Sig)
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
