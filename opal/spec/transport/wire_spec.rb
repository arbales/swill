# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/transport"

class WireTest < Minitest::Test
  def teardown
    Swill::Wire.base_url = ""
  end

  def test_resolves_relative_urls_against_configured_base
    Swill::Wire.base_url = "/giraffic-api/"
    assert_equal "/giraffic-api/api/lists", Swill::Wire.resolve_url("/api/lists")
    assert_equal "/giraffic-api/api/lists", Swill::Wire.resolve_url("api/lists")
  end

  def test_preserves_absolute_urls
    Swill::Wire.base_url = "/giraffic-api"
    assert_equal "https://example.com/lists", Swill::Wire.resolve_url("https://example.com/lists")
  end
end
