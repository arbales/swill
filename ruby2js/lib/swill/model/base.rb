# typed: true
# frozen_string_literal: true

module Swill
  module Model
    class Base < Swill::Object
      include Attributes
      include DirtyTracking
      include Drafts

      attribute :id, type: T.nilable(String), default: nil
    end
  end
end

