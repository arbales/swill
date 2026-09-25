# frozen_string_literal: true

module DataFixture
  class PostLookup < Swill::Data::Value
    field :post, type: T.nilable(Post)
    field :status, type: Swill::Data::Enum[:found, :missing]
  end

  class Post
    query :search, returns: Swill::Data::ResultSet[Post],
                   preload: [:title, :excerpt, { author: %i[name avatar] }]
    command :publish!, changes: %i[published published_at]
    command :invalid_publish!, returns: T::Boolean, changes: [:published]
    command :publish_author!, returns: User, changes: [:published], preload: [:name]
    command :lookup_title, on: :class, transaction: false, returns: PostLookup, preload: {post: [:title]}
    command :wrapped_transaction?, on: :class, returns: T::Boolean
    command :unwrapped_transaction?, on: :class, transaction: false, returns: T::Boolean

    def self.lookup_title(title)
      post = for_vc(Swill::Data.context.viewer_context).first(title: title)
      PostLookup.new(post: post, status: post ? :found : :missing)
    end

    def publish_author!
      update(published: true)
      author
    end

    def self.wrapped_transaction?
      DB.in_transaction?
    end

    def self.unwrapped_transaction?
      DB.in_transaction?
    end
  end
end
