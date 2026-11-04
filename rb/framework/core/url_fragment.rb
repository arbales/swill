# typed: true
# frozen_string_literal: true

module Swill
  # Grouped fragment state: #main.q=star,ids=(1,2);toolbar.mode=owner.
  # Writes with push or replace history and browser-driven change events.
  # Inert without a browser window
  # that has a location and history, as in Node.
  class URLFragment
    extend T::Sig

    # A fragment read from and written to +browser+'s location; nil, or a
    # window without a location and history, makes it inert.
    sig { params(browser: T.nilable(DOMWindow)).void }
    def initialize(browser)
      super()
      @browser = browser
      @suspended = false
      @on_change = T.let(nil, T.nilable(T.proc.params(event: Event).void))
    end

    # Whether there is a location and history to read and write.
    sig { returns(T::Boolean) }
    def available?
      browser = @browser
      browser != nil && browser.location != nil && browser.history != nil
    end

    # Flat, window-scoped keys internally; values are strings or string arrays.
    sig { returns(T::Hash[String, T.untyped]) }
    def params
      browser = @browser
      browser && available? ? parse(browser.location.hash.sub(/^#/, "")) : {}
    end

    # Parse groups before decoding their names and values.
    sig { params(text: String).returns(T::Hash[String, T.untyped]) }
    def parse(text) # :nodoc:
      found = T.let({}, T::Hash[String, T.untyped])
      text.split(";").each do |group|
        next if group.include?("&")
        entries = split_entries(group)
        next unless entries
        scope = T.let(nil, T.nilable(String))
        T.cast(entries, T::Array[String]).each do |entry|
          # Split only at the first equals; encoded delimiters remain data.
          key = entry.sub(/=.*/, "")
          next if key == entry
          value = entry.slice(key.length + 1, entry.length) || ""
          if scope.nil?
            scope = key.sub(/\..*/, "")
            key = key.start_with?(scope + ".") ? key.slice(scope.length + 1, key.length) || "" : ""
          end
          window_name = decode_component(scope)
          property = decode_component(key)
          decoded = decode_value(value)
          next if window_name.nil? || property.nil? || decoded.nil?
          name = property.empty? ? window_name : "#{window_name}.#{property}"
          next if name == "__proto__" || (property.empty? && !decoded.is_a?(String))
          found[name] = decoded
        end
      end
      found
    end

    # Commas inside a flat array separate its elements, not properties.
    sig { params(text: String).returns(T.nilable(T::Array[String])) }
    def split_entries(text) # :nodoc:
      entries = T.let([], T::Array[String])
      entry = ""
      depth = 0
      characters = text.chars
      index = 0
      while index < characters.length
        character = T.must(characters[index])
        index += 1
        depth += 1 if character == "("
        depth -= 1 if character == ")"
        return nil if depth < 0 || depth > 1
        if character == "," && depth == 0
          entries << entry
          entry = ""
        else
          entry += character
        end
      end
      return nil unless depth == 0
      entries << entry
      entries
    end

    sig { params(text: String).returns(T.nilable(String)) }
    def decode_component(text) # :nodoc:
      decodeURIComponent(text)
    rescue
      nil
    end

    sig { params(text: String).returns(String) }
    def encode_component(text) # :nodoc:
      escapes = { "(" => "%28", ")" => "%29", "'" => "%27" }
      encodeURIComponent(text).chars.map { |character| escapes[character] || character }.join
    end

    sig { params(text: String).returns(T.untyped) }
    def decode_value(text) # :nodoc:
      if text.start_with?("(") && text.end_with?(")")
        body = text.slice(1, text.length - 2) || ""
        return [] if body.empty?
        parts = body.split(",")
        return nil if body.end_with?(",") || parts.any? { |part| part.empty? || part.include?("(") || part.include?(")") }
        # An explicit empty string distinguishes ('') from an empty array.
        values = parts.map { |part| part == "''" ? "" : decode_component(part) }
        return nil if values.any? { |value| value.nil? }
        return values
      end
      return nil if text.include?("(") || text.include?(")")
      decode_component(text)
    end

    sig { params(value: T.untyped).returns(String) }
    def encode_value(value) # :nodoc:
      return encode_component(value) if value.is_a?(String)
      "(" + T.cast(value, T::Array[String]).map { |part| part.empty? ? "''" : encode_component(part) }.join(",") + ")"
    end

    # Stable group/key order; bare window keys select named content.
    sig { params(values: T::Hash[String, T.untyped]).returns(String) }
    def serialize(values) # :nodoc:
      groups = T.let([], T::Array[String])
      entries = T.let([], T::Array[String])
      previous = T.let(nil, T.nilable(String))
      names = values.keys.sort do |left, right|
        order = Runtime.compare_text(left.sub(/\..*/, ""), T.cast(right, String).sub(/\..*/, ""))
        order == 0 ? Runtime.compare_text(left, right) : order
      end
      names.each do |name|
        scope = name.sub(/\..*/, "")
        if scope != previous
          groups << entries.join(",") unless entries.empty?
          entries = []
          previous = scope
        end
        if name == scope
          entries << encode_component(scope) + "=" + encode_value(values[name])
        else
          key = name.slice(scope.length + 1, name.length) || ""
          prefix = entries.empty? ? encode_component(scope) + "." : ""
          entries << prefix + encode_component(key) + "=" + encode_value(values[name])
        end
      end
      groups << entries.join(",") unless entries.empty?
      groups.join(";")
    end

    # :push adds history, :replace updates it, :none suppresses the write.
    sig { params(key: String, value: T.untyped, history: Symbol).void }
    def write(key, value, history:)
      write_values({key => value}, history: history)
    end

    # Publish a window's state together, with one parse and history write.
    sig { params(changes: T::Hash[String, T.untyped], history: Symbol).void }
    def write_values(changes, history:) # :nodoc:
      return if history == :none || @suspended
      browser = @browser
      return unless browser && available?
      location = browser.location
      values = params
      changed = T.let(false, T::Boolean)
      changes.each do |key, value|
        changed = true unless values[key] == value
        value.nil? ? values.delete(key) : values[key] = value
      end
      return unless changed
      query = serialize(values)
      next_url = location.pathname + location.search + (query.empty? ? "" : "#" + query)
      return if next_url == location.pathname + location.search + location.hash
      if history == :push
        browser.history.pushState(nil, "", next_url)
      else
        browser.history.replaceState(nil, "", next_url)
      end
    end

    # Run a block with writes suppressed, so observers fired by applying
    # fragment values do not write back mid-application.
    sig { params(block: T.proc.void).void }
    def suspended(&block)
      @suspended = true
      begin
        yield
      ensure
        @suspended = false
      end
    end

    # Calls +callback+ when the browser changes the fragment: back, forward,
    # or a new hash. Writes through #write do not call it.
    sig { params(callback: T.proc.void).void }
    def start_observing(callback)
      browser = @browser
      return unless browser && available?
      on_change = ->(_event) { callback.() }
      @on_change = on_change
      browser.addEventListener("popstate", on_change)
      browser.addEventListener("hashchange", on_change)
    end

    # Stops calling the callback #start_observing gave.
    sig { void }
    def stop_observing
      on_change = @on_change
      browser = @browser
      return unless on_change && browser
      browser.removeEventListener("popstate", on_change)
      browser.removeEventListener("hashchange", on_change)
      @on_change = nil
    end
  end
end
