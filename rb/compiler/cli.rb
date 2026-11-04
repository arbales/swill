# typed: false
# frozen_string_literal: true

require "json"
require "optparse"
require_relative "build"
require_relative "project"
require_relative "dev"
require_relative "scaffold"

module Swill
  module Ruby2JS
    # The swill command: build an application from its entry file, or watch
    # its sources and rebuild as they change.
    class CLI
      USAGE = <<~TEXT
        Usage:
          swill build [ENTRY] [--out FILE] [--minify] [--with-framework] [--show-errors]
          swill watch [ENTRY] [--out FILE] [--minify] [--with-framework]
          swill new NAME [--data]
          swill init [DIR]
          swill manifest DIR
          swill dev [--port N] [--no-server] [--once] [--interval S] [--project FILE]
          swill build --project swill.yml
          swill watch --project swill.yml
          swill types [ENTRY] [--into DIR] [--out FILE]
          swill data generate SERVER_ENTRY [--root DIR]
          swill data check SERVER_ENTRY [--root DIR]

        ENTRY is a Ruby file, or a directory holding app.rb (default: .).
        The entry's require_relative lines name the sources, in order.
        Output defaults to dist/app.js beside the entry; --with-framework
        copies swill.js next to it for pages that do not load it from a CDN.
        With no ENTRY, swill.yml in the current directory selects a project
        workflow: data generation, client build, framework copy, and types.

        `new` writes an application in a new directory NAME that `swill dev`
        runs as it is; --data adds a server entry for Distant Objects.
        `init` adds swill.yml and client/ to an existing application, without
        replacing files, and prints the server and page integration steps.

        `dev` builds the project in swill.yml, runs its server (config.ru, with
        Falcon when the bundle has it, else rackup), and rebuilds what each
        edit affects, restarting the server when server code changed. The page
        offers to reload once a rebuild succeeds. --once builds, serves, and
        exits; `watch --project` is `dev --no-server`.

        --show-errors, which watch always uses, turns a compile error into a
        page error while developing: the output is replaced by a script that
        shows the error in the page, where the stale build would otherwise
        keep running unnoticed. The command still fails.

        `types` writes the Sorbet artifacts an application needs to typecheck
        itself — the framework's RBI, the DOM's, the runtime's, its own
        declared accessors, and the checks for its declaration expressions —
        under sorbet/swill/ beside the entry, with a local framework copy.
        sorbet/swill.config is refreshed; sorbet/config includes it if none
        exists. Run `srb tc` from the entry directory afterwards.
      TEXT

      def self.start(argv)
        new.run(argv)
      end

      def run(argv)
        command, *rest = argv
        options = {}
        parser = OptionParser.new do |opts|
          opts.on("--out FILE") { |file| options[:out] = file }
          opts.on("--minify") { options[:minify] = true }
          opts.on("--with-framework") { options[:framework] = true }
          opts.on("--show-errors") { options[:show_errors] = true }
          opts.on("--interval SECONDS", Float) { |seconds| options[:interval] = seconds }
          opts.on("--into DIR") { |dir| options[:into] = dir }
          opts.on("--root DIR") { |dir| options[:root] = dir }
          opts.on("--project FILE") { |file| options[:project] = file }
          opts.on("--port PORT", Integer) { |port| options[:port] = port }
          opts.on("--no-server") { options[:server] = false }
          opts.on("--once") { options[:once] = true }
          opts.on("--data") { options[:data] = true }
        end
        arguments = parser.parse(rest)
        return dev(options) if command == "dev"
        return scaffold(arguments, options) if command == "new"
        return init(arguments, options) if command == "init"
        return manifest(arguments) if command == "manifest"
        project = options[:project]
        project ||= "swill.yml" if %w[build watch].include?(command) && arguments.empty? && File.file?("swill.yml")
        if project
          unless %w[build watch].include?(command) && arguments.empty? && (options.keys - %i[project interval]).empty?
            raise OptionParser::ParseError, "project builds use swill.yml options; do not also pass ENTRY or build flags"
          end
          return run_project(project, watch: command == "watch", interval: options.fetch(:interval, 0.5))
        end
        case command
        when "build"
          build(arguments.first || ".", options)
          0
        when "watch"
          watch(arguments.first || ".", options)
          0
        when "types"
          types(arguments.first || ".", options)
          0
        when "data"
          data(arguments, options)
          0
        else
          $stderr.puts USAGE
          command.nil? || %w[-h --help help].include?(command) ? 0 : 1
        end
      rescue OptionParser::ParseError, CompileError => error
        $stderr.puts "swill: #{error.message}"
        1
      end

      def build(entry, options)
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        build = Build.new(entry, out: options[:out], minify: options[:minify])
        begin
          output = build.run
        rescue CompileError => error
          write_failure(build.out, error.message) if options[:show_errors]
          raise
        end
        copy_framework(output) if options[:framework]
        elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
        puts format("swill: built %s (%d sources, %.1fs)", output, build.sources.length, elapsed)
        build
      end

      def types(entry, options)
        build = Build.new(entry, out: options[:out])
        written = build.types(options[:into])
        root = File.expand_path(options[:into] || File.dirname(build.entry))
        puts format("swill: wrote %d Sorbet files under %s", written.length, File.join(root, "sorbet"))
        puts "swill: run `srb tc` from #{root}"
        written
      end

      def data(arguments, options)
        action, entry = arguments
        unless %w[generate check].include?(action) && entry
          raise OptionParser::ParseError, "data expects generate or check and a SERVER_ENTRY"
        end
        # The server entry describes its schema here, without serving; see
        # Swill::Distant.schema_only?.
        ENV["SWILL_SCHEMA_ONLY"] ||= "1"
        generator = Swill::Distant::Generator.new(entry, root: options[:root] || Dir.pwd)
        if action == "generate"
          written = generator.generate
          puts "swill: wrote #{written.length} data files"
        else
          generator.check
          puts "swill: generated data files are current"
        end
      rescue ArgumentError => error
        raise CompileError, error.message
      end

      # Polls the sources' modification times; no dependency on a file
      # watcher. A build error is reported and watching continues.
      def watch(entry, options)
        interval = options[:interval] || 0.5
        raise CompileError, "watch interval must be positive" unless interval.positive?
        $stdout.sync = true
        stamps = stamp(entry)
        build = attempt(entry, options)
        puts "swill: watching #{build ? build.sources.length : 0} sources (Ctrl-C to stop)"
        loop do
          sleep interval
          current = stamp(entry)
          next if current == stamps
          stamps = current
          attempt(entry, options)
        end
      rescue Interrupt
        puts
      end

      # `swill build --project` runs every step once; `swill watch --project`
      # is `swill dev` without a server.
      def run_project(path, watch:, interval:)
        raise CompileError, "watch interval must be positive" unless interval.positive?
        unless watch
          Project.new(path).run
          return 0
        end
        Dev.new(path, server: false, interval: interval).start
        0
      end

      # `swill new NAME`: a new application.
      def scaffold(arguments, options)
        name = arguments.first
        raise OptionParser::ParseError, "new expects the NAME of a new directory" unless name && arguments.length == 1
        scaffold = Scaffold.new(name, data: options.fetch(:data, false))
        written = scaffold.write
        puts "swill: wrote #{written.length} files into #{name}"
        puts "swill: cd #{name} && bundle install && bundle exec swill dev"
        0
      end

      # `swill init`: only the client and project configuration. The existing
      # application's dependencies, server, pages, and ignore rules stay its own.
      def init(arguments, options)
        unless arguments.length <= 1 && options.empty?
          raise OptionParser::ParseError, "init expects only an optional DIR"
        end
        scaffold = Scaffold.new(arguments.first || ".")
        written = scaffold.init
        puts "swill: wrote #{written.length} files into #{scaffold.directory}"
        puts scaffold.integration
        0
      end

      # `swill manifest DIR`: the paths under a bundle's resources folder, as
      # the JSON array `Swill.registerBundle` takes for a page without a build.
      def manifest(arguments)
        directory = arguments.first
        raise OptionParser::ParseError, "manifest expects the DIR of a bundle's resources" unless directory && arguments.length == 1
        raise CompileError, "#{directory} is not a directory" unless File.directory?(directory)
        puts JSON.generate(Resources.manifest(directory).paths)
        0
      end

      # `swill dev`: the project's build, server, and rebuilds on edits.
      def dev(options)
        path = options[:project] || "swill.yml"
        raise CompileError, "swill dev needs a swill.yml (or --project FILE)" unless File.file?(path)
        interval = options.fetch(:interval, 0.3)
        raise CompileError, "watch interval must be positive" unless interval.positive?
        ok = Dev.new(path, port: options[:port], server: options.fetch(:server, true),
                           once: options.fetch(:once, false), interval: interval).start
        ok ? 0 : 1
      end

    private

      def attempt(entry, options)
        build(entry, {show_errors: true}.merge(options))
      rescue CompileError => error
        $stderr.puts "swill: #{error.message}"
        nil
      end

      def stamp(entry)
        build = Build.new(entry)
        files = build.sources(allow_missing: true) + Dir.glob(File.join(build.resources, "**/*")).select { |file| File.file?(file) }
        files.sort.map do |file|
          stat = File.stat(file) if File.file?(file)
          [file, stat ? [stat.mtime.to_f, stat.size] : nil]
        end
      rescue CompileError, SystemCallError
        []
      end

      # The script written in place of a build that failed: it reports the
      # error to the framework, which shows it instead of launching.
      def write_failure(output, message)
        FileUtils.mkdir_p(File.dirname(output))
        File.write(output, <<~JS)
          // swill build failed; this script shows the error in the page.
          (function (message) {
            var runtime = globalThis.Swill && globalThis.Swill.Runtime;
            if (runtime && runtime.reportBuildFailure) runtime.reportBuildFailure(message);
            else console.error("[Swill] The application failed to build: " + message);
          })(#{message.to_json});
        JS
        FileUtils.rm_f("#{output}.map")
      end

      def copy_framework(output)
        bundle = Build.framework_bundle
        raise CompileError, "framework bundle not built: #{bundle}" unless File.file?(bundle)
        FileUtils.cp(bundle, File.join(File.dirname(output), "swill.js"))
        Resources.copy(File.join(File.dirname(bundle), "resources", "swill"), "swill", output)
        map = "#{bundle}.map"
        FileUtils.cp(map, File.join(File.dirname(output), "swill.js.map")) if File.file?(map)
      end
    end
  end
end
