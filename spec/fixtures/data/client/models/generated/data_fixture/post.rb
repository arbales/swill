# typed: true
# frozen_string_literal: true

module DataFixture
  class Post < Swill::Model::DistantObject
    model_name "DataFixture::Post"
    attribute :author_id, type: Integer
    attribute :body, type: T.nilable(String)
    attribute :excerpt, type: T.nilable(String)
    attribute :published, type: T::Boolean
    attribute :published_at, type: T.nilable(Time)
    attribute :title, type: String
    has_one :author, model: "DataFixture::User"
    has_many :comments, model: "DataFixture::Comment"

    sig { returns(T::Boolean) }
    async def invalid_publish!()
      await Swill::Runtime.data_command(self, "invalid_publish!", [], {})
    end

    sig { returns(T::Boolean) }
    async def publish!()
      await Swill::Runtime.data_command(self, "publish!", [], {})
    end

    sig { params(text: String, published: T.nilable(T::Boolean)).returns(Swill::Model::ResultSet[DataFixture::Post]) }
    async def self.search(text, published = Swill::Runtime.omitted_argument)
      await Swill::Runtime.data_query(self, "search", [text, published], {})
    end
  end
end
