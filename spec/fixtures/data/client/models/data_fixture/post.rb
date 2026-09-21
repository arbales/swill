# typed: true
# frozen_string_literal: true

module DataFixture
  class Post
    sig { returns(String) }
    def display_title
      title.upcase
    end
  end
end
