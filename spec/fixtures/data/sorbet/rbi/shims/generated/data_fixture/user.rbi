# typed: true

module DataFixture
  class User < Swill::Distant::Object
    sig { returns(T.nilable(String)) }
    def avatar; end
    sig { returns(T::Boolean) }
    def avatar_loaded; end
    sig { returns(T::Boolean) }
    def avatar_loading; end
    sig { returns(T.nilable(String)) }
    def avatar_error; end
    sig { returns(String) }
    def email; end
    sig { returns(T::Boolean) }
    def email_loaded; end
    sig { returns(T::Boolean) }
    def email_loading; end
    sig { returns(T.nilable(String)) }
    def email_error; end
    sig { returns(String) }
    def name; end
    sig { returns(T::Boolean) }
    def name_loaded; end
    sig { returns(T::Boolean) }
    def name_loading; end
    sig { returns(T.nilable(String)) }
    def name_error; end
    sig { returns(Swill::Model::AssociationCollection[DataFixture::Comment]) }
    def comments; end
    sig { returns(T::Boolean) }
    def comments_loaded; end
    sig { returns(T::Boolean) }
    def comments_stale; end
    sig { returns(T::Boolean) }
    def comments_loading; end
    sig { returns(T.nilable(String)) }
    def comments_error; end
    sig { returns(Swill::ArrayController) }
    def comments_controller; end
    sig { returns(Swill::Model::AssociationCollection[DataFixture::Post]) }
    def posts; end
    sig { returns(T::Boolean) }
    def posts_loaded; end
    sig { returns(T::Boolean) }
    def posts_stale; end
    sig { returns(T::Boolean) }
    def posts_loading; end
    sig { returns(T.nilable(String)) }
    def posts_error; end
    sig { returns(Swill::ArrayController) }
    def posts_controller; end
    sig { returns(Swill::Model::AssociationCollection[DataFixture::Post]) }
    def published_posts; end
    sig { returns(T::Boolean) }
    def published_posts_loaded; end
    sig { returns(T::Boolean) }
    def published_posts_stale; end
    sig { returns(T::Boolean) }
    def published_posts_loading; end
    sig { returns(T.nilable(String)) }
    def published_posts_error; end
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
