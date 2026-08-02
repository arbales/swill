# frozen_string_literal: true

module Swill
  module Model
    # Detached editing buffers for model-shaped objects. The including class
    # supplies id accessors plus collect_attributes and apply_attributes.
    module Drafts
      def draft
        copy = self.class.new
        copy.id = id
        copy.apply_attributes(collect_attributes)
        copy
      end


      # Apply an editing buffer through the public attribute writers. Unlike
      # server/codec application, accepting a draft is a user mutation and
      # therefore intentionally participates in dirty tracking — this requires
      # the Attributes concern's write_attributes.
      def apply_draft(copy)
        write_attributes(copy, track_dirty: true)
      end
    end
  end
end
