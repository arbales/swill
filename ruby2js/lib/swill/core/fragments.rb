# typed: true
# frozen_string_literal: true

module Swill
  # URL-fragment state: #key=value params, writes with push or replace
  # history, and browser-driven change events. Inert without a browser window
  # that has a location and history, as in Node.
  class Fragments < Swill::Object
    extend T::Sig

    sig { params(browser: T.nilable(DOMWindow)).void }
    def initialize(browser)
      super()
      @browser = browser
      @suspended = false
      @on_change = T.let(nil, T.nilable(T.proc.params(event: Event).void))
    end

    sig { returns(T::Boolean) }
    def available?
      browser = @browser
      browser != nil && browser.location != nil && browser.history != nil
    end

    sig { returns(T::Hash[String, String]) }
    def params
      found = T.let({}, T::Hash[String, String])
      browser = @browser
      return found unless browser && available?
      search = URLSearchParams.new(browser.location.hash.sub(/^#/, ""))
      search.forEach(->(value, key) { found[key] = value })
      found
    end

    # :push adds a history entry, :replace rewrites the current one, :none is
    # a no-op. Writes are also dropped while fragment state is being applied.
    sig { params(key: String, value: T.nilable(String), history: Symbol).void }
    def write(key, value, history)
      return if history == :none || @suspended
      browser = @browser
      return unless browser && available?
      location = browser.location
      search = URLSearchParams.new(location.hash.sub(/^#/, ""))
      if value == nil
        search.delete(key)
      else
        search.set(key, value)
      end
      query = search.toString
      next_url = location.pathname + location.search + (query.empty? ? "" : "#" + query)
      return if next_url == location.pathname + location.search + location.hash
      if history == :push
        browser.history.pushState(nil, "", next_url)
      else
        browser.history.replaceState(nil, "", next_url)
      end
    end

    # Run callback with writes suppressed, so observers fired by applying
    # fragment values do not write back mid-application.
    sig { params(callback: T.proc.void).void }
    def suspended(callback)
      @suspended = true
      begin
        callback.()
      ensure
        @suspended = false
      end
    end

    sig { params(callback: T.proc.void).void }
    def observe(callback)
      browser = @browser
      return unless browser && available?
      on_change = ->(_event) { callback.() }
      @on_change = on_change
      browser.addEventListener("popstate", on_change)
      browser.addEventListener("hashchange", on_change)
    end

    sig { void }
    def release
      on_change = @on_change
      browser = @browser
      return unless on_change && browser
      browser.removeEventListener("popstate", on_change)
      browser.removeEventListener("hashchange", on_change)
      @on_change = nil
    end
  end
end
