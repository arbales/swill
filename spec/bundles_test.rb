require "minitest/autorun"
require "json"
require "open3"
require "tmpdir"
require "rack/mock"
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
