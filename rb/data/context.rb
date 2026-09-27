# frozen_string_literal: true

module Swill
  module Data
    # Authenticated state available to resolver implementations while an
    # operation is dispatched.
    class Context
      KEY = :__swill_data_context
      EFFECTS_KEY = :__swill_data_effects

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
        previous_effects = Thread.current[EFFECTS_KEY]
        Thread.current[KEY] = self
        Thread.current[EFFECTS_KEY] = []
        if defined?(Sequel::Privacy)
          Sequel::Privacy.with_cache_scope(&block)
        else
          block.call
        end
      ensure
        Thread.current[KEY] = previous
        Thread.current[EFFECTS_KEY] = previous_effects
      end

      # Effects belong to an invocation, never to the persistent connection.
      def effects
        raise "no Swill data operation is active" unless Thread.current[KEY].equal?(self)

        Thread.current[EFFECTS_KEY]
      end

      # Send authoritative fields or relationship membership with this response.
      def refresh(record, *fields)
        record_effect(:refresh, record, fields)
      end

      # Keep cached membership until an observed/accessed relationship refreshes.
      def invalidate(record, *relationships)
        record_effect(:invalidate, record, relationships)
      end

      private

      def record_effect(kind, record, fields)
        raise ArgumentError, "effects require a saved Sequel model" unless record.is_a?(Sequel::Model) && record.pk
        raise ArgumentError, "effects require at least one field" if fields.empty?

        effects << { kind: kind, model: record.class.name, id: record.pk.to_s, fields: fields.map(&:to_s).uniq }
        nil
      end
    end

    def self.context
      Context.current
    end
  end
end
