# typed: true
# frozen_string_literal: true

module Swill
  # `Control::ImageView` shows an Image through an `<img>`. Its value is the
  # image. In markup, `image` names one among the bundles' resources, and
  # `bind` supplies an Image, a name, or a URL:
  #
  #     <img klass="Swill::Control::ImageView" image="Warning" alt="">
  #     <img klass="Swill::Control::ImageView" bind="@movie.poster" alt="">
  #
  # The control wraps an `<img>`, or the first one inside its element, adding
  # one when there is none. See [Resources](rdoc-ref:doc/resources.md).
  class Control::ImageView < Control
    extend T::Sig

    # The image shown, or nil for none. A string is looked up with
    # Image.named, and taken as a URL when no bundle has that name.
    property :value, type: T.nilable(Swill::Image), default: nil

    # Creates the control for `element`. An `image` attribute must name an
    # image a bundle has; raises "Unknown image: ..." otherwise.
    sig { params(element: Element).void }
    def initialize(element)
      super
      update_accessibility
      name = element.getAttribute("image")
      return unless name
      found = Image.named(name)
      raise "Unknown image: #{name}" unless found
      self.value = found
    end

    sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous) # :nodoc:
      return super unless name == "value" && value.is_a?(String)
      Image.named(value) || Image.new(value)
    end

    # Invoked after `value` changes to update the element's `src`.
    sig { params(_previous: T.untyped, image: T.nilable(Swill::Image)).void }
    def value_did_change(_previous, image)
      if image
        image_element.setAttribute("src", image.url)
      else
        image_element.removeAttribute("src")
      end
    end

    # The `<img>` the control shows its image in.
    sig { returns(Element) }
    def image_element
      return @element if @element.tagName == "IMG"
      found = @element.querySelector("img")
      return found if found
      created = @element.ownerDocument.createElement("img")
      created.setAttribute("alt", "")
      @element.appendChild(created)
      created
    end

    # An image with empty alt text is decoration, hidden from screen readers.
    sig { override.void }
    def update_accessibility
      super
      image_element.setAttribute("aria-hidden", "true") if image_element.getAttribute("alt") == ""
    end
  end
end
