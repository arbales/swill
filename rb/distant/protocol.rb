# frozen_string_literal: true

require "msgpack"
require "date"
require "time"

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
        case value
        when Reference then { "$ref" => [value.model, value.id] }
        when Hash then value.to_h { |key, item| [key.to_s, encode(item)] }
        when Array then value.map { |item| encode(item) }
        when Time then { "$time" => value.utc.iso8601(9) }
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
          return Date.iso8601(value["$date"]) if value.keys == ["$date"]

          value.to_h { |key, item| [key, decode(item)] }
        when Array then value.map { |item| decode(item) }
        else value
        end
      end

      private_class_method :encode, :decode
    end
  end
end
