# frozen_string_literal: true

module DataFixture
  class User
    module DistantInterface
      extend Swill::Distant::Interface

      fields :email, :name, :avatar
      associations :comments, :posts, :published_posts
      writable :email, :name, :avatar

      resolver :current_user, preload: %i[name avatar]
      resolver :first_by_email, preload: [:name]
      resolver :lookup, preload: [:name]
    end
  end
end
