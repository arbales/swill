# frozen_string_literal: true

module Swill
  module Model
    module Relationships
      Descriptor = Struct.new(:name, :key, :kind, :type, :url, keyword_init: true) do
        def model_class
          type.respond_to?(:call) && !type.is_a?(Class) ? type.call : type
        end

        def url_for(owner)
          url.respond_to?(:call) ? url.call(owner) : url
        end
      end

      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        def has_one(name, key: name, type:, url: nil)
          define_relationship(name, key: key, type: type, url: url, kind: :one, default: nil)
        end

        def has_many(name, key: name, type:, url: nil)
          define_relationship(name, key: key, type: type, url: url, kind: :many, default: -> { [] })
        end

        def model_relationships
          inherited = superclass.respond_to?(:model_relationships) ? superclass.model_relationships : {}
          inherited.merge(own_model_relationships)
        end

        private

        def own_model_relationships
          @own_model_relationships ||= {}
        end

        def define_relationship(name, key:, type:, url:, kind:, default:)
          name = name.to_sym
          own_model_relationships[name] = Descriptor.new(name: name, key: key.to_sym, kind: kind, type: type, url: url)
          property(name, default: default)
          property("#{name}_loading".to_sym, default: false)

          base_reader = instance_method(name)
          base_writer = instance_method("#{name}=")
          define_method(name) do
            value = base_reader.bind_call(self)
            if id && !relationship_loaded?(name) && !public_send("#{name}_loading")
              load_relationship(name).fail do |error|
                warn("[Swill] #{self.class}.#{name} load failed: #{error.message}")
                nil
              end
            end
            value
          end
          define_method("#{name}=") do |value|
            base_writer.bind_call(self, value)
            mark_relationship_loaded(name)
            value
          ensure
            public_send("#{name}_loading=", false)
          end
          define_method("reload_#{name}") { |wire: Wire| load_relationship(name, reload: true, wire: wire) }
        end
      end

      def relationship_loaded?(name)
        loaded_relationships.include?(name.to_sym)
      end

      def mark_relationship_loaded(name)
        loaded_relationships << name.to_sym unless relationship_loaded?(name)
      end

      def load_relationship(name, reload: false, wire: Wire)
        descriptor = self.class.model_relationships[name.to_sym]
        raise ArgumentError, "#{self.class}.#{name} is not a relationship" unless descriptor
        return wire.resolved(KeyPath.step(self, name.to_s)) if relationship_loaded?(name) && !reload

        url = descriptor.url_for(self)
        raise ArgumentError, "#{self.class}.#{name} has no relationship URL" if url.nil? || url.to_s.empty?

        public_send("#{name}_loading=", true)
        wire.get_json(url).then do |payload|
          value = if descriptor.kind == :many
                    descriptor.model_class.parse_many(payload)
                  else
                    descriptor.model_class.parse_one(payload)
                  end
          public_send("#{name}=", value)
          value
        end.fail do |error|
          public_send("#{name}_loading=", false)
          raise error
        end
      end

      private

      def loaded_relationships
        @loaded_relationships ||= []
      end
    end
  end
end
