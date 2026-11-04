require "digest"
require "json"
require "minitest/autorun"
require "open3"
require "tmpdir"
require "fileutils"
require "timeout"
require_relative "../rb/compiler/cli"

class CLITest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)

  def swill(*arguments)
    Open3.capture3("ruby", File.join(ROOT, "exe/swill"), *arguments)
  end

  def test_build_follows_the_entry_file_and_bundles_against_the_installed_framework
    Dir.mktmpdir do |dir|
      out = File.join(dir, "assets", "app.js")
      stdout, stderr, status = swill("build", File.join(ROOT, "spec/fixtures/cli_app"), "--out", out, "--with-framework")
      assert status.success?, stderr
      assert_match(/built .*app\.js \(3 sources/, stdout)
      js = File.read(out)
      assert_includes js, "Fixture__Note"
      assert_includes js, "Fixture__Notes"
      assert_includes js, "globalThis.Swill", "the application reads the framework from the page"
      refute_includes js, "class Swill__Controller ", "no second copy of the framework"
      assert File.file?(File.join(dir, "assets", "app.js.map"))
      assert File.file?(File.join(dir, "assets", "swill.js")), "--with-framework copies the bundle"
      assert File.file?(File.join(dir, "assets", "resources", "swill", "linear.css")),
             "--with-framework copies the framework's resources"
      assert File.file?(File.join(dir, "assets", "resources", "swill", "Warning.png"))
      assert File.file?(File.join(dir, "assets", "resources", "app", "icons", "Note.svg")),
             "the application's resources are copied beside app.js, folders and all"
      assert_includes js, '"icons/Note.svg"', "the manifest is registered"
      assert_includes js, "note_row", "HTML catalogs are embedded"
      refute_includes js, "<rect", "other resources are loaded by URL, never embedded"
      assert_operator js.index(/Fixture__Note\b/), :<, js.index(/Fixture__Notes\b/), "dependencies come first"
    end
  end

  def test_build_reports_missing_entries_and_compile_errors_without_a_backtrace
    _stdout, stderr, status = swill("build", "/nonexistent")
    refute status.success?
    assert_includes stderr, "no entry file"
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "app.rb"), "require_relative \"broken\"\n")
      File.write(File.join(dir, "broken.rb"), "class Broken < Nope; end\n")
      _stdout, stderr, status = swill("build", dir)
      refute status.success?
      assert_includes stderr, "swill: "
      refute_includes stderr, "cli.rb:"
      out = File.join(dir, "dist", "app.js")
      refute File.exist?(out), "a plain build that fails writes nothing"

      File.write(out.tap { |path| FileUtils.mkdir_p(File.dirname(path)) }, "// the last good build")
      File.write("#{out}.map", "{}")
      _stdout, stderr, status = swill("build", dir, "--show-errors")
      refute status.success?, "the command still fails"
      script = File.read(out)
      assert_includes script, "reportBuildFailure", "the stale build is replaced by one that shows the error"
      message = stderr.delete_prefix("swill: ").strip
      assert_includes script, message.to_json
      refute File.exist?("#{out}.map"), "the old source map goes with it"
    end
  end

  # The editor and CLI check one directory, including a refreshed local copy
  # of the framework. No absolute gem paths or per-source lists can go stale.
  def test_types_writes_sorbet_artifacts_a_consumer_can_check_against
    Dir.mktmpdir do |dir|
      FileUtils.cp_r(File.join(ROOT, "spec/fixtures/cli_app"), File.join(dir, "app"))
      stdout, stderr, status = swill("types", File.join(dir, "app"))
      assert status.success?, stderr
      assert_match(/wrote 8 Sorbet files/, stdout)
      sorbet = File.join(dir, "app", "sorbet")
      %w[swill/rbi/swill.rbi swill/rbi/swill-dom.rbi swill/rbi/swill-runtime.rbi swill/rbi/application.rbi
         swill/checks/declarations.rb swill/framework/core/controller.rb swill/.gitignore swill.config config].each do |name|
        assert File.file?(File.join(sorbet, name)), "#{name} was written"
      end
      assert_includes File.read(File.join(sorbet, "swill/rbi/application.rbi")), "Fixture::Note"
      assert_includes File.read(File.join(sorbet, "swill/rbi/swill.rbi")), "Swill::Controller"
      assert_includes File.read(File.join(sorbet, "swill/rbi/swill-dom.rbi")), "class Element"
      assert_equal "@sorbet/swill.config\n", File.read(File.join(sorbet, "config"))
      config = File.read(File.join(sorbet, "swill.config"))
      assert_equal ["--dir=.\n"], config.lines.grep(/^--dir=/)
      %w[/public /tmp /node_modules /dist /sorbet/rbi/shims/generated].each do |path|
        assert_includes config, "--ignore=#{path}"
      end
      assert_includes config, "--enable-experimental-requires-ancestor"
      refute_includes config, ROOT, "nothing points into the installed gem"
      output, status = Open3.capture2e("srb", "tc", chdir: File.join(dir, "app"))
      assert status.success?, output
      # Fresh files are picked up without regenerating a source list.
      File.write(File.join(dir, "app", "new.rb"), "# typed: true\nT.let(123, String)\n")
      output, status = Open3.capture2e("srb", "tc", chdir: File.join(dir, "app"))
      refute status.success?
      assert_includes output, "new.rb"
      # An existing config is the consumer's; it is not overwritten.
      File.write(File.join(sorbet, "config"), "--dir=.\n")
      File.write(File.join(sorbet, "swill.config"), "stale")
      stale = File.join(sorbet, "swill/framework/stale.rb")
      File.write(stale, "# removed by a gem update")
      _stdout, stderr, status = swill("types", File.join(dir, "app"))
      assert status.success?, stderr
      assert_equal "--dir=.\n", File.read(File.join(sorbet, "config"))
      assert_equal config, File.read(File.join(sorbet, "swill.config"))
      refute File.exist?(stale), "each generation refreshes the framework copy"
    end
  end

  def test_types_never_ignores_sources_when_output_shares_their_directory
    Dir.mktmpdir do |dir|
      FileUtils.cp_r(File.join(ROOT, "spec/fixtures/cli_app"), File.join(dir, "client"))
      _stdout, stderr, status = swill("types", File.join(dir, "client"), "--into", dir,
                                    "--out", File.join(dir, "client/app.js"))
      assert status.success?, stderr
      config = File.read(File.join(dir, "sorbet/swill.config"))
      refute_includes config, "--ignore=/client\n"
      output, status = Open3.capture2e("srb", "tc", chdir: dir)
      assert status.success?, output
      File.write(File.join(dir, "client/new.rb"), "# typed: true\nT.let(123, String)\n")
      output, status = Open3.capture2e("srb", "tc", chdir: dir)
      refute status.success?
      assert_includes output, "client/new.rb"
    end
  end

  def test_manifest_lists_a_bundles_resources_for_a_page_without_a_build
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "icons"))
      File.write(File.join(dir, "Poster.png"), "")
      File.write(File.join(dir, "icons/Star.svg"), "")
      File.write(File.join(dir, ".DS_Store"), "")
      stdout, stderr, status = swill("manifest", dir)
      assert status.success?, stderr
      assert_equal ["Poster.png", "icons/Star.svg"], JSON.parse(stdout)
      _, stderr, status = swill("manifest", File.join(dir, "missing"))
      refute status.success?
      assert_includes stderr, "is not a directory"
    end
  end

  def test_usage_without_a_command
    stdout, stderr, status = swill
    assert status.success?
    assert_includes stderr, "swill build [ENTRY]"
    assert_empty stdout
  end

  def test_data_generate_and_check
    Dir.mktmpdir do |dir|
      server = File.join(ROOT, "spec/fixtures/data/server.rb")
      stdout, stderr, status = swill("data", "generate", server, "--root", dir)
      assert status.success?, stderr
      assert_includes stdout, "wrote 13 data files"
      extension = File.join(dir, "client/models/data_fixture/post.rb")
      assert_includes File.read(extension), "class Post\n"
      refute_includes File.read(extension), "Distant::Object", "the extension reopens the generated class"

      stdout, stderr, status = swill("data", "check", server, "--root", dir)
      assert status.success?, stderr
      assert_includes stdout, "generated data files are current"

      File.write(File.join(dir, "client/models/generated/schema.json"), "stale")
      _stdout, stderr, status = swill("data", "check", server, "--root", dir)
      refute status.success?
      assert_includes stderr, "generated data file is stale"
    end
  end

  def test_project_build_regenerates_server_changes_in_a_fresh_process
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "client"))
      server = <<~RUBY
        require "sequel"
        require #{File.join(ROOT, "rb/swill/server").inspect}
        module ProjectFixture
          DB = Sequel.mock
          class Note < Sequel::Model(DB[:notes])
            def_column_accessor :id, :title, :body
            module DistantInterface
              extend Swill::Distant::Interface
              fields id: String, title: String
            end
          end
        end
      RUBY
      File.write(File.join(dir, "server.rb"), server)
      File.write(File.join(dir, "client/app.rb"), <<~RUBY)
        require_relative "models/generated/project_fixture/note"
        module ProjectFixture
          class App < Swill::Application
          end
        end
      RUBY
      config = File.join(dir, "swill.yml")
      File.write(config, {"server" => "server.rb", "client" => "client/app.rb",
                          "out" => "public/app.js"}.to_yaml)
      _stdout, stderr, status = swill("build", "--project", config)
      assert status.success?, stderr
      assert File.file?(File.join(dir, "public/swill.js"))
      assert File.file?(File.join(dir, "client/sorbet/swill/rbi/application.rbi"))
      project = Swill::Ruby2JS::Project.new(config)
      # What swill dev watches: each category's files, by content.
      snapshot = lambda do
        project.files(project.categories.values.flatten).to_h { |file| [file, Digest::SHA256.file(file).hexdigest] }
      end
      stamps = snapshot.()
      generated = File.join(dir, "client/models/generated/project_fixture/note.rb")
      File.write(generated, "stale")
      assert_equal stamps, snapshot.(), "generated files must not trigger a rebuild loop"
      File.write(File.join(dir, "server.rb"), server.sub("title: String", "title: String, body: String"))
      refute_equal stamps, snapshot.()
      _stdout, stderr, status = swill("build", "--project", config)
      assert status.success?, stderr
      assert_includes File.read(generated), "attribute :body"
      File.write(File.join(dir, "client/new.rb"), "# newly added source\n")
      assert snapshot.().keys.any? { |file| file.end_with?("client/new.rb") }
    end
  end

  def test_data_generate_goes_without_the_database_using_the_last_generated_schema
    Dir.mktmpdir do |dir|
      database = File.join(dir, "notes.sqlite3")
      setup = <<~RUBY
        require "sequel"
        db = Sequel.sqlite(#{database.inspect})
        db.create_table(:notes) { String :id, primary_key: true; String :title, null: false; Integer :stars; String :mood }
      RUBY
      output, status = Open3.capture2e(RbConfig.ruby, "-e", setup)
      assert status.success?, output
      File.write(File.join(dir, "server.rb"), <<~RUBY)
        require "sequel"
        require "swill/server"
        DB = Swill::Distant.database { Sequel.sqlite(ENV.fetch("NOTES_DATABASE")) }
        module Offline
          class Note < Sequel::Model(DB[:notes])
            module DistantInterface
              extend Swill::Distant::Interface
              fields :title, :stars, mood: T.nilable(Swill::Distant::Enum[:calm, :keen])
              writable :title
            end
          end
        end
      RUBY
      generate = lambda do |path|
        environment = {"RUBYLIB" => File.join(ROOT, "rb"), "SWILL_SCHEMA_ONLY" => "1", "NOTES_DATABASE" => path}
        Open3.capture2e(environment, RbConfig.ruby, File.join(ROOT, "exe/swill"), "data", "generate", "server.rb", chdir: dir)
      end
      unreachable = File.join(dir, "missing", "folder", "notes.sqlite3")
      output, status = generate.(unreachable)
      refute status.success?, "the first generation needs the database"
      assert_includes output, "generate once with the database"

      output, status = generate.(database)
      assert status.success?, output
      generated = File.join(dir, "client/models/generated")
      with_database = Dir.glob("#{generated}/**/*").select { |file| File.file?(file) }.sort.to_h { |file| [file, File.read(file)] }
      proxy = with_database.fetch(File.join(generated, "offline/note.rb"))
      assert_includes proxy, "attribute :stars"
      assert_includes proxy, 'MOOD_VALUES = ["calm", "keen"].freeze', "an enum's members reach the client"

      output, status = generate.(unreachable)
      assert status.success?, output
      without = Dir.glob("#{generated}/**/*").select { |file| File.file?(file) }.sort.to_h { |file| [file, File.read(file)] }
      assert_equal with_database, without, "the same proxies and schema hash, from the last generated schema"

      File.write(File.join(dir, "server.rb"), File.read(File.join(dir, "server.rb")).sub("fields :title, :stars,", "fields :title, :stars, :body,"))
      output, status = generate.(unreachable)
      refute status.success?
      assert_includes output, "unknown client field Offline::Note.body", "a field new since then needs the database or a type"
    end
  end

  def test_project_reports_config_and_hook_errors
    Dir.mktmpdir do |dir|
      config = File.join(dir, "swill.yml")
      File.write(config, {"client" => "client/app.rb", "typo" => true}.to_yaml)
      _stdout, stderr, status = swill("build", "--project", config)
      refute status.success?
      assert_includes stderr, "unknown project option: typo"
      File.write(config, {"client" => "client/app.rb", "types" => false,
                          "before_build" => [[RbConfig.ruby, "-e", "abort 'asset failure'"]]}.to_yaml)
      _stdout, stderr, status = swill("build", "--project", config)
      refute status.success?
      assert_includes stderr, "before_build failed"
      assert_includes stderr, "asset failure"
    end
  end

  def test_project_rejects_malformed_types_options
    Dir.mktmpdir do |dir|
      config = File.join(dir, "swill.yml")
      [true, "", {"check" => "true"}, {"into" => false}, {"typo" => true}].each do |value|
        File.write(config, {"client" => "app.rb", "types" => value}.to_yaml)
        error = assert_raises(Swill::Ruby2JS::CompileError) { Swill::Ruby2JS::Project.new(config) }
        assert_includes error.message, "project types must be"
      end
    end
  end

  def test_documented_data_form_builds_and_validates_a_save
    Dir.mktmpdir do |dir|
      blocks = File.read(File.join(ROOT, "doc/data_form.md")).scan(/```(?:ruby|html|yaml)\n(.*?)```/m).flatten
      %w[setup.rb server.rb config.ru client/app.rb public/index.html swill.yml].each do |name|
        source = blocks.find { |block| block.lines.first.include?(name) }
        refute_nil source, name
        file = File.join(dir, name)
        FileUtils.mkdir_p(File.dirname(file))
        File.write(file, source)
      end
      output, status = Open3.capture2e(RbConfig.ruby, File.join(dir, "setup.rb"))
      assert status.success?, output
      output, status = Open3.capture2e({"RUBYLIB" => File.join(ROOT, "rb")},
                                      RbConfig.ruby, File.join(ROOT, "exe/swill"), "build", chdir: dir)
      assert status.success?, output
      assert File.file?(File.join(dir, "public/assets/app.js"))
      assert File.file?(File.join(dir, "public/assets/swill.js"))
      script = <<~RUBY
        require #{File.join(dir, "server.rb").inspect}
        schema = Swill::Distant::Schema.new([Notes::Note])
        dispatcher = Swill::Distant::Dispatcher.new(schema: schema, viewer_context: nil, actor: nil, scope_token: "test")
        dispatcher.call("type" => "HELLO", "protocol_version" => Swill::Distant::PROTOCOL_VERSION, "schema_hash" => schema.hash)
        create = {"type" => "CREATE", "model" => "Notes::Note", "request_id" => 1, "generation" => 1}
        invalid = dispatcher.call(create.merge("attributes" => {"title" => ""}))
        abort invalid.inspect unless invalid.dig("error", "code") == "validation_failed"
        valid = dispatcher.call(create.merge("attributes" => {"title" => "A note"}))
        abort valid.inspect unless valid["type"] == "RETURN" && Notes::Note.count == 1
      RUBY
      output, status = Open3.capture2e(RbConfig.ruby, "-I#{File.join(ROOT, 'rb')}", "-e", script)
      assert status.success?, output
    end
  end

  def test_new_writes_an_application_that_builds_and_serves_its_page
    Dir.mktmpdir do |dir|
      app = File.join(dir, "hello-app")
      stdout, stderr, status = swill("new", app, "--data")
      assert status.success?, stderr
      assert_includes stdout, "bundle exec swill dev"
      %w[Gemfile swill.yml config.ru pages/index.html.erb client/app.rb client/application.rb
         client/controllers/hello.rb client/resources/app.css server/server.rb README.md .gitignore].each do |path|
        assert File.file?(File.join(app, path)), path
      end
      assert_includes File.read(File.join(app, "client/application.rb")), "module HelloApp"
      assert_includes File.read(File.join(app, "Gemfile")), %(gem "swill", path: #{ROOT.inspect})
      _stdout, stderr, status = swill("new", app)
      refute status.success?, "an existing application is never overwritten"
      assert_includes stderr, "is not empty"

      environment = {"RUBYLIB" => File.join(ROOT, "rb")}
      output, status = Open3.capture2e(environment, RbConfig.ruby, File.join(ROOT, "exe/swill"), "build", chdir: app)
      assert status.success?, output
      assert File.file?(File.join(app, "public/assets/app.js"))
      assert File.file?(File.join(app, "public/assets/resources/app/app.css"))
      script = <<~RUBY
        require "rack/builder"
        require "rack/mock"
        app = Rack::Builder.parse_file("config.ru")
        page = Rack::MockRequest.new(app).get("/")
        abort page.body unless page.status == 200 && page.body.include?('<script src="/assets/app.js"></script>') &&
                               page.body.include?('application="HelloApp::Application"')
        abort "app.js" unless Rack::MockRequest.new(app).get("/assets/app.js").status == 200
        abort "swill.js" unless Rack::MockRequest.new(app).get("/assets/swill.js").status == 200
        puts "served"
      RUBY
      output, status = Open3.capture2e(environment, RbConfig.ruby, "-e", script, chdir: app)
      assert status.success?, output
      assert_includes output, "served"
    end
  end

  def test_new_rejects_a_name_that_makes_no_module
    Dir.mktmpdir do |dir|
      _stdout, stderr, status = swill("new", File.join(dir, "123"))
      refute status.success?
      assert_includes stderr, "does not make a Ruby module name"
    end
  end

  def test_init_adds_only_the_client_and_config_and_refuses_either_existing_path
    Dir.mktmpdir("existing-app") do |dir|
      %w[Gemfile config.ru app.rb .gitignore views/index.erb].each do |path|
        target = File.join(dir, path)
        FileUtils.mkdir_p(File.dirname(target))
        File.write(target, "# existing #{path}\n")
      end
      existing = Dir.glob("#{dir}/**/*", File::FNM_DOTMATCH).select { |path| File.file?(path) }
                    .to_h { |path| [path, File.read(path)] }
      output, status = Open3.capture2e(RbConfig.ruby, File.join(ROOT, "exe/swill"), "init", chdir: dir)
      assert status.success?, output
      %w[swill.yml client/app.rb client/application.rb client/controllers/hello.rb client/resources/app.css].each do |path|
        assert File.file?(File.join(dir, path)), path
      end
      existing.each { |path, source| assert_equal source, File.read(path) }
      assert_includes output, 'map("/assets") { run SWILL.assets_app }'
      assert_equal "public/assets/app.js", YAML.safe_load_file(File.join(dir, "swill.yml"))["out"]
      assert_includes output, "If /assets is already in use"
      assert_includes output, "Sinatra"
      assert_includes output, "Roda"
      assert_includes output, "bind=\"greeting\""
      _stdout, stderr, status = swill("build", "--project", File.join(dir, "swill.yml"))
      assert status.success?, stderr
      assert File.file?(File.join(dir, "public/assets/app.js"))
      _stdout, stderr, status = swill("init", dir)
      refute status.success?
      assert_includes stderr, "will not overwrite"
    end
    %w[swill.yml client].each do |conflict|
      Dir.mktmpdir do |dir|
        File.symlink("missing", File.join(dir, conflict))
        _stdout, stderr, status = swill("init", dir)
        refute status.success?
        assert_includes stderr, "#{conflict} already exists"
        assert_equal [conflict], Dir.children(dir), "preflight must not write part of the scaffold"
      end
    end
  end

  def test_project_type_checking_is_fatal_in_build_and_a_warning_in_dev
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "client"))
      File.write(File.join(dir, "client/app.rb"), <<~RUBY)
        # typed: true
        class Wrong < Swill::Object
          extend T::Sig
          sig { returns(String) }
          def value
            123
          end
        end
      RUBY
      File.write(File.join(dir, "swill.yml"), {
        "client" => "client/app.rb", "out" => "client/assets/app.js",
        "framework" => false, "types" => {"check" => true},
        "dev" => {"server" => false}
      }.to_yaml)
      output, status = Open3.capture2e(RbConfig.ruby, File.join(ROOT, "exe/swill"), "build", chdir: dir)
      refute status.success?, output
      assert_includes output, "type checking failed"
      assert_includes output, "Expected `String`"
      config = File.read(File.join(dir, "client/sorbet/swill.config"))
      assert_includes config, "--ignore=/assets"
      output, status = Open3.capture2e(RbConfig.ruby, File.join(ROOT, "exe/swill"), "dev", "--once", chdir: dir)
      assert status.success?, output
      assert_includes output, "type checking failed"
      assert_includes output, "swill: ready"
    end
  end

  def test_plain_watch_rediscovers_dependencies_after_failures_and_watches_resources
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "app.rb"), "class Watched < Swill::Object; end\n")
      log = File.join(dir, "watch.log")
      pid = Process.spawn(RbConfig.ruby, File.join(ROOT, "exe/swill"), "watch", dir, "--interval", "0.05",
                          out: log, err: [:child, :out], pgroup: true)
      begin
        Timeout.timeout(30) do
          output = File.join(dir, "dist/app.js")
          sleep 0.05 until File.file?(output)
          File.write(File.join(dir, "app.rb"), "require_relative 'extra'\n")
          sleep 0.05 until File.read(log).include?("requires a missing file")
          File.write(File.join(dir, "extra.rb"), "require_relative 'nested'\n")
          sleep 0.05 until File.read(log).include?("extra.rb requires a missing file")
          File.write(File.join(dir, "extra.rb"), "class Recovered < Swill::Object; end\n")
          sleep 0.05 until File.read(output).include?("Recovered") && !File.read(output).include?("reportBuildFailure")
          FileUtils.mkdir_p(File.join(dir, "resources/icons"))
          resource = File.join(dir, "resources/icons/hello.txt")
          copied = File.join(dir, "dist/resources/app/icons/hello.txt")
          File.write(resource, "one")
          sleep 0.05 until File.file?(copied) && File.read(copied) == "one"
          File.write(resource, "two")
          sleep 0.05 until File.read(copied) == "two"
          File.delete(resource)
          sleep 0.05 while File.exist?(copied)
        end
      rescue Timeout::Error
        flunk "watch did not recover:\n#{File.read(log)}"
      ensure
        Process.kill("TERM", -pid)
        Process.wait(pid)
      end
    end
  end

  def test_project_watch_recovers_when_a_missing_source_is_created
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "app.rb"), "require_relative 'extra'\n")
      File.write(File.join(dir, "swill.yml"), {"client" => "app.rb", "out" => "app.js",
                                             "types" => false, "framework" => false}.to_yaml)
      log = File.join(dir, "watch.log")
      pid = Process.spawn(RbConfig.ruby, File.join(ROOT, "exe/swill"), "watch", "--interval", "0.05",
                          chdir: dir, out: log, err: [:child, :out], pgroup: true)
      begin
        Timeout.timeout(20) do
          sleep 0.05 until File.read(log).include?("requires a missing file")
          File.write(File.join(dir, "extra.rb"), "class Watched < Swill::Object; property :name, type: String, default: 'recovered'; end\n")
          output = File.join(dir, "app.js")
          sleep 0.05 until File.file?(output) && File.read(output).include?("recovered")
          File.write(File.join(dir, "extra.rb"), "class Watched < Swill::Object; property :name, type: String, default: 'edited'; end\n")
          sleep 0.05 until File.read(output).include?("edited")
        end
        refute File.file?(File.join(dir, "sorbet/config")), "types: false skips type generation"
      ensure
        Process.kill("TERM", -pid)
        Process.wait(pid)
      end
    end
  end
end
