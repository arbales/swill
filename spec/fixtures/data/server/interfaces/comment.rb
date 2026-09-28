# frozen_string_literal: true

module DataFixture
  class Comment
    module DistantInterface
      extend Swill::Distant::Interface

      fields :post_id, :author_id, :body
      associations :post, :author
      writable :post_id, :author_id, :body
    end
  end
end
