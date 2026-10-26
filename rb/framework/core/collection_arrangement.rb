# typed: true
# frozen_string_literal: true

module Swill
  # `CollectionArrangement` adds arrangement and selection to the objects that
  # include it, with no dependence on the DOM. It gives an object:
  #
  # - `content`, and `arranged_objects`: the content filtered by
  #   `includes_object?` and sorted by `sort_key` and `sort_direction`;
  # - a selection held by object identity, so it survives filtering, sorting
  #   and replacement of the content, and `selected_object_id`, which names
  #   the selection by id before the object arrives;
  # - `array_controller`: another arrangement to delegate all of this to, so
  #   a table, a detail pane and a toolbar share one selection.
  #
  # `Controller::List` includes it to arrange its rows, and `ArrayController`
  # is the module on a plain object. A list filters by overriding
  # `includes_object?`:
  #
  #     class MembersTable < Swill::Controller::SortableList
  #       property :filter_text, type: String, default: ""
  #
  #       def includes_object?(member)
  #         member.name.downcase.include?(filter_text.downcase)
  #       end
  #     end
  #
  # See [Collections](rdoc-ref:doc/collections.md).
  module CollectionArrangement
    extend T::Sig

    sig { params(base: T.class_of(Swill::Object)).void }
    def self.included(base) # :nodoc:
      # :section: Arranging Content
      # The content, and the filtered and sorted content presented from it.

      # The collection to arrange: an array, or a `Model::Collection`, whose
      # `records` are arranged. Nil until assigned. Raises when assigned while
      # `array_controller` is set.
      base.property :content, type: T.untyped, default: nil

      # An `ArrayController` that arranges and selects on this object's
      # behalf; every property and method here delegates to it while it is
      # set. Nil by default. Raises when assigned while `content` is set, or
      # when the controller delegates, directly or through others, back to
      # this object.
      base.property :array_controller, type: "T.nilable(Swill::ArrayController)", default: nil

      # The sort key and direction, and the object `show_first` placed ahead
      # of the rest, as one value.
      base.property :arrangement_options, type: T::Hash[String, T.untyped], default: {} # :nodoc:

      # The content after filtering and sorting, in display order; an empty
      # array when there is no content. Properties read while arranging are
      # its dependencies, so it rearranges when they change.
      base.property :arranged_objects, type: T::Array[T.untyped] do
        arrange_content
      end

      # :section: Sorting
      # One key and one direction at a time.

      # The key path the arranged content is sorted by, or nil when unsorted.
      # Writing it sorts.
      base.property :sort_key, type: T.nilable(String), writer: :change_sort_key do
        controller = array_controller
        controller ? controller.sort_key : T.cast(arrangement_options["key"] || nil, T.nilable(String))
      end

      # `"ascending"` or `"descending"`. The default is `"ascending"`. Writing
      # it sorts.
      base.property :sort_direction, type: String, writer: :change_sort_direction do
        controller = array_controller
        controller ? controller.sort_direction : T.cast(arrangement_options["direction"] || "ascending", String)
      end

      # The sort key mapped to its direction, for `bind-aria-sort`; an empty
      # hash when unsorted.
      base.property :sort_states, type: T::Hash[String, String] do
        key = sort_key
        key ? { key => sort_direction } : {}
      end

      # :section: Selecting
      # The selection, held by object identity within the arranged content.

      # The requested selection: the objects, and the id to fall back to.
      base.property :selection_state, type: T::Hash[String, T.untyped], default: {} # :nodoc:

      # The selected objects that are present in the arranged content, in
      # the order they were selected; an empty array when nothing is
      # selected. Writing it replaces the selection.
      base.property :selected_objects, type: T::Array[T.untyped], writer: :select_objects do
        arranged_selection
      end

      # The id of the first selected object, or nil when nothing is selected
      # or the object has no id. Writing it selects the object with that id
      # now, or once the content includes it, which is how a restored
      # selection waits for its record.
      base.property :selected_object_id, type: T.nilable(String), writer: :select_identifier do
        controller = array_controller
        controller ? controller.selected_object_id : T.cast(selection_state["id"] || nil, T.nilable(String))
      end

      # The first selected object, or nil when nothing is selected.
      base.property :selected_object, type: T.untyped do
        selected_objects.empty? ? nil : selected_objects[0]
      end

      # The indexes of the selected objects within the arranged content, in
      # ascending order; an empty array when nothing is selected.
      base.property :selected_indexes, type: T::Array[Integer] do
        selected = selected_objects
        indexes = T.let([], T::Array[Integer])
        arranged_objects.each_with_index { |object, index| indexes << index if selected.include?(object) }
        indexes
      end
    end

    # :section: Arranging Content

    sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous) # :nodoc:
      raise "Use either content or array_controller, not both" if name == "content" && !value.nil? && array_controller

      if name == "array_controller" && value
        raise "Use either content or array_controller, not both" unless content.nil?

        cursor = T.let(T.cast(value, T.nilable(ArrayController)), T.nilable(ArrayController))
        while cursor
          raise "An array controller cannot delegate to itself" if cursor == self

          cursor = cursor.array_controller
        end
      end
      super
    end

    # Returns the content filtered by `includes_object?` and sorted by
    # `sort_key` and `sort_direction`, with the object `show_first` placed
    # ahead of the rest. Nil values sort last, numbers and booleans by value,
    # and everything else as text. The default implementation is what
    # `arranged_objects` computes; override it to arrange another way.
    sig { returns(T::Array[T.untyped]) }
    def arrange_content
      controller = array_controller
      return controller.arranged_objects if controller

      source = content
      source = source.records if collection?(source)
      objects = T.let(T.cast(source || [], T::Array[T.untyped]), T::Array[T.untyped])
      options = arrangement_options
      leading = options["source"] == content ? T.cast(options["leading"] || [], T::Array[T.untyped]) : []
      leading = leading.select { |object| includes_object?(object) }
      objects = objects.select { |object| !leading.include?(object) && includes_object?(object) }
      key = T.cast(options["key"], T.nilable(String))
      if key
        direction = options["direction"] == "descending" ? -1 : 1
        # Read each sort value once, including its observation dependency.
        values = T.let(objects.map { |object| [Runtime.read(object, key), object] }, T::Array[T::Array[T.untyped]])
        values = values.sort do |left, right|
          compare_sort_values(left[0], right[0]) * direction
        end
        objects = values.map { |entry| entry[1] }
      end
      leading + objects
    end

    # Returns whether `object` belongs in the arranged content. The default
    # implementation returns true for every object. Override it to filter;
    # properties read in the override are dependencies of the arrangement,
    # so a change to them rearranges.
    sig { params(_object: T.untyped).returns(T::Boolean) }
    def includes_object?(_object)
      true
    end

    sig { params(_previous: T.untyped, _value: T.untyped).void }
    def content_did_change(_previous, _value) # :nodoc:
      options = arrangement_options
      return unless options.key?("source")

      self.arrangement_options = { "key" => options["key"], "direction" => options["direction"] }
    end

    sig { params(objects: T.untyped).returns(T::Boolean) }
    def collection?(objects) # :nodoc:
      !objects.nil? && !objects.is_a?(Array) && objects.respond_to?(:records)
    end

    # Places `object` ahead of the arranged content, whether or not the
    # content includes it, and selects it. `includes_object?` still applies.
    # Assigning new content or sorting clears the placement.
    sig { params(object: T.untyped).void }
    def show_first(object)
      controller = array_controller
      if controller
        controller.show_first(object)
      else
        self.arrangement_options = arrangement_options.merge({ "source" => content, "leading" => [object] })
        select_object(object)
      end
    end

    # Replaces `original` with `replacement` in the content: through
    # `replace` on a `Model::Collection`, or by assigning a new array.
    # Editing a plain row ends this way. A read-only collection raises.
    sig { params(original: T.untyped, replacement: T.untyped).void }
    def replace_object(original, replacement)
      controller = array_controller
      if controller
        controller.replace_object(original, replacement)
        return
      end
      source = content
      records = collection?(source) ? source.records : source
      values = T.cast(records || [], T::Array[T.untyped]).map do |object|
        object == original ? replacement : object
      end
      if collection?(source)
        source.replace(values)
      else
        self.content = values
      end
    end

    sig { params(left: T.untyped, right: T.untyped).returns(Integer) }
    def compare_sort_values(left, right) # :nodoc:
      return 0 if left.nil? && right.nil?
      return 1 if left.nil?
      return -1 if right.nil?
      if Runtime.data_value_type(left) == "BigDecimal" && Runtime.data_value_type(right) == "BigDecimal"
        return Runtime.compare_decimal(left, right)
      end
      return left - right if Runtime.is_number(left) && Runtime.is_number(right)
      if Runtime.is_boolean(left) && Runtime.is_boolean(right)
        return (left ? 1 : 0) - (right ? 1 : 0)
      end

      Runtime.compare_text(left.to_s, right.to_s)
    end

    # :section: Sorting

    # Sorts the arranged content by `key` in `direction`, `"ascending"` or
    # `"descending"`; nil for `key` leaves the content unsorted. Raises for
    # any other direction. Sorting clears a `show_first` placement.
    sig { params(key: T.nilable(String), direction: String).void }
    def sort(key, direction)
      controller = array_controller
      if controller
        controller.sort(key, direction)
      else
        raise "Sort direction must be ascending or descending" unless %w[ascending descending].include?(direction)

        self.arrangement_options = { "key" => key, "direction" => direction }
      end
    end

    # Sorts by `key`: descending when `key` is already the sort key in
    # ascending order, ascending otherwise. A sort header's action.
    sig { params(key: String).void }
    def toggle_sort(key)
      direction = sort_key == key && sort_direction == "ascending" ? "descending" : "ascending"
      sort(key, direction)
    end

    # Sorts by `key` in the current direction; the writer of `sort_key`.
    sig { params(key: T.nilable(String)).void }
    def change_sort_key(key)
      sort(key, sort_direction)
    end

    # Sorts by the current key in `direction`; the writer of
    # `sort_direction`.
    sig { params(direction: String).void }
    def change_sort_direction(direction)
      sort(sort_key, direction)
    end

    # :section: Selecting

    sig { returns(T::Array[T.untyped]) }
    def arranged_selection # :nodoc:
      controller = array_controller
      return controller.selected_objects if controller

      objects = arranged_objects
      requested = T.cast(selection_state["objects"] || [], T::Array[T.untyped])
      selected = requested.select { |object| objects.include?(object) }
      if selected.empty?
        identifier = T.cast(selection_state["id"] || nil, T.nilable(String))
        found = identifier ? objects.find { |object| identifier_for(object) == identifier } : nil
        selected = [found] if found
      end
      selected
    end

    # Selects `objects`, replacing the current selection; the writer of
    # `selected_objects`. The array is copied. An object the arranged content
    # does not include stays requested, and is selected once it appears.
    sig { params(objects: T::Array[T.untyped]).void }
    def select_objects(objects)
      controller = array_controller
      if controller
        controller.selected_objects = objects
      else
        self.selection_state = { "objects" => objects.dup, "id" => identifier_for(objects.first) }
      end
    end

    # Selects the object whose id is `identifier`, now or once the content
    # includes it, replacing the current selection; the writer of
    # `selected_object_id`. Nil deselects.
    sig { params(identifier: T.nilable(String)).void }
    def select_identifier(identifier)
      controller = array_controller
      if controller
        controller.selected_object_id = identifier
      else
        self.selection_state = { "objects" => [], "id" => identifier }
      end
    end

    # Selects the objects at `indexes` in the arranged content, replacing
    # the current selection. An index outside the content is ignored.
    sig { params(indexes: T::Array[Integer]).void }
    def select_indexes(indexes)
      arranged = arranged_objects
      objects = T.let([], T::Array[T.untyped])
      indexes.each do |index|
        objects << arranged[index] if index >= 0 && index < arranged.length
      end
      self.selected_objects = objects
    end

    # Selects `object` alone, replacing the current selection. Nil deselects.
    sig { params(object: T.untyped).void }
    def select_object(object)
      self.selected_objects = object.nil? ? [] : [object]
    end

    # Empties the selection.
    sig { void }
    def deselect_all
      self.selected_objects = []
    end

    # Selects the first arranged object when nothing is selected and there
    # is one.
    sig { void }
    def select_first_if_nothing_selected
      select_indexes([0]) if selected_objects.empty? && !arranged_objects.empty?
    end

    # Returns the arranged object at `index`, or nil when `index` is outside
    # the arranged content.
    sig { params(index: Integer).returns(T.untyped) }
    def object_at(index)
      objects = arranged_objects
      index >= 0 && index < objects.length ? objects[index] : nil
    end

    # Returns `object`'s `id` as a string, or nil when `object` is nil, has
    # no `id`, or its id is nil.
    sig { params(object: T.untyped).returns(T.nilable(String)) }
    def identifier_for(object)
      return nil unless object
      return nil unless object.respond_to?(:id)

      value = object.id
      return nil if value.nil?

      value.to_s
    end

    # Returns the arranged object whose id is `identifier`, or nil when none
    # has it or `identifier` is nil or empty.
    sig { params(identifier: T.nilable(String)).returns(T.untyped) }
    def object_with_id(identifier)
      return nil if identifier.nil? || identifier.empty?

      arranged_objects.find { |object| identifier_for(object) == identifier }
    end

    sig { returns(T::Array[T.untyped]) }
    def current_selection # :nodoc:
      selected_objects
    end

    sig { returns(T::Array[Integer]) }
    def current_indexes # :nodoc:
      selected_indexes
    end

    sig { void }
    def reconcile_selection # :nodoc:
      selected_objects
    end
  end

  # `ArrayController` manages a collection of objects: its arrangement and
  # its selection, through `CollectionArrangement`, with no view of its own.
  # A list given one through its `bind` or its `array_controller` property
  # delegates arrangement and selection to it, so a table, a detail pane and
  # a toolbar that bind to the same controller share one selection.
  #
  #     members = MembersController.new
  #     members.content = mailing_list.members
  #
  # Subclass it to filter, by overriding `includes_object?`. The object that
  # creates a controller retains it and releases it when it unloads. See
  # [Collections](rdoc-ref:doc/collections.md).
  class ArrayController < Swill::Object
    include CollectionArrangement
    include ObjectBindings
  end
end
