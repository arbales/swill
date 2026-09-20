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

      # Take a draft's attributes back. Application is clean, as any
      # apply_attributes is; the values already passed the validators when
      # the draft was written.
      sig { params(copy: T.untyped).returns(T.untyped) }
      def apply_draft(copy)
        apply_attributes(copy.collect_attributes)
        self
      end
    end
  end
end
