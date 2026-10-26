# frozen_string_literal: true

require "msgpack"
require "date"
require "time"
require "bigdecimal"

module Swill
  module Distant
    # `Protocol` is the codec for the binary envelope between a browser and a
    # `Connection`: MessagePack, with a model reference, a `Time` and a `Date`
    # each carried as a tagged one-key Hash (`$ref`, `$time`, `$date`) so an
    # application Hash may hold any other keys without being read as
    # protocol data. The connection unpacks each frame with `unpack` before
    # the `Dispatcher` sees it and packs the reply with `pack`. See
    # [Server Data](rdoc-ref:doc/server_data.md).
    module Protocol
      # A reference to a server model by `model` (the class name) and `id`
      # (the primary key as a string). The dispatcher sends one in place of a
      # record, alongside a patch carrying the record's fields, and a browser
      # sends one for a model argument, which the dispatcher resolves under
      # the viewer context.
      Reference = ::Data.define(:model, :id)

      module_function

      # Returns `message` encoded to MessagePack bytes: Hash keys become
      # strings, and every `Reference`, `Time` (as UTC ISO 8601 with
      # nanoseconds) and `Date` becomes its tagged Hash. `unpack` is the
      # inverse.
      def pack(message)
        MessagePack.pack(encode(message))
      end

      # Returns the message decoded from MessagePack `bytes`, with each tagged
      # Hash restored to a `Reference`, `Time` or `Date`. Raises when `bytes`
      # are not MessagePack. `pack` is the inverse.
      def unpack(bytes)
        decode(MessagePack.unpack(bytes))
      end

      # Returns `value` with tagged Hashes in place of references, times and
      # dates, recursively through Hashes and Arrays.
      def encode(value)
        if defined?(Sequel::Postgres::PGRange) && value.is_a?(Sequel::Postgres::PGRange)
          return {"$range" => [value.db_type, value.empty?, encode(value.begin), encode(value.end),
                                value.exclude_begin?, value.exclude_end?]}
        end
        if defined?(Sequel::Postgres::PGMultiRange) && value.is_a?(Sequel::Postgres::PGMultiRange)
          return value.to_a.map { |item| encode(item) }
        end
        if defined?(Sequel::Postgres::PGArray) && value.is_a?(Sequel::Postgres::PGArray)
          return value.to_a.map { |item| encode(item) }
        end
        if defined?(ActiveSupport::Duration) && value.is_a?(ActiveSupport::Duration)
          parts = value.parts
          months = parts.fetch(:years, 0) * 12 + parts.fetch(:months, 0)
          days = parts.fetch(:weeks, 0) * 7 + parts.fetch(:days, 0)
          seconds = parts.fetch(:hours, 0) * 3600 + parts.fetch(:minutes, 0) * 60 + parts.fetch(:seconds, 0)
          return {"$interval" => [months, days, (BigDecimal(seconds.to_s) * 1_000_000).to_i.to_s]}
        end
        if defined?(Sequel::SQLTime) && value.is_a?(Sequel::SQLTime)
          return {"$time_of_day" => value.strftime("%H:%M:%S.%6N")}
        end
        case value
        when Reference then { "$ref" => [value.model, value.id] }
        when Hash then value.to_h { |key, item| [key.to_s, encode(item)] }
        when Array then value.map { |item| encode(item) }
        when BigDecimal then { "$decimal" => value.to_s("F") }
        when Time then { "$time" => value.utc.iso8601(6) }
        when DateTime then { "$datetime" => value.new_offset(0).iso8601(6) }
        when Date then { "$date" => value.iso8601 }
        else value
        end
      end

      # Returns `value` with each one-key tagged Hash restored to its object,
      # recursively through Hashes and Arrays.
      def decode(value)
        case value
        when Hash
          return Reference.new(*value["$ref"]) if value.keys == ["$ref"]
          return Time.iso8601(value["$time"]) if value.keys == ["$time"]
          return DateTime.iso8601(value["$datetime"]) if value.keys == ["$datetime"]
          return Date.iso8601(value["$date"]) if value.keys == ["$date"]
          return BigDecimal(value["$decimal"]) if value.keys == ["$decimal"]
          if value.keys == ["$range"]
            raise ArgumentError, "Sequel pg_range extension is required" unless defined?(Sequel::Postgres::PGRange)
            name, empty, first, last, exclude_first, exclude_last = value["$range"]
            return Sequel::Postgres::PGRange.empty(name) if empty
            return Sequel::Postgres::PGRange.new(decode(first), decode(last),
              db_type: name, exclude_begin: exclude_first, exclude_end: exclude_last)
          end
          if value.keys == ["$interval"]
            raise ArgumentError, "Sequel pg_interval extension is required" unless defined?(ActiveSupport::Duration)
            months, days, micros = value["$interval"]
            parts = {months: months, days: days, seconds: BigDecimal(micros) / 1_000_000}
            return ActiveSupport::Duration.new(months * 2_592_000 + days * 86_400 + parts[:seconds].to_f, parts)
          end
          if value.keys == ["$time_of_day"]
            raise ArgumentError, "Sequel SQLTime is required" unless defined?(Sequel::SQLTime)
            return Sequel::SQLTime.parse(value["$time_of_day"])
          end

          value.to_h { |key, item| [key, decode(item)] }
        when Array then value.map { |item| decode(item) }
        else value
        end
      end

      private_class_method :encode, :decode
    end
  end
end
