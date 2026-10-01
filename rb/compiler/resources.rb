# frozen_string_literal: true

require "fileutils"
require "json"
require_relative "../bundles/manifest"

module Swill
  module Ruby2JS
    # A bundle's resources at build time: the folder copied beside the
    # script as `resources/<name>/`, and the registration the script runs as
    # it loads, carrying the manifest and whatever is embedded. HTML
    # catalogs are embedded, since controls need their templates without
    # waiting; embedding only fills in the load the browser would otherwise
    # make, and everything else is loaded by URL when used.
    module Resources
      EMBEDDED_EXTENSIONS = %w[html].freeze

      # The manifest of +source+, a resources folder, raising a CompileError
      # for colliding names.
      def self.manifest(source)
        Bundles::Manifest.scan(source)
      rescue ArgumentError => error
        raise CompileError, "#{source}: #{error.message}"
      end

      # Replaces `resources/<name>/` beside +script+ with the files of
      # +source+'s manifest, so hidden files such as .DS_Store stay behind.
      # Nothing is copied when +source+ is missing, and a destination that is
      # the source itself is left alone.
      def self.copy(source, name, script)
        destination = File.join(File.dirname(script), "resources", name)
        return destination unless File.directory?(source)
        return destination if File.expand_path(source) == File.expand_path(destination)
        paths = manifest(source).paths
        FileUtils.rm_rf(destination)
        paths.each do |path|
          target = File.join(destination, path)
          FileUtils.mkdir_p(File.dirname(target))
          FileUtils.cp(File.join(source, path), target)
        end
        destination
      end

      # The JavaScript that registers the bundle through +bundle_class+, an
      # expression naming Swill::Bundle. The base is the folder the running
      # script was served from; outside a page it is empty.
      def self.registration(bundle_class, name, source, main:)
        paths = manifest(source).paths
        embedded = paths.select { |path| EMBEDDED_EXTENSIONS.include?(File.extname(path).delete_prefix(".")) }
                        .to_h { |path| [path, File.read(File.join(source, path))] }
        <<~JS
          {
            const script = typeof document === "undefined" ? null : document.currentScript;
            const base = script && script.src ? new URL(".", script.src).href : "";
            #{bundle_class}.register(#{name.to_json}, base, #{paths.to_json}, #{embedded.to_json}, #{main});
          }
        JS
      end
    end
  end
end
