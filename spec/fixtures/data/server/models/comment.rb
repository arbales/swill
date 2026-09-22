# frozen_string_literal: true

module DataFixture
  class Comment < Sequel::Model(DB[:comments])
    plugin :privacy

    client_model fields: %i[post_id author_id body], relationships: %i[post author],
                 writable: %i[post_id author_id body]

    many_to_one :post, class: "DataFixture::Post", key: :post_id
    many_to_one :author, class: "DataFixture::User", key: :author_id

    privacy do
      can :view, Policies::AllowAll
      can :create, Policies::AllowAll
      can :edit, Policies::AllowAll
      can :delete, Policies::AllowAll
    end

    def validate
      super
      errors.add(:body, "is reserved for validation tests") if body == "invalid"
    end
  end
end
