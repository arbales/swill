# typed: true
# frozen_string_literal: true

module Swill
  # A list whose arranged objects are ordered by one sort key. The key and
  # direction are writable computed properties, so they bind and restore. sort_states
  # maps the sorted column to its direction in aria-sort vocabulary, for
  # header bindings such as bind-aria-sort="sort_states.name"; a header cell
  # with data-column="name" data-action="sort_by" toggles that column.
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

    # Compatibility for subclasses; sort state is now derived from arrangement.
    sig { void }
    def sync_sort_states
      sort_states
    end
  end
end
