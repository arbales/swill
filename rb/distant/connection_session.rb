# frozen_string_literal: true

require "async/semaphore"

module Swill
  module Distant
    # Two independent queries may overlap. Every other message is a barrier.
    class ConnectionSession # :nodoc:
      def initialize(dispatcher, connection)
        @dispatcher = dispatcher
        @connection = connection
        @queries = Async::Semaphore.new(2)
        @writer = Async::Semaphore.new(1)
        @tasks = []
        @welcomed = false
        @failure = nil
      end

      def run
        reader = Async::Task.current.async do |task|
          @reader = task
          while (frame = @connection.read)
            break unless submit(Protocol.unpack(frame.to_str))
          end
        end
        reader.wait
        raise @failure if @failure
      ensure
        stop
      end

      def submit(message)
        @tasks.delete_if do |task|
          task.wait if task.finished?
          task.finished?
        end
        if @welcomed && message["type"] == "QUERY"
          @tasks << @queries.async do
            reply(@dispatcher.call(message))
          rescue StandardError => error
            # Wake a reader blocked on the socket or on a mutation barrier.
            @failure ||= error
            @reader&.stop
          end
        else
          wait
          response = @dispatcher.call(message)
          reply(response)
          @welcomed = response["type"] == "WELCOME" if message["type"] == "HELLO"
          return false if response.dig("error", "code") == "schema_mismatch"
        end
        true
      end

      def wait
        @tasks.each(&:wait)
        @tasks.clear
        raise @failure if @failure
      end

      def stop
        @tasks.each(&:stop)
        @tasks.clear
      end

      private

      def reply(message)
        @writer.acquire do
          @connection.write(::Protocol::WebSocket::BinaryMessage.new(Protocol.pack(message)))
          @connection.flush
        end
      end
    end
  end
end
