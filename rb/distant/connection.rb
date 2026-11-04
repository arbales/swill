# frozen_string_literal: true

module Swill
  module Distant
    # A `Connection` is the Rack application a browser's WebSocket reaches. It
    # accepts the upgrade, authenticates the browser once, and then runs every
    # message the browser sends under that identity: each frame is unpacked
    # with `Protocol`, answered by a `Dispatcher` created for the connection,
    # and the reply is written back as a binary frame. The connection closes
    # after a `schema_mismatch` reply, and a request that is not a WebSocket
    # upgrade is answered `426 Upgrade Required`.
    # Up to two queries run concurrently; other operations wait for earlier
    # queries and finish before later queries start. Replies are written serially.
    #
    # It is mounted in `config.ru` with the schema and an authenticator:
    #
    #     map "/data" do
    #       run Swill::Distant::Connection.new(
    #         schema: Swill::Distant::Schema.discover,
    #         authenticate: ->(env) { MyApp.authenticate_data_connection(env) }
    #       )
    #     end
    #
    # The connection needs the `async-websocket` gem and a Rack server that
    # supports it, such as Falcon; neither is a dependency of the gem, and a
    # request raises naming them when they are missing. See
    # [Server Data](rdoc-ref:doc/server_data.md).
    class Connection
      # Creates a connection serving `schema`. `authenticate` is a callable
      # invoked with the Rack `env` when a browser connects; it returns a
      # Hash with `viewer_context:`, `actor:` and `scope_token:`, which become
      # the `Context` every message on that WebSocket runs under. The viewer
      # context may be nil when the application does not use sequel-privacy;
      # the scope token is an opaque string identifying the authenticated
      # scope, and a new actor or scope is a new token.
      # Enables Sequel's fiber-aware pool ownership for concurrent operations.
      def initialize(schema:, authenticate:)
        require "sequel"
        # Concurrent operations must never share a thread-owned pool checkout.
        Sequel.extension :fiber_concurrency
        @schema = schema
        @authenticate = authenticate
      end

      # Handles the Rack request in `env`. For a WebSocket upgrade, it
      # authenticates the browser, creates a `Dispatcher`, and answers each
      # binary frame with the dispatcher's reply until the browser closes or a
      # reply carries the `schema_mismatch` error; the WebSocket adapter's
      # response is returned. A request that is not an upgrade returns a
      # `426` response with the plain-text body "WebSocket required". An
      # exception raised by `authenticate` propagates to the Rack server.
      def call(env)
        begin
          require "async/websocket/adapters/rack"
          require "protocol/websocket/message"
          require_relative "connection_session"
        rescue LoadError => e
          raise LoadError, "Swill::Distant::Connection needs the async-websocket gem and a server that " \
                           "supports it, such as Falcon (#{e.message})"
        end

        Async::WebSocket::Adapters::Rack.open(env) do |connection|
          identity = @authenticate.call(env)
          dispatcher = Dispatcher.new(schema: @schema, **identity)
          ConnectionSession.new(dispatcher, connection).run
        end || [426, { "content-type" => "text/plain" }, ["WebSocket required"]]
      end
    end
  end
end
