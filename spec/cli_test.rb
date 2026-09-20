require "minitest/autorun"
require "open3"
require "tmpdir"
require "fileutils"
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
end
