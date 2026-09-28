# frozen_string_literal: true

module DataFixture
  class Post
    module DistantInterface
      extend Swill::Distant::Interface

      fields :author_id, :title, :excerpt, :body, :published, :published_at
      associations :author, :comments
      writable :author_id, :title, :excerpt, :body

      query :search, returns: Swill::Distant::ResultSet[Post],
                     preload: [:title, :excerpt, { author: %i[name avatar] }]
      command :move_to_author!, returns: T::Boolean
      command :publish!, changes: %i[published published_at]
      command :invalid_publish!, returns: T::Boolean, changes: [:published]
      command :publish_author!, returns: User, changes: [:published], preload: [:name]
      command :lookup_title, on: :class, transaction: false, returns: PostLookup, preload: {post: [:title]}
      command :wrapped_transaction?, on: :class, returns: T::Boolean
      command :unwrapped_transaction?, on: :class, transaction: false, returns: T::Boolean
    end
  end
end
