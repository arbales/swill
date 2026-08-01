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
      # therefore intentionally participates in dirty tracking.
      def apply_draft(copy)
        source = copy.collect_attributes
        self.class.model_attributes.each_value do |descriptor|
          keys = [descriptor.key, descriptor.key.to_s, descriptor.name, descriptor.name.to_s]
          key = keys.find { |candidate| source.key?(candidate) }
          public_send("#{descriptor.name}=", source[key]) if key
        end
        self
      end
    end
  end
end
