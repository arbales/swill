# frozen_string_literal: true

module Swill
  module Data
    # One policy cache per concurrent operation. The viewer context remains
    # connection-scoped; only evaluation results have operation scope.
    module PrivacyScope
      CACHE_KEY = :__swill_privacy_cache
      MATCHES_KEY = :__swill_privacy_single_matches

      module_function

      def install!
        return unless defined?(Sequel::Privacy)

        singleton = Sequel::Privacy.singleton_class
        singleton.prepend(Overrides) unless singleton < Overrides
      end

      def use
        install!
        previous_cache = Thread.current[CACHE_KEY]
        previous_matches = Thread.current[MATCHES_KEY]
        Thread.current[CACHE_KEY] = {}
        Thread.current[MATCHES_KEY] = {}
        yield
      ensure
        Thread.current[CACHE_KEY] = previous_cache
        Thread.current[MATCHES_KEY] = previous_matches
      end

      module Overrides
        def cache
          Thread.current[PrivacyScope::CACHE_KEY] || super
        end

        def single_matches
          Thread.current[PrivacyScope::MATCHES_KEY] || super
        end

        def clear_cache!
          if Thread.current[PrivacyScope::CACHE_KEY]
            Thread.current[PrivacyScope::CACHE_KEY] = {}
            Thread.current[PrivacyScope::MATCHES_KEY] = {}
          else
            super
          end
        end
      end
    end
  end
end
