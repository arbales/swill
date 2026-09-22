# frozen_string_literal: true

module Swill
  module Data
    # Authenticated state available to resolver implementations while an
    # operation is dispatched.
    class Context
      KEY = :__swill_data_context

      attr_reader :viewer_context, :actor, :scope_token

      def initialize(viewer_context:, actor:, scope_token:)
        @viewer_context = viewer_context
        @actor = actor
        @scope_token = scope_token
      end

      def self.current
        Thread.current[KEY] || raise("no Swill data operation is active")
      end

      def use(&block)
        previous = Thread.current[KEY]
        Thread.current[KEY] = self
        Sequel::Privacy.with_cache_scope(&block)
      ensure
        Thread.current[KEY] = previous
      end
    end

    def self.context
      Context.current
    end
  end
end
