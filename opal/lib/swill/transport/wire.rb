# frozen_string_literal: true
# backtick_javascript: true

module Swill
  # Minimal browser wire boundary. Higher-level model APIs depend only on the
  # get_json protocol, so applications and MRI specs can inject another adapter.
  module Wire
    module_function

    @base_url = ""

    def base_url
      @base_url
    end

    def base_url=(value)
      @base_url = value.to_s.sub(%r{/+$}, "")
    end

    def resolved(value)
      Promise.value(value)
    end

    def get_json(url, params: {})
      request_json("GET", url, params: params)
    end

    def request_json(method, url, body: nil, params: {})
      promise = Promise.new
      request_url = url_with_params(resolve_url(url), params)

      succeeded = lambda do |response|
        unless `#{response}.ok`
          promise.reject(RuntimeError.new("#{method} #{request_url} -> #{`#{response}.status`}"))
          next
        end

        if `#{response}.status === 204`
          promise.resolve(nil)
          next
        end

        decoded = lambda do |value|
          promise.resolve(JSON.parse(`JSON.stringify(#{value})`))
        end
        decode_failed = ->(error) { promise.reject(RuntimeError.new(`String(#{error})`)) }
        json_promise = `#{response}.json()`
        `#{json_promise}.then(#{decoded}).catch(#{decode_failed})`
      end

      failed = ->(error) { promise.reject(RuntimeError.new(`String(#{error})`)) }
      options = `({ method: #{method}, headers: { "Accept": "application/vnd.api+json, application/json" } })`
      unless body.nil?
        `#{options}.headers["Content-Type"] = "application/vnd.api+json"`
        `#{options}.body = #{JSON.generate(body)}`
      end
      fetch_promise = `fetch(#{request_url}, #{options})`
      `#{fetch_promise}.then(#{succeeded}).catch(#{failed})`
      promise
    end

    def url_with_params(url, params)
      return url if params.empty?

      encoded = params.map do |key, value|
        "#{escape(key)}=#{escape(value)}"
      end.join("&")
      separator = url.include?("?") ? "&" : "?"
      "#{url}#{separator}#{encoded}"
    end

    def resolve_url(url)
      return url if url.match?(%r{\Ahttps?://}) || base_url.empty?

      suffix = url.start_with?("/") ? url : "/#{url}"
      "#{base_url}#{suffix}"
    end

    def resource_url(collection_url, id)
      "#{collection_url.sub(%r{/+$}, "")}/#{escape_component(id)}"
    end

    def escape_component(value)
      return `encodeURIComponent(#{value.to_s})` if RUBY_ENGINE == "opal"

      value.to_s.bytes.map do |byte|
        character = byte.chr
        if character.match?(/[A-Za-z0-9_.~-]/)
          character
        else
          "%#{byte.to_s(16).upcase.rjust(2, "0")}"
        end
      end.join
    end

    def escape(value)
      escape_component(value)
    end
    private_class_method :escape
  end
end
