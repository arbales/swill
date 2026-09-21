# frozen_string_literal: true

module Swill
  module Data
    # Rack endpoint adapting binary WebSocket frames to one Dispatcher.
    class WebSocket
      def initialize(schema:, authenticate:)
        @schema = schema
        @authenticate = authenticate
      end

      def call(env)
        require "async/websocket/adapters/rack"
        require "protocol/websocket/message"

        Async::WebSocket::Adapters::Rack.open(env) do |connection|
          identity = @authenticate.call(env)
          dispatcher = Dispatcher.new(schema: @schema, **identity)
          while (frame = connection.read)
            reply = dispatcher.call(Protocol.unpack(frame.to_str))
            connection.write(::Protocol::WebSocket::BinaryMessage.new(Protocol.pack(reply)))
            connection.flush
            break if reply.dig("error", "code") == "schema_mismatch"
          end
        end || [426, { "content-type" => "text/plain" }, ["WebSocket required"]]
      end
    end
  end
end
