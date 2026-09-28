# typed: true

module DataFixture
  class Post < Swill::Distant::Object
    sig { returns(Integer) }
    def author_id; end
    sig { returns(T::Boolean) }
    def author_id_loaded; end
    sig { returns(T::Boolean) }
    def author_id_loading; end
    sig { returns(T.nilable(String)) }
    def author_id_error; end
    sig { returns(T.nilable(String)) }
    def body; end
    sig { returns(T::Boolean) }
    def body_loaded; end
    sig { returns(T::Boolean) }
    def body_loading; end
    sig { returns(T.nilable(String)) }
    def body_error; end
    sig { returns(T.nilable(String)) }
    def excerpt; end
    sig { returns(T::Boolean) }
    def excerpt_loaded; end
    sig { returns(T::Boolean) }
    def excerpt_loading; end
    sig { returns(T.nilable(String)) }
    def excerpt_error; end
    sig { returns(T::Boolean) }
    def published; end
    sig { returns(T::Boolean) }
    def published_loaded; end
    sig { returns(T::Boolean) }
    def published_loading; end
    sig { returns(T.nilable(String)) }
    def published_error; end
    sig { returns(T.nilable(Time)) }
    def published_at; end
    sig { returns(T::Boolean) }
    def published_at_loaded; end
    sig { returns(T::Boolean) }
    def published_at_loading; end
    sig { returns(T.nilable(String)) }
    def published_at_error; end
    sig { returns(String) }
    def title; end
    sig { returns(T::Boolean) }
    def title_loaded; end
    sig { returns(T::Boolean) }
    def title_loading; end
    sig { returns(T.nilable(String)) }
    def title_error; end
    sig { returns(T.nilable(DataFixture::User)) }
    def author; end
    sig { returns(T::Boolean) }
    def author_loaded; end
    sig { returns(T::Boolean) }
    def author_stale; end
    sig { returns(T::Boolean) }
    def author_loading; end
    sig { returns(T.nilable(String)) }
    def author_error; end
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
    sig { returns(T::Boolean) }
    def invalid_publish!(); end
    sig { params(title: T.untyped).returns(DataFixture::PostLookup) }
    def self.lookup_title(title); end
    sig { params(author_id: T.untyped, replace: T.untyped, fail: T.untyped, hidden: T.untyped).returns(T::Boolean) }
    def move_to_author!(author_id, replace: Swill::Runtime.omitted_argument, fail: Swill::Runtime.omitted_argument, hidden: Swill::Runtime.omitted_argument); end
    sig { returns(T::Boolean) }
    def publish!(); end
    sig { returns(DataFixture::User) }
    def publish_author!(); end
    sig { params(text: String, published: T.nilable(T::Boolean)).returns(Swill::Model::ResultSet[DataFixture::Post]) }
    def self.search(text, published = Swill::Runtime.omitted_argument); end
    sig { returns(T::Boolean) }
    def self.unwrapped_transaction?(); end
    sig { returns(T::Boolean) }
    def self.wrapped_transaction?(); end
  end
end
