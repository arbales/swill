# typed: false
# frozen_string_literal: true

# A container's require lines are inert, so the one gem the host needs is
# required here, in the process that evaluates it.
require "sorbet-runtime"

module Swill
  module Ruby2JS
    # Loading the Ruby. Only one thing about a class body cannot be ported to
    # the browser 1:1: it runs at class-definition time. So it runs here, on
    # MRI, inside a container module, and the compiler reads what it declared
    # back off the defined classes. Method bodies never run; the sources only
    # have to load.
    #
    # A container is an anonymous module with a temporary name, so nothing is
    # added to the global namespace and the whole build is collectable. The
    # framework's container is built once per process; an application's
    # container includes it, resolves Swill::Controller, subclasses the same
    # class object, and keeps its own declarations.
    class Loader
      ROOT = File.expand_path("../..", __dir__)

      # The MRI host, in dependency order. A source's own require lines are
      # inert inside a container, so the order is named here.
      HOST_SOURCES = %w[
        lib/swill/runtime/declarations.rb
        lib/swill/runtime/properties.rb
        lib/swill/runtime/attributes.rb
        lib/swill/runtime.rb
      ].freeze

      PREFIX = /\bswill_build_\d+::/

      class << self
        def next_name
          @counter = (@counter || 0) + 1
          "swill_build_#{@counter}"
        end

        # Built once per process and shared by inclusion, so a watch rebuild
        # evaluates only the application's own files.
        def framework
          @framework ||= new.tap do |loader|
            FRAMEWORK_SOURCES.each { |path| loader.load_file(File.join(ROOT, path)) }
          end
        end

        # A container's classes print with its prefix; nothing outside a
        # build should ever see it.
        def strip_prefix(text)
          text.gsub(PREFIX, "")
        end
      end

      attr_reader :container

      def initialize(parent: nil)
        # Only real files are shared: a source with no file of its own is
        # this container's, whatever another container called its own.
        @evaluated = parent ? parent.evaluated.select { |path| File.file?(path) } : []
        @container = Module.new
        @container.set_temporary_name(self.class.next_name)
        # The framework's own constants, shared: an application subclasses
        # the same class objects and keeps its own declarations. They are
        # set rather than included because Ruby searches only the innermost
        # lexical scope's ancestors, and an application's classes live inside
        # its own modules.
        parent&.container&.constants&.each do |name|
          @container.const_set(name, parent.container.const_get(name, false))
        end
        # A source's require lines order the build; inside a container the
        # sources are handed over in order and the lines are inert.
        @container.define_singleton_method(:require) { |*| false }
        @container.define_singleton_method(:require_relative) { |*| false }
        return if parent
        install_dom_stubs
        HOST_SOURCES.each { |path| load_file(File.join(ROOT, path)) }
      end

      attr_reader :evaluated

      def load_file(path)
        evaluate(File.read(path), path)
      end

      # Evaluate one source in this container and answer the path the
      # evaluation used, which is the path Proc#source_location will report
      # for a block it declared. A real file is evaluated once per container,
      # so a compiler that names the framework's own sources shares the
      # framework's container instead of defining everything a second time; a
      # source with no file of its own gets a key of its own.
      def evaluate(source, path)
        key = File.expand_path(path)
        unless File.file?(key)
          @anonymous = (@anonymous || 0) + 1
          key = "#{key}:#{@anonymous}" if @anonymous > 1
        end
        return key if @evaluated.include?(key)
        @evaluated << key
        begin
          @container.module_eval(source, key, 1)
        rescue ::Exception => error # rubocop:disable Lint/RescueException
          raise CompileError, "#{location(error, key)}: #{self.class.strip_prefix(error.message.to_s)}"
        ensure
          # A failed class body leaves a sig half-declared; the next one must
          # not inherit it.
          reset_declaration_state
        end
        key
      end

      # The constant a class is installed under, in this container.
      def constant(name)
        @container.const_get(name)
      rescue ::NameError
        nil
      end

      # A mixin declares through its included hook, so what it declares is
      # read from a throwaway class that includes it.
      def probe(mod)
        base = constant("Swill::Object") || ::Object
        probe = ::Class.new(base)
        probe.include(mod)
        probe
      end

      private

        def location(error, path)
          frame = error.backtrace_locations&.find { |candidate| candidate.path == path }
          frame ? "#{path}:#{frame.lineno}" : path
        end

        def reset_declaration_state
          state = T::Private::DeclState.current
          state.reset! if state.respond_to?(:reset!)
        rescue ::StandardError
          nil
        end

        # Sigs and declarations may name a DOM class, so the browser's type
        # names must resolve. Parents first, so each stub can extend its own.
        def install_dom_stubs
          DOM::CLASSES.each_key { |name| dom_stub(name) }
        end

        def dom_stub(name)
          return @container.const_get(name, false) if @container.const_defined?(name, false)
          parent, = DOM::CLASSES.fetch(name)
          @container.const_set(name, ::Class.new(parent ? dom_stub(parent) : ::Object))
        end
    end
  end
end
