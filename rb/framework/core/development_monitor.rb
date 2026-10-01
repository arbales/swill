# typed: true
# frozen_string_literal: true

module Swill
  # The page carries the revision it actually loaded. Polling is opt-in via
  # server metadata, and works equally with Distant, REST, or no data layer.
  class DevelopmentMonitor < Swill::Object
    extend T::Sig

    sig { params(document: Document, reporter: ProblemReporter).void }
    def initialize(document, reporter)
      super()
      @document = document
      @reporter = reporter
      @endpoint = T.let("", String)
      @loaded_revision = T.let("", String)
      @timer = T.let(nil, T.nilable(Integer))
      @request = T.let(nil, T.nilable(AbortController))
      @stopped = T.let(true, T::Boolean)
      @on_visibility = ->(_event) { poll if @document.visibilityState == "visible" }
    end

    sig { void }
    def start
      metadata = @document.querySelector('meta[name="swill-development"]')
      return unless metadata

      @endpoint = metadata.getAttribute("data-endpoint").to_s
      @loaded_revision = metadata.getAttribute("content").to_s
      return if @endpoint.empty?

      @stopped = false
      @document.addEventListener("visibilitychange", @on_visibility)
      poll
    end

    sig { void }
    def stop
      @stopped = true
      @document.removeEventListener("visibilitychange", @on_visibility)
      timer = @timer
      clearTimeout(timer) if timer
      @timer = nil
      request = @request
      request.abort if request
    end

    sig { returns(T::Boolean) }
    def running? # :nodoc:
      !@stopped
    end

    sig { void }
    async def poll # :nodoc:
      return if @stopped || @request

      timer = @timer
      clearTimeout(timer) if timer
      @timer = nil
      return unless @document.visibilityState == "visible"

      request = AbortController.new
      @request = request
      timeout = setTimeout(-> { request.abort }, 5000)
      begin
        response = await fetch(@endpoint, { cache: "no-store", signal: request.signal })
        if response.ok
          state = T.cast(await(response.json), T::Hash[String, T.untyped])
          revision = state["revision"].to_s
          if running? && state["ready"] == true && !revision.empty? && revision != @loaded_revision
            @reporter.revision_changed(revision)
          end
        end
      rescue Error => _e
        # An unavailable or rebuilding server is not a new build.
      ensure
        clearTimeout(timeout)
        @request = nil
        @timer = setTimeout(-> { poll }, 1000) unless @stopped
      end
    end
  end
end
