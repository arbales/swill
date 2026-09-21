# frozen_string_literal: true

module DataFixture
  class Post
    query :search, returns: Swill::Data::ResultSet[Post],
                   preload: [:title, :excerpt, { author: %i[name avatar] }]
    command :publish!, changes: %i[published published_at]
    command :invalid_publish!, returns: T::Boolean, changes: [:published]
  end
end
