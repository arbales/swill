# typed: true

module DataFixture
  class Post < Swill::Model::DistantObject
    sig { returns(Integer) }
    def author_id; end
    sig { returns(T.nilable(String)) }
    def body; end
    sig { returns(T.nilable(String)) }
    def excerpt; end
    sig { returns(T::Boolean) }
    def published; end
    sig { returns(T.nilable(Time)) }
    def published_at; end
    sig { returns(String) }
    def title; end
    sig { returns(T::Boolean) }
    def invalid_publish!(); end
    sig { params(title: T.untyped).returns(DataFixture::PostLookup) }
    def self.lookup_title(title); end
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
