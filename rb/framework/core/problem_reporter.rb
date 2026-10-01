# typed: true
# frozen_string_literal: true

module Swill
  # In development, shows the application's problems as alerts as well as in
  # the console: an uncaught error or a rejected promise with the Stop image,
  # and a framework warning with the Warning image. One alert shows at a time;
  # problems that arrive meanwhile wait behind it, and one already showing or
  # waiting is not shown again.
  #
  # The application runs one when it is in development. See
  # Application#development.
  class ProblemReporter < Swill::Object
    extend T::Sig

    # Creates a reporter for +window+, the browser window whose uncaught
    # errors it reports. Nothing is reported until #start.
    sig { params(window: T.nilable(DOMWindow)).void }
    def initialize(window)
      super()
      @window = window
      @pending = T.let([], T::Array[T::Hash[String, String]])
      @current = T.let(nil, T.nilable(String))
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

    # Stops reporting. An alert already showing stays until it is dismissed.
    sig { void }
    def stop
      window = @window
      if window
        window.removeEventListener("error", @on_error)
        window.removeEventListener("unhandledrejection", @on_rejection)
      end
      stop_warnings = @stop_warnings
      stop_warnings.() if stop_warnings
      @stop_warnings = nil
      @pending = []
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
      report("Stop", ProblemReporter.message_of(reason), ProblemReporter.origin_of(reason))
    end

    # Queues a problem, showing it now when no alert is showing.
    sig { params(icon: String, message: String, detail: String).void }
    def report(icon, message, detail)
      return if @current == message || @pending.any? { |problem| problem["message"] == message }
      @pending << {"icon" => icon, "message" => message, "detail" => detail}
      show_next if @current.nil?
    end

    sig { void }
    async def show_next # :nodoc:
      problem = @pending.shift
      return unless problem
      @current = problem["message"]
      begin
        alert = Alert.new
        alert.icon = T.must(problem["icon"])
        alert.message_text = T.must(problem["message"])
        alert.informative_text = T.must(problem["detail"])
        alert.add_button("OK")
        await alert.run
      rescue => _error
        # The console already has the problem; an alert that cannot show is
        # not reported again, which could only repeat.
        @pending = []
      ensure
        @current = nil
      end
      show_next unless @pending.empty?
    end

    # What an error says: an Error's message, or anything else as text.
    sig { params(value: T.untyped).returns(String) }
    def self.message_of(value)
      return T.cast(value, Error).message if value.is_a?(Error)
      "#{value}"
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
