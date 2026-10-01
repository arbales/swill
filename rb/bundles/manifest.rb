# frozen_string_literal: true

module Swill
  module Bundles
    # The resources a bundle carries: every file under its resources folder,
    # as sorted relative paths. The rules are the browser's Swill::Bundle's,
    # so both sides answer the same: a resource is named by its path without
    # the extension, a name without an extension must be unambiguous, and two
    # paths that differ only in case collide, since not every file system
    # tells them apart.
    class Manifest
      attr_reader :paths

      # The manifest of +directory+; empty when there is no such folder.
      # Hidden files are skipped.
      def self.scan(directory)
        paths = if File.directory?(directory)
          Dir.glob("**/*", base: directory).select { |path| File.file?(File.join(directory, path)) }
        else
          []
        end
        new(paths.reject { |path| path.split("/").any? { |segment| segment.start_with?(".") } })
      end

      def initialize(paths)
        @paths = paths.sort.freeze
        duplicates = @paths.group_by(&:downcase).values.select { |group| group.length > 1 }
        return if duplicates.empty?
        raise ArgumentError, "resources collide: #{duplicates.map { |group| group.join(' and ') }.join('; ')}"
      end

      # `icons/Star.png` is `icons/Star`; a name starting with a dot has no
      # extension.
      def self.stem(path)
        segments = path.split("/")
        file = segments.pop
        parts = file.split(".")
        name = parts.length > 1 && !parts.first.empty? ? parts[0...-1].join(".") : file
        (segments + [name]).join("/")
      end

      # The path of the resource, or nil. Without an extension, a name more
      # than one file carries raises rather than choosing.
      def path_for(name, extension = nil)
        if extension
          path = "#{name}.#{extension}"
          return @paths.include?(path) ? path : nil
        end
        matches = @paths.select { |path| Manifest.stem(path) == name }
        raise ArgumentError, "ambiguous resource #{name}: #{matches.join(', ')}" if matches.length > 1
        matches.first
      end
    end

    # A path segment encoded as the browser's encodeURIComponent encodes it,
    # so a server-written URL is the one the client computes.
    def self.encode_component(segment)
      segment.b.gsub(/[^A-Za-z0-9\-_.!~*'()]/n) { |byte| format("%%%02X", byte.ord) }
    end
  end
end
