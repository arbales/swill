# typed: true
# frozen_string_literal: true

module Swill
  module Connections
    # Reads the binding attributes in a region and establishes a Binding for
    # each. This is the markup side only: what a binding then does is
    # Swill::Binding's business, and the same binding can be established in
    # Ruby through ObjectBindings#bind.
    #
    #   bind="path"                  two-way for form controls, one-way for text
    #   bind="path" transform="name" through a registered ValueTransformer
    #   bind-prop="path"             one-way DOM property; a path may end in a
    #                                value reader (name.blank?, delta.positive?)
    #
    # Paths resolve under the controller's binding_root; a leading @ ignores it.
    # A bind on a child controller's root belongs to this owner and feeds the
    # child's represented_object; bind-* on that root belongs to the child.
    module Bindings
      extend T::Sig

      sig { params(controller: Controller).returns(Controller) }
      def self.establish(controller)
        root = controller.view.element
        prefix = controller.binding_root
        disposers = T.let([], T::Array[T.proc.void])
        properties_in(controller, prefix, root, disposers)
        region_in(controller, prefix, root, disposers)
        controller.retain(releasing(disposers))
        controller
      end

      # A region owned by an object rather than a controller: paths resolve
      # directly against the object, and the region's root may carry bind
      # itself (bind="@" is the object). When that root is a controller's,
      # only its represented object comes from here; the controller wires the
      # rest as its own region. Answers the disposer.
      sig { params(element: Element, object: Swill::Object).returns(T.proc.void) }
      def self.establish_in(element, object)
        disposers = T.let([], T::Array[T.proc.void])
        disposers << connect(object, element, nil) if element.hasAttribute("bind")
        unless element.hasAttribute("controller")
          properties_in(object, nil, element, disposers)
          region_in(object, nil, element, disposers)
        end
        releasing(disposers)
      end

      # A bind on a child controller's root belongs to this owner and feeds the
      # child's represented object; its bind-* properties belong to the child.
      sig { params(object: Swill::Object, prefix: T.nilable(Symbol), element: Element, disposers: T::Array[T.proc.void]).void }
      def self.region_in(object, prefix, element, disposers)
        DOM.each_owned(element, false, ->(child, _controller_root) do
          disposers << connect(object, child, prefix) if child.hasAttribute("bind")
          properties_in(object, prefix, child, disposers) unless child.hasAttribute("controller")
        end)
      end

      sig { params(object: Swill::Object, prefix: T.nilable(Symbol), element: Element, disposers: T::Array[T.proc.void]).void }
      def self.properties_in(object, prefix, element, disposers)
        element.getAttributeNames.each do |name|
          next unless name.start_with?("bind-")
          property = T.must(name.slice(5, name.length))
          disposers << connect_property(object, prefix, element, property, T.must(element.getAttribute(name)))
        end
      end

      # One disposer that releases all of these, for a caller that retains a
      # wired region as a whole.
      sig { params(disposers: T::Array[T.proc.void]).returns(T.proc.void) }
      def self.releasing(disposers)
        ->() { disposers.each { |dispose| dispose.() } }
      end

      sig { params(prefix: T.nilable(Symbol), path: String).returns(String) }
      def self.resolve_path(prefix, path)
        return path.slice(1, path.length) || "" if path[0] == "@"
        return path if prefix == nil
        path.length == 0 ? "#{prefix}" : "#{prefix}.#{path}"
      end

      # The element's transform="name", or nil; an unregistered name is an
      # error at wiring, not a silent passthrough.
      sig { params(element: Element).returns(T.nilable(ValueTransformer)) }
      def self.transformer_for(element)
        name = element.getAttribute("transform")
        return nil unless name
        transformer = ValueTransformer.named(name)
        raise "unknown transform #{name}" unless transformer
        transformer
      end

      # A value binding. On a child controller's root the value becomes the
      # child's represented object; otherwise it renders into the element.
      sig { params(object: Swill::Object, element: Element, prefix: T.nilable(Symbol)).returns(T.proc.void) }
      def self.connect(object, element, prefix)
        path = resolve_path(prefix, T.must(element.getAttribute("bind")))
        transformer = transformer_for(element)
        view = element.__swill_view__
        child = view ? view.controller_value : nil
        return connect_represented_object(object, child, path) if child
        return connect_control(object, T.cast(view, Control), path, transformer) if view.is_a?(Control)

        # What kind of element this is, and so what "its value" means, is the
        # destination's business rather than the binding's.
        destination = BindingDestination.for_element(element)
        Binding.establish(destination, element, nil, object, path,
                          transformer, destination.null_placeholder, false)
      end

      # A control's own value property is kept equal to the path, both ways;
      # the control decides how that reaches its element.
      sig { params(object: Swill::Object, control: Control, path: String, transformer: T.nilable(ValueTransformer)).returns(T.proc.void) }
      def self.connect_control(object, control, path, transformer)
        # A control renders the value, so an absent one shows as empty.
        Binding.establish(BindingDestination.object_property, control, "value", object, path,
                          transformer, "", false)
      end

      sig { params(object: Swill::Object, child: Controller, path: String).returns(T.proc.void) }
      def self.connect_represented_object(object, child, path)
        # The same destination as a control value, bound with different options:
        # the child is handed the value as it is, and never answers back.
        Binding.establish(BindingDestination.object_property, child, "represented_object", object, path,
                          nil, nil, true)
      end

      sig { params(object: Swill::Object, prefix: T.nilable(Symbol), element: Element, property: String, path: String).returns(T.proc.void) }
      def self.connect_property(object, prefix, element, property, path)
        # The attribute is spelled as HTML spells it; the property is not.
        name = property == "readonly" ? "readOnly" : property
        Binding.establish(BindingDestination.element_property, element, name, object,
                          resolve_path(prefix, path), nil, nil, false)
      end
    end
  end
end
