# typed: true
# frozen_string_literal: true

module Swill
  # What markup connects: outlets, actions, and bindings. Interface Builder
  # archives a connector object per connection and sends it establishConnection
  # as the nib loads; here the attributes are read from the document instead, so
  # there is nothing to archive and nothing to be an instance of. These are
  # functions over an owner and its region.
  module Connections
    # Connects an application or controller's declared outlets to the elements in its owned
    # region that carry an outlet attribute. A child controller's root is a
    # candidate; nothing inside it is. Values are a
    # child controller, a view, an inert template element, or decoded JSON.
    module Outlets
      extend T::Sig

      sig { params(controller: T.any(Controller, Application, Control), root: Element).returns(T.any(Controller, Application, Control)) }
      def self.establish(controller, root)
        declared = T.let(Runtime.outlets(controller), T::Array[T.untyped])
        return controller if declared.empty?
        by_name = T.let({}, T::Hash[String, T.untyped])
        declared.each { |descriptor| by_name[descriptor.name] = descriptor }
        connected = T.let({}, T::Hash[String, Element])
        candidates(root).each do |element|
          name = T.must(element.getAttribute("outlet"))
          raise undeclared(controller, name, element, by_name.keys) unless by_name[name]
          first = connected[name]
          if first
            raise "Duplicate outlet #{name} on #{owner_name(controller)}: #{describe(first)} and " \
                  "#{describe(element)} both carry outlet=\"#{name}\"; an outlet connects one element"
          end
          connected[name] = element
          Runtime.write(controller, name, value_for(controller, by_name[name], element))
        end
        declared.each do |descriptor|
          name = descriptor.name
          raise unresolved(controller, name, root) if !descriptor.optional && !connected[name]
        end
        controller
      end

      # :section: Messages
      # What went wrong, where, and what would fix it.

      sig do
        params(controller: T.any(Controller, Application, Control), name: String, element: Element,
               declared: T::Array[String]).returns(String)
      end
      def self.undeclared(controller, name, element, declared) # :nodoc:
        owner = owner_name(controller)
        message = "Undeclared outlet #{name} on #{owner}: #{describe(element)} names an outlet #{owner} does not declare"
        similar = similar_names(name, declared)
        message += ". Did you mean #{similar.join(' or ')}?" unless similar.empty?
        known = declared.empty? ? "none" : declared.join(", ")
        "#{message} Its outlets: #{known}. Declare it with `outlet :#{name}, type: ...`, or remove the attribute"
      end

      sig { params(controller: T.any(Controller, Application, Control), name: String, root: Element).returns(String) }
      def self.unresolved(controller, name, root) # :nodoc:
        owner = owner_name(controller)
        message = "Unresolved outlet #{name} on #{owner}: no element in its region carries outlet=\"#{name}\""
        elsewhere = root.querySelector("[outlet=\"#{name}\"]")
        if elsewhere
          region = region_owner(elsewhere, root)
          message += ". #{describe(elsewhere)} does, but it is inside #{region}, whose outlets are its own"
        end
        "#{message}. Add the attribute to an element #{owner} owns, or declare the outlet `optional: true`"
      end

      # The class awakening, as markup names it.
      sig { params(controller: T.any(Controller, Application, Control)).returns(String) }
      def self.owner_name(controller) # :nodoc:
        T.let(Runtime.nameOf(controller), T.nilable(String)) || "the application"
      end

      # An element as its markup reads, by the attributes that identify it.
      sig { params(element: Element).returns(String) }
      def self.describe(element) # :nodoc:
        attributes = ["controller", "klass", "outlet", "id"].select { |name| element.hasAttribute(name) }.map do |name|
          " #{name}=\"#{element.getAttribute(name)}\""
        end
        "<#{element.tagName.downcase}#{attributes.join}>"
      end

      # The nearest controller or templated control between +element+ and
      # +root+, which owns +element+ instead.
      sig { params(element: Element, root: Element).returns(String) }
      def self.region_owner(element, root) # :nodoc:
        current = T.let(element.parentElement, T.nilable(Element))
        while current && current != root
          view = current.__swill_view__
          if current.hasAttribute("controller") || (view && view.owns_content?)
            return "#{describe(current)}'s region"
          end
          current = current.parentElement
        end
        "another region"
      end

      # Declared names close to +name+: the same once case and underscores are
      # set aside (menuBar for menu_bar), or a couple of edits away.
      sig { params(name: String, declared: T::Array[String]).returns(T::Array[String]) }
      def self.similar_names(name, declared) # :nodoc:
        folded = name.downcase.split("_").join
        limit = name.length > 3 ? 2 : 1
        declared.select do |candidate|
          candidate.downcase.split("_").join == folded || edit_distance(name, candidate) <= limit
        end
      end

      # Levenshtein distance: the insertions, deletions and substitutions
      # that turn +a+ into +b+.
      sig { params(a: String, b: String).returns(Integer) }
      def self.edit_distance(a, b) # :nodoc:
        previous = T.let([], T::Array[Integer])
        column = 0
        while column <= b.length
          previous << column
          column += 1
        end
        row = 1
        while row <= a.length
          current = T.let([row], T::Array[Integer])
          column = 1
          while column <= b.length
            cost = a[row - 1] == b[column - 1] ? 0 : 1
            deletion = T.must(previous[column]) + 1
            insertion = T.must(current[column - 1]) + 1
            substitution = T.must(previous[column - 1]) + cost
            nearer = deletion < insertion ? deletion : insertion
            current << (nearer < substitution ? nearer : substitution)
            column += 1
          end
          previous = current
          row += 1
        end
        T.must(previous[b.length])
      end

      # Everything under root carrying outlet, the root itself aside. A child
      # controller counts: it can be an outlet of its parent.
      sig { params(root: Element).returns(T::Array[Element]) }
      def self.candidates(root)
        found = T.let([], T::Array[Element])
        DOM.each_owned(root, false, ->(element, _controller_root) do
          found << element if element.hasAttribute("outlet")
        end)
        found
      end

      # The element decides what the value is: decoded JSON, the inert
      # template, a child controller, or a view. The declaration decides what it
      # must be: a typed outlet's value is checked against the declared type,
      # shallowly, as T.cast checks, so a mismatch fails here by outlet name
      # rather than at first use.
      sig { params(controller: T.any(Controller, Application, Control), descriptor: T.untyped, element: Element).returns(T.untyped) }
      def self.value_for(controller, descriptor, element)
        name = descriptor.name
        value = materialize(controller, name, element)
        typed = descriptor.type && descriptor.type != "T.untyped"
        raise "Outlet #{name} expects #{descriptor.type}" if typed && !Runtime.conforms(value, descriptor.type)
        value
      end

      sig { params(controller: T.any(Controller, Application, Control), name: String, element: Element).returns(T.untyped) }
      def self.materialize(controller, name, element)
        return decode(controller, name, element) if element.tagName == "SCRIPT" && element.type == "application/json"
        return element if element.tagName == "TEMPLATE"
        view = element.__swill_view__
        raise "Outlet #{name} is not a managed element" unless view
        owner = view.controller_value
        owner ? owner : view
      end

      sig { params(controller: T.any(Controller, Application, Control), name: String, element: Element).returns(T.untyped) }
      def self.decode(controller, name, element)
        text = element.textContent.strip
        controller.decode_outlet_data(name, text.empty? ? nil : JSON.parse(text))
      end
    end
  end
end
