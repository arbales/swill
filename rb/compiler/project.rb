# frozen_string_literal: true

require "yaml"
require "rbconfig"
require "open3"
require "digest"

module Swill
  module Ruby2JS
    # Coordinates application tools; each step gets a fresh Ruby load context.
    class Project
      KEYS = %w[server client root out types framework minify watch assets dev before_build env].freeze

      # The watch categories that run steps; any other category, such as an
      # application's views, only offers the page a reload.
      STEP_CATEGORIES = %w[client resources schema server].freeze

      # The servers `dev.server` names besides a command of its own.
      SERVERS = %w[auto falcon rackup].freeze

      # The steps of a build, in order; #run takes any subset.
      STEPS = %i[before_build assets data client types].freeze

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
        if config.key?("watch") && !globs?(config["watch"]) &&
           !(config["watch"].is_a?(Hash) && config["watch"].all? { |key, globs| key.is_a?(String) && globs?(globs) })
          raise CompileError, "project watch must be an array of glob patterns, or categories of them"
        end
        assets = config.fetch("assets", [])
        unless assets.is_a?(Array) && assets.all? { |entry| asset_entry?(entry) }
          raise CompileError, "project assets must be entries with watch globs, a run argument array, " \
                              "and an optional chdir"
        end
        validate_dev(config.fetch("dev", {}))
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

      # Runs the steps in +only+, in build order: the `before_build` hooks,
      # the `assets` entries (those at +assets+ indexes, or all), data
      # generation, the client build, and type generation. +show_errors+
      # passes --show-errors to the client build, as watching does.
      def run(show_errors: false, only: STEPS, assets: nil)
        config.fetch("before_build", []).each { |argv| execute("before_build", argv) } if only.include?(:before_build)
        if only.include?(:assets)
          (assets || asset_entries.each_index.to_a).each { |index| run_asset(index) }
        end
        if config["server"] && only.include?(:data)
          swill("data generation", "data", "generate", config["server"], "--root", config.fetch("root", "."))
        end
        if only.include?(:client)
          args = ["build", config.fetch("client")]
          args.concat(["--out", config["out"]]) if config["out"]
          args << "--with-framework" if config.fetch("framework", true)
          args << "--minify" if config.fetch("minify", false)
          args << "--show-errors" if show_errors
          swill("client build", *args)
        end
        if only.include?(:types) && config["types"] != false
          swill("type generation", "types", config.fetch("client"), "--into", types_root)
        end
      end

      # The watch categories and their globs. A plain list of globs, or none,
      # is the one category "all": any change runs every step.
      def categories
        watch = config.fetch("watch", ["**/*.rb", "Gemfile", "Gemfile.lock"])
        watch.is_a?(Hash) ? watch : {"all" => watch}
      end

      # The `assets` entries: {"watch" => globs, "run" => argv, "chdir" => dir}.
      def asset_entries
        config.fetch("assets", [])
      end

      # The files matching +globs+, relative to the project, without the
      # outputs of its own steps.
      def files(globs)
        globs.flat_map { |pattern| Dir.glob(File.expand_path(pattern, directory)) }
             .reject { |file| generated?(file) }
             .select { |file| File.file?(file) }.uniq.sort
      end

      # A digest of the generated data proxies, which tells whether a schema
      # change reached the client.
      def generated_digest
        Dir.glob(File.join(generated_root, "**/*")).select { |file| File.file?(file) }.sort
           .map { |file| [file, Digest::SHA256.file(file).hexdigest] }
      end

      # The `dev` options: the server's port, the server to run, and the
      # revision file the page polls through.
      def dev
        {"port" => 9292, "server" => "auto", "state" => "tmp/swill-development.json"}.merge(config.fetch("dev", {}))
      end

      # The client build's output: the script it writes.
      def output
        File.expand_path(config["out"] || File.join(File.dirname(config.fetch("client")), "dist/app.js"), directory)
      end

      private

      def globs?(value)
        value.is_a?(Array) && value.all? { |item| item.is_a?(String) }
      end

      def asset_entry?(entry)
        entry.is_a?(Hash) && (entry.keys - %w[watch run chdir]).empty? && globs?(entry["watch"]) &&
          globs?(entry["run"]) && !entry["run"].empty? && (!entry.key?("chdir") || entry["chdir"].is_a?(String))
      end

      def validate_dev(dev)
        raise CompileError, "project dev must be a mapping" unless dev.is_a?(Hash)
        unknown = dev.keys - %w[port server state]
        raise CompileError, "unknown project dev option: #{unknown.first}" unless unknown.empty?
        if dev.key?("port") && !(dev["port"].is_a?(Integer) && dev["port"].positive?)
          raise CompileError, "project dev port must be a positive integer"
        end
        server = dev.fetch("server", "auto")
        unless server == false || SERVERS.include?(server) || (globs?(server) && !server.empty?)
          raise CompileError, "project dev server must be auto, falcon, rackup, a command, or false"
        end
        raise CompileError, "project dev state must be a path" if dev.key?("state") && !dev["state"].is_a?(String)
      end

      def generated_root
        File.expand_path(File.join(config.fetch("root", "."), "client/models/generated"), directory)
      end

      # Data proxies, Sorbet artifacts, and the client build's own files (its
      # script, the framework's, their maps, and the resources beside them)
      # are the steps' outputs; watching them would rebuild forever.
      def generated?(file)
        folder = File.dirname(output)
        roots = [generated_root, File.expand_path(File.join(config.fetch("root", "."), "sorbet"), directory),
                 File.expand_path(File.join(types_root, "sorbet"), directory), File.join(folder, "resources")]
        written = [output, "#{output}.map", File.join(folder, "swill.js"), File.join(folder, "swill.js.map")]
        relative = "/#{file.delete_prefix("#{directory}/")}"
        written.include?(file) || roots.any? { |root| file.start_with?("#{root}/") } ||
          relative.match?(%r{/(?:vendor|node_modules|\.git|build|tmp)/})
      end

      def unbundled(&block)
        defined?(Bundler) ? Bundler.with_unbundled_env(&block) : block.call
      end

      def run_asset(index)
        entry = asset_entries.fetch(index)
        execute("asset #{entry['run'].first}", entry["run"], chdir: entry["chdir"])
      end

      def types_root
        return config["types"] if config["types"].is_a?(String)
        client = config.fetch("client")
        File.directory?(File.expand_path(client, directory)) ? client : File.dirname(client)
      end

      def swill(label, *arguments)
        execute(label, [RbConfig.ruby, File.join(Swill::ROOT, "exe/swill"), *arguments])
      end

      # Runs +argv+ in the project, or in +chdir+. A +chdir+ with a Gemfile of
      # its own, such as a sibling checkout, runs in that bundle alone: the
      # project's Bundler environment (its Gemfile, its lockfile, its setup)
      # is left out, or the other directory's Gemfile would be resolved into
      # this project's lockfile.
      def execute(label, argv, chdir: nil)
        puts "swill: #{label}"
        folder = chdir ? File.expand_path(chdir, directory) : directory
        environment = config.fetch("env", {})
        gemfile = File.join(folder, "Gemfile")
        output, status = if chdir && File.file?(gemfile)
          unbundled { Open3.capture2e(environment.merge("BUNDLE_GEMFILE" => gemfile), *argv, chdir: folder) }
        else
          Open3.capture2e(environment, *argv, chdir: folder)
        end
        raise CompileError, "#{label} failed:\n#{output.strip}" unless status.success?
        puts output unless output.empty?
      rescue Errno::ENOENT => error
        raise CompileError, "#{label}: #{error.message}"
      end
    end
  end
end
