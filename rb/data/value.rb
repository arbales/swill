# frozen_string_literal: true

module Swill
  module Data
    # A typed, immutable operation result that is not a persistent model.
    class Value
      class << self
        def fields
          inherited = superclass.respond_to?(:fields) ? superclass.fields : {}
          inherited.merge(@fields || {})
        end

        def field(name, type:)
          @fields ||= {}
          key = name.to_s
          raise ArgumentError, "duplicate value field #{key}" if @fields.key?(key)
          @fields[key] = Types.normalize(type)
          attr_reader name
        end
      end

      def initialize(**attributes)
        unknown = attributes.keys.map(&:to_s) - self.class.fields.keys
        raise ArgumentError, "unknown value field #{unknown.first}" unless unknown.empty?

        self.class.fields.each_key do |name|
          raise ArgumentError, "missing value field #{name}" unless attributes.key?(name.to_sym)
          instance_variable_set("@#{name}", attributes.fetch(name.to_sym))
        end
        freeze
      end

      def to_h
        self.class.fields.to_h { |name, _type| [name, public_send(name)] }
      end
    end
  end
end
