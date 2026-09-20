# typed: false
# frozen_string_literal: true

require "optparse"
require_relative "build"

module Swill
  module Ruby2JS
    # The swill command: build an application from its entry file, or watch
    # its sources and rebuild as they change.
    class CLI
      USAGE = <<~TEXT
        Usage:
          swill build [ENTRY] [--out FILE] [--minify] [--with-framework]
          swill watch [ENTRY] [--out FILE] [--minify] [--with-framework]
          swill types [ENTRY] [--into DIR]

        ENTRY is a Ruby file, or a directory holding app.rb (default: .).
        The entry's require_relative lines name the sources, in order.
        Output defaults to dist/app.js beside the entry; --with-framework
        copies swill.js next to it for pages that do not load it from a CDN.

        `types` writes the Sorbet artifacts an application needs to typecheck
        itself — the framework's RBI, the DOM's, the runtime's, its own
        declared accessors, and the checks for its declaration expressions —
        into sorbet/ beside the entry, with a sorbet/config if none exists.
        Run `srb tc` from that directory afterwards.
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
          opts.on("--interval SECONDS", Float) { |seconds| options[:interval] = seconds }
          opts.on("--into DIR") { |dir| options[:into] = dir }
        end
        arguments = parser.parse(rest)
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
        output = build.run
        copy_framework(output) if options[:framework]
        elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
        puts format("swill: built %s (%d sources, %.1fs)", output, build.sources.length, elapsed)
        build
      end

      def types(entry, options)
        build = Build.new(entry)
        written = build.types(options[:into])
        root = File.dirname(written.first)
        puts format("swill: wrote %d Sorbet files under %s", written.length, File.dirname(root))
        puts "swill: run `srb tc` from #{File.dirname(File.dirname(root))}"
        written
      end

      # Polls the sources' modification times; no dependency on a file
      # watcher. A build error is reported and watching continues.
      def watch(entry, options)
        interval = options[:interval] || 0.5
        build = attempt(entry, options)
        stamps = stamp(build, entry)
        puts "swill: watching #{build ? build.sources.length : 0} sources (Ctrl-C to stop)"
        loop do
          sleep interval
          current = stamp(build, entry)
          next if current == stamps
          stamps = current
          build = attempt(entry, options) || build
        end
      rescue Interrupt
        puts
      end

    private

      def attempt(entry, options)
        build(entry, options)
      rescue CompileError => error
        $stderr.puts "swill: #{error.message}"
        nil
      end

      def stamp(build, entry)
        files = build ? build.sources : [Build.new(entry).entry]
        files.map { |file| [file, File.file?(file) ? File.mtime(file).to_f : nil] }
      rescue CompileError
        []
      end

      def copy_framework(output)
        bundle = Build.framework_bundle
        raise CompileError, "framework bundle not built: #{bundle}" unless File.file?(bundle)
        FileUtils.cp(bundle, File.join(File.dirname(output), "swill.js"))
        map = "#{bundle}.map"
        FileUtils.cp(map, File.join(File.dirname(output), "swill.js.map")) if File.file?(map)
      end
    end
  end
end
