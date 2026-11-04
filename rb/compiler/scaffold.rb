# frozen_string_literal: true

require "fileutils"

module Swill
  module Ruby2JS
    # `swill new NAME`: a new application that `swill dev` runs as it is, a
    # page greeting what is typed into it. The client is Ruby under
    # `client/`, compiled into `public/assets/`; `config.ru` serves the page,
    # the bundles, and the development reload with Swill::Server. `--data`
    # adds a server entry for Distant Objects.
    class Scaffold
      attr_reader :directory, :module_name

      def initialize(directory, data: false)
        @directory = File.expand_path(directory)
        @data = data
        base = File.basename(@directory)
        @module_name = base.split(/[^A-Za-z0-9]+/).reject(&:empty?).map { |part| part[0].upcase + part[1..] }.join
        unless @module_name.match?(/\A[A-Z][A-Za-z0-9]*\z/)
          raise CompileError, "#{base} does not make a Ruby module name; choose a name that starts with a letter"
        end
      end

      # Writes the files, refusing a directory that already has any.
      def write
        if File.directory?(directory) && !Dir.empty?(directory)
          raise CompileError, "#{directory} is not empty; swill new writes a new application"
        end
        write_files(files)
      end

      # Add only the client and its build configuration to an existing app.
      # Preflight both paths before writing anything, including dangling links.
      def init
        %w[swill.yml client].each do |path|
          target = File.join(directory, path)
          if File.exist?(target) || File.symlink?(target)
            raise CompileError, "#{target} already exists; swill init will not overwrite it"
          end
        end
        write_files({"swill.yml" => project(existing: true)}.merge(client_files))
      end

      def integration
        <<~TEXT
          swill: next, integrate with the existing application:
            1. Add Swill and Ruby2JS to its Gemfile if needed (see doc/getting_started.md).
            2. Require "swill/server" and create:
                 SWILL = Swill::Server.new(assets: {url: "/assets", directory: "public/assets"})
            3. In config.ru, before running your existing app:
                 SWILL.use_in(self)
                 map("/assets") { run SWILL.assets_app }
                 map("/") { run YourExistingApp }
               This reserves /assets, including 404s, before Sinatra's public folder or Roda's Assets plugin.
               If /assets is already in use, integrate into the router or choose another URL;
               check public/assets/app.js for output collisions too. See doc/serving.md.
            4. Render SWILL.helpers(request.env).head(theme: "linear") unescaped in the page head,
               and its stylesheet_tag("app") for the client's CSS.
            5. Name the application on the body: application="#{module_name}::Application".
               Add controller="#{module_name}::Hello", an input bind="name", and a heading bind="greeting".
            6. Ignore /public/assets/ and /tmp/, review swill.yml's watch paths, then run:
                 bundle exec swill dev
          swill: doc/serving.md has router and template-engine examples.
        TEXT
      end

      def files
        written = {
          "Gemfile" => gemfile,
          "swill.yml" => project,
          "config.ru" => rackup,
          "pages/index.html.erb" => page,
          "README.md" => readme,
          ".gitignore" => "/public/assets/\n/tmp/\n"
        }.merge(client_files)
        written["server/server.rb"] = server if @data
        written
      end

    private

      def write_files(files)
        files.each do |path, content|
          target = File.join(directory, path)
          FileUtils.mkdir_p(File.dirname(target))
          File.write(target, content)
        end
        files.keys
      end

      def client_files
        {
          "client/app.rb" => entry,
          "client/application.rb" => application,
          "client/controllers/hello.rb" => hello,
          "client/resources/app.css" => stylesheet
        }
      end

      # The gem as this command was run from it: from its git repository
      # when Bundler installed it from one, and otherwise by path to this
      # checkout. It is not on rubygems.org, so a name alone would not install.
      def swill_gem
        source = Gem.loaded_specs["swill"]&.then { |spec| spec.respond_to?(:source) ? spec.source : nil }
        if defined?(Bundler::Source::Git) && source.is_a?(Bundler::Source::Git)
          pin = source.options["tag"] ? %(tag: #{source.options["tag"].inspect}) : %(branch: #{(source.branch || "main").inspect})
          return %(gem "swill", git: #{source.uri.inspect}, #{pin})
        end
        %(gem "swill", path: #{Swill::ROOT.inspect})
      end

      def gemfile
        data = @data ? <<~RUBY : ""

          # Distant Objects: Sequel models served over a WebSocket.
          gem "sequel"
          gem "sqlite3"
          gem "async-websocket"
        RUBY
        base = <<~RUBY
          source "https://rubygems.org"

          #{swill_gem}
          # Swill compiles with Ruby2JS's main branch, which no release carries yet.
          gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
          # The server `swill dev` runs config.ru with.
          gem "falcon"
        RUBY
        base + data
      end

      def project(existing: false)
        schema = @data ? %(\n  schema: ["server/**/*.rb"]) : ""
        server = @data ? "server: server/server.rb\n" : ""
        server_globs = existing ? '["config.ru", "app.rb", "lib/**/*.rb"]' : '["config.ru"]'
        pages = existing ? '["views/**/*", "public/**/*.html"]' : '["pages/**/*"]'
        <<~YAML
          #{server}client: client/app.rb
          out: public/assets/app.js
          # config.ru serves the framework from the gem, so it is not copied.
          framework: false
          # Set to `client` to write Sorbet artifacts there; see doc/sorbet.md.
          types: false
          watch:
            client: ["client/**/*.rb"]
            resources: ["client/resources/**/*"]
            server: #{server_globs}#{schema}
            pages: #{pages}
          dev:
            port: 9292
        YAML
      end

      def rackup
        require_server = @data ? %(require_relative "server/server"\n) : ""
        data = @data ? <<~RUBY.gsub(/^/, "  ") : ""
          data: {
            schema: Swill::Distant::Schema.discover,
            # Who the browser is: see doc/server_data.md.
            authenticate: ->(_env) { {viewer_context: nil, actor: nil, scope_token: "anonymous"} }
          },
        RUBY
        <<~RUBY
          require "swill/server"
          #{require_server}
          # The page, the compiled bundles, and, under `swill dev`, the
          # development reload.
          run Swill::Server.new(
            assets: {url: "/assets", directory: "public/assets", bundles: ["app"]},
          #{data}  pages: {"/" => "pages/index.html.erb"}
          )
        RUBY
      end

      def page
        <<~HTML
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8">
              <title>#{module_name}</title>
              <%= swill.head(theme: "linear") %>
              <%= swill.stylesheet_tag("app") %>
            </head>
            <body application="#{module_name}::Application"<%= " development" if ENV["RACK_ENV"] == "development" %>>
              <main controller="#{module_name}::Hello">
                <h1 bind="greeting"></h1>
                <label>Name <input type="text" bind="name"></label>
              </main>
            </body>
          </html>
        HTML
      end

      def entry
        <<~RUBY
          # The client's sources, in the order they load.
          require_relative "application"
          require_relative "controllers/hello"
        RUBY
      end

      def application
        <<~RUBY
          # typed: true
          # frozen_string_literal: true

          module #{module_name}
            # The application the page names with `application=`.
            class Application < Swill::Application
            end
          end
        RUBY
      end

      def hello
        <<~RUBY
          # typed: true
          # frozen_string_literal: true

          module #{module_name}
            # Greets the name typed into the page: `name` is bound to the
            # field, and `greeting`, computed from it, to the heading.
            class Hello < Swill::Controller
              extend T::Sig

              property :name, type: String, default: "world"

              property :greeting, type: String do
                "Hello, \#{name}!"
              end
            end
          end
        RUBY
      end

      def stylesheet
        <<~CSS
          /* The application's own styles, after the theme's. */
          main {
            max-width: 32rem;
            margin: 3rem auto;
          }
        CSS
      end

      def server
        <<~RUBY
          # frozen_string_literal: true

          # The server's data: Sequel models, each with a DistantInterface
          # naming what the browser may read and call. `swill data generate`
          # (which `swill dev` runs) loads this file to write the client's
          # proxies. See doc/server_data.md.
          require "fileutils"
          require "sequel"
          require "swill/server"

          FileUtils.mkdir_p(File.expand_path("../tmp", __dir__))
          DB = Sequel.sqlite(File.expand_path("../tmp/development.sqlite3", __dir__))
        RUBY
      end

      def readme
        <<~MARKDOWN
          # #{module_name}

          A Swill application.

          ```sh
          bundle install
          bundle exec swill dev
          ```

          Then open http://localhost:9292. `swill dev` compiles `client/` into
          `public/assets/`, runs `config.ru`, and rebuilds as you edit; the page
          offers to reload once a rebuild succeeds.

          | Path | What it holds |
          | --- | --- |
          | `client/` | The application, in Ruby: `app.rb` lists its sources |
          | `client/resources/` | Images, stylesheets and templates, served beside the build |
          | `pages/index.html.erb` | The page, which names the application |
          | `config.ru` | The server: the page, the bundles, and the development reload |
          | `swill.yml` | What `swill dev` builds and watches |
        MARKDOWN
      end
    end
  end
end
