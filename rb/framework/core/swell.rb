# typed: true
# frozen_string_literal: true

module Swill
  # DOM reads and fluent edits without creating a View or changing ownership.
  # Mutators return this wrapper; queries return values, and listen a disposer.
  class Swell < Swill::Object
    extend T::Sig

    sig { params(element: Element, block: T.nilable(T.proc.params(dom: Swell).void)).returns(Swell) }
    def self.[](element, &block)
      dom = new(element)
      block.call(dom) if block
      dom
    end

    sig { params(element: Element).void }
    def initialize(element)
      super()
      @element = element
    end

    sig { returns(Element) }
    attr_reader :element

    sig { params(name: String).returns(Swell) }
    def add_class(name)
      @element.classList.add(name)
      self
    end

    sig { params(name: String).returns(Swell) }
    def remove_class(name)
      @element.classList.remove(name)
      self
    end

    sig { params(name: String, on: T.nilable(T::Boolean)).returns(Swell) }
    def toggle_class(name, on = nil)
      on == nil ? @element.classList.toggle(name) : @element.classList.toggle(name, on)
      self
    end

    sig { params(name: String).returns(T::Boolean) }
    def has_class?(name)
      @element.classList.contains(name)
    end

    # HTML booleans are presence/absence; nil also removes the attribute.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def attr(name, value)
      if value == nil || value == false
        @element.removeAttribute(name)
      else
        @element.setAttribute(name, value == true ? "" : value.to_s)
      end
      self
    end

    sig { params(name: String).returns(T.nilable(String)) }
    def attribute(name)
      @element.getAttribute(name)
    end

    sig { params(name: String).returns(T::Boolean) }
    def has_attribute?(name)
      @element.hasAttribute(name)
    end

    sig { params(name: String).returns(Swell) }
    def remove_attr(name)
      @element.removeAttribute(name)
      self
    end

    # ARIA and data values are strings: false means "false", not absence.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def aria(name, value)
      attr("aria-#{name}", value == nil ? nil : value.to_s)
    end

    sig { params(name: String, value: T.untyped).returns(Swell) }
    def data(name, value)
      attr("data-#{name}", value == nil ? nil : value.to_s)
    end

    sig { params(name: String).returns(T.nilable(String)) }
    def aria_value(name)
      attribute("aria-#{name}")
    end

    sig { params(name: String).returns(T.nilable(String)) }
    def data_value(name)
      attribute("data-#{name}")
    end

    # Properties retain their values and types, unlike serialized attributes.
    sig { params(name: String, value: T.untyped).returns(Swell) }
    def prop(name, value)
      @element[name] = value
      self
    end

    sig { params(name: String).returns(T.untyped) }
    def property_value(name)
      @element[name]
    end

    # Text is always literal. Markup belongs in templates.
    sig { params(value: T.untyped).returns(Swell) }
    def text(value)
      @element.textContent = value.to_s
      self
    end

    sig { returns(String) }
    def text_content
      @element.textContent.to_s
    end

    sig { returns(Swell) }
    def hide
      @element.hidden = true
      self
    end

    sig { returns(Swell) }
    def show
      @element.hidden = false
      self
    end

    sig { returns(Swell) }
    def empty
      @element.replaceChildren
      self
    end

    sig { params(node: Node).returns(Swell) }
    def append(node)
      @element.appendChild(node)
      self
    end

    sig { returns(Swell) }
    def remove
      @element.remove
      self
    end

    sig { params(selector: String).returns(T.nilable(Swell)) }
    def find(selector)
      found = @element.querySelector(selector)
      found ? Swell[found] : nil
    end

    sig { params(selector: String).returns(Swell) }
    def find!(selector)
      found = find(selector)
      raise "No element matching #{selector}" unless found
      found
    end

    # Retain the returned disposer on the object that owns the listener.
    sig { params(type: String, handler: T.proc.params(event: Event).void, capture: T::Boolean).returns(T.proc.void) }
    def listen(type, handler, capture: false)
      @element.addEventListener(type, handler, capture)
      ->() { @element.removeEventListener(type, handler, capture) }
    end
  end
end
