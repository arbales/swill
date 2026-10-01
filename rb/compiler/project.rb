# frozen_string_literal: true

require "yaml"
require "rbconfig"
require "open3"
require "digest"

module Swill
  module Ruby2JS
    # Coordinates application tools; each step gets a fresh Ruby load context.
    class Project
      KEYS = %w[server client root out types framework minify watch before_build env].freeze

      attr_reader :path, :directory, :config

      def initialize(path)
        @path = File.expand_path(path)
        @directory = File.dirname(@path)
        @config = YAML.safe_load_file(@path) || {}
        raise CompileError, "project must be a YAML mapping: #{@path}" unless config.is_a?(Hash)
        unknown = config.keys - KEYS
        raise CompileError, "unknown project option: #{unknown.first}" unless unknown.empty?
        %w[client server root out].each do |key|
          next if key != "client" && !config.key?(key)
          raise CompileError, "project #{key} must be a nonempty path" unless config[key].is_a?(String) && !config[key].empty?
        end
        %w[framework minify].each do |key|
          if config.key?(key) && ![true, false].include?(config[key])
            raise CompileError, "project #{key} must be true or false"
          end
        end
        if config.key?("types") && config["types"] != false && !config["types"].is_a?(String)
          raise CompileError, "project types must be a directory or false"
        end
        if config.key?("watch") && !(config["watch"].is_a?(Array) && config["watch"].all? { |item| item.is_a?(String) })
          raise CompileError, "project watch must be an array of glob patterns"
        end
        hooks = config.fetch("before_build", [])
        unless hooks.is_a?(Array) && hooks.all? { |argv| argv.is_a?(Array) && !argv.empty? && argv.all? { |arg| arg.is_a?(String) } }
          raise CompileError, "project before_build must be an array of argument arrays"
        end
        env = config.fetch("env", {})
        unless env.is_a?(Hash) && env.all? { |key, value| key.is_a?(String) && value.is_a?(String) }
          raise CompileError, "project env must map strings to strings"
        end
      rescue Psych::Exception, Errno::ENOENT => error
        raise CompileError, "project: #{error.message}"
      end

      # +show_errors+ passes --show-errors to the client build, as watching does.
      def run(show_errors: false)
        config.fetch("before_build", []).each { |argv| execute("before_build", argv) }
        swill("data generation", "data", "generate", config["server"], "--root", config.fetch("root", ".")) if config["server"]
        args = ["build", config.fetch("client")]
        args.concat(["--out", config["out"]]) if config["out"]
        args << "--with-framework" if config.fetch("framework", true)
        args << "--minify" if config.fetch("minify", false)
        args << "--show-errors" if show_errors
        swill("client build", *args)
        unless config["types"] == false
          swill("type generation", "types", config.fetch("client"), "--into", types_root)
        end
      end

      # Include missing/new files, but never our own generated outputs.
      def snapshot
        patterns = config.fetch("watch", ["**/*.rb", "Gemfile", "Gemfile.lock"])
        files = patterns.flat_map { |pattern| Dir.glob(File.expand_path(pattern, directory)) }
        generated = [File.join(config.fetch("root", "."), "client/models/generated"),
                     File.join(config.fetch("root", "."), "sorbet"),
                     File.join(types_root, "sorbet")].map { |name| File.expand_path(name, directory) }
        files.reject! do |file|
          generated.any? { |root| file.start_with?("#{root}/") } ||
            file.match?(%r{/(?:vendor|node_modules|\.git|build)/})
        end
        (files + [path]).uniq.sort.filter_map do |file|
          [file, Digest::SHA256.file(file).hexdigest] if File.file?(file)
        end
      end

      private

      def types_root
        return config["types"] if config["types"].is_a?(String)
        client = config.fetch("client")
        File.directory?(File.expand_path(client, directory)) ? client : File.dirname(client)
      end

      def swill(label, *arguments)
        execute(label, [RbConfig.ruby, File.join(Swill::ROOT, "exe/swill"), *arguments])
      end

      def execute(label, argv)
        puts "swill: #{label}"
        output, status = Open3.capture2e(config.fetch("env", {}), *argv, chdir: directory)
        raise CompileError, "#{label} failed:\n#{output.strip}" unless status.success?
        puts output unless output.empty?
      rescue Errno::ENOENT => error
        raise CompileError, "#{label}: #{error.message}"
      end
    end
  end
end
