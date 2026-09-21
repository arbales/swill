# typed: true
# frozen_string_literal: true

module DataFixture
  class Comment < Swill::Model::Base
    remote_model "DataFixture::Comment"
    remote_attribute :author_id, type: Integer
    remote_attribute :body, type: String
    remote_attribute :post_id, type: Integer
    remote_has_one :author, model: "DataFixture::User"
    remote_has_one :post, model: "DataFixture::Post"
  end
end
