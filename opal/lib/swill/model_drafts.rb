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
    end
  end
end
