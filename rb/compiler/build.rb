# typed: false
# frozen_string_literal: true

require "fileutils"
require "pathname"
require "tmpdir"
require_relative "../swill"
require_relative "compiler"
require_relative "resources"

module Swill
  module Ruby2JS
    # An application build: the sources an entry file names, compiled against
    # the framework's interface, bundled into one script that imports the
    # installed framework from the page (window.Swill) rather than a second
    # copy of it. This is what `swill build` runs and what the Rakefile uses
    # for the examples. A `resources/` folder beside the entry is the
    # application's bundle: it is copied to `resources/<name>/` beside the
    # script, where <name> is the script's (app for app.js), and registered as
    # the main bundle when the script loads.
    class Build
      ROOT = Swill::ROOT

      attr_reader :entry, :out, :minify

      # entry: a Ruby file, or a directory holding app.rb.
      def initialize(entry, out: nil, minify: false)
        path = File.expand_path(entry)
        path = File.join(path, "app.rb") if File.directory?(path)
        raise CompileError, "no entry file: #{path}" unless File.file?(path)
        @entry = path
        @out = File.expand_path(out || File.join(File.dirname(path), "dist", "app.js"))
        @minify = minify
      end

      # Sources in order: the entry file's require_relative lines, followed
      # recursively, each file once, dependencies first. Watching includes
      # missing dependencies too, so creating one can repair a failed build.
      def sources(allow_missing: false)
        found = []
        visited = []
        visit = lambda do |file|
          next if visited.include?(file)
          visited << file
          unless File.file?(file)
            found << file
            next
          end
          File.read(file).scan(/^\s*require_relative\s+["']([^"']+)["']/).flatten.each do |name|
            target = File.expand_path(name, File.dirname(file))
            target += ".rb" unless target.end_with?(".rb")
            unless allow_missing || File.file?(target)
              raise CompileError, "#{file} requires a missing file: #{target}"
            end
            visit.(target)
          end
          found << file
        end
        visit.(entry)
        found
      end

      # The framework, compiled from its sources once per process. Validation
      # spells every signature type out in full, which an application compiled
      # elsewhere depends on.
      def self.framework_compiler
        @framework_compiler ||= begin
          compiler = Compiler.new(loader: Loader.framework)
          FRAMEWORK_SOURCES.each do |path|
            file = File.join(ROOT, path)
            compiler.add(File.read(file), file: file)
          end
          compiler.validate!
          compiler
        end
      end

      # The framework's interface: what an application compiles against.
      def self.framework
        @framework ||= framework_compiler.knowledge.interface
      end

      # The handwritten RBI for the runtime and declaration boundary, shipped
      # with the gem.
      def self.runtime_rbi
        File.join(ROOT, "sorbet", "rbi", "runtime.rbi")
      end

      # The framework bundle shipped with this build of the compiler.
      def self.framework_bundle
        File.join(ROOT, "rb", "dist", "swill.js")
      end

      # Compiles and bundles; returns the output path.
      def run
        interface = self.class.framework
        compiler = Compiler.new(imports: interface)
        sources.each { |file| compiler.add(File.read(file), file: file) }
        Dir.mktmpdir("swill-build") do |dir|
          write_shim(dir, interface)
          compiler.modules(name: "application", runtime: "./framework.external.mjs",
                           framework: "./framework.external.mjs", sourcemaps: true).each do |name, source|
            File.write(File.join(dir, name), source)
          end
          Compiler.format_file(File.join(dir, "application.classes.mjs"))
          File.write(File.join(dir, "entry.mjs"), <<~JS)
            import {Swill__Bundle} from "./framework.external.mjs";
            import "./application.mjs";
            #{Resources.registration('Swill__Bundle', bundle_name, resources, main: true)}
          JS
          FileUtils.mkdir_p(File.dirname(out))
          bundle(File.join(dir, "entry.mjs"))
          Resources.copy(resources, bundle_name, out)
        end
        out
      end

      # The application's resources folder, beside its entry.
      def resources
        File.join(File.dirname(entry), "resources")
      end

      # The bundle's name: its script's, without `.min`.
      def bundle_name
        File.basename(out, ".js").delete_suffix(".min")
      end

      # Sorbet's language server accepts a single input directory. Keep a
      # refreshed copy of the framework inside it, beside the generated RBIs,
      # and leave the consumer's sorbet/config under their control.
      def types(directory = nil)
        root = File.expand_path(directory || File.dirname(entry))
        framework = self.class.framework_compiler
        application = Compiler.new(imports: framework.knowledge.interface)
        sources.each { |file| application.add(File.read(file), file: file) }
        application.validate!

        generated = File.join(root, "sorbet", "swill")
        framework_copy = File.join(generated, "framework")
        FileUtils.rm_rf(framework_copy)
        FRAMEWORK_SOURCES.each do |path|
          target = File.join(framework_copy, path.delete_prefix("rb/framework/"))
          FileUtils.mkdir_p(File.dirname(target))
          FileUtils.cp(File.join(ROOT, path), target)
        end
        rbi = File.join(generated, "rbi")
        checks = File.join(generated, "checks")
        FileUtils.mkdir_p(rbi)
        FileUtils.mkdir_p(checks)
        written = {
          File.join(rbi, "swill.rbi") => framework.rbi,
          File.join(rbi, "swill-dom.rbi") => DOM.rbi,
          File.join(rbi, "swill-runtime.rbi") => File.read(self.class.runtime_rbi),
          File.join(rbi, "application.rbi") => application.rbi,
          File.join(checks, "declarations.rb") => application.type_probes,
          File.join(root, "sorbet", "swill.config") => sorbet_config(root),
          File.join(generated, ".gitignore") => "*\n"
        }
        written.each { |file, source| File.write(file, source) }
        config = File.join(root, "sorbet", "config")
        unless File.file?(config)
          File.write(config, "@sorbet/swill.config\n")
          written[config] = nil
        end
        written.keys
      end

    private

      # Exactly one input directory, with exclusions rather than a source list
      # that goes stale when files are added. Ignore an output directory only
      # when it is inside this root and contains none of the client's sources.
      def sorbet_config(root)
        folder = File.dirname(out)
        output = Pathname.new(folder).relative_path_from(Pathname.new(root)).to_s
        ignored = %w[/public /tmp /node_modules /sorbet/rbi/shims/generated]
        if output != "." && output != ".." && !output.start_with?("../") &&
           sources.none? { |file| file.start_with?("#{folder}/") }
          ignored << "/#{output}"
        end
        [
          "--dir=.",
          *ignored.uniq.map { |path| "--ignore=#{path}" },
          "--silence-dev-message",
          # Model and controller concerns declare requires_ancestor.
          "--enable-experimental-requires-ancestor",
          ""
        ].join("\n")
      end

      # Every framework identifier the application may import, read from the
      # page's installed framework.
      def write_shim(dir, interface)
        exports = %w[Runtime] + interface.flat_map do |entry|
          [entry["identifier"], *(entry["extends_class_methods"] ? ["#{entry['identifier']}_ClassMethods"] : [])]
        end
        shim = [
          "const framework = globalThis.Swill;",
          "if (!framework) throw new Error('Load swill.js before app.js');",
          *exports.map { |name| "export const #{name} = framework.#{name};" }
        ].join("\n")
        File.write(File.join(dir, "framework.external.mjs"), Compiler.format_javascript(shim))
      end

      def bundle(entrypoint)
        command = ["esbuild", entrypoint, "--bundle", "--format=iife", "--target=es2022", "--sourcemap", "--outfile=#{out}"]
        # A minified build is optimized, and leaves in_development blocks out.
        command.push("--minify", "--sources-content=false", "--define:globalThis.__SWILL_DEV__=false") if minify
        output, status = Open3.capture2e(*command)
        raise CompileError, "bundling failed: #{output}" unless status.success?
      rescue Errno::ENOENT
        raise CompileError, "esbuild is required to bundle the application"
      end
    end
  end
end
