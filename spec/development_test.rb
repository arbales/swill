# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require_relative "../rb/swill/development"

class DevelopmentTest < Minitest::Test
  def setup
    @directory = Dir.mktmpdir
    @path = File.join(@directory, "revision.json")
    @revision = Swill::Development::Revision.new(@path)
  end

  def teardown
    FileUtils.remove_entry(@directory)
  end

  def test_only_successful_builds_publish_a_new_revision
    refute @revision.read["ready"]
    first = @revision.publish!
    assert first["ready"]
    @revision.building!
    assert_equal first["revision"], @revision.read["revision"]
    refute @revision.read["ready"]
    # Another process reads the same completed file, including after restart.
    reader = Swill::Development::Revision.new(@path)
    assert_equal @revision.read, reader.read
    second = @revision.publish!
    refute_equal first["revision"], second["revision"]
    assert_equal second, reader.read
  end

  def test_endpoint_never_enters_the_application
    @revision.publish!
    middleware = Swill::Development::Middleware.new(->(_) { raise "database/application was reached" }, path: @path)
    status, headers, body = middleware.call("PATH_INFO" => Swill::Development::ENDPOINT, "REQUEST_METHOD" => "GET")
    assert_equal 200, status
    assert_equal "no-store", headers["cache-control"]
    assert_equal @revision.read, JSON.parse(body.join)
  end

  def test_html_embeds_the_loaded_revision_and_production_embeds_nothing
    assert_equal "", Swill::Development.metadata({})
    first = @revision.publish!
    middleware = Swill::Development::Middleware.new(->(env) {
      [200, {"content-type" => "text/html"}, [Swill::Development.metadata(env)]]
    }, path: @path)
    _, headers, body = middleware.call("PATH_INFO" => "/", "REQUEST_METHOD" => "GET")
    assert_includes body.join, %(content="#{first['revision']}")
    assert_includes body.join, %(data-endpoint="/__swill/development")
    assert_equal "no-store", headers["cache-control"]
    @revision.publish!
    assert_includes body.join, first["revision"], "a later poll must compare against what this page loaded"
  end

  def test_metadata_escapes_content
    html = Swill::Development.metadata("swill.development" => {"revision" => '"><script>'})
    refute_includes html, "<script>"
  end

  def test_readers_never_see_partial_publications
    @revision.publish!
    writer = Thread.new { 100.times { @revision.building!; @revision.publish! } }
    200.times do
      state = @revision.read
      assert_match(/\A[\da-f-]+\z/, state["revision"])
      assert_includes [true, false], state["ready"]
    end
    writer.join
  end
end
