require "minitest/autorun"
require "json"
require "open3"
require "socket"
require "tmpdir"
require "fileutils"
require "timeout"
require "yaml"

# `swill dev` against a project whose "server" is a few lines of plain Ruby:
# it answers the development endpoint from the revision file and records its
# pid, so a restart shows as a new pid.
class DevTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)

  SERVER = <<~RUBY
    require "socket"
    File.write("server.pid", Process.pid.to_s)
    server = TCPServer.new("0.0.0.0", Integer(ENV.fetch("PORT")))
    loop do
      client = server.accept
      client.gets
      body = File.exist?(ENV["SWILL_DEVELOPMENT_STATE"]) ? File.read(ENV["SWILL_DEVELOPMENT_STATE"]) : '{"ready":false}'
      client.write("HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nContent-Length: \#{body.bytesize}\\r\\nConnection: close\\r\\n\\r\\n\#{body}")
      client.close
    end
  RUBY

  def free_port
    server = TCPServer.new("127.0.0.1", 0)
    server.addr[1]
  ensure
    server&.close
  end

  def project(dir)
    FileUtils.mkdir_p(File.join(dir, "client"))
    FileUtils.mkdir_p(File.join(dir, "pages"))
    File.write(File.join(dir, "client/app.rb"), "require_relative 'note'\n")
    File.write(File.join(dir, "client/note.rb"), "class Note < Swill::Object; property :text, type: String, default: 'one'; end\n")
    File.write(File.join(dir, "pages/index.html"), "<p>one</p>\n")
    File.write(File.join(dir, "server.rb"), SERVER)
    File.write(File.join(dir, "swill.yml"), {
      "client" => "client/app.rb", "out" => "public/app.js", "types" => false, "framework" => false,
      "watch" => {"client" => ["client/**/*.rb"], "server" => ["server.rb"], "pages" => ["pages/**/*"]},
      "dev" => {"port" => free_port, "server" => [RbConfig.ruby, "server.rb"], "state" => "tmp/state.json"}
    }.to_yaml)
    dir
  end

  def state(dir)
    JSON.parse(File.read(File.join(dir, "tmp/state.json")))
  rescue Errno::ENOENT, JSON::ParserError
    {}
  end

  def server_pid(dir)
    Integer(File.read(File.join(dir, "server.pid")))
  rescue Errno::ENOENT, ArgumentError
    nil
  end

  def alive?(pid)
    Process.kill(0, pid)
    true
  rescue Errno::ESRCH
    false
  end

  def wait_until(seconds = 30)
    Timeout.timeout(seconds) { sleep 0.05 until yield }
  end

  def test_once_builds_serves_publishes_and_stops
    Dir.mktmpdir do |dir|
      project(dir)
      output, status = Timeout.timeout(60) do
        Open3.capture2e(RbConfig.ruby, File.join(ROOT, "exe/swill"), "dev", "--once", chdir: dir)
      end
      assert status.success?, output
      assert_includes output, "swill: ready at http://localhost:"
      assert_equal true, state(dir)["ready"]
      refute_nil state(dir)["revision"]
      assert_includes File.read(File.join(dir, "public/app.js")), "one"
      pid = server_pid(dir)
      refute_nil pid, "the server ran"
      refute alive?(pid), "and was stopped on exit"
    end
  end

  def test_edits_rebuild_what_they_affect_and_publish_a_new_revision
    Dir.mktmpdir do |dir|
      project(dir)
      log = File.join(dir, "dev.log")
      pid = Process.spawn(RbConfig.ruby, File.join(ROOT, "exe/swill"), "dev", "--interval", "0.05",
                          chdir: dir, out: log, err: [:child, :out], pgroup: true)
      begin
        wait_until(60) { state(dir)["ready"] }
        first = state(dir)["revision"]
        server = server_pid(dir)

        File.write(File.join(dir, "client/note.rb"), "class Note < Swill::Object; property :text, type: String, default: 'two'; end\n")
        wait_until { state(dir)["ready"] && state(dir)["revision"] != first }
        assert_includes File.read(File.join(dir, "public/app.js")), "two", "a client edit rebuilds the client"
        assert_equal server, server_pid(dir), "and leaves the server running"

        second = state(dir)["revision"]
        File.write(File.join(dir, "pages/index.html"), "<p>two</p>\n")
        wait_until { state(dir)["ready"] && state(dir)["revision"] != second }
        assert_equal server, server_pid(dir), "a page edit only republishes"

        third = state(dir)["revision"]
        File.write(File.join(dir, "server.rb"), "#{SERVER}# edited\n")
        wait_until { state(dir)["ready"] && state(dir)["revision"] != third }
        refute_equal server, server_pid(dir), "a server edit restarts the server"
        refute alive?(server)

        fourth = state(dir)["revision"]
        File.write(File.join(dir, "client/app.rb"), "require_relative 'missing'\n")
        wait_until { File.read(log).include?("requires a missing file") }
        wait_until { File.read(File.join(dir, "public/app.js")).include?("reportBuildFailure") }
        assert_equal false, state(dir)["ready"], "a failed build leaves the revision unready"
        assert_equal fourth, state(dir)["revision"]

        File.write(File.join(dir, "client/app.rb"), "require_relative 'note'\n")
        wait_until { state(dir)["ready"] && state(dir)["revision"] != fourth }
      ensure
        Process.kill("TERM", -pid)
        Process.wait(pid)
      end
      wait_until(10) { !alive?(server_pid(dir)) }
    end
  end

  def test_an_asset_step_in_another_directory_runs_in_that_bundle_alone
    require_relative "../rb/compiler/compiler"
    require_relative "../rb/compiler/project"
    Dir.mktmpdir do |dir|
      sibling = File.join(dir, "sibling")
      FileUtils.mkdir_p(sibling)
      File.write(File.join(sibling, "Gemfile"), "source \"https://rubygems.org\"\n")
      app = File.join(dir, "app")
      FileUtils.mkdir_p(app)
      probe = [RbConfig.ruby, "-e", 'puts "gemfile=#{ENV["BUNDLE_GEMFILE"]} lockfile=#{ENV["BUNDLE_LOCKFILE"].inspect}"']
      File.write(File.join(app, "swill.yml"), {"client" => "app.rb", "types" => false,
                                             "assets" => [{"watch" => ["x"], "run" => probe, "chdir" => "../sibling"}]}.to_yaml)
      project = Swill::Ruby2JS::Project.new(File.join(app, "swill.yml"))
      parent = {"BUNDLE_GEMFILE" => File.join(app, "Gemfile"), "BUNDLE_LOCKFILE" => File.join(app, "Gemfile.lock")}
      output, = capture_io do
        previous = parent.to_h { |key, _| [key, ENV[key]] }
        begin
          ENV.update(parent)
          project.run(only: %i[assets])
        ensure
          previous.each { |key, value| value ? ENV[key] = value : ENV.delete(key) }
        end
      end
      assert_includes output, "gemfile=#{File.join(sibling, 'Gemfile')}"
      assert_includes output, "lockfile=nil", "the project's lockfile must not reach the sibling's bundle"
    end
  end

  def test_a_busy_port_is_reported
    Dir.mktmpdir do |dir|
      project(dir)
      port = YAML.safe_load_file(File.join(dir, "swill.yml"))["dev"]["port"]
      blocker = TCPServer.new("0.0.0.0", port)
      begin
        output, status = Timeout.timeout(30) do
          Open3.capture2e(RbConfig.ruby, File.join(ROOT, "exe/swill"), "dev", "--once", chdir: dir)
        end
        refute status.success?
        assert_includes output, "is already in use"
      ensure
        blocker.close
      end
    end
  end
end
