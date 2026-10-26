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
    module DistantInterface
      extend Swill::Distant::Interface

      fields :name
      writable :name
    end
  end

  class PrivateRecord < Sequel::Model(DB[:plain_records])
    plugin :privacy
    privacy { can :view, Policies::AllowSelf }

    module DistantInterface
      extend Swill::Distant::Interface
      fields :name
    end
  end
end

class DataTest < Minitest::Test
  def test_enums_compose_with_real_sorbet_nilability
    source = <<~'RUBY'
      require "sorbet-runtime"
      require "json"
      require "swill/server"
      enum = Swill::Distant::Enum["high", "low"]
      type = T.nilable(enum)
      descriptor = Swill::Distant::Types.dump(type)
      puts JSON.generate([
        descriptor,
        [nil, "high", "low", "", "unknown"].map { |value| type.valid?(value) },
        Swill::Distant::Types.dump(T::Boolean)
      ])
    RUBY
    output, status = Open3.capture2e("ruby", "-Irb", "-e", source)
    assert status.success?, output
    descriptor, accepted, boolean = JSON.parse(output)
    assert_equal "optional", descriptor.fetch("kind")
    assert_equal "enum", descriptor.dig("members", 0, "kind")
    assert_equal %w[high low], descriptor.dig("members", 0, "members").map { |member| member.fetch("name") }
    assert_equal [true, true, true, false, false], accepted
    assert_equal({"kind" => "primitive", "name" => "Boolean"}, boolean)
  end

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

      class FacadeRecord < Sequel::Model(DB[:facade_records])
        extend T::Sig

        sig { params(name: String).returns(T.nilable(FacadeRecord)) }
        def self.named(name)
          first(name: name)
        end

        module DistantInterface
          extend Swill::Distant::Interface
          fields name: T.nilable(String)
          command :named, on: :class
        end
      end

      data_schema = Swill::Distant::Schema.new([FacadeRecord])
      schema = data_schema.models.fetch("FacadeRecord")
      dispatcher = Swill::Distant::Dispatcher.new(
        schema: data_schema, viewer_context: nil, actor: nil, scope_token: "plain"
      )
      dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => data_schema.hash)
      reply = dispatcher.call(
        "type" => "COMMAND", "request_id" => 1, "generation" => 1,
        "model" => "FacadeRecord", "name" => "named", "arguments" => ["missing"], "keywords" => {}
      )
      puts JSON.generate({
        sorbet: $LOADED_FEATURES.any? { |path| path.include?("sorbet-runtime") },
        privacy: $LOADED_FEATURES.any? { |path| path.include?("sequel-privacy") },
        field: schema.dig("fields", "name", "type", "kind"),
        result: schema.dig("remote_methods", "named", "returns", "kind"),
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
    @schema = Swill::Distant::Schema.new([
                                        DataFixture::Comment, DataFixture::Post, DataFixture::User
                                      ])
    omniscient = Sequel::Privacy::ViewerContext.omniscient(:data_test_actor)
    actor = DataFixture::User.for_vc(omniscient).with_pk(1)
    vc = Sequel::Privacy::ViewerContext.for_actor(actor)
    actor.reset_viewer_context(vc, :authenticated_connection)
    @dispatcher = Swill::Distant::Dispatcher.new(
      schema: @schema, viewer_context: vc, actor: actor, scope_token: "actor-1"
    )
    @dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => @schema.hash)
  end

  def test_clients_without_invalidation_support_fail_the_handshake
    response = @dispatcher.call("type" => "HELLO", "protocol_version" => 1, "schema_hash" => @schema.hash)
    assert_equal "schema_mismatch", response.dig("error", "code")
  end

  def test_protocol_round_trips_references_and_temporal_values
    value = {
      "reference" => Swill::Distant::Protocol::Reference.new("DataFixture::Post", "1"),
      "nil" => nil,
      "time" => Time.utc(2026, 1, 2, 3, 4, 5),
      "date" => Date.new(2026, 1, 2),
      "date_time" => DateTime.iso8601("2026-01-02T03:04:05.123456-04:00"),
      "decimal" => BigDecimal("12345678901234567890.123456")
    }
    assert_equal value, Swill::Distant::Protocol.unpack(Swill::Distant::Protocol.pack(value))
  end

  def test_date_and_datetime_are_distinct_at_the_boundary
    date = {"kind" => "primitive", "name" => "Date"}
    instant = {"kind" => "primitive", "name" => "DateTime"}
    value = DateTime.iso8601("2026-10-06T12:34:56.123456-04:00")
    refute Swill::Distant::Validator.send(:matches?, value, date)
    assert Swill::Distant::Validator.send(:matches?, value, instant)
    tagged = Swill::Distant::Protocol.send(:encode, value)
    assert_equal ["$datetime"], tagged.keys
    assert_equal DateTime.iso8601("2026-10-06T16:34:56.123456+00:00"),
                 Swill::Distant::Protocol.unpack(Swill::Distant::Protocol.pack(value))
  end

  def test_range_round_trip_preserves_empty_unbounded_and_excluded_bounds
    require "sequel/extensions/pg_range"
    range = Sequel::Postgres::PGRange.new(nil, 20, db_type: "int4range", exclude_end: true)
    empty = Sequel::Postgres::PGRange.empty("daterange")
    decoded = Swill::Distant::Protocol.unpack(Swill::Distant::Protocol.pack([range, empty]))
    assert_nil decoded[0].begin
    assert_equal 20, decoded[0].end
    assert decoded[0].exclude_end?
    assert decoded[1].empty?
  end

  def test_reflection_preserves_common_types_and_rejects_unknown_columns
    decimal = @schema.send(:reflected_type, DataFixture::Post, "amount", type: :decimal, db_type: "numeric(12,2)")
    date = @schema.send(:reflected_type, DataFixture::Post, "watched_at", type: :date, db_type: "date")
    array = @schema.send(:reflected_type, DataFixture::Post, "tags", type: :array, db_type: "text[]")
    range = @schema.send(:reflected_type, DataFixture::Post, "dates", type: :range, db_type: "daterange")
    assert_equal "BigDecimal", decimal.name
    assert_equal "Date", date.name
    assert_equal "String", array.members.first.name
    assert_equal "Date", range.members.first.name
    error = assert_raises(ArgumentError) do
      @schema.send(:reflected_type, DataFixture::Post, "location", type: :geometry, db_type: "geometry")
    end
    assert_match(/Post.location.*explicit type/, error.message)
  end

  def test_swill_and_sorbet_signatures_normalize_to_protocol_types
    models = @schema.models
    assert_equal "optional", models.dig("DataFixture::User", "remote_methods", "current_user", "returns", "kind")
    assert_equal "String", models.dig("DataFixture::User", "remote_methods", "first_by_email",
                                       "parameters", 0, "type", "name")
    assert_equal "Boolean", models.dig("DataFixture::Post", "remote_methods", "publish!", "returns", "name")
    lookup = models.dig("DataFixture::User", "remote_methods", "lookup", "parameters")
    lookup_types = lookup.map do |parameter|
      type = parameter.fetch("type")
      type["name"] || type.fetch("kind")
    end
    assert_equal %w[String Boolean Integer dynamic], lookup_types
    assert_equal Swill::Distant::Types.dump(T.nilable(DataFixture::User)),
                 Swill::Distant::Types.dump(Swill::Distant::Types.parse("T.nilable(DataFixture::User)"))
    nested = Swill::Distant::Types.parse("T.any(T.nilable(String), T::Array[Integer])")
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
    assert_instance_of Swill::Distant::Protocol::Reference, reference
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
    schema = Swill::Distant::Schema.new([DataFixture::PlainRecord])
    dispatcher = Swill::Distant::Dispatcher.new(
      schema: schema, viewer_context: nil, actor: nil, scope_token: "plain"
    )
    dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => schema.hash)

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
    assert_equal [Swill::Distant::Protocol::Reference.new("DataFixture::Post", "1")], response["value"]
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
    assert_equal Swill::Distant::Protocol::Reference.new("DataFixture::User", "1"), response["value"]

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

  def test_association_hydration_encodes_references
    response = @dispatcher.call("type" => "GET", "request_id" => 12, "generation" => 12,
                                "demands" => [{ "model" => "DataFixture::Post", "id" => "1",
                                                "fields" => ["comments"] }])
    post = response.fetch("patches").find { |patch| patch["model"] == "DataFixture::Post" }
    comments = post.dig("fields", "comments")
    assert_equal [Swill::Distant::Protocol::Reference.new("DataFixture::Comment", "1")], comments
    assert Swill::Distant::Protocol.pack(response), "the response is MessagePack encodable"
    assert_equal "DataFixture::Post", response.fetch("patches").last.fetch("model")
  end

  def test_hydration_batches_models_without_changing_order_fields_or_privacy
    sql = []
    logger = Object.new
    logger.define_singleton_method(:info) { |statement| sql << statement }
    DataFixture::DB.loggers << logger
    response = @dispatcher.call("type" => "GET", "generation" => 8, "demands" => [
      {"model" => "DataFixture::User", "id" => "2", "fields" => ["name", "avatar"]},
      {"model" => "DataFixture::Post", "id" => "1", "fields" => ["title"]},
      {"model" => "DataFixture::User", "id" => "1", "fields" => ["avatar"]},
      {"model" => "DataFixture::User", "id" => "2", "fields" => ["email"]}
    ])
    assert_equal "RETURN", response["type"]
    assert_equal 2, sql.count { |statement| statement.include?("SELECT") }, sql.inspect
    patches = response.fetch("patches")
    assert_equal %w[2 1 1 2], patches.map { |item| item.fetch("id") }
    assert_equal [{"name" => "Grace", "avatar" => nil}, {"title" => "Distributed Objects"},
                  {"avatar" => "ada.png"}, {"email" => "grace@example.test"}], patches.map { |item| item.fetch("fields") }
    assert_equal [8], patches.map { |item| item.fetch("generation") }.uniq
  ensure
    DataFixture::DB.loggers.delete(logger)
  end

  def test_hydration_does_not_share_fields_between_viewer_contexts
    anonymous = Swill::Distant::Dispatcher.new(schema: @schema, viewer_context: Sequel::Privacy::ViewerContext.anonymous,
                                              actor: nil, scope_token: "anonymous")
    anonymous.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => @schema.hash)
    message = {"type" => "GET", "generation" => 1, "demands" => [
      {"model" => "DataFixture::User", "id" => "1", "fields" => ["avatar"]}
    ]}
    assert_equal "ada.png", @dispatcher.call(message).fetch("patches").first.dig("fields", "avatar")
    assert_nil anonymous.call(message).fetch("patches").first.dig("fields", "avatar")
    assert_equal "ada.png", @dispatcher.call(message).fetch("patches").first.dig("fields", "avatar")
  end

  def test_hydration_retains_noncanonical_primary_key_lookups
    response = @dispatcher.call("type" => "GET", "generation" => 1, "demands" => [
      {"model" => "DataFixture::User", "id" => "01", "fields" => ["name"]}
    ])
    assert_equal "Ada", response.fetch("patches").first.dig("fields", "name")
  end

  def test_missing_and_denied_records_fail_the_whole_hydration
    DataFixture::DB.transaction(rollback: :always) do
      DataFixture::DB[:plain_records].insert(id: 1, name: "Visible")
      DataFixture::DB[:plain_records].insert(id: 2, name: "Hidden")
      schema = Swill::Distant::Schema.new([DataFixture::PrivateRecord])
      dispatcher = Swill::Distant::Dispatcher.new(schema: schema, viewer_context: @dispatcher.context.viewer_context,
                                                  actor: @dispatcher.context.actor, scope_token: "private")
      dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => schema.hash)
      %w[2 999].each do |id|
        response = dispatcher.call("type" => "GET", "generation" => 1, "demands" => [
          {"model" => "DataFixture::PrivateRecord", "id" => "1", "fields" => ["name"]},
          {"model" => "DataFixture::PrivateRecord", "id" => id, "fields" => ["name"]}
        ])
        assert_equal "operation_failed", response.dig("error", "code")
        refute response.key?("patches")
        refute_includes response.to_s, "Hidden"
      end
    end
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
    operation = @schema.models.dig("DataFixture::Post", "remote_methods", "lookup_title")
    assert_equal "class", operation.fetch("target")
    assert_equal false, operation.fetch("transaction")
    assert_equal "value", operation.dig("returns", "kind")

    response = @dispatcher.call("type" => "COMMAND", "request_id" => 30, "generation" => 30,
                                "model" => "DataFixture::Post", "name" => "lookup_title",
                                "arguments" => ["Distributed Objects"], "keywords" => {})
    assert_equal "RETURN", response["type"]
    assert_equal "DataFixture::PostLookup", response.dig("value", "$value", 0)
    assert_equal "found", response.dig("value", "$value", 1, "status").to_s
    assert_instance_of Swill::Distant::Protocol::Reference, response.dig("value", "$value", 1, "post")
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
    assert_equal [Swill::Distant::Protocol::Reference.new("DataFixture::Post", "1")], user.dig("fields", "posts")
    assert_equal [], user.dig("fields", "published_posts"), "scoped membership is queried, not inferred"
    assert_nil user.dig("fields", "avatar"), "refresh respects denied-read nils"
    post = response["patches"].find { |patch| patch.dig("fields", "author_id") }
    assert_equal 2, post.dig("fields", "author_id")
    assert_equal Swill::Distant::Protocol::Reference.new("DataFixture::User", "2"), post.dig("fields", "author")
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
    assert_equal Swill::Distant::Protocol::Reference.new("DataFixture::User", "1"), response["value"]
    author = response.fetch("patches").find { |patch| patch["model"] == "DataFixture::User" }
    post = response.fetch("patches").find { |patch| patch["model"] == "DataFixture::Post" }
    assert_equal({"name" => "Ada"}, author.fetch("fields"))
    assert_equal({"published" => true}, post.fetch("fields"))
  end

  def test_projection_validation_uses_the_return_type
    declaration = DataFixture::Post::DistantInterface.remote_methods.fetch("publish_author!")
    original = declaration.fetch("projection")
    declaration["projection"] = [:title]
    error = assert_raises(ArgumentError) do
      Swill::Distant::Schema.new([DataFixture::Comment, DataFixture::Post, DataFixture::User])
    end
    assert_includes error.message, "DataFixture::User.title"
  ensure
    declaration["projection"] = original
  end

  def test_class_commands_reject_receiver_changes
    interface = Module.new.extend(Swill::Distant::Interface)
    error = assert_raises(ArgumentError) { interface.command(:publish, on: :class, changes: [:title]) }
    assert_includes error.message, "class commands have no receiver"
  end

  def test_interface_fields_mix_reflected_and_typed_names_and_reject_duplicates
    interface = Module.new.extend(Swill::Distant::Interface)
    interface.fields :title, body: T.nilable(String)
    interface.fields :excerpt
    interface.associations :author
    interface.writable :title
    declaration = interface.declaration
    assert_equal %w[title body excerpt], declaration.fetch("fields")
    assert_equal %w[body], declaration.fetch("field_types").keys
    assert_equal "optional", declaration.dig("field_types", "body").kind
    assert_equal %w[author], declaration.fetch("associations")
    assert_equal %w[title], declaration.fetch("writable")
    error = assert_raises(ArgumentError) { interface.fields :title }
    assert_includes error.message, "duplicate field title"
    assert_raises(ArgumentError) { interface.associations :author }
    assert_raises(ArgumentError) { interface.writable :title }
    assert_raises(ArgumentError) { interface.command(:publish!); interface.command(:publish!) }
  end

  def test_schema_accepts_models_or_their_interfaces_and_requires_an_interface
    from_model = Swill::Distant::Schema.new([DataFixture::PlainRecord])
    from_interface = Swill::Distant::Schema.new([DataFixture::PlainRecord::DistantInterface])
    assert_equal from_model.hash, from_interface.hash
    assert_same DataFixture::PlainRecord, from_interface.model_class("DataFixture::PlainRecord")
    assert_same DataFixture::PlainRecord, DataFixture::PlainRecord::DistantInterface.model
    bare = Class.new(Sequel::Model(DataFixture::DB[:plain_records]))
    error = assert_raises(ArgumentError) { Swill::Distant::Schema.new([bare]) }
    assert_includes error.message, "no distant interface"
    assert_nil Swill::Distant::Interface.of(bare)
  end

  # The fixture declares Post's interface in a file loaded after the model,
  # so discovery finds interfaces added by reopening the class.
  def test_discovery_finds_each_model_with_an_interface
    discovered = Swill::Distant::Schema.discover
    assert_equal %w[DataFixture::Comment DataFixture::PlainRecord DataFixture::Post DataFixture::PrivateRecord DataFixture::User],
                 discovered.models.keys
    assert_equal @schema.models.fetch("DataFixture::Post"), discovered.models.fetch("DataFixture::Post")
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
    bad = Swill::Distant::Dispatcher.new(schema: @schema, viewer_context: nil, actor: nil, scope_token: "x")
    mismatch = bad.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => "wrong")
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

  def test_association_schema_preserves_association_type_and_reflected_cardinality
    reflection_class = Struct.new(:type, :associated_class, :plural) do
      def returns_array?
        plural
      end
    end
    reflections = %i[many_to_one one_to_one one_to_many many_to_many one_through_one].to_h do |type|
      [type, reflection_class.new(type, DataFixture::User, %i[one_to_many many_to_many].include?(type))]
    end
    model = Struct.new(:association_reflections, :name).new(reflections, "Example")
    declaration = {"associations" => reflections.keys.map(&:to_s)}
    associations = @schema.send(:associations, model, declaration)
    reflections.each do |type, reflection|
      assert_equal type.to_s, associations[type.to_s]["association"]
      assert_equal(reflection.returns_array? ? "many" : "one", associations[type.to_s]["kind"])
    end
    # Cardinality comes from the reflection, independently of its type name.
    reflections[:one_to_many].plural = false
    assert_equal "one", @schema.send(:associations, model, declaration)["one_to_many"]["kind"]
    reflections[:one_to_many].type = :unsupported_plugin_type
    assert_raises(ArgumentError) { @schema.send(:associations, model, declaration) }
  end

  def test_generation_is_deterministic_and_check_detects_drift
    Dir.mktmpdir do |root|
      generator = Swill::Distant::Generator.new(File.expand_path("fixtures/data/server.rb", __dir__), root: root)
      generator.instance_variable_set(:@schema, @schema)
      paths = generator.generate
      assert generator.check
      assert(paths.any? { |path| path.end_with?("schema.json") })
      proxy = paths.find { |path| path.end_with?("generated/data_fixture/post.rb") }
      proxy_source = File.read(proxy)
      assert_includes proxy_source, "class Post < Swill::Distant::Object"
      assert_includes proxy_source, 'model_name "DataFixture::Post"'
      assert_includes proxy_source, "attribute :title"
      assert_includes proxy_source, 'many_to_one :author, class: "DataFixture::User"'
      refute_includes proxy_source, "remote_"
      rbi = paths.find { |path| path.end_with?("data_fixture/post.rbi") }
      assert_includes File.read(rbi), "T.nilable(DataFixture::User)"
      assert_includes File.read(rbi), "Swill::Model::AssociationCollection[DataFixture::Comment]"
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
      user_proxy = paths.find { |path| path.end_with?("generated/data_fixture/user.rb") }
      assert_includes File.read(user_proxy), "async def self.lookup(*emails, exact:, limit: Swill::Runtime.omitted_argument, **options)"
      generated_rbis = paths.select { |path| path.end_with?(".rbi") }.map { |path| File.read(path) }
      refute generated_rbis.any? { |source| source.include?("T.unsafe") }
      extension = paths.find { |path| path.end_with?("client/models/data_fixture/post.rb") }
      assert_includes File.read(extension), "module DataFixture\n  # Client behavior for DataFixture::Post"
      assert_includes File.read(extension), "  class Post\n  end\n"
      refute(paths.any? { |path| path.end_with?("client/models/data_fixture/post_lookup.rb") }, "values get no extension")
      File.write(extension, "edited")
      generator.generate
      assert_equal "edited", File.read(extension), "an existing extension is never overwritten"
      File.write(proxy, "stale")
      assert_raises(ArgumentError) { generator.check }
    end
  end

  def test_data_block_parameters_are_rejected_explicitly
    DataFixture::DB.create_table(:blocked_operations) { primary_key :id }
    klass = Class.new(Sequel::Model(DataFixture::DB[:blocked_operations]))
    DataFixture.const_set(:BlockedOperation, klass)
    klass.extend(T::Sig)
    interface = Module.new.extend(Swill::Distant::Interface)
    klass.const_set(:DistantInterface, interface)
    klass.singleton_class.class_eval do
      define_method(:stream) { |_value = nil, &_block| nil }
    end
    klass.sig { params(value: T.untyped, block: T.untyped).returns(T.untyped) }
    klass.singleton_class.class_eval do
      define_method(:stream) { |value = nil, &block| block&.call(value) }
    end
    interface.resolver :stream

    error = assert_raises(ArgumentError) { Swill::Distant::Schema.new([klass]) }
    assert_includes error.message, "DataFixture::BlockedOperation.stream"
    assert_includes error.message, "block"
  ensure
    # The class outlives its constant, so its interface goes too or discovery
    # would still find it.
    klass&.send(:remove_const, :DistantInterface) if klass&.const_defined?(:DistantInterface, false)
    DataFixture.send(:remove_const, :BlockedOperation) if DataFixture.const_defined?(:BlockedOperation, false)
    DataFixture::DB.drop_table?(:blocked_operations)
  end
end
