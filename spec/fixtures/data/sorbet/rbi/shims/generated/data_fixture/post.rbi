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
    sig { returns(T::Boolean) }
    def publish!(); end
    sig { params(text: String, published: T.nilable(T::Boolean)).returns(Swill::Model::ResultSet[DataFixture::Post]) }
    def self.search(text, published = Swill::Runtime.omitted_argument); end
  end
end
