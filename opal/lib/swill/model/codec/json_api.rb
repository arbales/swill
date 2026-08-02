# frozen_string_literal: true

module Swill
  module Model
  module JSONAPI
    extend Codec
    module_function

    @type_registry = {}

    # JSON:API resource type configuration is deliberately owned by this
    # codec. Plain JSON and future transports do not need or consult it.
    module ModelClassMethods
      extend Declarations

      class_setting :json_api_type do |value|
        JSONAPI.unregister_type(@json_api_type, self) if instance_variable_defined?(:@json_api_type)
        value = value.to_s
        JSONAPI.register_type(value, self)
        value
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

      resource = { type: type, attributes: PlainJSON.serialize(model, dirty_only: dirty_only) }
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
      resources.each { |resource| hydrate_relationships(resource) }
    end

    def hydrate_relationships(resource)
      owner_type = fetch(resource, :type)
      owner_id = fetch(resource, :id)
      owner_class = class_for_type(owner_type)
      owner = owner_class&.get(owner_id)
      relationships = fetch(resource, :relationships)
      return unless owner && relationships.is_a?(Hash) && owner.class.respond_to?(:model_relationships)

      owner.class.model_relationships.each_value do |descriptor|
        linkage = fetch(relationships, descriptor.key) || fetch(relationships, descriptor.name)
        next unless linkage.is_a?(Hash) && key?(linkage, :data)

        data = fetch(linkage, :data)
        if descriptor.kind == :one
          if data.nil?
            owner.public_send("#{descriptor.name}=", nil)
          elsif data.is_a?(Hash)
            related = pooled_linkage(data, descriptor)
            owner.public_send("#{descriptor.name}=", related) if related
          end
        elsif data.is_a?(Array)
          related = data.map { |item| pooled_linkage(item, descriptor) }
          owner.public_send("#{descriptor.name}=", related) unless related.any?(&:nil?)
        end
      end
    end

    def pooled_linkage(linkage, descriptor)
      type = fetch(linkage, :type)
      id = fetch(linkage, :id)
      klass = descriptor.model_class
      return nil unless klass.respond_to?(:json_api_type) && klass.json_api_type == type.to_s

      klass.get(id)
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

    def key?(hash, key)
      Indifferent.key?(hash, key)
    end

    def fetch(hash, key)
      Indifferent.fetch(hash, key)
    end
  end

  Base.extend(JSONAPI::ModelClassMethods)
  end
end
