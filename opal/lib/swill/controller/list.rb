# backtick_javascript: true

module Swill
  # NSTableView-style controller backed by a <template for="row">. Generated
  # rows bind directly to collection items and are disposed on every rerender.
  class Controller::List < Controller
    property :represented_object, default: -> { [] }, coerce: ->(objects) { objects || [] }
    property :allows_multiple_selection, default: false

    html_attribute :multiple, to: :allows_multiple_selection, value: true

    # Selection is identity-based: the selected objects themselves are the
    # stored primitive. Indexes and the leading object's id derive from them,
    # so a reorder or rerender preserves selection with no bookkeeping.
    property :selected_objects, default: -> { [] }, coerce: ->(objects) { objects || [] }

    property :selected_indexes do
      arranged = arranged_objects
      selected_objects.map { |object| arranged.index(object) }.compact.sort
    end

    property :selected_object do
      selected_objects.first
    end

    property :selected_object_id do
      identifier_for(selected_object)
    end

    outlet :header_view, optional: true
    outlet :rows, optional: true

    def selected_indexes=(indexes)
      arranged = arranged_objects
      self.selected_objects = (indexes || []).map { |index| arranged[index] }.compact
    end

    def selected_object=(object)
      self.selected_objects = object.nil? ? [] : [object]
    end

    # Select by model id. An id no arranged object carries yet (state restored
    # before the data arrived) is remembered and resolves when the collection
    # changes.
    def selected_object_id=(identifier)
      identifier = identifier&.to_s
      @requested_selected_object_id = identifier
      object = object_with_id(identifier)
      self.selected_objects = [object] if object
    end

    def after_load
      super
      `#{view.element}.tabIndex = 0` unless `#{view.element}.hasAttribute("tabindex")`
      render_all
      install_selection
    end

    def represented_object_did_change(_previous, _value)
      @selection_anchor = nil
      survivors = selected_objects.select { |object| arranged_objects.include?(object) }
      if survivors.empty?
        requested = object_with_id(@requested_selected_object_id)
        survivors = [requested] if requested
      end
      self.selected_objects = survivors
      render_all if view
    end

    def selected_objects_did_change(previous, objects)
      sync_selected_rows
      previous_object = previous ? previous.first : nil
      next_object = objects.first
      @requested_selected_object_id = identifier_for(next_object) if next_object
      return if previous_object == next_object

      selected_object_did_change(previous_object, next_object) if respond_to?(:selected_object_did_change)
    end

    def select_first_if_nothing_selected
      self.selected_indexes = [0] if selected_indexes.empty? && !arranged_objects.empty?
    end

    # Enter/double-click hook. The owning controller gets the target-action by
    # default; subclasses can override for local activation behavior.
    def activate_selection
      next_responder&.perform_action(:activate_selection, self, nil)
    end

    def become_first_responder
      accepted = super
      select_first_if_nothing_selected if accepted
      accepted
    end

    def key_down(event)
      return super if arranged_objects.empty?

      current = selected_indexes.first || -1
      case event && event.key
      when "ArrowDown"
        event.prevent_default
        index = [[current + 1, 0].max, arranged_objects.length - 1].min
        self.selected_indexes = [index]
        @selection_anchor = index
      when "ArrowUp"
        event.prevent_default
        index = [[current - 1, 0].max, arranged_objects.length - 1].min
        self.selected_indexes = [index]
        @selection_anchor = index
      else
        super
      end
    end

    def insert_newline(event)
      return super if selected_indexes.empty?

      event&.prevent_default
      activate_selection
    end

    protected

    def arranged_objects
      represented_object
    end

    def render_all
      clear_rows
      arranged_objects.each do |item|
        element = make_row_element(item)
        `#{container}.appendChild(#{element})`
        binding_disposer = Bindings.wire_object(item, element)
        action_disposer = Actions.wire_object(self, element)
        row_disposers << lambda do
          binding_disposer.call
          action_disposer.call
        end
        if rows_are_views?
          row_view = View.for(element) || View.new(element)
          view.adopt_subview(row_view)
        end
        configure_row(element, item)
      end
      sync_selected_rows
    end

    # Reflect the derived indexes onto the rendered rows.
    def sync_selected_rows
      indexes = selected_indexes
      elements = row_elements
      elements.each_with_index do |element, index|
        selected = indexes.include?(index)
        `#{element}.classList.toggle("selected", #{selected})`
        `#{element}.setAttribute("aria-selected", #{selected ? "true" : "false"})`
      end
      first = indexes.first
      `#{elements[first]}.scrollIntoView({ block: "nearest" })` if first && elements[first]
    end

    def make_row_element(_item)
      template = `#{view.element}.querySelector("template")`
      element = `#{template} && #{template}.content.firstElementChild && #{template}.content.firstElementChild.cloneNode(true)`
      return element if element

      `console.warn("[Swill] " + #{self.class.name} + ": missing row template")`
      `document.createElement("div")`
    end

    def configure_row(_element, _item); end

    def rows_are_views?
      true
    end

    def clear_rows
      row_elements.each do |element|
        row_view = View.for(element)
        view.release_subview(row_view) if row_view
        row_disposers.shift&.call
        `#{element}.remove()`
      end
    end

    def row_elements
      `Array.from(#{container}.children)`.reject { |element| `#{element}.tagName === "TEMPLATE"` }
                                              .select { |element| is_row_element?(element) }
    end

    def is_row_element?(_element)
      true
    end

    def container
      rows ? rows.element : view.element
    end

    def row_disposers
      @row_disposers ||= []
    end


    private

    def install_selection
      focus_listener = ->(_event) { select_first_if_nothing_selected }
      click_listener = lambda do |event|
        index = event_row_index(event)
        next if index.negative?

        if allows_multiple_selection && `#{event}.shiftKey` && !@selection_anchor.nil?
          low, high = [@selection_anchor, index].minmax
          self.selected_indexes = (low..high).to_a
        else
          self.selected_indexes = [index]
          @selection_anchor = index
        end
        application.make_first_responder(self)
      end
      double_click_listener = lambda do |event|
        index = event_row_index(event)
        next if index.negative?

        self.selected_indexes = [index]
        @selection_anchor = index
        application.make_first_responder(self)
        activate_selection
      end
      mouse_down_listener = lambda do |event|
        next unless allows_multiple_selection && `#{event}.shiftKey`
        next if event_row_index(event).negative?

        `#{event}.preventDefault && #{event}.preventDefault()`
        `window.getSelection && window.getSelection().removeAllRanges()`
      end
      `#{view.element}.addEventListener("focus", #{focus_listener})`
      `#{container}.addEventListener("click", #{click_listener}, true)`
      `#{container}.addEventListener("dblclick", #{double_click_listener})`
      `#{container}.addEventListener("mousedown", #{mouse_down_listener})`
      register_teardown do
        `#{view.element}.removeEventListener("focus", #{focus_listener})`
        `#{container}.removeEventListener("click", #{click_listener}, true)`
        `#{container}.removeEventListener("dblclick", #{double_click_listener})`
        `#{container}.removeEventListener("mousedown", #{mouse_down_listener})`
        clear_rows
      end
    end

    def event_row_index(event)
      node = `#{event}.target`
      node = `#{node}.parentElement` while node && `#{node}.parentElement !== #{container}`
      return -1 unless node

      row_elements.index { |element| `#{element} === #{node}` } || -1
    end

    def identifier_for(object)
      object.respond_to?(:id) ? object.id&.to_s : nil
    end

    def object_with_id(identifier)
      return nil if identifier.nil? || identifier.empty?

      arranged_objects.find { |candidate| identifier_for(candidate) == identifier }
    end
  end
end
