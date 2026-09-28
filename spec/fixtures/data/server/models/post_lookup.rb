# frozen_string_literal: true

module DataFixture
  class PostLookup < Swill::Distant::Value
    field :post, type: T.nilable(Post)
    field :status, type: Swill::Distant::Enum[:found, :missing]
  end
end
