# backtick_javascript: true

module Swill
  # URL-fragment state: reading and writing #key=value params and observing
  # browser-driven changes. The application composes one router; windows write
  # their content and restorable state through it. All entry points no-op in
  # environments without window.location/history.
  class FragmentRouter
    def initialize
      @suspended = false
      @installed = false
    end

    def params
      params = {}
      return params unless `typeof window !== "undefined" && window.location`

      raw = `window.location.hash.replace(/^#/, "")`
      search = `new URLSearchParams(#{raw})`
      collect = ->(value, key) { params[key.to_s] = value.to_s }
      `#{search}.forEach(#{collect})`
      params
    end

    # Suppress writes while applying fragment state to controllers, so the
    # observers those assignments trigger do not write back mid-application.
    def suspend_writes
      @suspended = true
      yield
    ensure
      @suspended = false
    end

    def write(key, value, history)
      return if history == :none || @suspended
      return unless `typeof window !== "undefined" && window.location && window.history`

      raw = `window.location.hash.replace(/^#/, "")`
      params = `new URLSearchParams(#{raw})`
      if value.nil?
        `#{params}.delete(#{key})`
      else
        `#{params}.set(#{key}, #{value.to_s})`
      end
      query = `#{params}.toString()`
      next_url = `window.location.pathname + window.location.search + (#{query} ? "#" + #{query} : "")`
      current = `window.location.pathname + window.location.search + window.location.hash`
      return if next_url == current

      if history == :push
        `window.history.pushState(null, "", #{next_url})`
      else
        `window.history.replaceState(null, "", #{next_url})`
      end
    end

    # Observe popstate/hashchange. Installed once; subsequent calls no-op.
    def on_change(&block)
      return if @installed
      return unless `typeof window !== "undefined" && window.addEventListener`

      callback = ->(_event) { block.call }
      `window.addEventListener("popstate", #{callback})`
      `window.addEventListener("hashchange", #{callback})`
      @installed = true
    end
  end
end
