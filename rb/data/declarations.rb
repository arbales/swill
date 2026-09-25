# frozen_string_literal: true

module Swill
  module Data
    # Client schema and data operations declared on authoritative models.
    module Declarations
      def swill_client_model
        return @swill_client_model if instance_variable_defined?(:@swill_client_model)
        superclass.respond_to?(:swill_client_model) ? superclass.swill_client_model : nil
      end

      def client_model(fields:, relationships: [], writable: [])
        raise ArgumentError, "duplicate client_model declaration" if instance_variable_defined?(:@swill_client_model)

        names = fields.is_a?(Hash) ? fields.keys : Array(fields)
        types = fields.is_a?(Hash) ? fields.to_h { |name, type| [name.to_s, Types.normalize(type)] } : {}
        @swill_client_model = {
          "fields" => names.map(&:to_s),
          "field_types" => types,
          "relationships" => Array(relationships).map(&:to_s),
          "writable" => Array(writable).map(&:to_s)
        }
      end

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

      def command(name, on: :instance, returns: nil, changes: [], preload: [], transaction: true)
        raise ArgumentError, "command on: must be :instance or :class" unless %i[instance class].include?(on)
        if on == :class && !changes.empty?
          raise ArgumentError, "class commands have no receiver fields; use preload: for their return value"
        end
        declare_remote(:command, name, returns:, projection: preload,
                       target: on, transaction: transaction, changes:)
      end

      private

      def declare_remote(kind, name, returns:, projection:, target: nil, transaction: nil, changes: nil)
        @swill_data_operations ||= {}
        key = name.to_s
        raise ArgumentError, "duplicate data operation #{key}" if @swill_data_operations.key?(key)

        @swill_data_operations[key] = {
          "kind" => kind.to_s,
          "name" => key,
          "returns" => returns,
          "projection" => projection,
          **(target ? {"target" => target.to_s} : {}),
          **(changes ? {"changes" => changes} : {}),
          **(!transaction.nil? ? {"transaction" => transaction} : {})
        }
      end
    end
  end
end
