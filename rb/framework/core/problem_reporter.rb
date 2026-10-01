# typed: true
# frozen_string_literal: true

module Swill
  # Coordinates connection, reload, and development update notices. In
  # development it also reports uncaught errors and framework warnings.
  # One alert shows at a time; mandatory reload takes precedence.
  class ProblemReporter < Swill::Object
    extend T::Sig

    CONNECTION = "connection"
    RELOAD = "reload"
    REVISION = "revision"
    CONNECTION_MESSAGE = "Connection lost"
    CONNECTION_DETAIL = "Reconnecting automatically. Your local edits are still here."
    REVISION_MESSAGE = "Application updated"
    REVISION_DETAIL = "A new development build is ready. Refresh when you are ready to leave this page."

    # Creates a reporter for +window+, the browser window whose uncaught
    # errors it reports. #start opts into development error reporting.
    sig { params(window: T.nilable(DOMWindow)).void }
    def initialize(window)
      # FIXME: find a way to alias T.let and then prefer `@var = let "", String`
      super()
      @window   = window
      @pending  = T.let [],   T::Array[T::Hash[Symbol, String]]
      @current  = T.let nil,  T.nilable(String)
      @active   = T.let nil,  T.nilable(SystemAlert)
      @kind     = ""
      @state    = "idle"
      @stopped  = false
      @retry    = T.let nil, T.nilable(T.proc.void)
      @revision = ""

      @dismissed = false
      @acknowledged_revision = ""
      @on_error = ->(event) { report_error(T.cast(event, ErrorEvent)) }
      @on_rejection = ->(event) { report_rejection(T.cast(event, PromiseRejectionEvent)) }
      @stop_warnings = T.let(nil, T.nilable(T.proc.void))
    end

    # Starts reporting uncaught errors, rejected promises and warnings.
    sig { void }
    def start
      window = @window
      if window
        window.addEventListener("error", @on_error)
        window.addEventListener("unhandledrejection", @on_rejection)
      end
      @stop_warnings = Runtime.observeWarnings(->(message) { report("Warning", message, "") })
    end

    # Stops reporting and closes any notice before application teardown.
    sig { void }
    def stop
      window = @window
      if window
        window.removeEventListener("error", @on_error)
        window.removeEventListener("unhandledrejection", @on_rejection)
      end
      stop_warnings = @stop_warnings
      stop_warnings&.()
      @stop_warnings = nil
      @pending = []
      @stopped = true
      @active&.finish(nil)
    end

    sig { params(event: ErrorEvent).void }
    def report_error(event) # :nodoc:
      error = event.error
      message = error.nil? ? event.message : ProblemReporter.message_of(error)
      origin = error.nil? ? "" : ProblemReporter.origin_of(error)
      # Without a usable stack, the event itself says where it was raised.
      origin = "at #{event.filename}:#{event.lineno}:#{event.colno}" if origin.empty? && !event.filename.to_s.empty?
      report("Stop", message, origin)
    end

    sig { params(event: PromiseRejectionEvent).void }
    def report_rejection(event) # :nodoc:
      reason = event.reason
      # Connection notices explain these; uncertain writes still need their
      # own explicit outcome warning.
      # FIXME: We are checking the type of Error twice here. We can use case when here.
      return if reason.is_a?(Error) && %w[connection_lost schema_mismatch actor_scope_changed outcome_unknown].include?(T.cast(reason, Error).code.to_s)

      report("Stop", ProblemReporter.message_of(reason), ProblemReporter.origin_of(reason))
    end

    # Queues a problem, showing it now when no alert is showing.
    sig { params(icon: String, message: String, detail: String).void }
    def report(icon, message, detail)
      return if @stopped || @current == message || @pending.any? { |problem| problem[:message] == message }

      @pending << { kind: "", icon: icon, message: message, detail: detail }
      show_next if @current.nil?
    end

    # These notices are available in production, independent of error reporting.
    sig { params(state: String, detail: String, retry_action: T.proc.void).void }
    def connection_changed(state, detail, retry_action)
      @state = state
      @retry = retry_action
      case state
      when "connected", "idle" then connection_restored
      when "reload_required" then require_reload(detail)
      when "disconnected" then connection_lost unless @dismissed
      end
    end

    # Coalesce builds while a notice is open. Later acknowledges the latest
    # revision seen, rather than only the one which first opened the alert.
    sig { params(revision: String).void }
    def revision_changed(revision)
      @revision = revision
      return if revision == @acknowledged_revision || @state == "reload_required"

      enqueue_notice(REVISION, REVISION_MESSAGE, REVISION_DETAIL)
    end

    sig { params(kind: String, message: String, detail: String).void }
    def enqueue_notice(kind, message, detail) # :nodoc:
      return if @stopped || @kind == kind || @pending.any? { |item| item[:kind] == kind }

      icon = kind == CONNECTION ? "NetworkLost" : "Warning"
      @pending.unshift({ kind: kind, icon: icon, message: message, detail: detail })
      show_next if @current.nil?
    end

    sig { void }
    async def show_next # :nodoc:
      return if @stopped

      first = @pending.first
      return if first && first[:kind] == REVISION && %w[disconnected connecting].include?(@state)

      problem = @pending.shift
      return unless problem

      @current = problem.fetch(:message)
      @kind = problem.fetch(:kind)
      kind = @kind
      begin
        alert = SystemAlert.new
        alert.retry_action = kind == CONNECTION ? @retry : nil
        alert.required = kind == RELOAD
        @active = alert
        alert.icon = problem.fetch(:icon)
        alert.title = kind.empty? ? (alert.icon == "Stop" ? "Error" : "Warning") : "Application"
        alert.message_text = problem.fetch(:message)
        alert.informative_text = problem.fetch(:detail)
        button_titles(kind).each { |label| alert.add_button(label) }
        await alert.run
        @dismissed = true if kind == CONNECTION && %w[disconnected connecting].include?(@state)
        @acknowledged_revision = @revision if kind == REVISION && %w[idle connected].include?(@state)
      rescue => _e
        # An alert that cannot show must not report itself recursively.
        @pending = []
      ensure
        @current = nil
        @kind = ""
        @active = nil
      end
      show_next unless @pending.empty?
    end

    private

    sig { void }
    def connection_restored
      @dismissed = false
      @pending = @pending.reject { |item| [CONNECTION, RELOAD].include?(item[:kind]) }
      @active&.finish(nil) if [CONNECTION, RELOAD].include?(@kind)
      show_next if @current.nil?
    end

    sig { params(detail: String).void }
    def require_reload(detail)
      @pending = @pending.reject { |item| [CONNECTION, REVISION].include?(item[:kind]) }
      enqueue_notice(RELOAD, "Reload required", detail)
      @active&.finish(nil) unless @kind == RELOAD
    end

    sig { void }
    def connection_lost
      if @kind == REVISION
        @pending << { kind: REVISION, icon: "Warning", message: REVISION_MESSAGE, detail: REVISION_DETAIL }
        @active&.finish(nil)
      end
      enqueue_notice(CONNECTION, CONNECTION_MESSAGE, CONNECTION_DETAIL)
    end

    sig { params(kind: String).returns(T::Array[String]) }
    def button_titles(kind)
      case kind
      when CONNECTION then [SystemAlert::RETRY_TITLE, "Dismiss"]
      when RELOAD then [SystemAlert::RELOAD_TITLE]
      when REVISION then [SystemAlert::REFRESH_TITLE, "Later"]
      else ["OK"]
      end
    end

    # What an error says: an Error's message, or anything else as text.
    sig { params(value: T.untyped).returns(String) }
    def self.message_of(value)
      return T.cast(value, Error).message if value.is_a?(Error)

      value.to_s
    end

    # Where an error was raised: the first frame of an Error's stack, or
    # empty when there is none. Browsers write frames differently, Chrome as
    # `at fn (url:line:col)` and Safari and Firefox as `fn@url:line:col`, so a
    # frame is the first line ending in a line and column, written the same
    # way for every browser.
    sig { params(value: T.untyped).returns(String) }
    def self.origin_of(value)
      return "" unless value.is_a?(Error)

      stack = T.cast(value, Error).stack || ""
      found = stack.split("\n").find { |line| line.strip =~ /:\d+:\d+\)?$/ }
      return "" unless found

      frame = T.let(found.strip, String)
      return frame if frame.start_with?("at ")

      parts = T.let(frame.split("@"), T::Array[String])
      return "at #{frame}" if parts.length < 2

      function = T.must(parts.first)
      location = parts.drop(1).join("@")
      function.empty? ? "at #{location}" : "at #{function} (#{location})"
    end
  end
end
