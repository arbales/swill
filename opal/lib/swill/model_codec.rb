# frozen_string_literal: true

module Swill
  module Model
    module Codec
      def parse_one(_model_class, _payload)
        raise NotImplementedError
      end

      def parse_many(_model_class, _payload)
        raise NotImplementedError
      end

      def serialize(_model, dirty_only: false)
        raise NotImplementedError
      end
    end

    module PlainJSON
      extend Codec
      module_function

    def parse_one(model_class, payload)
      return nil if payload.nil?
      raise ArgumentError, "expected plain JSON object" unless payload.is_a?(Hash)

      id = payload[:id] || payload["id"]
      instance = id.nil? ? model_class.new : (model_class.get(id) || model_class.new)
      instance.id = id unless id.nil?
      instance.apply_attributes(payload)
      model_class.put(instance) unless instance.id.nil?
      instance
    end

    def parse_many(model_class, payload)
      raise ArgumentError, "expected plain JSON array" unless payload.is_a?(Array)

      payload.map { |item| parse_one(model_class, item) }.compact
    end

    def serialize(model, dirty_only: false)
      selected = dirty_only ? model.dirty : nil
      model.class.model_attributes.each_with_object({}) do |(name, descriptor), result|
        result[descriptor.key] = model.public_send(name) if selected.nil? || selected.include?(name)
      end
    end
    end
  end
end
