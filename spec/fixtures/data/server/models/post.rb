# frozen_string_literal: true

module DataFixture
  class Post < Sequel::Model(DB[:posts])
    plugin :privacy
    extend T::Sig

    many_to_one :author, class: "DataFixture::User", key: :author_id
    one_to_many :comments, class: "DataFixture::Comment", key: :post_id

    privacy do
      can :view, Policies::AllowAll
      can :edit, Policies::AllowAll
    end

    dataset_module do
      extend T::Sig

      sig { params(text: String, published: T.nilable(T::Boolean)).returns(Sequel::Dataset) }
      def search(text, published = nil)
        result = where(Sequel.ilike(:title, "%#{text}%"))
        published.nil? ? result : result.where(published: published)
      end
    end

    sig { returns(T::Boolean) }
    def publish!
      update(published: true, published_at: Time.utc(2026, 1, 2, 3, 4, 5))
      true
    end

    sig { returns(T.untyped) }
    def invalid_publish!
      update(published: true)
      "not a boolean"
    end

    def self.lookup_title(title)
      post = for_vc(Swill::Distant.context.viewer_context).first(title: title)
      PostLookup.new(post: post, status: post ? :found : :missing)
    end

    def move_to_author!(author_id, replace: false, fail: false, hidden: false)
      context = Swill::Distant.context
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
