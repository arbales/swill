# typed: true
# frozen_string_literal: true

module DataFixture
  class Comment < Swill::Distant::Object
    model_name "DataFixture::Comment"
    attribute :author_id, type: Integer
    attribute :body, type: String
    attribute :post_id, type: Integer
    many_to_one :author, class: "DataFixture::User"
    many_to_one :post, class: "DataFixture::Post"
  end
end
