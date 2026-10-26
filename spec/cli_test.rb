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

  # An application typechecks itself without the framework checkout on its
  # own terms: the artifacts land beside its entry, and the config names its
  # own sources, the framework's, and the generated RBIs.
  def test_types_writes_sorbet_artifacts_a_consumer_can_check_against
    Dir.mktmpdir do |dir|
      FileUtils.cp_r(File.join(ROOT, "spec/fixtures/cli_app"), File.join(dir, "app"))
      stdout, stderr, status = swill("types", File.join(dir, "app"))
      assert status.success?, stderr
      assert_match(/wrote 6 Sorbet files/, stdout)
      sorbet = File.join(dir, "app", "sorbet")
      %w[rbi/swill.rbi rbi/swill-dom.rbi rbi/swill-runtime.rbi rbi/application.rbi
         checks/declarations.rb config].each do |name|
        assert File.file?(File.join(sorbet, name)), "#{name} was written"
      end
      assert_includes File.read(File.join(sorbet, "rbi/application.rbi")), "Fixture::Note"
      assert_includes File.read(File.join(sorbet, "rbi/swill.rbi")), "Swill::Controller"
      assert_includes File.read(File.join(sorbet, "rbi/swill-dom.rbi")), "class Element"
      config = File.read(File.join(sorbet, "config"))
      assert_includes config, "app.rb", "the application's own sources are checked"
      assert_includes config, "rb/framework/core/controller.rb", "so is the framework's Ruby"
      assert_includes config, "--dir=sorbet/rbi"
      assert_includes config, "--enable-experimental-requires-ancestor"
      refute_includes config, "rb/runtime/", "the MRI host is described by swill-runtime.rbi instead"
      # An existing config is the consumer's; it is not overwritten.
      File.write(File.join(sorbet, "config"), "--dir=.\n")
      _stdout, stderr, status = swill("types", File.join(dir, "app"))
      assert status.success?, stderr
      assert_equal "--dir=.\n", File.read(File.join(sorbet, "config"))
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
      assert File.file?(File.join(dir, "client/sorbet/rbi/application.rbi"))
      project = Swill::Ruby2JS::Project.new(config)
      stamps = project.snapshot
      generated = File.join(dir, "client/models/generated/project_fixture/note.rb")
      File.write(generated, "stale")
      assert_equal stamps, project.snapshot, "generated files must not trigger a rebuild loop"
      File.write(File.join(dir, "server.rb"), server.sub("title: String", "title: String, body: String"))
      refute_equal stamps, project.snapshot
      _stdout, stderr, status = swill("build", "--project", config)
      assert status.success?, stderr
      assert_includes File.read(generated), "attribute :body"
      File.write(File.join(dir, "client/new.rb"), "# newly added source\n")
      assert project.snapshot.any? { |file, _| file.end_with?("client/new.rb") }
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
