# frozen_string_literal: true

module Swill
  module Model
  module JSONAPI
    extend Codec
    module_function

    TYPE_UNSET = Object.new
    private_constant :TYPE_UNSET

    @type_registry = {}

    # JSON:API resource type configuration is deliberately owned by this
    # codec. Plain JSON and future transports do not need or consult it.
    module ModelClassMethods
      def json_api_type(value = TYPE_UNSET)
        if value.equal?(TYPE_UNSET)
          return @json_api_type if instance_variable_defined?(:@json_api_type)
          return superclass.json_api_type if superclass.respond_to?(:json_api_type)

          return nil
        end

        JSONAPI.unregister_type(@json_api_type, self) if instance_variable_defined?(:@json_api_type)
        @json_api_type = value.to_s
        JSONAPI.register_type(@json_api_type, self)
      end
    end

    def register_type(type, klass)
      @type_registry[type] = klass
    end

    def unregister_type(type, klass)
      @type_registry.delete(type) if @type_registry[type] == klass
    end

    def class_for_type(type)
      @type_registry[type.to_s]
    end

    def parse_one(model_class, payload)
      document = validate_document(payload)
      data = fetch(document, :data)
      raise ArgumentError, "expected single JSON:API resource" if data.is_a?(Array)
      return nil if data.nil?

      pool_document(document)
      fetch_pooled(data, expected: model_class)
    end

    def parse_many(model_class, payload)
      document = validate_document(payload)
      data = fetch(document, :data)
      raise ArgumentError, "expected JSON:API collection" unless data.is_a?(Array)

      pool_document(document)
      data.map { |resource| fetch_pooled(resource, expected: model_class) }
    end

    def serialize(model, dirty_only: false)
      type = model.class.json_api_type
      raise ArgumentError, "#{model.class} has no json_api_type" if type.nil? || type.empty?

      resource = { type: type, attributes: serialize_attributes(model, dirty_only) }
      resource[:id] = model.id unless model.id.nil?
      { data: resource }
    end

    def validate_document(payload)
      raise ArgumentError, "expected JSON:API document" unless payload.is_a?(Hash) && key?(payload, :data)

      included = fetch(payload, :included)
      raise ArgumentError, "JSON:API included must be an array" unless included.nil? || included.is_a?(Array)
      payload
    end

    def pool_document(document)
      included = fetch(document, :included) || []
      data = fetch(document, :data)
      resources = included + (data.nil? ? [] : (data.is_a?(Array) ? data : [data]))
      resources.each { |resource| pool_resource(resource) }
    end

    def pool_resource(resource)
      raise ArgumentError, "expected JSON:API resource object" unless resource.is_a?(Hash)

      type = fetch(resource, :type)
      id = fetch(resource, :id)
      raise ArgumentError, "JSON:API resource missing type" unless type.is_a?(String) && !type.empty?
      raise ArgumentError, "JSON:API resource missing id" if id.nil?

      klass = class_for_type(type)
      raise ArgumentError, "unknown JSON:API type #{type.inspect}" unless klass

      attributes = fetch(resource, :attributes)
      raise ArgumentError, "JSON:API attributes must be an object" unless attributes.nil? || attributes.is_a?(Hash)

      instance = klass.get(id) || klass.new
      instance.id = id
      instance.apply_attributes(attributes) if attributes
      klass.put(instance)
    end

    def fetch_pooled(resource, expected:)
      type = fetch(resource, :type)
      id = fetch(resource, :id)
      klass = class_for_type(type)
      raise ArgumentError, "resource type #{type.inspect} does not match #{expected}" unless klass == expected

      klass.get(id) || raise(ArgumentError, "resource was not pooled")
    end

    def serialize_attributes(model, dirty_only)
      selected = dirty_only ? model.dirty : nil
      model.class.model_attributes.each_with_object({}) do |(name, descriptor), result|
        result[descriptor.key] = model.public_send(name) if selected.nil? || selected.include?(name)
      end
    end

    def key?(hash, key)
      hash.key?(key) || hash.key?(key.to_s)
    end

    def fetch(hash, key)
      hash.key?(key) ? hash[key] : hash[key.to_s]
    end
  end

  Base.extend(JSONAPI::ModelClassMethods)
  end
end
