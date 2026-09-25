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
      assert_includes stdout, "wrote 10 data files"

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
        Swill::Data.install(Sequel::Model)
        module ProjectFixture
          DB = Sequel.mock
          class Note < Sequel::Model(DB[:notes])
            def_column_accessor :id, :title, :body
            client_model fields: {id: String, title: String}
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
      File.write(File.join(dir, "server.rb"), server.sub("title: String}", "title: String, body: String}"))
      refute_equal stamps, project.snapshot
      _stdout, stderr, status = swill("build", "--project", config)
      assert status.success?, stderr
      assert_includes File.read(generated), "attribute :body"
      File.write(File.join(dir, "client/new.rb"), "# newly added source\n")
      assert project.snapshot.any? { |file, _| file.end_with?("client/new.rb") }
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
        schema = Swill::Data::Schema.new([Notes::Note])
        dispatcher = Swill::Data::Dispatcher.new(schema: schema, viewer_context: nil, actor: nil, scope_token: "test")
        dispatcher.call("type" => "HELLO", "protocol_version" => 1, "schema_hash" => schema.hash)
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
