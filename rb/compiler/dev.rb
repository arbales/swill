# frozen_string_literal: true

require "json"
require "net/http"
require "socket"
require "uri"
require_relative "project"
require_relative "build"
require_relative "../swill/development"

module Swill
  module Ruby2JS
    # `swill dev`: builds a project, runs its server, and rebuilds what an
    # edit affects, publishing a revision the page's development monitor
    # offers to reload. Watching polls file times and sizes, with no native
    # dependency.
    #
    # Each watch category runs its own steps: `client` and `resources` the
    # client build and types; `schema` data generation, then the client build
    # when the generated proxies changed, then a server restart; `server` a
    # restart. Any other category, such as an application's views, only
    # republishes. An `assets` entry runs its own command. The installed
    # framework bundle is always watched, and recopied with the client build
    # when it changes. A project whose `watch` is a plain list has one
    # category, and any change runs everything.
    class Dev
      COALESCE = 0.15
      READY_TIMEOUT = 30
      FRAMEWORK = "framework"
      CONFIG = "swill.yml"

      def initialize(path, port: nil, server: true, once: false, interval: 0.3)
        @path = path
        @project = Project.new(path)
        @interval = interval
        @once = once
        settings = @project.dev
        @server_command = server ? settings["server"] : false
        @port = Integer(port || ENV["PORT"] || settings["port"])
        @state = File.expand_path(settings["state"], @project.directory)
        @revision = Swill::Development::Revision.new(@state)
        @server_pid = nil
        @stopping = false
      end

      # Builds, serves, and watches until interrupted; with `once`, returns
      # after the first cycle: true when it succeeded.
      def start
        $stdout.sync = true
        %w[INT TERM].each { |signal| Signal.trap(signal) { @stopping = true } }
        check_port if @server_command
        previous = snapshot
        ok = cycle(previous.keys, first: true)
        return ok if @once
        puts "swill: watching #{@project.path} (Ctrl-C to stop)"
        until @stopping
          sleep @interval
          check_server
          current = snapshot
          next if current == previous
          sleep COALESCE
          current = snapshot
          changed = current.keys.select { |key| current[key] != previous[key] }
          previous = current
          cycle(changed)
        end
        true
      ensure
        stop_server
      end

      # The categories that changed, their steps run once each, the server
      # restarted when it must be, and the revision published when all of it
      # succeeded. A failure leaves the revision unready until the next edit.
      def cycle(changed, first: false)
        @revision.building!
        puts "swill: changed #{changed.join(', ')}" unless first
        # An edited swill.yml is read again, and rebuilds everything.
        @project = Project.new(@path) if changed.include?(CONFIG)
        everything = first || changed.include?("all") || changed.include?(CONFIG)
        assets = changed.filter_map { |key| key.delete_prefix("assets:").to_i if key.start_with?("assets:") }
        restart = everything || changed.include?("schema") || changed.include?("server") || !@server_pid
        client = everything || (changed & %w[client resources] + [FRAMEWORK]).any?
        @project.run(only: everything ? %i[before_build assets] : %i[assets], assets: everything ? nil : assets) \
          if everything || assets.any?
        if everything || changed.include?("schema")
          before = @project.generated_digest
          @project.run(only: %i[data])
          client ||= @project.generated_digest != before
        end
        @project.run(only: %i[client], show_errors: true) if client
        types if client
        if restart && @server_command
          stop_server
          start_server
        end
        @revision.publish!
        puts "swill: ready#{" at http://localhost:#{@port}" if @server_command}"
        true
      rescue CompileError => error
        warn "swill: #{error.message}"
        warn "swill: waiting for an edit" unless @once
        false
      end

      private

      # Each category's files with their times and sizes, the `assets`
      # entries as `assets:<index>`, and the installed framework bundle.
      def snapshot
        groups = @project.categories.transform_values { |globs| @project.files(globs) }
        @project.asset_entries.each_with_index { |entry, index| groups["assets:#{index}"] = @project.files(entry["watch"]) }
        groups[FRAMEWORK] = framework_files
        groups[CONFIG] = [@project.path]
        groups.transform_values { |files| files.to_h { |file| [file, stamp(file)] } }
      end

      def stamp(file)
        stat = File.stat(file)
        [stat.mtime.to_f, stat.size]
      rescue SystemCallError
        nil
      end

      def framework_files
        bundle = Build.framework_bundle
        [bundle, "#{bundle}.map", *Dir.glob(File.join(File.dirname(bundle), "resources/swill/**/*"))]
          .select { |file| File.file?(file) }
      end

      # A types failure is reported, not fatal: the page still runs.
      def types
        @project.run(only: %i[types])
      rescue CompileError => error
        warn "swill: #{error.message}"
      end

      # ---- the server ----

      def bind
        ENV.fetch("BIND", "http://0.0.0.0:#{@port}")
      end

      def check_port
        uri = URI.parse(bind)
        TCPServer.new(uri.host, uri.port).close
      rescue Errno::EADDRINUSE
        raise CompileError, "#{bind} is already in use; stop the other server or choose another port (--port)"
      end

      def server_argv
        bundled = File.file?(File.join(@project.directory, "Gemfile")) ? %w[bundle exec] : []
        case @server_command
        when Array then @server_command
        when "falcon" then falcon(bundled)
        when "rackup" then rackup(bundled)
        else falcon_available? ? falcon(bundled) : rackup(bundled)
        end
      end

      def falcon(bundled)
        [*bundled, "falcon", "serve", "--threaded", "--count", "1", "--no-restart", "--bind", bind, "--config", "config.ru"]
      end

      def rackup(bundled)
        uri = URI.parse(bind)
        [*bundled, "rackup", "--host", uri.host, "--port", uri.port.to_s, "config.ru"]
      end

      def falcon_available?
        !Gem::Specification.find_all_by_name("falcon").empty?
      end

      def start_server
        argv = server_argv
        puts "swill: #{argv.join(' ')}"
        environment = {"RACK_ENV" => "development", "SWILL_DEVELOPMENT_STATE" => @state, "PORT" => @port.to_s}
        @server_pid = Process.spawn(environment, *argv, chdir: @project.directory, pgroup: true)
        wait_for_server
      rescue SystemCallError => error
        stop_server
        raise CompileError, "server: #{error.message}"
      rescue CompileError
        stop_server
        raise
      end

      # Process creation is not readiness: waits for the server to answer the
      # development endpoint.
      def wait_for_server
        uri = URI.parse(bind)
        uri.host = "127.0.0.1" if uri.host == "0.0.0.0"
        uri.path = Swill::Development::ENDPOINT
        deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + READY_TIMEOUT
        loop do
          raise CompileError, "server startup interrupted" if @stopping
          check_server
          raise CompileError, "the server exited before it was ready" unless @server_pid
          begin
            response = Net::HTTP.start(uri.host, uri.port, open_timeout: 1, read_timeout: 1) { |http| http.get(uri.request_uri) }
            return if response.code == "200" && JSON.parse(response.body).key?("ready")
          rescue SystemCallError, IOError, Timeout::Error, JSON::ParserError
            nil
          end
          if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
            raise CompileError, "the server did not answer #{uri} within #{READY_TIMEOUT}s; " \
                                "does config.ru mount the development middleware?"
          end
          sleep 0.1
        end
      end

      def check_server
        return unless @server_pid
        result = Process.waitpid2(@server_pid, Process::WNOHANG)
        return unless result
        @server_pid = nil
        @revision.building!
        warn "swill: the server exited (#{result.last.exitstatus}); fix the error and edit a file to retry"
      end

      # Stops the server's own process group: TERM, then KILL after five
      # seconds.
      def stop_server
        return unless @server_pid
        Process.kill("TERM", -@server_pid)
        50.times do
          return if Process.waitpid(@server_pid, Process::WNOHANG)
          sleep 0.1
        end
        Process.kill("KILL", -@server_pid)
        Process.waitpid(@server_pid)
      rescue Errno::ESRCH, Errno::ECHILD
        nil
      ensure
        @server_pid = nil
      end
    end
  end
end
