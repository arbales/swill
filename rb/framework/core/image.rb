# typed: true
# frozen_string_literal: true

module Swill
  # An image the page loads by URL. `Image.named` finds one among the
  # bundles' resources; `Image.new` takes any path or URL:
  #
  #     Swill::Image.named("Warning")          # the framework's
  #     Swill::Image.new("/posters/42.jpg")
  #
  # Nothing is loaded until a Control::ImageView shows it, and the browser
  # caches it from there. See [Resources](rdoc-ref:doc/resources.md).
  class Image < Swill::Object
    extend T::Sig

    # The kinds of file a name finds, in the order they are tried.
    sig { returns(T::Array[String]) }
    def self.extensions
      ["svg", "png", "webp", "jpg", "jpeg", "gif"]
    end

    # The image called +name+ in the application's bundle, else the
    # framework's, or nil when neither has one. See Bundle.
    sig { params(name: String).returns(T.nilable(Image)) }
    def self.named(name)
      urls = Bundle.search_order.flat_map do |bundle|
        Image.extensions.map { |extension| bundle.url_for_resource(name, extension) }
      end
      url = urls.compact.first
      url ? Image.new(url) : nil
    end

    # An image at +url+, a path or URL as an `<img src>` would take it.
    sig { params(url: String).void }
    def initialize(url)
      super()
      @url = url
    end

    # Where the image is, as an `<img src>` would take it.
    sig { returns(String) }
    attr_reader :url
  end
end
