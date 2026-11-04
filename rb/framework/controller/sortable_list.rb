# typed: true
# frozen_string_literal: true

module Swill
  # A list whose arranged objects are ordered by one sort key. The key and
  # direction are writable computed properties, so they bind and restore. A
  # header cell with data-column="name" data-action="sort_by" toggles that
  # column, and the list marks the sorted one: the `sorted-ascending` or
  # `sorted-descending` class, which themes draw, and `aria-sort`.
  # Selection is by identity in List, so a reorder keeps it.
  class Controller::SortableList < Controller::List
    extend T::Sig

    # The sort_by action: the sender's column names the key.
    sig { params(sender: Element).void }
    def sort_by(sender)
      key = sort_key_for(sender)
      toggle_sort(key) if key
    end

    # Override when the column name lives elsewhere than data-column.
    sig { params(sender: Element).returns(T.nilable(String)) }
    def sort_key_for(sender)
      sender.getAttribute("data-column")
    end

    sig { override.void }
    def awake_from_dom
      super
      mark_sorted_column
    end

    # Marks the newly sorted header cell.
    sig { params(_previous: T.untyped, _states: T.untyped).void }
    def sort_states_did_change(_previous, _states)
      mark_sorted_column if @awakened
    end

    # Marks each header cell the list owns with its column's sort direction,
    # and clears the others.
    sig { void }
    def mark_sorted_column # :nodoc:
      states = sort_states
      DOM.owned_matching(@view.element, "[data-column]").each do |cell|
        direction = states[sort_key_for(cell) || ""]
        cell.classList.toggle("sorted-ascending", direction == "ascending")
        cell.classList.toggle("sorted-descending", direction == "descending")
        if direction
          cell.setAttribute("aria-sort", direction)
        else
          cell.removeAttribute("aria-sort")
        end
      end
    end
  end
end
