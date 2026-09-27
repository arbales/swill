# frozen_string_literal: true

module DataFixture
  class PostLookup < Swill::Data::Value
    field :post, type: T.nilable(Post)
    field :status, type: Swill::Data::Enum[:found, :missing]
  end

  class Post
    query :search, returns: Swill::Data::ResultSet[Post],
                   preload: [:title, :excerpt, { author: %i[name avatar] }]
    command :move_to_author!, returns: T::Boolean
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

    def move_to_author!(author_id, replace: false, fail: false, hidden: false)
      context = Swill::Data.context
      old_author = author
      new_author = User.for_vc(context.viewer_context).with_pk!(author_id)
      update(author_id: new_author.id)
      context.refresh(self, :author_id, :author)
      context.invalidate(old_author, :posts)
      if replace
        context.refresh(new_author, :posts, :published_posts, :avatar)
      else
        context.invalidate(new_author, :posts)
      end
      context.refresh(new_author, :surprise) if hidden
      raise "move rejected" if fail

      true
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
