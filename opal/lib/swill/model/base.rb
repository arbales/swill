# frozen_string_literal: true

module Swill
  module Model
    # The standard client model composition. Individual concerns remain public
    # for generated or server-aligned model classes that need a smaller surface.
    class Base
      include Observable
      include Attributes
      include DirtyTracking
      include Identity
      include Relationships
      include Drafts
      include Datasets
      include Persistence
      include ObjectBindings

      class << self
        extend Declarations

        class_setting :codec

        def parse_one(payload)
          (codec || PlainJSON).parse_one(self, payload)
        end

        def parse_many(payload)
          (codec || PlainJSON).parse_many(self, payload)
        end
      end

      def initialize(attributes = nil, **keywords)
        values = attributes || keywords
        apply_attributes(values) unless values.nil? || values.empty?
      end

      def validate
        nil
      end

      def serialize(dirty_only: false)
        selected_codec.serialize(self, dirty_only: dirty_only)
      end

      private

      def selected_codec
        self.class.codec || PlainJSON
      end
    end
  end
end
