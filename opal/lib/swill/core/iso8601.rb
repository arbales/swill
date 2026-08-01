# frozen_string_literal: true

require "date"

module Swill
  # An ISO-8601 calendar-date parser, used to polyfill Date.iso8601 on the
  # client. The server (MRI) keeps its native Date.iso8601; Opal's stdlib Date
  # does not implement it, so on the client this fills the gap. Both sides are
  # then ISO-8601 compliant, which is what keeps them from drifting — the
  # spec, verified by an MRI parity test against the native implementation, is
  # the contract, not a shared code path.
  #
  # It accepts the same date forms `Date.iso8601` does — extended and basic
  # calendar (`2026-06-23`, `20260623`), ordinal (`2026-174`, `2026174`), and
  # week (`2026-W26-2`, `2026W262`) dates — each optionally followed by a `T`
  # time component, which is ignored. Everything is computed with integer and
  # Julian-Day arithmetic so it does not depend on Opal's Date supporting more
  # than `Date.new`.
  module ISO8601
    EXTENDED_CALENDAR = /\A(\d{4})-(\d{2})-(\d{2})\z/
    BASIC_CALENDAR    = /\A(\d{4})(\d{2})(\d{2})\z/
    EXTENDED_ORDINAL  = /\A(\d{4})-(\d{3})\z/
    BASIC_ORDINAL     = /\A(\d{4})(\d{3})\z/
    EXTENDED_WEEK     = /\A(\d{4})-W(\d{2})-(\d)\z/
    BASIC_WEEK        = /\A(\d{4})W(\d{2})(\d)\z/

    DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].freeze

    module_function

    # Parse +string+ into a Date, or raise ArgumentError (matching the
    # interface of Date.iso8601, whose Date::Error is itself an ArgumentError).
    def parse(string)
      # Only a `T` separates the date from an optional time; a space does not,
      # so a bare space-separated value falls through to no match and is
      # rejected, exactly as native Date.iso8601 rejects it.
      date_part = string.to_s.split("T", 2).first.to_s

      ymd = parse_date_part(date_part)
      raise ArgumentError, "invalid ISO-8601 date: #{string.inspect}" if ymd.nil?

      Date.new(*ymd)
    end

    # => [year, month, day] or nil
    def parse_date_part(string)
      if (m = EXTENDED_CALENDAR.match(string)) || (m = BASIC_CALENDAR.match(string))
        calendar(m[1].to_i, m[2].to_i, m[3].to_i)
      elsif (m = EXTENDED_ORDINAL.match(string)) || (m = BASIC_ORDINAL.match(string))
        from_ordinal(m[1].to_i, m[2].to_i)
      elsif (m = EXTENDED_WEEK.match(string)) || (m = BASIC_WEEK.match(string))
        from_week(m[1].to_i, m[2].to_i, m[3].to_i)
      end
    end

    def calendar(year, month, day)
      return nil unless month.between?(1, 12)
      return nil unless day.between?(1, days_in_month(year, month))

      [year, month, day]
    end

    def from_ordinal(year, day_of_year)
      return nil unless day_of_year.between?(1, leap?(year) ? 366 : 365)

      month = 1
      remaining = day_of_year
      while remaining > days_in_month(year, month)
        remaining -= days_in_month(year, month)
        month += 1
      end
      [year, month, remaining]
    end

    def from_week(year, week, weekday)
      return nil unless weekday.between?(1, 7)
      return nil unless week.between?(1, weeks_in_year(year))

      jan4 = gregorian_to_jdn(year, 1, 4)
      week1_monday = jan4 - (iso_weekday(jan4) - 1)
      jdn_to_gregorian(week1_monday + (week - 1) * 7 + (weekday - 1))
    end

    def days_in_month(year, month)
      return 29 if month == 2 && leap?(year)

      DAYS_IN_MONTH[month - 1]
    end

    def leap?(year)
      (year % 4).zero? && (!(year % 100).zero? || (year % 400).zero?)
    end

    # 53-week ISO years are those whose Jan 1 is a Thursday, or leap years
    # whose Jan 1 is a Wednesday.
    def weeks_in_year(year)
      jan1 = iso_weekday(gregorian_to_jdn(year, 1, 1))
      return 53 if jan1 == 4 || (leap?(year) && jan1 == 3)

      52
    end

    # ISO weekday of a Julian Day Number: 1 = Monday .. 7 = Sunday.
    def iso_weekday(jdn)
      (jdn % 7) + 1
    end

    # Fliegel–Van Flandern conversions, integer arithmetic throughout. We use
    # Integer#div rather than `/`: under Opal `/` is true (float) division
    # (7 / 2 == 3.5), while #div floors like Ruby (7.div(2) == 3). All operands
    # here are non-negative, so floor and truncation agree.
    def gregorian_to_jdn(year, month, day)
      a = (14 - month).div(12)
      y = year + 4800 - a
      m = month + 12 * a - 3
      day + (153 * m + 2).div(5) + 365 * y + y.div(4) - y.div(100) + y.div(400) - 32045
    end

    def jdn_to_gregorian(jdn)
      a = jdn + 32044
      b = (4 * a + 3).div(146097)
      c = a - (146097 * b).div(4)
      d = (4 * c + 3).div(1461)
      e = c - (1461 * d).div(4)
      m = (5 * e + 2).div(153)
      day = e - (153 * m + 2).div(5) + 1
      month = m + 3 - 12 * m.div(10)
      year = 100 * b + d - 4800 + m.div(10)
      [year, month, day]
    end
  end
end

# Polyfill the client. The server keeps its native, fuller implementation.
unless Date.respond_to?(:iso8601)
  class << Date
    def iso8601(string)
      Swill::ISO8601.parse(string)
    end
  end
end
