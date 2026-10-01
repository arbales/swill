# typed: true
# frozen_string_literal: true

module Swill
  # Turns server HTML into objects. One walk creates a View for each managed
  # element, adopts it into the nearest view, and attaches controllers; the
  # lifecycle then runs children first so a parent's awake_from_dom sees wired
  # children. Elements with only bind or data-action stay raw DOM.
  module Awakening
    extend T::Sig

    # Returns the new controllers in document order. Awakening a fragment that
    # already sits under a live view adopts it into that view's tree.
    sig { params(root: Element).returns(T::Array[Controller]) }
    def self.instantiate(root)
      controllers = awaken(root)
      finish(controllers)
      controllers
    end

    # The load phase only: view_did_load, outlets, bindings, actions, and
    # awake_from_dom, children first. The application restores window state
    # between this and finish.
    sig { params(root: Element).returns(T::Array[Controller]) }
    def self.awaken(root)
      controllers = prepare(root)
      controllers.reverse.each { |controller| load(controller) }
      controllers
    end

    # Build the object tree before any lifecycle callbacks run.
    sig { params(root: Element).returns(T::Array[Controller]) }
    def self.prepare(root)
      controllers = T.let([], T::Array[Controller])
      walk(root, nearest_view(root.parentElement), controllers)
      controllers
    end

    # The host already exists. Only its copied children need awakening.
    sig { params(root: Element, owner: Control).void }
    def self.awaken_owned(root, owner)
      controllers = T.let([], T::Array[Controller])
      DOM.each_child(root, ->(child) { walk(child, owner, controllers) })
      Connections::Outlets.establish(owner, root)
      disposers = T.let([], T::Array[T.proc.void])
      Connections::Bindings.region_in(owner, nil, root, disposers)
      owner.retain(Connections::Bindings.releasing(disposers))
      owner.retain(Connections::Actions.establish_in(root, owner, include_root: false))
      controllers.reverse.each { |controller| load(controller) }
      finish(controllers)
    end

    # controller_did_load once per controller, then appearance.
    sig { params(controllers: T::Array[Controller]).void }
    def self.finish(controllers)
      controllers.reverse.each { |controller| controller.controller_did_load }
      controllers.reverse.each { |controller| controller.view_will_appear }
      controllers.reverse.each { |controller| controller.view_did_appear }
    end

    # Whatever view_did_load adds awakens as markup does, before the
    # region's bindings and actions connect to it.
    sig { params(controller: Controller).void }
    def self.load(controller)
      root = controller.view.element
      Connections::Outlets.establish(controller, root)
      controller.view_did_load
      added = T.let([], T::Array[Controller])
      DOM.each_child(root, ->(child) { walk(child, controller.view, added) })
      added.reverse.each { |child| load(child) }
      finish(added)
      Connections::Bindings.establish(controller)
      Connections::Actions.establish(controller)
      controller.awake_from_dom
    end

    # An element that already has a View, such as a list row created in code,
    # is part of the tree whatever its attributes say.
    sig { params(element: Element, owner: T.nilable(View), controllers: T::Array[Controller]).void }
    def self.walk(element, owner, controllers)
      view = element.__swill_view__
      view = create_view(element) if !view && managed?(element)
      if view
        owner.adopt_subview(view) if owner && !view.superview
        if element.hasAttribute("controller") && !view.controller_value
          controller = T.cast(Runtime.resolve(T.must(element.getAttribute("controller"))).new, Controller)
          controller.attach(element)
          controllers << controller
        end
      end
      return if view && view.owns_content?
      next_owner = view || owner
      DOM.each_child(element, ->(child) { walk(child, next_owner, controllers) })
    end

    # A live element with klass, controller, or outlet. Templates and JSON
    # scripts are inert content, never objects.
    sig { params(element: Element).returns(T::Boolean) }
    def self.managed?(element)
      return false unless element.nodeType == 1
      return false if element.tagName == "TEMPLATE" || element.tagName == "SCRIPT"
      element.hasAttribute("klass") || element.hasAttribute("controller") || element.hasAttribute("outlet")
    end

    # klass names a View subclass; a plain managed element gets a plain View.
    sig { params(element: Element).returns(View) }
    def self.create_view(element)
      name = element.getAttribute("klass")
      return View.new(element) unless name
      view = Runtime.resolve(name).new(element)
      raise "#{name} is not a Swill::View" unless view.is_a?(View)
      view
    end

    # Every controller in a subtree in document order, the node included.
    sig { params(node: Element).returns(T::Array[Controller]) }
    def self.controllers_within(node)
      found = T.let([], T::Array[Controller])
      collect_controllers(node, found)
      found
    end

    sig { params(element: Element, found: T::Array[Controller]).void }
    def self.collect_controllers(element, found)
      view = element.__swill_view__
      controller = view ? view.controller_value : nil
      found << controller if controller
      DOM.each_child(element, ->(child) { collect_controllers(child, found) })
    end

    # The counterpart of wire for a subtree being removed. Teardown recurses
    # into descendants and is idempotent, so document order is fine.
    sig { params(node: Element).void }
    def self.detach(node)
      view = node.__swill_view__
      controller = view ? view.controller_value : nil
      if controller
        controller.unload
      elsif view
        view.unload
      else
        DOM.each_child(node, ->(child) { detach(child) })
      end
    end

    sig { params(element: T.nilable(Element)).returns(T.nilable(View)) }
    def self.nearest_view(element)
      return nil unless element
      view = element.__swill_view__
      view ? view : nearest_view(element.parentElement)
    end
  end
end
