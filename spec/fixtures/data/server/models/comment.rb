# frozen_string_literal: true

module DataFixture
  class Comment < Sequel::Model(DB[:comments])
    plugin :privacy

    many_to_one :post, class: "DataFixture::Post", key: :post_id
    many_to_one :author, class: "DataFixture::User", key: :author_id

    privacy do
      can :view, Policies::AllowAll
    end
  end
end
