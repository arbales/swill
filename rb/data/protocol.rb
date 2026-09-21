# frozen_string_literal: true

require "msgpack"
require "date"
require "time"

module Swill
  module Data
    # Binary envelope codec. References are tagged explicitly so ordinary
    # application hashes can contain any keys without becoming protocol data.
    module Protocol
      Reference = ::Data.define(:model, :id)

      module_function

      def pack(message)
        MessagePack.pack(encode(message))
      end

      def unpack(bytes)
        decode(MessagePack.unpack(bytes))
      end

      def encode(value)
        case value
        when Reference then { "$ref" => [value.model, value.id] }
        when Hash then value.to_h { |key, item| [key.to_s, encode(item)] }
        when Array then value.map { |item| encode(item) }
        when Time then { "$time" => value.utc.iso8601(9) }
        when Date then { "$date" => value.iso8601 }
        else value
        end
      end

      def decode(value)
        case value
        when Hash
          return Reference.new(*value["$ref"]) if value.keys == ["$ref"]
          return Time.iso8601(value["$time"]) if value.keys == ["$time"]
          return Date.iso8601(value["$date"]) if value.keys == ["$date"]

          value.to_h { |key, item| [key, decode(item)] }
        when Array then value.map { |item| decode(item) }
        else value
        end
      end
    end
  end
end
