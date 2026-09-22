# frozen_string_literal: true

module DataFixture
  class Post < Sequel::Model(DB[:posts])
    plugin :privacy
    extend T::Sig

    client_model fields: %i[author_id title excerpt body published published_at],
                 relationships: %i[author comments], writable: %i[author_id title excerpt body]

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
  end
end
