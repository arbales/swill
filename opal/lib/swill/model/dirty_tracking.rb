# frozen_string_literal: true

module Swill
  module Model
    # Baseline-aware attribute mutation tracking. Attribute equality follows
    # Ruby == semantics and clean application can temporarily suspend tracking.
    module DirtyTracking
      def dirty
        Computation.record(self, :dirty)
        dirty_attributes.dup
      end

      def dirty?
        Computation.record(self, :dirty?)
        !dirty_attributes.empty?
      end

      def mark_clean!
        previous_dirty = dirty
        previous_state = dirty?
        dirty_attributes.clear
        dirty_baseline.clear
        notify_dirty(previous_dirty, previous_state)
        self
      end

      private

      def mark_attribute_dirty(name, previous, value)
        return if dirty_tracking_suspended?

        previous_dirty = dirty
        previous_state = dirty?
        unless dirty_attributes.include?(name)
          dirty_attributes << name
          dirty_baseline[name] = previous
        end
        if dirty_baseline[name] == value
          dirty_attributes.delete(name)
          dirty_baseline.delete(name)
        end
        notify_dirty(previous_dirty, previous_state)
      end

      def without_dirty_tracking
        @dirty_tracking_suspensions = (@dirty_tracking_suspensions || 0) + 1
        yield
      ensure
        @dirty_tracking_suspensions -= 1
      end

      def dirty_tracking_suspended?
        (@dirty_tracking_suspensions || 0).positive?
      end

      def dirty_attributes
        @dirty_attributes ||= []
      end

      def dirty_baseline
        @dirty_baseline ||= {}
      end

      def notify_dirty(previous_dirty, previous_state)
        notify_change(:dirty, previous_dirty, dirty) unless previous_dirty == dirty
        notify_change(:dirty?, previous_state, dirty?) unless previous_state == dirty?
      end
    end
  end
end
