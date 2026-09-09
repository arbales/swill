# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Baseline-aware attribute mutation tracking. dirty_attributes and dirty?
    # are observable properties, so bindings follow them. A value that returns
    # to its baseline is clean again, and codec or draft application is clean.
    module DirtyTracking
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base)
        base.property :dirty_attributes, type: T::Array[T.untyped], default: []
        base.property :dirty?, type: T::Boolean do
          !dirty_attributes.empty?
        end
      end

      sig { returns(T::Array[T.untyped]) }
      def dirty
        dirty_attributes.dup # Pragma: array
      end

      sig { returns(T.untyped) }
      def mark_clean!
        @dirty_baseline = {}
        self.dirty_attributes = []
        self
      end

      # Server, codec, and draft application is clean; only user mutation
      # through setters marks attributes dirty.
      sig { params(source: T.untyped).returns(T.untyped) }
      def apply_attributes(source)
        @dirty_suspensions = (@dirty_suspensions || 0) + 1
        begin
          super(source)
        ensure
          @dirty_suspensions = @dirty_suspensions - 1
        end
        self
      end

      sig { params(name: T.any(Symbol, String), previous: T.untyped, value: T.untyped).void }
      def property_will_change(name, previous, value)
        super(name, previous, value)
        return if (@dirty_suspensions || 0) > 0
        return unless Swill::Runtime.isAttribute(self, name)
        mark_attribute_dirty(name, previous, value)
      end

      sig { params(name: T.any(Symbol, String), previous: T.untyped, value: T.untyped).void }
      def mark_attribute_dirty(name, previous, value)
        baseline = (@dirty_baseline ||= {})
        names = dirty_attributes
        if names.include?(name)
          self.dirty_attributes = names.select { |candidate| candidate != name } if baseline[name] == value
        else
          baseline[name] = previous
          self.dirty_attributes = [*names, name]
        end
      end
    end
  end
end
