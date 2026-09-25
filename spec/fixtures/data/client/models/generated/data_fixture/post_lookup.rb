# typed: true
# frozen_string_literal: true

module DataFixture
  class PostLookup < Swill::Object
    property :post, type: T.nilable(DataFixture::Post), default: nil
    property :status, type: String, default: nil
  end
end
