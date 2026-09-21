# typed: true
# frozen_string_literal: true

module DataFixture
  class User < Swill::Model::Base
    remote_model "DataFixture::User"
    remote_attribute :avatar, type: T.nilable(String)
    remote_attribute :email, type: String
    remote_attribute :name, type: String
    remote_has_many :comments, model: "DataFixture::Comment"
    remote_has_many :posts, model: "DataFixture::Post"

    sig { returns(T.nilable(DataFixture::User)) }
    async def self.current_user()
      await Swill::Runtime.data_resolve(self, "current_user", [], {})
    end

    sig { params(email: String).returns(T.nilable(DataFixture::User)) }
    async def self.first_by_email(email)
      await Swill::Runtime.data_resolve(self, "first_by_email", [email], {})
    end

    sig { params(emails: String, exact: T::Boolean, limit: Integer, options: T.untyped).returns(T.nilable(DataFixture::User)) }
    async def self.lookup(*emails, exact:, limit: Swill::Runtime.omitted_argument, **options)
      await Swill::Runtime.data_resolve(self, "lookup", [*emails], {exact: exact, limit: limit, **options})
    end
  end
end
