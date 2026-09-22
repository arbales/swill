# typed: true
# frozen_string_literal: true

module DataFixture
  class BrowserController < Swill::Controller
    extend T::Sig

    property :post, type: T.nilable(DataFixture::Post), default: nil
    property :status, type: String, default: "Loading"

    property :comment_count, type: Integer do
      current = post
      current ? current.comments.size : 0
    end

    sig { void }
    def controller_did_load
      load_post
    end

    sig { void }
    async def load_post
      posts = await DataFixture::Post.search("Objects")
      self.post = posts.first
      self.status = "Loaded"
    rescue => failure
      self.status = failure.message
    end

    sig { void }
    async def publish
      current = post
      return unless current

      await current.publish!
    rescue => failure
      self.status = failure.message
    end
  end
end
