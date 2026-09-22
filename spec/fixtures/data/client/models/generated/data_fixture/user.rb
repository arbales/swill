# typed: true
# frozen_string_literal: true

module DataFixture
  class User < Swill::Model::DistantObject
    model_name "DataFixture::User"
    attribute :avatar, type: T.nilable(String)
    attribute :email, type: String
    attribute :name, type: String
    has_many :comments, model: "DataFixture::Comment"
    has_many :posts, model: "DataFixture::Post"

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
