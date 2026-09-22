# typed: true
# frozen_string_literal: true

module DataFixture
  class Comment < Swill::Model::DistantObject
    model_name "DataFixture::Comment"
    attribute :author_id, type: Integer
    attribute :body, type: String
    attribute :post_id, type: Integer
    has_one :author, model: "DataFixture::User"
    has_one :post, model: "DataFixture::Post"
  end
end
