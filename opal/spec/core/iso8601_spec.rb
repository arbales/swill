# frozen_string_literal: true

# Pure-Ruby spec for Swill::ISO8601, the client-side Date.iso8601 polyfill.
#
#   ruby spec/iso8601_spec.rb
#
# The headline test is parity: across a wide corpus, Swill::ISO8601.parse must
# agree with MRI's native Date.iso8601 — same Date, or both raise. That parity
# is what guarantees the Opal client (which uses this) and the MRI server
# (which uses native) do not drift. Under MRI the polyfill does not install
# (native exists), so this exercises our implementation directly against the
# reference.

require_relative "../spec_helper"
require "swill/core"
require "swill/core/iso8601"

class ISO8601Test < Minitest::Test
  def parse(string) = Swill::ISO8601.parse(string)

  # --- direct behavior ------------------------------------------------------

  def test_extended_calendar_date
    date = parse("2026-06-23")
    assert_instance_of Date, date
    assert_equal [2026, 6, 23], [date.year, date.month, date.day]
  end

  def test_basic_calendar_date
    assert_equal Date.new(2026, 6, 23), parse("20260623")
  end

  def test_ordinal_dates
    assert_equal Date.new(2026, 6, 23), parse("2026-174")
    assert_equal Date.new(2026, 6, 23), parse("2026174")
  end

  def test_week_dates
    assert_equal Date.new(2026, 6, 23), parse("2026-W26-2")
    assert_equal Date.new(2026, 6, 23), parse("2026W262")
  end

  def test_ignores_trailing_time
    assert_equal Date.new(2026, 6, 23), parse("2026-06-23T10:30:00Z")
  end

  def test_rejects_space_separated_time
    assert_raises(ArgumentError) { parse("2026-06-23 10:30") }
  end

  def test_leap_day_rules
    assert_equal Date.new(2024, 2, 29), parse("2024-02-29")
    assert_raises(ArgumentError) { parse("2025-02-29") }
  end

  def test_rejects_out_of_range
    ["2026-13-01", "2026-06-31", "2026-00-10", "2026-366", "2026-W54-1",
     "2026-W26-8", "2026-W26-0"].each do |bad|
      assert_raises(ArgumentError, "should reject #{bad}") { parse(bad) }
    end
  end

  def test_rejects_non_iso_formats
    ["2026-6-23", "06/23/2026", "2026/06/23", "garbage", ""].each do |bad|
      assert_raises(ArgumentError, "should reject #{bad}") { parse(bad) }
    end
  end

  # --- parity with native Date.iso8601 (the no-drift guarantee) -------------

  def outcome(string)
    [:ok, yield(string)]
  rescue ArgumentError
    [:error]
  end

  def assert_parity(string)
    ours = outcome(string) { |s| Swill::ISO8601.parse(s) }
    native = outcome(string) { |s| Date.iso8601(s) }
    assert_equal native, ours,
                 "drift on #{string.inspect}: native=#{native.inspect} ours=#{ours.inspect}"
  end

  FORMATS = ["%Y-%m-%d", "%Y%m%d", "%Y-%j", "%Y%j", "%G-W%V-%u", "%GW%V%u"].freeze

  def test_parity_across_all_forms_over_a_wide_date_range
    date = Date.new(1801, 1, 1)
    last = Date.new(2200, 12, 31)
    checked = 0

    while date <= last
      FORMATS.each do |format|
        assert_parity(date.strftime(format))
        checked += 1
      end
      assert_parity("#{date.strftime('%Y-%m-%d')}T10:30:00Z")
      date += 73 # sample many weekdays, months, leap years, 53-week years
    end

    assert_operator checked, :>, 10_000, "corpus should be substantial"
  end

  def test_parity_on_edge_and_invalid_inputs
    [
      "2024-02-29", "2024-366", "2020-W53-7", "2026-W01-1", "9999-12-31",
      "2025-02-29", "2026-13-01", "2026-06-31", "2026-00-10", "2026-W54-1",
      "2026-W26-8", "2026-W26-0", "2026-6-23", "06/23/2026", "2026/06/23",
      "garbage", "", "2026-06-23 10:30", "2026-366", "1900-02-29", "2000-02-29"
    ].each { |input| assert_parity(input) }
  end
end
