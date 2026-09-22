# typed: true
# frozen_string_literal: true

module Swill
  # Where a binding writes: an element, or an object and the name of one of its
  # properties. `key` is that name, and is nil for an element's own value.
  #
  # Transformers, placeholders and direction are the binding's options, and
  # Binding applies them before a value arrives here.
  #
  # Destinations are shared and stateless — what they act on is passed to every
  # call — so a page with a thousand bound elements allocates none.
  class BindingDestination
    extend T::Sig

    sig { params(target: T.untyped, key: T.nilable(String), value: T.untyped).void }
    def write(target, key, value)
      raise "BindingDestination subclasses implement write"
    end

    sig { params(target: T.untyped, key: T.nilable(String)).returns(T.untyped) }
    def read(target, key)
      raise "BindingDestination subclasses implement read"
    end

    # Whether this destination feeds the model as well as showing it.
    sig { params(target: T.untyped, key: T.nilable(String)).returns(T::Boolean) }
    def two_way?(target, key)
      false
    end

    # Whether a transformer means anything here. A checkbox shows the truth of
    # a value rather than a rendering of it, so formatting it for display would
    # be answering a question nobody asked.
    sig { returns(T::Boolean) }
    def transforms?
      true
    end

    # What to show when the path has no value. An destination that renders text
    # wants the empty string; one that hands the value onward wants the nil,
    # which means something different from "".
    sig { returns(T.untyped) }
    def null_placeholder
      ""
    end

    # Reports edits. The destination decides what "changed" means for its kind and
    # hands over its value; the binding decides what to do with it. Answers the
    # disposer that stops the reporting.
    sig do
      params(target: T.untyped, key: T.nilable(String),
             callback: T.proc.params(value: T.untyped).void).returns(T.proc.void)
    end
    def listen(target, key, callback)
      ->() {}
    end

    # Dispatched on the tag rather than a selector: this runs once per bound
    # element, and a list re-wires every row on every render.
    sig { params(element: Element).returns(BindingDestination) }
    def self.for_element(element)
      tag = element.tagName
      if tag == "INPUT"
        return T.must(shared["checkbox"]) if element.type == "checkbox"
        return T.must(shared["field"])
      end
      return T.must(shared["field"]) if tag == "TEXTAREA"
      return T.must(shared["select"]) if tag == "SELECT"
      T.must(shared["text"])
    end

    sig { returns(BindingDestination) }
    def self.element_property
      T.must(shared["property"])
    end

    # A named property on a Swill object — a control's value, a child
    # controller's represented object, anything declared.
    sig { returns(BindingDestination) }
    def self.object_property
      T.must(shared["object"])
    end

    sig { returns(T::Hash[String, BindingDestination]) }
    def self.shared
      known = @shared
      return known if known
      @shared = T.let({
        "text" => TextBindingDestination.new,
        "field" => FieldBindingDestination.new,
        "select" => SelectBindingDestination.new,
        "checkbox" => CheckboxBindingDestination.new,
        "property" => ElementPropertyBindingDestination.new,
        "object" => ObjectPropertyBindingDestination.new
      }, T.nilable(T::Hash[String, BindingDestination]))
      T.must(@shared)
    end
  end

  # An element that shows the value as its text.
  class TextBindingDestination < BindingDestination
    extend T::Sig

    sig { override.params(target: Element, key: T.nilable(String), value: T.untyped).void }
    def write(target, key, value)
      target.textContent = value
    end

    sig { override.params(target: Element, key: T.nilable(String)).returns(T.untyped) }
    def read(target, key)
      target.textContent
    end
  end

  # A form control, which carries the value in its `value` and reports edits as
  # they are typed.
  class FieldBindingDestination < BindingDestination
    extend T::Sig

    sig { override.params(target: Element, key: T.nilable(String), value: T.untyped).void }
    def write(target, key, value)
      target.value = value
    end

    sig { override.params(target: Element, key: T.nilable(String)).returns(T.untyped) }
    def read(target, key)
      target.value
    end

    # A readonly control shows the value without answering back.
    sig { override.params(target: Element, key: T.nilable(String)).returns(T::Boolean) }
    def two_way?(target, key)
      !target.hasAttribute("readonly")
    end

    sig do
      override.params(target: Element, key: T.nilable(String),
                      callback: T.proc.params(value: T.untyped).void).returns(T.proc.void)
    end
    def listen(target, key, callback)
      name = event_name
      handler = ->(event) { callback.(read(target, key)) }
      target.addEventListener(name, handler)
      ->() { target.removeEventListener(name, handler) }
    end

    # The DOM event that means "the user changed me".
    sig { returns(String) }
    def event_name
      "input"
    end
  end

  # A select commits on choice rather than on keystroke.
  class SelectBindingDestination < FieldBindingDestination
    extend T::Sig

    sig { override.returns(String) }
    def event_name
      "change"
    end
  end

  # A checkbox is the truth of the value rather than a rendering of it, so a
  # transformer has nothing to do here and nil must stay nil: "" is true.
  class CheckboxBindingDestination < FieldBindingDestination
    extend T::Sig

    sig { override.params(target: Element, key: T.nilable(String), value: T.untyped).void }
    def write(target, key, value)
      target.checked = Runtime.isTruthy(value)
    end

    sig { override.params(target: Element, key: T.nilable(String)).returns(T.untyped) }
    def read(target, key)
      target.checked
    end

    sig { override.returns(T::Boolean) }
    def transforms?
      false
    end

    sig { override.returns(T.untyped) }
    def null_placeholder
      nil
    end

    sig { override.returns(String) }
    def event_name
      "change"
    end
  end

  # A named DOM property or attribute, written one way. This is where the
  # document's own rules live: what a boolean property makes of a value, and
  # which absences remove an attribute rather than writing it empty.
  class ElementPropertyBindingDestination < BindingDestination
    extend T::Sig

    sig { override.params(target: Element, key: T.nilable(String), value: T.untyped).void }
    def write(target, key, value)
      property = T.must(key)
      # A data attribute is a flag or a value: false, nil, and "" remove it.
      # ARIA attributes keep "false", which is a state of its own.
      if property.start_with?("data-") || property.start_with?("aria-")
        if value == nil || value == "" || (value == false && property.start_with?("data-"))
          target.removeAttribute(property)
        else
          target.setAttribute(property, value)
        end
        return
      end
      if (property == "href" || property == "src") && value == nil
        target.removeAttribute(property)
        target[property] = ""
        return
      end
      target[property] = boolean_property?(property) ? Runtime.isTruthy(value) : value
    end

    sig { params(property: String).returns(T::Boolean) }
    def boolean_property?(property)
      case property
      when "disabled", "checked", "hidden", "readOnly", "required", "open" then true
      else false
      end
    end

    # nil is a value here: it is what removes an attribute.
    sig { override.returns(T.untyped) }
    def null_placeholder
      nil
    end

    sig { override.returns(T::Boolean) }
    def transforms?
      false
    end
  end

  # A declared property on a Swill object, named by key. A control's value and a
  # child controller's represented object are both this; they differ only in the
  # options the binding is established with.
  #
  # The property is reached by name rather than by calling it, because the name
  # is only known at wiring time.
  class ObjectPropertyBindingDestination < BindingDestination
    extend T::Sig

    sig { override.params(target: Swill::Object, key: T.nilable(String), value: T.untyped).void }
    def write(target, key, value)
      Runtime.write(target, T.must(key), value)
    end

    sig { override.params(target: Swill::Object, key: T.nilable(String)).returns(T.untyped) }
    def read(target, key)
      Runtime.read(target, T.must(key))
    end

    sig { override.params(target: Swill::Object, key: T.nilable(String)).returns(T::Boolean) }
    def two_way?(target, key)
      true
    end

    # A property takes the nil. Substituting "" would store a different value.
    sig { override.returns(T.untyped) }
    def null_placeholder
      nil
    end

    sig do
      override.params(target: Swill::Object, key: T.nilable(String),
                      callback: T.proc.params(value: T.untyped).void).returns(T.proc.void)
    end
    def listen(target, key, callback)
      # The runtime primitive, not Observable#observe: this disposer belongs to
      # whatever wired the region — a controller, or a list row released and
      # rewired on every render — not to the object being watched.
      Runtime.observe(target, T.must(key), ->(value) { callback.(value) })
    end
  end
end
