# backtick_javascript: true

module Swill
  # A thin wrapper over a native DOM event, created at the DOM boundary
  # (Application's key listeners) so the responder chain — which is pure Ruby
  # and must load under MRI — only ever sees `event.key` and friends, never a
  # raw JS object.
  class Event
    attr_reader :native

    def initialize(native)
      @native = native
    end

    def key
      `#{@native} ? #{@native}.key : nil`
    end

    def prevent_default
      `#{@native} && #{@native}.preventDefault && #{@native}.preventDefault()`
    end
  end
end
