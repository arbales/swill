# typed: true
# frozen_string_literal: true

module DataFixture
  class Post < Swill::Distant::Object
    model_name "DataFixture::Post"
    attribute :author_id, type: Integer
    attribute :body, type: T.nilable(String)
    attribute :excerpt, type: T.nilable(String)
    attribute :published, type: T::Boolean
    attribute :published_at, type: T.nilable(Time)
    attribute :title, type: String
    many_to_one :author, class: "DataFixture::User"
    one_to_many :comments, class: "DataFixture::Comment"

    sig { returns(T::Boolean) }
    async def invalid_publish!()
      await Swill::Distant::Client.default.command(self, "invalid_publish!", [], {}, "primitive")
    end

    sig { params(title: T.untyped).returns(DataFixture::PostLookup) }
    async def self.lookup_title(title)
      await Swill::Distant::Client.default.class_command(data_model_name, "lookup_title", [title], {}, "value")
    end

    sig { params(author_id: T.untyped, replace: T.untyped, fail: T.untyped, hidden: T.untyped).returns(T::Boolean) }
    async def move_to_author!(author_id, replace: Swill::Runtime.omitted_argument, fail: Swill::Runtime.omitted_argument, hidden: Swill::Runtime.omitted_argument)
      await Swill::Distant::Client.default.command(self, "move_to_author!", [author_id], {replace: replace, fail: fail, hidden: hidden}, "primitive")
    end

    sig { returns(T::Boolean) }
    async def publish!()
      await Swill::Distant::Client.default.command(self, "publish!", [], {}, "primitive")
    end

    sig { returns(DataFixture::User) }
    async def publish_author!()
      await Swill::Distant::Client.default.command(self, "publish_author!", [], {}, "model")
    end

    sig { params(text: String, published: T.nilable(T::Boolean)).returns(Swill::Model::ResultSet[DataFixture::Post]) }
    async def self.search(text, published = Swill::Runtime.omitted_argument)
      await Swill::Distant::Client.default.query(data_model_name, "search", [text, published], {}, "result_set")
    end

    sig { returns(T::Boolean) }
    async def self.unwrapped_transaction?()
      await Swill::Distant::Client.default.class_command(data_model_name, "unwrapped_transaction?", [], {}, "primitive")
    end

    sig { returns(T::Boolean) }
    async def self.wrapped_transaction?()
      await Swill::Distant::Client.default.class_command(data_model_name, "wrapped_transaction?", [], {}, "primitive")
    end
  end
end
