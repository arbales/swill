# frozen_string_literal: true

module Swill
  module Model
    module Relationships
      Descriptor = Struct.new(:name, :key, :kind, :type, :url, keyword_init: true) do
        # A lambda defers constant resolution for forward references; classes
        # do not respond to call, so no further guard is needed.
        def model_class
          type.respond_to?(:call) ? type.call : type
        end

        def url_for(owner)
          url.respond_to?(:call) ? url.call(owner) : url
        end
      end

      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Declarations

        inheritable_registry :model_relationships

        def has_one(name, key: name, type:, url: nil)
          define_relationship(name, key: key, type: type, url: url, kind: :one, default: nil)
        end

        def has_many(name, key: name, type:, url: nil)
          define_relationship(name, key: key, type: type, url: url, kind: :many, default: -> { [] })
        end

        private

        def define_relationship(name, key:, type:, url:, kind:, default:)
          name = name.to_sym
          model_relationships[name] = Descriptor.new(name: name, key: key.to_sym, kind: kind, type: type, url: url)
          property(name, default: default)
          property("#{name}_loading".to_sym, default: false)

          # Lazy loading wraps the generated property accessors via a
          # prepended module, so `super` reaches the observable accessor.
          relationship_accessors.define_method(name) do
            value = super()
            if id && !relationship_loaded?(name) && !public_send("#{name}_loading")
              load_relationship(name).fail do |error|
                warn("[Swill] #{self.class}.#{name} load failed: #{error.message}")
                nil
              end
            end
            value
          end
          relationship_accessors.define_method("#{name}=") do |value|
            super(value)
            mark_relationship_loaded(name)
            value
          ensure
            public_send("#{name}_loading=", false)
          end
          define_method("reload_#{name}") { |wire: Wire| load_relationship(name, reload: true, wire: wire) }
        end

        def relationship_accessors
          @relationship_accessors ||= Module.new.tap { |accessors| prepend accessors }
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
