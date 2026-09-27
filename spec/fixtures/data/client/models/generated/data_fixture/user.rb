# typed: true
# frozen_string_literal: true

module DataFixture
  class User < Swill::Model::DistantObject
    model_name "DataFixture::User"
    attribute :avatar, type: T.nilable(String)
    attribute :email, type: String
    attribute :name, type: String
    one_to_many :comments, class: "DataFixture::Comment"
    one_to_many :posts, class: "DataFixture::Post"
    one_to_many :published_posts, class: "DataFixture::Post"

    sig { returns(T.nilable(DataFixture::User)) }
    async def self.current_user()
      await Swill::Model::DistantClient.default.resolve(data_model_name, "current_user", [], {}, "optional")
    end

    sig { params(email: String).returns(T.nilable(DataFixture::User)) }
    async def self.first_by_email(email)
      await Swill::Model::DistantClient.default.resolve(data_model_name, "first_by_email", [email], {}, "optional")
    end

    sig { params(emails: String, exact: T::Boolean, limit: Integer, options: T.untyped).returns(T.nilable(DataFixture::User)) }
    async def self.lookup(*emails, exact:, limit: Swill::Runtime.omitted_argument, **options)
      await Swill::Model::DistantClient.default.resolve(data_model_name, "lookup", [*emails], {exact: exact, limit: limit, **options}, "optional")
    end
  end
end
