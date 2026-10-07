# frozen_string_literal: true

require "erb"
require_relative "../../bundles"
require_relative "../development"

module Swill
  # The server side of a Swill application as one Rack application, or as
  # parts an existing Roda, Sinatra or Rack application mounts where its
  # router puts things:
  #
  #     # config.ru
  #     run Swill::Server.new(
  #       assets: {url: "/assets", directory: "public/assets", bundles: ["app"]},
  #       data: {schema: Swill::Distant::Schema.discover, authenticate: ->(env) { ... }},
  #       pages: {"/" => "pages/index.html.erb"}
  #     )
  #
  # +assets+ names where the application's bundles were built and the URL
  # they are served at; the framework's bundle comes from the gem. +data+
  # is a Swill::Distant::Connection, the keywords to create one, or nil.
  # +development+ is the path of the revision file `swill dev` writes
  # (`SWILL_DEVELOPMENT_STATE` by default), which turns on the development
  # middleware and the page's update notice; nil in production. +pages+ maps
  # paths to ERB templates rendered with the page helpers as +swill+.
  #
  # The parts: #assets_app and #data_app are Rack applications; #middleware
  # is the development middleware with its argument, for `use`; #helpers
  # answers the page helpers for a request. See
  # [Serving](rdoc-ref:doc/serving.md).
  class Server
    DEFAULT_DATA_PATH = "/data"

    attr_reader :catalog, :assets_url, :data_path, :development_path

    def initialize(assets:, data: nil, development: ENV["SWILL_DEVELOPMENT_STATE"], pages: {})
      @assets_url = assets.fetch(:url).chomp("/")
      directory = File.expand_path(assets.fetch(:directory))
      bundles = assets.fetch(:bundles, ["app"]).map do |name|
        Bundles::Bundle.new(name: name, directory: directory, url: @assets_url)
      end
      @bundles = bundles + [Bundles::Bundle.framework(url: @assets_url)]
      @catalog = Bundles::Catalog.new(*@bundles)
      @data_path, @connection = resolve_data(data)
      @development_path = development
      @pages = pages.transform_values { |template| File.expand_path(template) }
      Server.default ||= self
    end

    class << self
      # The server created first, which the Swill::Bundles::Helpers mixin
      # renders for when a view does not name one.
      attr_accessor :default
    end

    # A Rack application serving the bundles' scripts and resources at
    # +assets_url+ (mount it there).
    def assets_app
      @assets_app ||= Bundles::Server.new(*@bundles)
    end

    # The Distant connection at +data_path+, or nil when the server has no
    # data.
    def data_app
      @connection
    end

    # The development middleware and its options, or nil outside
    # development. #use_in adds it to a Rack builder.
    def middleware
      return nil unless @development_path
      [Development::Middleware, {path: @development_path}]
    end

    # Adds the development middleware to +builder+, a Rack::Builder (the
    # +self+ of a `config.ru`), when the server is in development:
    #
    #     SWILL.use_in(self)
    def use_in(builder)
      klass, options = middleware
      builder.use(klass, **options) if klass
      builder
    end

    # The page helpers for the request +env+.
    def helpers(env)
      Bundles::Page.new(@catalog, env)
    end

    # Everything mounted together: the middleware, the assets, the data
    # connection, and the pages.
    def to_app
      @app ||= build_app
    end

    def call(env)
      to_app.call(env)
    end

  private

    def resolve_data(data)
      return [nil, nil] if data.nil?
      if data.is_a?(Hash)
        path = data.fetch(:path, DEFAULT_DATA_PATH)
        connection = Distant::Connection.new(schema: data.fetch(:schema), authenticate: data.fetch(:authenticate))
        return [path, connection]
      end
      [DEFAULT_DATA_PATH, data]
    end

    def build_app
      require "rack/builder"
      server = self
      Rack::Builder.new do
        server.use_in(self)
        map(server.assets_url) { run server.assets_app }
        map(server.data_path) { run server.data_app } if server.data_app
        run server.method(:render_page)
      end.to_app
    end

    def render_page(env)
      template = @pages[env["PATH_INFO"]]
      return [404, {"content-type" => "text/plain"}, ["Not Found"]] unless template
      html = Bundles::Page.render(template, helpers(env))
      [200, {"content-type" => "text/html; charset=utf-8"}, [html]]
    end
  end
end
