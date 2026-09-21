# frozen_string_literal: true

module Swill
  module Data
    # Remote operations declared on authoritative server models.
    module Declarations
      def swill_data_operations
        inherited = superclass.respond_to?(:swill_data_operations) ? superclass.swill_data_operations : {}
        inherited.merge(@swill_data_operations || {})
      end

      def query(name, returns: nil, preload: [])
        declare_remote(:query, name, returns:, projection: preload)
      end

      def resolver(name, returns: nil, preload: [])
        declare_remote(:resolver, name, returns:, projection: preload)
      end

      def command(name, returns: nil, changes: [])
        declare_remote(:command, name, returns:, projection: changes)
      end

      private

      def declare_remote(kind, name, returns:, projection:)
        @swill_data_operations ||= {}
        key = name.to_s
        raise ArgumentError, "duplicate remote operation #{key}" if @swill_data_operations.key?(key)

        @swill_data_operations[key] = {
          "kind" => kind.to_s,
          "name" => key,
          "returns" => returns,
          "projection" => projection
        }
      end
    end
  end
end
