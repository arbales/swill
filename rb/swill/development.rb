# frozen_string_literal: true

require "cgi"
require "fileutils"
require "json"
require "securerandom"
require "tempfile"

module Swill
  # Optional development revision signal, independent of the application's
  # data transport. Only mount Middleware in development. The watcher and
  # server share a file; publish only after a whole build and restart succeed.
  module Development
    ENDPOINT = "/__swill/development"

    class Revision
      def initialize(path)
        @path = File.expand_path(path)
      end

      def read
        JSON.parse(File.read(@path)).slice("revision", "ready")
      rescue Errno::ENOENT, JSON::ParserError
        { "revision" => nil, "ready" => false }
      end

      def building!
        write(read.merge("ready" => false))
      end

      def publish!
        write("revision" => SecureRandom.uuid, "ready" => true)
      end

      private

      def write(state)
        FileUtils.mkdir_p(File.dirname(@path))
        Tempfile.create([".swill-revision", ".json"], File.dirname(@path)) do |file|
          file.write(JSON.generate(state))
          file.flush
          File.rename(file.path, @path)
        end
        state
      end
    end

    class Middleware
      def initialize(app, path:)
        @app = app
        @revision = Revision.new(path)
      end

      def call(env)
        state = @revision.read
        if env["PATH_INFO"] == ENDPOINT && env["REQUEST_METHOD"] == "GET"
          return [200, { "content-type" => "application/json", "cache-control" => "no-store" }, [JSON.generate(state)]]
        end

        env["swill.development"] = state
        status, headers, body = @app.(env)
        # The embedded revision must describe the assets this page will load.
        headers = headers.merge("cache-control" => "no-store") unless status == 101
        [status, headers, body]
      end
    end

    # Put this in the HTML head. Without the middleware it renders nothing,
    # so production pages never start the development poller.
    def self.metadata(env)
      state = env["swill.development"]
      return "" unless state

      revision = CGI.escapeHTML(state["revision"].to_s)
      %(<meta name="swill-development" content="#{revision}" data-endpoint="#{ENDPOINT}">)
    end
  end
end
