# backtick_javascript: true

module Swill
  # NSTableView-style controller backed by a <template for="row">. Generated
  # rows bind directly to collection items and are disposed on every rerender.
  class List < Controller
    property :represented_object, default: -> { [] }
    property :selected_indexes, default: -> { [] }

    property :selected_objects do
      selected_indexes.map { |index| represented_object[index] }.compact
    end

    property :selected_object do
      selected_objects.first
    end

    outlet :rows, optional: true

    def after_load
      super
      @allows_multiple_selection = `#{view.element}.hasAttribute("multiple")`
      render_all
      install_selection
    end

    def represented_object_did_change(_previous, _value)
      self.selected_indexes = []
      @selection_anchor = nil
      render_all if view
    end

    def selected_indexes_did_change(_previous, indexes)
      row_elements.each_with_index do |element, index|
        selected = indexes.include?(index)
        `#{element}.classList.toggle("selected", #{selected})`
        `#{element}.setAttribute("aria-selected", #{selected ? "true" : "false"})`
      end
    end

    def select_first_if_nothing_selected
      self.selected_indexes = [0] if selected_indexes.empty? && !represented_object.empty?
    end

    def key_down(event)
      return super if represented_object.empty?

      current = selected_indexes.first || -1
      case event && event.key
      when "ArrowDown"
        `#{event}.preventDefault()`
        index = [[current + 1, 0].max, represented_object.length - 1].min
        self.selected_indexes = [index]
      when "ArrowUp"
        `#{event}.preventDefault()`
        self.selected_indexes = [[current - 1, 0].max]
      else
        super
      end
    end

    private

    def render_all
      clear_rows
      represented_object.each do |item|
        element = make_row_element
        `#{container}.appendChild(#{element})`
        row_disposers << Bindings.wire_object(item, element)
      end
      selected_indexes_did_change([], selected_indexes)
    end

    def make_row_element
      template = `#{view.element}.querySelector("template")`
      element = `#{template} && #{template}.content.firstElementChild && #{template}.content.firstElementChild.cloneNode(true)`
      return element if element

      `console.warn("[Swill] " + #{self.class.name} + ": missing row template")`
      `document.createElement("div")`
    end

    def clear_rows
      row_elements.each do |element|
        row_disposers.shift&.call
        `#{element}.remove()`
      end
    end

    def row_elements
      `Array.from(#{container}.children)`.reject { |element| `#{element}.tagName === "TEMPLATE"` }
    end

    def container
      rows ? rows.element : view.element
    end

    def row_disposers
      @row_disposers ||= []
    end

    def install_selection
      listener = lambda do |event|
        node = `#{event}.target`
        node = `#{node}.parentElement` while node && `#{node}.parentElement !== #{container}`
        next unless node

        index = `Array.from(#{container}.children).filter(function(child) {
          return child.tagName !== "TEMPLATE";
        }).indexOf(#{node})`
        if @allows_multiple_selection && `#{event}.shiftKey` && !@selection_anchor.nil?
          low, high = [@selection_anchor, index].minmax
          self.selected_indexes = (low..high).to_a
        else
          self.selected_indexes = [index]
          @selection_anchor = index
        end
      end
      `#{container}.addEventListener("click", #{listener})`
      register_teardown do
        `#{container}.removeEventListener("click", #{listener})`
        clear_rows
      end
    end
  end
end
