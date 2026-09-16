# typed: true
# frozen_string_literal: true

module Swill
  # A list whose arranged objects are ordered by one sort key. The key and
  # direction are stored properties, so they bind and restore. sort_states
  # maps the sorted column to its direction in aria-sort vocabulary, for
  # header bindings such as bind-aria-sort="sort_states.name"; a header cell
  # with data-column="name" data-action="sort_by" toggles that column.
  # Selection is by identity in List, so a reorder keeps it.
  class Controller::SortableList < Controller::List
    extend T::Sig

    property :sort_key, type: T.nilable(String), default: nil
    property :sort_direction, type: String, default: "ascending"
    property :sort_states, type: T::Hash[String, String], default: {}

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

    # The same key flips the direction; a new key sorts ascending.
    sig { params(key: String).void }
    def toggle_sort(key)
      if self.sort_key == key
        self.sort_direction = self.sort_direction == "ascending" ? "descending" : "ascending"
      else
        sort(key, "ascending")
      end
    end

    # Set the key and direction together, re-rendering once.
    sig { params(key: T.nilable(String), direction: String).void }
    def sort(key, direction)
      @changing_sort = true
      begin
        self.sort_key = key
        self.sort_direction = direction
      ensure
        @changing_sort = false
      end
      sort_did_change
    end

    sig { override.void }
    def awake_from_dom
      super
      sync_sort_states
    end

    sig { params(_previous: T.untyped, _key: T.untyped).void }
    def sort_key_did_change(_previous, _key)
      sort_did_change unless @changing_sort
    end

    sig { params(_previous: T.untyped, _direction: T.untyped).void }
    def sort_direction_did_change(_previous, _direction)
      sort_did_change unless @changing_sort
    end

    sig { void }
    def sort_did_change
      sync_sort_states
      render_all if @awakened
    end

    # The represented objects in sort order: nil values last when ascending,
    # numbers and booleans by value, everything else as text.
    sig { override.returns(T::Array[T.untyped]) }
    def arranged_objects
      objects = super
      key = self.sort_key
      return objects unless key
      sign = self.sort_direction == "descending" ? -1 : 1
      objects.sort do |left, right|
        Runtime.compareValues(Runtime.read(left, key), Runtime.read(right, key)) * sign
      end
    end

    sig { void }
    def sync_sort_states
      key = self.sort_key
      states = T.let({}, T::Hash[String, String])
      states[key] = self.sort_direction if key
      self.sort_states = states
    end
  end
end
