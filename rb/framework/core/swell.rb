# typed: true
# frozen_string_literal: true

module Swill
  # `Swell` wraps an element to read and change its classes, attributes,
  # properties, and content. Editing methods return the wrapper so calls can
  # be chained; query methods return the requested value.
  #
  # A control can update its appearance and accessibility state together:
  #
  #     Swell[element].toggle_class("open", open).aria("expanded", open)
  #
  # Wrapping an element preserves its existing view and ownership. Event
  # listeners belong to the object that retains their release callable.
  # See [Swell](rdoc-ref:doc/swell.md) for usage and listener lifetime.
  class Swell < Swill::Object
    extend T::Sig

    # :section: Wrapping an Element
    # Creating a wrapper and accessing its element.

    # Returns a new wrapper for `element`. If a block is supplied, yields the
    # wrapper to it before returning it. See `#element`.
    sig { params(element: Element, block: T.nilable(T.proc.params(dom: Swell).void)).returns(Swell) }
    def self.[](element, &block)
      dom = new(element)
      block.call(dom) if block
      dom
    end

    # Creates a wrapper for `element`, preserving its existing view and owner.
    sig { params(element: Element).void }
    def initialize(element)
      super()
      @element = element
    end

    # The element this wrapper reads and changes.
    sig { returns(Element) }
    attr_reader :element

    # :section: Managing Classes
    # Reading and changing the element's CSS classes.

    # Adds the class `name` and returns the wrapper. See `#remove_class`.
    sig { params(name: String).returns(Swell) }
    def add_class(name)
      @element.classList.add(name)
      self
    end

    # Removes the class `name` and returns the wrapper. See `#add_class`.
    sig { params(name: String).returns(Swell) }
    def remove_class(name)
      @element.classList.remove(name)
      self
    end

    # Adds the class `name` when `on` is true, removes it when false, and
    # returns the wrapper. When `on` is omitted or nil, reverses the class's
    # presence. See `#has_class?`.
    sig { params(name: String, on: T.nilable(T::Boolean)).returns(Swell) }
    def toggle_class(name, on = nil)
      on == nil ? @element.classList.toggle(name) : @element.classList.toggle(name, on)
      self
    end

    # Returns whether the element has the class `name`. See `#toggle_class`.
    sig { params(name: String).returns(T::Boolean) }
    def has_class?(name)
      @element.classList.contains(name)
    end

    # :section: Managing Attributes
    # Reading and changing HTML, ARIA, and data attributes.

    # Sets the attribute `name` from `value` and returns the wrapper.
    # A nil or false value removes the attribute; true sets an empty string.
    # Other values are converted to strings. See `#attribute`, `#aria`, and
    # `#data` for reading attributes and writing prefixed values.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def attr(name, value)
      if value == nil || value == false
        @element.removeAttribute(name)
      else
        @element.setAttribute(name, value == true ? "" : value.to_s)
      end
      self
    end

    # Returns the attribute `name` as a string, or nil when absent.
    # See `#attr` and `#has_attribute?`.
    sig { params(name: String).returns(T.nilable(String)) }
    def attribute(name)
      @element.getAttribute(name)
    end

    # Returns whether the element has the attribute `name`, including an
    # attribute whose value is an empty string. See `#attribute`.
    sig { params(name: String).returns(T::Boolean) }
    def has_attribute?(name)
      @element.hasAttribute(name)
    end

    # Removes the attribute `name` and returns the wrapper.
    # See `#attr` and `#has_attribute?`.
    sig { params(name: String).returns(Swell) }
    def remove_attr(name)
      @element.removeAttribute(name)
      self
    end

    # Sets `aria-name` to the string form of `value` and returns the wrapper.
    # A nil value removes the attribute; false is written as "false".
    # Supply the suffix, such as "expanded", as `name`. See `#aria_value`.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def aria(name, value)
      attr("aria-#{name}", value == nil ? nil : value.to_s)
    end

    # Sets `data-name` to the string form of `value` and returns the wrapper.
    # A nil value removes the attribute; false is written as "false".
    # Supply the suffix, such as "value", as `name`. See `#data_value`.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def data(name, value)
      attr("data-#{name}", value == nil ? nil : value.to_s)
    end

    # Returns the value of `aria-name`, or nil when absent. `name` is the
    # suffix without "aria-". See `#aria`.
    sig { params(name: String).returns(T.nilable(String)) }
    def aria_value(name)
      attribute("aria-#{name}")
    end

    # Returns the value of `data-name`, or nil when absent. `name` is the
    # suffix without "data-". See `#data`.
    sig { params(name: String).returns(T.nilable(String)) }
    def data_value(name)
      attribute("data-#{name}")
    end

    # :section: Managing Properties
    # Reading and assigning the element's DOM properties.

    # Assigns `value` to the DOM property `name` and returns the wrapper.
    # Uses the property's JavaScript name, such as "readOnly". The DOM
    # property's setter determines how the value is stored.
    # See `#property_value`.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def prop(name, value)
      @element[name] = value
      self
    end

    # Returns the DOM property `name` using its JavaScript spelling.
    # An absent property returns JavaScript's undefined value. See `#prop`.
    sig { params(name: String).returns(T.untyped) }
    def property_value(name)
      @element[name]
    end

    # :section: Managing Content and Visibility
    # Updating text, child nodes, and the element's hidden state.

    # Replaces the element's contents with the string form of `value` and
    # returns the wrapper. Text is displayed literally; nil clears the
    # contents. See `#text_content` and `#empty`.
    sig { params(value: T.untyped).returns(Swell) }
    def text(value)
      @element.textContent = value.to_s
      self
    end

    # Returns the element's text content, or an empty string when it has
    # none. See `#text`.
    sig { returns(String) }
    def text_content
      @element.textContent.to_s
    end

    # Sets the element's hidden property to true and returns the wrapper.
    # See `#show`.
    sig { returns(Swell) }
    def hide
      @element.hidden = true
      self
    end

    # Sets the element's hidden property to false and returns the wrapper.
    # See `#hide`.
    sig { returns(Swell) }
    def show
      @element.hidden = false
      self
    end

    # Removes all child nodes and returns the wrapper. See `#append`.
    sig { returns(Swell) }
    def empty
      @element.replaceChildren
      self
    end

    # Appends `node` as the last child and returns the wrapper. An existing
    # node moves from its current parent. See `#empty`.
    sig { params(node: Node).returns(Swell) }
    def append(node)
      @element.appendChild(node)
      self
    end

    # Inserts `node` before the element's current children and returns the wrapper.
    sig { params(node: Node).returns(Swell) }
    def prepend(node)
      @element.insertBefore(node, @element.firstElementChild)
      self
    end

    # Removes the element from its parent and returns the wrapper.
    # An element with no parent remains unchanged.
    sig { returns(Swell) }
    def remove
      @element.remove
      self
    end

    # :section: Finding Elements
    # Looking up descendants by CSS selector.

    # Returns a new wrapper for the first descendant matching `selector`,
    # or nil when none matches. See `#find!`.
    sig { params(selector: String).returns(T.nilable(Swell)) }
    def find(selector)
      found = @element.querySelector(selector)
      found ? Swell[found] : nil
    end

    # Returns a new wrapper for the first descendant matching `selector`.
    # Raises "No element matching ..." when none matches; use `#find` when
    # the descendant may be absent.
    sig { params(selector: String).returns(Swell) }
    def find!(selector)
      found = find(selector)
      raise "No element matching #{selector}" unless found
      found
    end

    # :section: Listening for Events
    # Registering event handlers and releasing them with their owner.

    # Registers `handler` for events of `type` and returns a callable that
    # removes the listener. The handler receives the DOM event. `capture`
    # selects the capture phase; the default is false.
    #
    # Retain the returned callable on the controller or view that owns the
    # listener so it is removed when that owner unloads.
    sig { params(type: String, handler: T.proc.params(event: Event).void, capture: T::Boolean).returns(T.proc.void) }
    def listen(type, handler, capture: false)
      @element.addEventListener(type, handler, capture)
      ->() { @element.removeEventListener(type, handler, capture) }
    end
  end
end
