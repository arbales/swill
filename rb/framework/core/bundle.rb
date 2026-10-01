# typed: true
# frozen_string_literal: true

module Swill
  # A bundle is a compiled script and the resources beside it. The framework
  # is one bundle and an application built with `swill build` is another;
  # each keeps its files in `resources/<name>/` beside its script:
  #
  #     swill.js   resources/swill/Warning.svg
  #     app.js     resources/app/Poster.png
  #
  # A bundle registers itself as its script loads, with where its resources
  # are served and the manifest of what they are. It never carries the files
  # themselves, except a resource the build embedded to save a request: that
  # arrives already loaded, and is otherwise the same as one loaded later.
  #
  # A resource is named by its path under the folder without its extension,
  # so `icons/Star.png` is `url_for_resource("icons/Star", "png")`. See
  # [Resources](rdoc-ref:doc/resources.md).
  class Bundle < Swill::Object
    extend T::Sig

    # Called by a bundle's script as it loads. +base_url+ is the folder the
    # script was served from, +manifest+ the paths under its resources
    # folder, and +embedded+ the contents the build included. The main
    # bundle is the application's.
    sig do
      params(name: String, base_url: String, manifest: T::Array[String],
             embedded: T::Hash[String, String], main: T::Boolean).returns(Bundle)
    end
    def self.register(name, base_url, manifest, embedded, main) # :nodoc:
      bundle = Bundle.new(name, base_url, manifest, embedded)
      bundles = @bundles || {}
      @bundles = T.let(bundles, T.nilable(T::Hash[String, Bundle]))
      bundles[name] = bundle
      @main = T.let(bundle, T.nilable(Bundle)) if main
      bundle
    end

    # The application's bundle, or nil when it has none.
    sig { returns(T.nilable(Bundle)) }
    def self.main
      @main
    end

    # The framework's own bundle.
    sig { returns(T.nilable(Bundle)) }
    def self.framework
      named("swill")
    end

    # The registered bundle called +name+, or nil.
    sig { params(name: String).returns(T.nilable(Bundle)) }
    def self.named(name)
      bundles = @bundles
      bundles ? bundles[name] : nil
    end

    # Where a name is looked for: the application's bundle, then the
    # framework's.
    sig { returns(T::Array[Bundle]) }
    def self.search_order
      [main, framework].compact.uniq
    end

    # Creates a bundle; a bundle's script calls Bundle.register instead.
    # +embedded+ holds contents already loaded, by path.
    sig do
      params(name: String, base_url: String, manifest: T::Array[String], embedded: T::Hash[String, String]).void
    end
    def initialize(name, base_url, manifest, embedded)
      super()
      @name = name
      @base_url = base_url
      @manifest = manifest
      @contents = T.let(embedded.dup, T::Hash[String, String])
      @stems = T.let({}, T::Hash[String, T::Array[String]])
      manifest.each do |path|
        stem = Bundle.stem(path)
        paths = @stems[stem]
        if paths
          paths << path
        else
          @stems[stem] = [path]
        end
      end
    end

    # The bundle's name, which is also its folder under `resources/`.
    sig { returns(String) }
    attr_reader :name

    # The folder the bundle's script was served from, ending in a slash.
    # Assign it to serve the resources from somewhere else.
    sig { returns(String) }
    attr_accessor :base_url

    # Every resource path, relative to the bundle's resources folder.
    sig { returns(T::Array[String]) }
    attr_reader :manifest

    # The path of the resource +name+ with +extension+, or nil when the
    # bundle has none. Without an extension, a name that more than one file
    # carries raises rather than choosing.
    sig do
      params(name: String, extension: T.nilable(String)).returns(T.nilable(String))
    end
    def path_for_resource(name, extension = nil)
      if extension
        path = "#{name}.#{extension}"
        return @manifest.include?(path) ? path : nil
      end
      paths = @stems[name] || []
      raise "Ambiguous resource #{name} in bundle #{@name}: #{paths.join(', ')}" if paths.length > 1
      paths.first
    end

    # The URL of a resource, or nil when the bundle has none. See
    # #path_for_resource.
    sig do
      params(name: String, extension: T.nilable(String)).returns(T.nilable(String))
    end
    def url_for_resource(name, extension = nil)
      path = path_for_resource(name, extension)
      path ? url_for_path(path) : nil
    end

    # Whether the bundle has the resource. See #path_for_resource.
    sig { params(name: String, extension: T.nilable(String)).returns(T::Boolean) }
    def resource?(name, extension = nil)
      !path_for_resource(name, extension).nil?
    end

    # The URL of the resource at +path+ in the manifest.
    sig { params(path: String).returns(String) }
    def url_for_path(path)
      encoded = path.split("/").map { |segment| encodeURIComponent(segment) }.join("/")
      "#{@base_url}resources/#{encodeURIComponent(@name)}/#{encoded}"
    end

    # The resource's text, fetched once and kept. This is the one way a
    # resource's contents arrive: one the build embedded is already here.
    # +extension+ may be nil, as for #path_for_resource. Raises when the
    # bundle has no such resource or the fetch fails.
    sig { params(name: String, extension: T.nilable(String)).returns(String) }
    async def load_resource(name, extension)
      path = path_for_resource(name, extension)
      raise "No resource #{name} in bundle #{@name}" unless path
      loaded = @contents.fetch(path, nil)
      return loaded if loaded
      response = await fetch(url_for_path(path))
      raise "Could not load #{path} from bundle #{@name}: #{response.status}" unless response.ok
      text = await response.text
      @contents[path] = text
      text
    end

    # The resource's text when it has been loaded, or embedded, and nil
    # otherwise. See #load_resource.
    sig do
      params(name: String, extension: T.nilable(String)).returns(T.nilable(String))
    end
    def loaded_resource(name, extension = nil)
      path = path_for_resource(name, extension)
      path ? @contents.fetch(path, nil) : nil
    end

    # The loaded text of the resource at +path+, or nil.
    sig { params(path: String).returns(T.nilable(String)) }
    def loaded_path(path) # :nodoc:
      @contents.fetch(path, nil)
    end

    # Links the stylesheet +name+ into +document+ once, and answers a promise
    # that settles as it loads. Pages usually link their stylesheets
    # themselves; this is for adding one while running.
    sig { params(name: String, document: Document).returns(Promise) }
    def add_stylesheet(name, document)
      url = url_for_resource(name, "css")
      raise "No stylesheet #{name} in bundle #{@name}" unless url
      existing = document.querySelector("link[data-swill-stylesheet=\"#{url}\"]")
      return Promise.resolve(existing) if existing
      link = document.createElement("link")
      link.setAttribute("rel", "stylesheet")
      link.setAttribute("href", url)
      link.setAttribute("data-swill-stylesheet", url)
      loaded = Promise.new(->(resolve, reject) do
        link.addEventListener("load", ->(_event) { resolve.(link) })
        link.addEventListener("error", ->(_event) { reject.("Could not load stylesheet #{url}") })
      end)
      document.head.appendChild(link)
      loaded
    end

    # A resource path without its extension: `icons/Star.png` is
    # `icons/Star`. A name starting with a dot has no extension.
    sig { params(path: String).returns(String) }
    def self.stem(path)
      segments = path.split("/")
      file = T.must(segments.pop)
      parts = file.split(".")
      name = parts.length > 1 && !T.must(parts.first).empty? ? parts.take(parts.length - 1).join(".") : file
      (segments + [name]).join("/")
    end
  end
end
