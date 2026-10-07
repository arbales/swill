# frozen_string_literal: true

require "cgi"
require "erb"
require_relative "bundles/manifest"

module Swill
  # The server's view of the bundles a page loads, so a template rendered on
  # the server can write the same resource URLs, image tags and stylesheet
  # links the browser's Swill::Bundle resolves:
  #
  #     framework = Swill::Bundles::Bundle.framework(url: "/assets/ruby")
  #     app = Swill::Bundles::Bundle.new(name: "app", directory: "public/assets/ruby",
  #                                      url: "/assets/ruby")
  #     bundles = Swill::Bundles::Catalog.new(app, framework)
  #     bundles.image_tag("Warning", class: "icon")
  #
  # A bundle's files are its script and `resources/<name>/` in +directory+,
  # served at +url+. Swill::Bundles::Server serves them from there when an
  # application would rather not copy them into its public folder.
  module Bundles
    # Loaded when first named, so only an application that mounts it needs
    # Rack.
    autoload :Server, File.join(__dir__, "bundles", "server")

    # The image extensions a name finds, in the order they are tried.
    IMAGE_EXTENSIONS = %w[svg png webp jpg jpeg gif].freeze

    # One bundle, as the browser's Swill::Bundle describes it.
    class Bundle
      attr_reader :name, :directory, :url, :manifest

      # The framework's own bundle, from the installed gem, served at +url+.
      def self.framework(url:)
        new(name: "swill", directory: File.join(Swill::ROOT, "rb", "dist"), url: url)
      end

      def initialize(name:, directory:, url:, script: "#{name}.js")
        @name = name
        @directory = File.expand_path(directory)
        @url = url.end_with?("/") ? url : "#{url}/"
        @script = script
        @manifest = Manifest.scan(resources_directory)
      end

      # Where the bundle's resources are on disk.
      def resources_directory
        File.join(@directory, "resources", @name)
      end

      def path_for_resource(name, extension = nil)
        @manifest.path_for(name, extension)
      end

      # The resource's URL, or nil when the bundle has none.
      def url_for_resource(name, extension = nil)
        path = path_for_resource(name, extension)
        path && url_for_path(path)
      end

      def resource?(name, extension = nil)
        !path_for_resource(name, extension).nil?
      end

      def url_for_path(path)
        encoded = path.split("/").map { |segment| Bundles.encode_component(segment) }.join("/")
        "#{@url}resources/#{Bundles.encode_component(@name)}/#{encoded}"
      end

      # The resource's text, or nil when the bundle has none.
      def read_resource(name, extension = nil)
        path = path_for_resource(name, extension)
        path && File.read(File.join(resources_directory, path))
      end

      # The URL of the bundle's script.
      def script_url
        "#{@url}#{@script}"
      end
    end

    # What a page needs from the server, for a template to write: the
    # bundles' tags, the theme, and the meta tag the browser reads for
    # development reloads. Swill::Server#helpers
    # answers one for a request; a view context that includes Helpers has it
    # as +swill+. The tags are HTML, so a template engine that escapes
    # output, such as Roda's Erubi, writes them with `<%==`; Ruby's ERB, which
    # renders a Swill::Server page, with `<%=`:
    #
    #     <head><%== swill.head(theme: "linear") %></head>
    class Page
      attr_reader :catalog, :env

      def initialize(catalog, env)
        @catalog = catalog
        @env = env
      end

      # Renders the ERB +template+ with +page+ as +swill+.
      def self.render(template, page)
        ERB.new(File.read(template), trim_mode: "-").result(page.template_binding)
      end

      def template_binding # :nodoc:
        swill = self
        binding
      end

      # `<script>` tags for every bundle, the framework's first.
      def script_tags
        @catalog.script_tags
      end

      # A `<link rel="stylesheet">` for the stylesheet +name+.
      def stylesheet_tag(name, **attributes)
        @catalog.stylesheet_tag(name, **attributes)
      end

      # An `<img>` for the image +name+; see Catalog#image_tag.
      def image_tag(name, **attributes)
        @catalog.image_tag(name, **attributes)
      end

      # The link to the theme +name+, marked `data-swill-theme` so
      # Swill::Application#theme can read and switch it.
      def theme_link(name)
        @catalog.stylesheet_tag(name, "data-swill-theme": "")
      end

      # The meta tag the development poller reads, or nothing outside
      # development; see Swill::Development.metadata.
      def development_metadata
        Development.metadata(@env)
      end

      # Everything a page's head needs, in order: the development metadata,
      # the theme, and the scripts.
      def head(theme: "linear")
        [development_metadata, theme_link(theme), script_tags].reject(&:empty?).join("\n")
      end
    end

    # Mix into a view context (Roda's or Sinatra's) to render the page
    # helpers as +swill+, for the server Swill::Server.default names; the
    # context answers +request+ or +env+.
    module Helpers
      def swill
        @swill ||= Swill::Server.default.helpers(respond_to?(:request) ? request.env : env)
      end
    end

    # Bundles searched in order, the application's before the framework's, as
    # the browser searches them. Unknown names raise, so a template naming a
    # missing image fails where it renders.
    class Catalog
      attr_reader :bundles

      def initialize(*bundles)
        @bundles = bundles.compact
      end

      # The URL of the image +name+ in the first bundle that has one.
      def image_url(name)
        @bundles.each do |bundle|
          IMAGE_EXTENSIONS.each do |extension|
            url = bundle.url_for_resource(name, extension)
            return url if url
          end
        end
        raise ArgumentError, "unknown image: #{name}"
      end

      # An `<img>` for the image +name+. Pass `view: true` to have it awaken
      # as a Swill::Control::ImageView, which can then be bound.
      def image_tag(name, alt: "", view: false, **attributes)
        attributes = {src: image_url(name), alt: alt}.merge(attributes)
        attributes = {klass: "Swill::Control::ImageView", image: name}.merge(attributes) if view
        tag("img", attributes)
      end

      # The URL of the resource in the first bundle that has it.
      def url_for_resource(name, extension = nil)
        @bundles.each do |bundle|
          url = bundle.url_for_resource(name, extension)
          return url if url
        end
        raise ArgumentError, "unknown resource: #{name}#{extension && ".#{extension}"}"
      end

      # A `<link rel="stylesheet">` for the stylesheet +name+.
      def stylesheet_tag(name, **attributes)
        tag("link", {rel: "stylesheet", href: url_for_resource(name, "css")}.merge(attributes))
      end

      # `<script>` tags for every bundle, the framework's first, as a page
      # must load them.
      def script_tags
        @bundles.reverse.map { |bundle| "<script src=\"#{escape(bundle.script_url)}\"></script>" }.join("\n")
      end

      # The HTML of the template +name+ from the bundles' catalogs, for a
      # server that renders it in place.
      def template(name)
        @bundles.each do |bundle|
          bundle.manifest.paths.select { |path| path.end_with?(".html") }.each do |path|
            found = template_contents(File.read(File.join(bundle.resources_directory, path)), name)
            return found if found
          end
        end
        raise ArgumentError, "unknown template: #{name}"
      end

    private

      # What is inside the template named +name+, counting the templates
      # nested within it.
      def template_contents(source, name)
        opening = source.match(/<template\b[^>]*\bname="#{Regexp.escape(name)}"[^>]*>/)
        return nil unless opening
        depth = 1
        position = opening.end(0)
        while (tag = %r{<template\b[^>]*>|</template>}.match(source, position))
          depth += tag[0].start_with?("</") ? -1 : 1
          return source[opening.end(0)...tag.begin(0)] if depth.zero?
          position = tag.end(0)
        end
        nil
      end

      def tag(name, attributes)
        pairs = attributes.map { |key, value| " #{key.to_s.tr('_', '-')}=\"#{escape(value.to_s)}\"" }
        "<#{name}#{pairs.join}>"
      end

      def escape(value)
        CGI.escapeHTML(value)
      end
    end
  end
end
