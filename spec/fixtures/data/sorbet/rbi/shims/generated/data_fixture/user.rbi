# typed: true

module DataFixture
  class User < Swill::Model::Base
    sig { returns(T.nilable(String)) }
    def avatar; end
    sig { returns(String) }
    def email; end
    sig { returns(String) }
    def name; end
    sig { returns(T.nilable(DataFixture::User)) }
    def self.current_user(); end
    sig { params(email: String).returns(T.nilable(DataFixture::User)) }
    def self.first_by_email(email); end
    sig { params(emails: String, exact: T::Boolean, limit: Integer, options: T.untyped).returns(T.nilable(DataFixture::User)) }
    def self.lookup(*emails, exact:, limit: T.unsafe(nil), **options); end
  end
end
