# typed: true
# frozen_string_literal: true

module Swill
  module Model
    module Drafts
      extend T::Sig

      sig { returns(T.untyped) }
      def draft
        copy = self.class.new
        copy.apply_attributes(collect_attributes)
        copy
      end
    end
  end
end
