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
      await Swill::Model::DistantClient.default.command(self, "invalid_publish!", [], {}, "primitive")
    end

    sig { params(title: T.untyped).returns(DataFixture::PostLookup) }
    async def self.lookup_title(title)
      await Swill::Model::DistantClient.default.class_command(data_model_name, "lookup_title", [title], {}, "value")
    end

    sig { returns(T::Boolean) }
    async def publish!()
      await Swill::Model::DistantClient.default.command(self, "publish!", [], {}, "primitive")
    end

    sig { returns(DataFixture::User) }
    async def publish_author!()
      await Swill::Model::DistantClient.default.command(self, "publish_author!", [], {}, "model")
    end

    sig { params(text: String, published: T.nilable(T::Boolean)).returns(Swill::Model::ResultSet[DataFixture::Post]) }
    async def self.search(text, published = Swill::Runtime.omitted_argument)
      await Swill::Model::DistantClient.default.query(data_model_name, "search", [text, published], {}, "result_set")
    end

    sig { returns(T::Boolean) }
    async def self.unwrapped_transaction?()
      await Swill::Model::DistantClient.default.class_command(data_model_name, "unwrapped_transaction?", [], {}, "primitive")
    end

    sig { returns(T::Boolean) }
    async def self.wrapped_transaction?()
      await Swill::Model::DistantClient.default.class_command(data_model_name, "wrapped_transaction?", [], {}, "primitive")
    end
  end
end
