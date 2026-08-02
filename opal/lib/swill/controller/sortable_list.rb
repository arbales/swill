# backtick_javascript: true

module Swill
  class Controller::SortableList < Controller::List
    # One stored sort descriptor; key and direction derive from it, so a
    # toggle is a single change notification and selection — identity-based
    # in List — survives the reorder with no bookkeeping.
    property :sort, default: -> { {} }
    property :sort_states, default: -> { {} }

    # Plain readers, not computeds: the did-change hook runs before computed
    # invalidation, so a cached reader would be stale inside sort_did_change.
    # Reads still auto-track — they record the underlying :sort property.
    def sort_key
      sort[:key]
    end

    def sort_dir
      sort[:dir] || "asc"
    end

    def sort_key=(key)
      self.sort = { key: key, dir: sort_dir }
    end

    def sort_dir=(dir)
      self.sort = { key: sort_key, dir: dir }
    end

    def after_load
      super
      sync_sort_states
    end

    def sort_did_change(_previous, _value)
      sync_sort_states
      render_all if view
    end

    def sort_by(sender, _event = nil)
      key = `#{sender}.getAttribute("data-column")`
      toggle_sort(key.to_s) if key
    end

    def toggle_sort(key)
      self.sort = if sort_key == key
                    { key: key, dir: sort_dir == "asc" ? "desc" : "asc" }
                  else
                    { key: key, dir: "asc" }
                  end
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

    def sync_sort_states
      self.sort_states = sort_key ? { sort_key => sort_dir } : {}
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
