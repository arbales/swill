# typed: true

module DataFixture
  class User < Swill::Distant::Object
    sig { returns(T.nilable(String)) }
    def avatar; end
    sig { returns(String) }
    def email; end
    sig { returns(String) }
    def name; end
    sig { returns(Swill::Model::AssociationCollection[DataFixture::Comment]) }
    def comments; end
    sig { returns(Swill::ArrayController) }
    def comments_controller; end
    sig { returns(Swill::Model::AssociationCollection[DataFixture::Post]) }
    def posts; end
    sig { returns(Swill::ArrayController) }
    def posts_controller; end
    sig { returns(Swill::Model::AssociationCollection[DataFixture::Post]) }
    def published_posts; end
    sig { returns(Swill::ArrayController) }
    def published_posts_controller; end
    sig { returns(T.nilable(DataFixture::User)) }
    def self.current_user(); end
    sig { params(email: String).returns(T.nilable(DataFixture::User)) }
    def self.first_by_email(email); end
    sig { params(emails: String, exact: T::Boolean, limit: Integer, options: T.untyped).returns(T.nilable(DataFixture::User)) }
    def self.lookup(*emails, exact:, limit: Swill::Runtime.omitted_argument, **options); end
  end
end
