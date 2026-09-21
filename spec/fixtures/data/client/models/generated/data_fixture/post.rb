# typed: true
# frozen_string_literal: true

module DataFixture
  class Post < Swill::Model::Base
    remote_model "DataFixture::Post"
    remote_attribute :author_id, type: Integer
    remote_attribute :body, type: T.nilable(String)
    remote_attribute :excerpt, type: T.nilable(String)
    remote_attribute :published, type: T::Boolean
    remote_attribute :published_at, type: T.nilable(Time)
    remote_attribute :title, type: String
    remote_has_one :author, model: "DataFixture::User"
    remote_has_many :comments, model: "DataFixture::Comment"

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
