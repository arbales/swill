# backtick_javascript: true

module Swill
  class Controller::SortableList < Controller::List
    property :sort_key
    property :sort_dir, default: "asc"
    property :sort_states, default: -> { {} }

    def after_load
      super
      self.sort_states = sort_state_map
    end

    def sort_key_did_change(_previous, _value)
      sort_did_change
    end

    def sort_dir_did_change(_previous, _value)
      sort_did_change
    end

    def sort_by(sender, _event = nil)
      key = `#{sender}.getAttribute("data-column")`
      toggle_sort(key.to_s) if key
    end

    def toggle_sort(key)
      selected = selected_object
      @changing_sort = true
      if sort_key == key
        self.sort_dir = sort_dir == "asc" ? "desc" : "asc"
      else
        self.sort_key = key
        self.sort_dir = "asc"
      end
      @changing_sort = false
      sort_did_change
      self.selected_object = selected
    end

    protected

    def arranged_objects
      return represented_object unless sort_key

      represented_object.sort do |left, right|
        comparison = compare_values(value_for_sort(left, sort_key), value_for_sort(right, sort_key))
        sort_dir == "asc" ? comparison : -comparison
      end
    end

    private

    def sort_did_change
      return if @changing_sort

      self.sort_states = sort_state_map
      render_all
    end

    def sort_state_map
      return {} unless header_view && sort_key

      states = {}
      `Array.from(#{header_view.element}.querySelectorAll("[data-column]"))`.each do |element|
        key = `#{element}.getAttribute("data-column")`.to_s
        states[key] = sort_dir if key == sort_key
      end
      states
    end

    def value_for_sort(object, key)
      if object.respond_to?(key)
        object.public_send(key)
      elsif object.respond_to?(:[])
        object[key] || object[key.to_sym]
      end
    end

    def compare_values(left, right)
      return 0 if left.nil? && right.nil?
      return 1 if left.nil?
      return -1 if right.nil?
      return left <=> right if left.is_a?(Numeric) && right.is_a?(Numeric)
      if [true, false].include?(left) && [true, false].include?(right)
        return (left ? 1 : 0) <=> (right ? 1 : 0)
      end

      left.to_s <=> right.to_s
    end
  end
end
