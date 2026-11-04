require "minitest/autorun"
require "json"
require "open3"
require "tmpdir"
require "rack/mock"
require "rack/builder"
require_relative "../rb/swill/bundles"

# The server's view of bundles, and that it agrees with the browser's.
class BundlesTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  PUBLIC = File.join(ROOT, "spec/fixtures/bundles/public")

  def app
    Swill::Bundles::Bundle.new(name: "app", directory: PUBLIC, url: "/assets")
  end

  def framework
    Swill::Bundles::Bundle.framework(url: "/assets")
  end

  def catalog
    Swill::Bundles::Catalog.new(app, framework)
  end

  def test_a_manifest_lists_every_file_and_rejects_names_that_collide
    assert_equal ["Poster.png", "icons/Star.png", "icons/Star.svg", "read me.md", "templates.html", "theme.css"],
                 app.manifest.paths
    assert_equal "icons/Star", Swill::Bundles::Manifest.stem("icons/Star.png")
    assert_equal ".hidden", Swill::Bundles::Manifest.stem(".hidden")
    error = assert_raises(ArgumentError) { Swill::Bundles::Manifest.new(["Logo.png", "logo.PNG"]) }
    assert_includes error.message, "resources collide: Logo.png and logo.PNG"
    assert_equal [], Swill::Bundles::Manifest.scan(File.join(PUBLIC, "missing")).paths
  end

  def test_a_bundle_answers_resource_urls_and_contents
    assert_equal "/assets/resources/app/Poster.png", app.url_for_resource("Poster")
    assert_equal "/assets/resources/app/icons/Star.svg", app.url_for_resource("icons/Star", "svg")
    assert_equal "/assets/resources/app/read%20me.md", app.url_for_resource("read me")
    assert_nil app.url_for_resource("Missing")
    error = assert_raises(ArgumentError) { app.url_for_resource("icons/Star") }
    assert_includes error.message, "ambiguous resource icons/Star"
    assert app.resource?("theme", "css")
    assert_equal "body { color: red; }\n", app.read_resource("theme", "css")
    assert_equal "/assets/resources/swill/Warning.png", framework.url_for_resource("Warning", "png")
  end

  def test_a_catalog_looks_in_the_application_first_and_writes_tags
    assert_equal "/assets/resources/app/Poster.png", catalog.image_url("Poster")
    assert_equal "/assets/resources/swill/Warning.png", catalog.image_url("Warning")
    assert_equal '<img src="/assets/resources/swill/Warning.png" alt="" class="icon">',
                 catalog.image_tag("Warning", class: "icon")
    assert_equal '<img klass="Swill::Control::ImageView" image="Poster" src="/assets/resources/app/Poster.png" alt="Poster">',
                 catalog.image_tag("Poster", alt: "Poster", view: true)
    assert_equal '<link rel="stylesheet" href="/assets/resources/app/theme.css">', catalog.stylesheet_tag("theme")
    assert_equal '<link rel="stylesheet" href="/assets/resources/swill/linear.css">', catalog.stylesheet_tag("linear")
    assert_equal %(<script src="/assets/swill.js"></script>\n<script src="/assets/app.js"></script>), catalog.script_tags
    assert_equal '<div class="card"><template outlet="line"><p></p></template><h2></h2></div>', catalog.template("card"),
                 "a nested template stays inside the one that holds it"
    assert_includes catalog.template("segmented"), "segmented-options", "the framework's templates too"
    assert_raises(ArgumentError) { catalog.image_url("Missing") }
    assert_raises(ArgumentError) { catalog.template("missing") }
  end

  def test_the_server_serves_listed_files_and_nothing_else
    server = Rack::MockRequest.new(Swill::Bundles::Server.new(app, framework))
    response = server.get("/resources/app/theme.css")
    assert_equal 200, response.status
    assert_equal "body { color: red; }\n", response.body
    assert_equal "public, max-age=300", response.headers["cache-control"]
    assert_equal 200, server.get("/resources/app/read%20me.md").status
    assert_equal 200, server.get("/resources/swill/Warning.png").status
    assert_equal 200, server.get("/app.js").status
    assert_equal 404, server.get("/resources/app/Missing.png").status
    assert_equal 404, server.get("/resources/app/../app.js").status
    assert_equal 404, server.get("/resources/app/%2E%2E/app.js").status
    assert_equal 404, server.get("/Gemfile").status
  end

  # The browser's Swill::Bundle, compiled from the framework's Ruby, answers
  # exactly what the server does for the same manifest.
  def test_a_server_composes_the_bundles_the_middleware_and_the_pages
    require_relative "../rb/swill/server"
    Swill::Server.default = nil
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "index.html.erb"), "<head><%= swill.head(theme: \"linear\") %></head><body application=\"X\"></body>")
      state = File.join(dir, "state.json")
      Swill::Development::Revision.new(state).publish!
      server = Swill::Server.new(assets: {url: "/assets/", directory: PUBLIC, bundles: ["app"]},
                                 development: state, pages: {"/" => File.join(dir, "index.html.erb")})
      assert_equal "/assets", server.assets_url
      assert_nil server.data_app
      assert_equal [Swill::Development::Middleware, {path: state}], server.middleware
      builder = Rack::Builder.new
      server.use_in(builder)
      builder.run(->(env) { [200, {}, [env["swill.development"].to_json]] })
      assert_equal true, JSON.parse(Rack::MockRequest.new(builder.to_app).get("/").body)["ready"], "use_in adds the middleware"
      script = Rack::MockRequest.new(server).get("/assets/swill.js")
      assert_equal 200, script.status
      assert_equal 200, Rack::MockRequest.new(server).get("/assets/resources/app/Poster.png").status
      assert_equal 404, Rack::MockRequest.new(server).get("/assets/missing.js").status
      status = Rack::MockRequest.new(server).get("/__swill/development")
      assert_equal true, JSON.parse(status.body)["ready"], "the development middleware answers its endpoint"
      page = Rack::MockRequest.new(server).get("/")
      assert_equal 200, page.status
      assert_equal "no-store", page.headers["cache-control"]
      assert_includes page.body, '<meta name="swill-development" content="'
      assert_includes page.body, '<link rel="stylesheet" href="/assets/resources/swill/linear.css" data-swill-theme="">'
      assert_includes page.body, '<script src="/assets/swill.js"></script>'
      assert_equal 404, Rack::MockRequest.new(server).get("/other").status
      helpers = server.helpers({})
      assert_equal "", helpers.development_metadata, "outside the middleware the poller is not started"
      assert_equal Swill::Server.default, server
      view = Object.new.extend(Swill::Bundles::Helpers)
      view.define_singleton_method(:env) { {} }
      assert_includes view.swill.script_tags, "swill.js"
    end
  end

  def test_a_server_with_data_mounts_the_connection
    require_relative "../rb/swill/server"
    connection = Object.new
    connection.define_singleton_method(:call) { |_env| [426, {"content-type" => "text/plain"}, ["WebSocket required"]] }
    server = Swill::Server.new(assets: {url: "/assets", directory: PUBLIC}, data: connection, development: nil)
    assert_nil server.middleware
    assert_equal connection, server.data_app
    assert_equal 426, Rack::MockRequest.new(server).get("/data").status
  end

  def test_rack_mounts_take_precedence_over_an_existing_apps_public_folder
    require_relative "../rb/swill/server"
    require "rack/static"
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "assets"))
      File.write(File.join(dir, "assets/app.js"), "// stale public asset")
      File.write(File.join(dir, "site.css"), "body {}")
      existing = Rack::Static.new(->(_env) { [200, {}, ["existing page"]] }, urls: ["/assets", "/site.css"], root: dir)
      server = Swill::Server.new(assets: {url: "/assets", directory: PUBLIC}, development: nil)
      request = Rack::MockRequest.new(Rack::Builder.new do
        map("/assets") { run server.assets_app }
        map("/") { run existing }
      end)
      assert_equal File.read(File.join(PUBLIC, "app.js")), request.get("/assets/app.js").body
      assert_equal 200, request.get("/assets/swill.js").status
      assert_equal 404, request.get("/assets/missing.js").status
      assert_equal "body {}", request.get("/site.css").body, "other public files still belong to the app"
      assert_equal "existing page", request.get("/").body
    end
  end

  def test_roda_can_share_the_assets_prefix_when_its_plugin_runs_first
    require_relative "../rb/swill/server"
    require "roda"
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "css"))
      File.write(File.join(dir, "css/site.css"), "body {}")
      server = Swill::Server.new(assets: {url: "/assets", directory: PUBLIC}, development: nil)
      existing = Class.new(Roda) do
        plugin :assets, path: dir, css: "site.css"
        route do |r|
          r.assets
          r.on("assets") { r.run server.assets_app }
          r.root { "existing page" }
        end
      end
      request = Rack::MockRequest.new(existing)
      assert_equal File.read(File.join(PUBLIC, "app.js")), request.get("/assets/app.js").body
      assert_equal 200, request.get("/assets/resources/swill/linear.css").status
      assert_equal 404, request.get("/assets/missing.js").status
      assert_equal "existing page", request.get("/").body
      assert_equal "body {}", request.get("/assets/css/site.css").body,
                   "Roda's default asset routes remain reachable"
    end
  end

  def test_the_browser_bundle_agrees_with_the_server
    names = [["Poster", nil], ["icons/Star", "svg"], ["icons/Star", "png"], ["read me", nil], ["theme", "css"],
             ["Missing", nil], ["icons/Star", nil]]
    server = names.map do |name, extension|
      app.url_for_resource(name, extension)
    rescue ArgumentError
      "ambiguous"
    end
    script = <<~JS
      import {loadBundles} from "#{File.join(ROOT, 'spec/load_bundles.mjs')}";
      const {Runtime} = loadBundles();
      const bundle = Runtime.resolve("Swill::Bundle").register("app", "/assets/", #{app.manifest.paths.to_json}, {}, false);
      console.log(JSON.stringify(#{names.to_json}.map(([name, extension]) => {
        try { return bundle.urlForResourceWithExtension(name, extension); } catch { return "ambiguous"; }
      })));
    JS
    Dir.mktmpdir do |dir|
      file = File.join(dir, "parity.mjs")
      File.write(file, script)
      output, status = Open3.capture2e("deno", "run", "-A", file)
      assert status.success?, output
      assert_equal server, JSON.parse(output.lines.last)
    end
  end
end
