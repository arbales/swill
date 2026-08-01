# frozen_string_literal: true

module Swill
  module Restoration
    Declaration = Struct.new(:path, :key, :codec, keyword_init: true)

    module Codecs
      module String
        module_function

        def encode(value) = value.nil? ? nil : value.to_s
        def decode(value) = value.to_s
      end

      module Integer
        module_function

        def encode(value) = value.nil? ? nil : value.to_i.to_s
        def decode(value) = Kernel.Integer(value, 10)
      end

      module Boolean
        module_function

        def encode(value) = value.nil? ? nil : (value ? "true" : "false")

        def decode(value)
          return true if %w[true 1].include?(value.to_s)
          return false if %w[false 0].include?(value.to_s)

          raise ArgumentError, "expected true, false, 1, or 0"
        end
      end
    end

    # A small keyed coder. Storage backends provide string values; codecs own
    # the boundary conversion so controller state stays ordinary Ruby.
    class Coder
      def initialize(values = {})
        @values = values.transform_keys(&:to_s)
        @encoded = {}
      end

      attr_reader :encoded

      def include?(key)
        @values.key?(key.to_s)
      end

      def decode(key, codec: Codecs::String)
        return nil unless include?(key)

        codec.decode(@values[key.to_s])
      end

      def encode(value, key:, codec: Codecs::String)
        @encoded[key.to_s] = codec.encode(value)
      end
    end

    module ControllerState
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        def restorable_state(path, key: nil, codec: Codecs::String)
          path = path.to_s
          own_restorable_state << Declaration.new(
            path: path,
            key: (key || path).to_s,
            codec: codec
          )
        end

        def restorable_state_declarations
          inherited = superclass.respond_to?(:restorable_state_declarations) ? superclass.restorable_state_declarations : []
          inherited + own_restorable_state
        end

        private

        def own_restorable_state
          @own_restorable_state ||= []
        end
      end

      def restore_state(coder)
        self.class.restorable_state_declarations.each do |declaration|
          next unless coder.include?(declaration.key)

          begin
            value = coder.decode(declaration.key, codec: declaration.codec)
            KeyPath.write!(self, declaration.path.split("."), value)
          rescue StandardError => error
            warn("[Swill] could not restore #{declaration.key.inspect}: #{error.message}")
          end
        end
      end

      def encode_restorable_state(coder)
        self.class.restorable_state_declarations.each do |declaration|
          value = KeyPath.read(self, declaration.path.split("."))
          coder.encode(value, key: declaration.key, codec: declaration.codec)
        end
      end

      def invalidate_restorable_state
        application&.__send__(:invalidate_restorable_state, self)
      end
    end
  end
end
