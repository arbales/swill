# typed: true
# frozen_string_literal: true

module Swill
  # The browser wire boundary (NSURLSession, at the size of one page): every
  # model request goes through a Wire, so an application points it at a base
  # URL once and a test replaces the fetch it calls. Bodies are JSON unless a
  # form is asked for; a failed status raises, and a 204 yields nil.
  class Wire < Swill::Object
    extend T::Sig

    property :base_url, type: String, default: ""

    sig { returns(Wire) }
    def self.default
      wire = @default
      return wire if wire
      @default = T.let(Wire.new, T.nilable(Wire))
      T.must(@default)
    end

    sig { params(url: String, params: T::Hash[String, T.untyped]).returns(T.untyped) }
    async def get_json(url, params)
      await request("GET", Wire.url_with_params(url, params), nil, nil)
    end

    sig { params(method: String, url: String, body: T.untyped).returns(T.untyped) }
    async def request_json(method, url, body)
      await request(method, url, body, "application/vnd.api+json")
    end

    sig { params(method: String, url: String, body: T::Hash[String, T.untyped]).returns(T.untyped) }
    async def request_form_json(method, url, body)
      await request(method, url, Wire.encode_params(body), "application/x-www-form-urlencoded")
    end

    # The decoded JSON a request answers with; nil for no content.
    sig { params(method: String, url: String, body: T.untyped, content_type: T.nilable(String)).returns(T.untyped) }
    async def request(method, url, body, content_type)
      request_url = resolve_url(url)
      headers = T.let({"Accept" => "application/vnd.api+json, application/json"}, T::Hash[String, String])
      init = T.let({"method" => method, "headers" => headers}, T::Hash[String, T.untyped])
      if body != nil
        headers["Content-Type"] = content_type if content_type
        init["body"] = content_type == "application/x-www-form-urlencoded" ? body : JSON.generate(body)
      end
      response = await fetch(request_url, init)
      raise "#{method} #{request_url} -> #{response.status}" unless response.ok
      return nil if response.status == 204
      await response.json
    end

    sig { params(url: String).returns(String) }
    def resolve_url(url)
      prefix = base_url
      return url if prefix.empty? || url.start_with?("http://") || url.start_with?("https://")
      url.start_with?("/") ? "#{prefix}#{url}" : "#{prefix}/#{url}"
    end

    sig { params(url: String, params: T::Hash[String, T.untyped]).returns(String) }
    def self.url_with_params(url, params)
      query = encode_params(params)
      return url if query.empty?
      separator = url.include?("?") ? "&" : "?"
      "#{url}#{separator}#{query}"
    end

    # key=value pairs, escaped; a nil value is left out.
    sig { params(values: T::Hash[String, T.untyped]).returns(String) }
    def self.encode_params(values)
      search = URLSearchParams.new
      values.each { |key, value| search.set(key, "#{value}") unless value == nil }
      search.toString
    end

    sig { params(collection_url: String, id: String).returns(String) }
    def self.resource_url(collection_url, id)
      "#{collection_url}/#{encodeURIComponent(id)}"
    end
  end
end
