# frozen_string_literal: true

require "minitest/autorun"
require "async"
require "sequel"
require "sequel-privacy"
require_relative "../rb/swill/server"
require_relative "../rb/distant/connection_session"
require "protocol/websocket/message"
require "async/queue"

class DataConnectionTest < Minitest::Test
  class Socket
    attr_reader :replies
    attr_accessor :fail_reply

    def initialize
      @replies = []
      @writing = false
      @frames = Async::Queue.new
    end

    def feed(message)
      @frames.enqueue(message && Swill::Distant::Protocol.pack(message))
    end

    def read
      @frames.dequeue
    end

    def write(frame)
      raise "overlapping frame writes" if @writing
      @writing = true
      @replies << Swill::Distant::Protocol.unpack(frame.to_str)
    end

    def flush
      raise IOError, "socket write failed" if @replies.last["request_id"] == @fail_reply && @fail_reply
      sleep 0.001
      @writing = false
    end
  end

  def test_failed_response_wakes_socket_reader_and_stops_other_queries
    Async do |parent|
      stopped = []
      dispatcher = lambda do |message|
        next({"type" => "WELCOME"}) if message["type"] == "HELLO"
        id = message["request_id"]
        begin
          sleep(id == 1 ? 0.01 : 10)
          {"type" => "RESULT", "request_id" => id}
        ensure
          stopped << id
        end
      end
      socket = Socket.new
      socket.fail_reply = 1
      socket.feed("type" => "HELLO")
      socket.feed(query(1))
      socket.feed(query(2))
      session = Swill::Distant::ConnectionSession.new(dispatcher, socket)
      parent.with_timeout(1) do
        error = assert_raises(IOError) { session.run }
        assert_equal "socket write failed", error.message
      end
      assert_equal [1, 2], stopped.sort
    end.wait
  end

  def test_eof_stops_reads_without_sending_late_replies
    Async do
      stopped = []
      dispatcher = lambda do |message|
        next({"type" => "WELCOME"}) if message["type"] == "HELLO"
        begin
          sleep 10
        ensure
          stopped << message["request_id"]
        end
      end
      socket = Socket.new
      socket.feed("type" => "HELLO")
      socket.feed(query(1))
      socket.feed(query(2))
      socket.feed(nil)
      Swill::Distant::ConnectionSession.new(dispatcher, socket).run
      assert_equal [1, 2], stopped.sort
      assert_equal ["WELCOME"], socket.replies.map { |r| r["type"] }
    end.wait
  end

  def query(id)
    {"type" => "QUERY", "model" => "Movies::Movie", "name" => "search", "request_id" => id}
  end

  def test_reads_overlap_but_writes_fence_both_sides
    Async do
      events = []
      active = 0
      maximum = 0
      context = Swill::Distant::Context.new(viewer_context: nil, actor: :fixture, scope_token: "fixture")
      dispatcher = lambda do |message|
        next({"type" => "WELCOME"}) if message["type"] == "HELLO"
        context.use do
          id = message.fetch("request_id")
          active += 1
          maximum = [maximum, active].max
          events << [:start, id]
          context.effects << id
          Sequel::Privacy.cache[id] = :allow
          sleep(id == 1 ? 0.03 : 0.005)
          assert_equal [id], context.effects, "effects must be invocation-local"
          assert_equal({id => :allow}, Sequel::Privacy.cache, "policy caches must be invocation-local")
          assert_same context, Swill::Distant.context
          events << [:finish, id]
          active -= 1
          {"type" => "RESULT", "request_id" => id}
        end
      end
      socket = Socket.new
      schedule = Swill::Distant::ConnectionSession.new(dispatcher, socket)
      schedule.submit("type" => "HELLO")
      3.times { |index| schedule.submit(query(index + 1)) }
      schedule.submit("type" => "UPDATE", "request_id" => 4)
      schedule.submit(query(5))
      schedule.wait
      assert_equal 2, maximum
      assert_operator events.index([:finish, 2]), :<, events.index([:finish, 1])
      (1..3).each { |id| assert_operator events.index([:finish, id]), :<, events.index([:start, 4]) }
      assert_operator events.index([:finish, 4]), :<, events.index([:start, 5])
      assert_equal [nil, 1, 2, 3, 4, 5], socket.replies.map { |r| r["request_id"] }.sort_by { |id| id || 0 }
      assert_raises(RuntimeError) { Swill::Distant.context }
    ensure
      schedule&.stop
    end.wait
  end

  def test_handshake_required_and_mismatch_stops
    Async do
      events = []
      dispatcher = lambda do |message|
        id = message["request_id"]
        events << [:start, id]
        sleep 0.005
        events << [:finish, id]
        if message["type"] == "HELLO"
          {"type" => "ERROR", "error" => {"code" => "schema_mismatch"}}
        else
          {"type" => "ERROR", "error" => {"code" => "handshake_required"}}
        end
      end
      schedule = Swill::Distant::ConnectionSession.new(dispatcher, Socket.new)
      schedule.submit(query(1))
      schedule.submit(query(2))
      assert_equal [[:start, 1], [:finish, 1], [:start, 2], [:finish, 2]], events
      assert_equal false, schedule.submit("type" => "HELLO")
    ensure
      schedule&.stop
    end.wait
  end

  def test_hydration_and_commands_are_barriers
    Async do
      events = []
      dispatcher = lambda do |message|
        next({"type" => "WELCOME"}) if message["type"] == "HELLO"
        id = message.fetch("request_id")
        events << [:start, id]
        sleep 0.005
        events << [:finish, id]
        {"type" => "RETURN", "request_id" => id}
      end
      schedule = Swill::Distant::ConnectionSession.new(dispatcher, Socket.new)
      schedule.submit("type" => "HELLO")
      schedule.submit(query(1))
      schedule.submit({"type" => "GET", "request_id" => 2})
      schedule.submit(query(3))
      schedule.submit("type" => "COMMAND", "request_id" => 4)
      schedule.wait
      assert_equal (1..4).flat_map { |id| [[:start, id], [:finish, id]] }, events
    ensure
      schedule&.stop
    end.wait
  end

  def test_disconnect_stops_active_reads_and_restores_context
    Async do |parent|
      context = Swill::Distant::Context.new(viewer_context: nil, actor: :fixture, scope_token: "fixture")
      finished = []
      dispatcher = lambda do |message|
        next({"type" => "WELCOME"}) if message["type"] == "HELLO"
        context.use do
          begin
            parent.sleep(10)
          ensure
            finished << message["request_id"]
          end
        end
      end
      socket = Socket.new
      schedule = Swill::Distant::ConnectionSession.new(dispatcher, socket)
      schedule.submit("type" => "HELLO")
      schedule.submit(query(1))
      schedule.submit(query(2))
      schedule.stop
      assert_equal [1, 2], finished.sort
      assert_equal 1, socket.replies.length
      assert_raises(RuntimeError) { Swill::Distant.context }
    end.wait
  end
end
