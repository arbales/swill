# typed: false
# frozen_string_literal: true

require "fileutils"
require "tmpdir"
require_relative "compiler"

module Swill
  module Ruby2JS
    # An application build: the sources an entry file names, compiled against
    # the framework's interface, bundled into one script that imports the
    # installed framework from the page (window.Swill) rather than a second
    # copy of it. This is what `swill build` runs and what the Rakefile uses
    # for the examples.
    class Build
      ROOT = File.expand_path("../..", __dir__)

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
      # recursively, each file once, dependencies first.
      def sources
        found = []
        visit = lambda do |file|
          next if found.include?(file)
          File.read(file).scan(/^\s*require_relative\s+["']([^"']+)["']/).flatten.each do |name|
            target = File.expand_path(name, File.dirname(file))
            target += ".rb" unless target.end_with?(".rb")
            raise CompileError, "#{file} requires a missing file: #{target}" unless File.file?(target)
            visit.(target)
          end
          found << file
        end
        visit.(entry)
        found
      end

      # The framework's interface, compiled from its sources once per process.
      def self.framework
        @framework ||= begin
          compiler = Compiler.new(loader: Loader.framework)
          FRAMEWORK_SOURCES.each do |path|
            file = File.join(ROOT, path)
            compiler.add(File.read(file), file: file)
          end
          # Validation spells every signature type out in full, which an
          # application compiled elsewhere depends on.
          compiler.validate!
          compiler.knowledge.interface
        end
      end

      # The framework bundle shipped with this build of the compiler.
      def self.framework_bundle
        File.join(ROOT, "dist", "swill.js")
      end

      # Compiles and bundles; returns the output path.
      def run
        interface = self.class.framework
        compiler = Compiler.new(imports: interface)
        sources.each { |file| compiler.add(File.read(file), file: file) }
        Dir.mktmpdir("swill-build") do |dir|
          write_shim(dir, interface)
          compiler.modules(name: "application", runtime: "./framework.external.mjs",
                           framework: "./framework.external.mjs").each do |name, source|
            File.write(File.join(dir, name), source)
          end
          FileUtils.mkdir_p(File.dirname(out))
          bundle(File.join(dir, "application.mjs"))
        end
        out
      end

    private

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
        command << "--minify" if minify
        output, status = Open3.capture2e(*command)
        raise CompileError, "bundling failed: #{output}" unless status.success?
      rescue Errno::ENOENT
        raise CompileError, "esbuild is required to bundle the application"
      end
    end
  end
end
