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

class ModelDatasetTest < Minitest::Test
  class ImmediatePromise
    def initialize(value: nil, error: nil)
      @value = value
      @error = error
    end

    def then
      @value = yield(@value) unless @error
      self
    rescue StandardError => error
      @error = error
      self
    end

    def fail
      @value = yield(@error) if @error
      self
    end
  end

  class FakeWire
    attr_reader :requests

    def initialize(payload: nil, error: nil)
      @payload = payload
      @error = error
      @requests = []
    end

    def get_json(url, params: {})
      @requests << [url, params]
      ImmediatePromise.new(value: @payload, error: @error)
    end
  end

  class Brewery < Swill::Model::Base
    attribute :name
    attribute :brewery_type, key: :brewery_type
  end

  def setup
    Brewery.clear
  end

  def test_reload_decodes_pools_and_notifies
    wire = FakeWire.new(payload: [{ id: "one", name: "Wayfinder", brewery_type: "micro" }])
    dataset = Brewery.dataset(url: "/breweries/search", params: { query: "portland" }, wire: wire)
    loading = []
    dataset.observe(:loading) { |value| loading << value }

    dataset.reload

    assert_equal [["/breweries/search", { query: "portland" }]], wire.requests
    assert_equal [true, false], loading
    assert_equal ["Wayfinder"], dataset.records.map(&:name)
    assert_same dataset.records.first, Brewery.get("one")
    assert_nil dataset.error
  end

  def test_reload_exposes_failure_and_preserves_records
    failure = RuntimeError.new("offline")
    dataset = Brewery.dataset(url: "/breweries", wire: FakeWire.new(error: failure))
    dataset.records = [Brewery.new(name: "Existing")]

    dataset.reload

    assert_equal ["Existing"], dataset.records.map(&:name)
    assert_same failure, dataset.error
    refute dataset.loading
  end
end
