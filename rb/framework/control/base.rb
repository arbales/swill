# typed: true
# frozen_string_literal: true

module Swill
  # A `Control` is a view that presents a user interface control. It can
  # coordinate several elements, with outlets and bindings owned by the control.
  # Subclasses define how user input changes their value and presentation.
  #
  # A control can load a template to connect its internal elements:
  #
  #     load_template("segmented")
  #
  # See [Controls](rdoc-ref:doc/controls.md) for markup, values, and focus.
  #
  # If you're tempted to create a subview of a Control, then
  # you're probably exceeding its intended scope.
  #
  # Control is somewhat thin at the moment, but I imagine it growing over time.
  class Control < View
    extend T::Sig
    include OutletOwner

    # The object consulted before the control resigns first responder. It may
    # implement `control_should_resign_first_responder(control, next_responder)`
    # and return false to refuse the change. The default is nil.
    # See `#resign_first_responder`.
    property :delegate, type: T.untyped, default: nil

    # Replaces the element's contents with a copy of the named control template
    # and connects its outlets, bindings, and actions to this control.
    # Raises "Control template already loaded" if a template has been loaded,
    # or "Unknown control template: ..." if the name is absent from the catalog.
    # Connections are released when the control unloads.
    sig { params(name: String).void }
    def load_template(name)
      raise "Control template already loaded" if @owns_content
      template = Templates.named(name, @element.ownerDocument)
      @owns_content = true
      @element.replaceChildren(template.content.cloneNode(true))
      Awakening.awaken_owned(@element, self)
    end

    # Invoked before first responder moves to `next_responder`. Returns false
    # if the delegate refuses; otherwise returns the superclass result.
    # An override should call `super` to preserve the delegate's decision.
    # See `#delegate`.
    sig { override.params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      current = self.delegate
      if current && current.respond_to?(:control_should_resign_first_responder)
        return false unless current.control_should_resign_first_responder(self, next_responder)
      end
      super
    end
  end
end
