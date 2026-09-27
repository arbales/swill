# typed: true
# frozen_string_literal: true

module Swill
  # DOM-independent arrangement and selection, shared by lists and array controllers.
  module CollectionArrangement
    extend T::Sig

    sig { params(base: T.class_of(Swill::Object)).void }
    def self.included(base)
      base.property :content, type: T.untyped, default: nil
      base.property :array_controller, type: "T.nilable(Swill::ArrayController)", default: nil
      base.property :arrangement_options, type: T::Hash[String, T.untyped], default: {}
      base.property :selection_state, type: T::Hash[String, T.untyped], default: {}

      base.property :arranged_content, type: T::Array[T.untyped] do
        arrange_content
      end
      base.property :selected_objects, type: T::Array[T.untyped], writer: :select_objects do
        arranged_selection
      end
      base.property :selected_object_id, type: T.nilable(String), writer: :select_identifier do
        controller = array_controller
        controller ? controller.selected_object_id : T.cast(selection_state["id"] || nil, T.nilable(String))
      end
      base.property :selected_object, type: T.untyped do
        selected_objects.empty? ? nil : selected_objects[0]
      end
      base.property :selected_indexes, type: T::Array[Integer] do
        selected = selected_objects
        indexes = T.let([], T::Array[Integer])
        arranged_objects.each_with_index { |object, index| indexes << index if selected.include?(object) }
        indexes
      end
      base.property :sort_key, type: T.nilable(String), writer: :change_sort_key do
        controller = array_controller
        controller ? controller.sort_key : T.cast(arrangement_options["key"] || nil, T.nilable(String))
      end
      base.property :sort_direction, type: String, writer: :change_sort_direction do
        controller = array_controller
        controller ? controller.sort_direction : T.cast(arrangement_options["direction"] || "ascending", String)
      end
      base.property :sort_states, type: T::Hash[String, String] do
        key = sort_key
        key ? { key => sort_direction } : {}
      end
    end

    sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous)
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

    # Keep the existing overridable method; the underlying computation is cached.
    sig { returns(T::Array[T.untyped]) }
    def arranged_objects
      arranged_content
    end

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

    # Property reads in this hook become arrangement dependencies automatically.
    sig { params(_object: T.untyped).returns(T::Boolean) }
    def includes_object?(_object)
      true
    end

    sig { params(_previous: T.untyped, _value: T.untyped).void }
    def content_did_change(_previous, _value)
      options = arrangement_options
      return unless options.key?("source")

      self.arrangement_options = { "key" => options["key"], "direction" => options["direction"] }
    end

    sig { params(objects: T.untyped).returns(T::Boolean) }
    def collection?(objects)
      !objects.nil? && !objects.is_a?(Array) && objects.respond_to?(:records)
    end

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

    sig { params(key: String).void }
    def toggle_sort(key)
      direction = sort_key == key && sort_direction == "ascending" ? "descending" : "ascending"
      sort(key, direction)
    end

    sig { params(key: T.nilable(String)).void }
    def change_sort_key(key)
      sort(key, sort_direction)
    end

    sig { params(direction: String).void }
    def change_sort_direction(direction)
      sort(sort_key, direction)
    end

    # Temporary presentation inclusion, cleared by new content or explicit sorting.
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

    # Editing a plain row replaces its source object; read-only sources reject it.
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
    def compare_sort_values(left, right)
      return 0 if left.nil? && right.nil?
      return 1 if left.nil?
      return -1 if right.nil?
      return left - right if Runtime.is_number(left) && Runtime.is_number(right)
      if Runtime.is_boolean(left) && Runtime.is_boolean(right)
        return (left ? 1 : 0) - (right ? 1 : 0)
      end

      Runtime.compare_text(left.to_s, right.to_s)
    end

    sig { returns(T::Array[T.untyped]) }
    def arranged_selection
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

    sig { params(objects: T::Array[T.untyped]).void }
    def select_objects(objects)
      controller = array_controller
      if controller
        controller.selected_objects = objects
      else
        self.selection_state = { "objects" => objects.dup, "id" => identifier_for(objects.first) }
      end
    end

    sig { params(identifier: T.nilable(String)).void }
    def select_identifier(identifier)
      controller = array_controller
      if controller
        controller.selected_object_id = identifier
      else
        self.selection_state = { "objects" => [], "id" => identifier }
      end
    end

    sig { params(indexes: T::Array[Integer]).void }
    def select_indexes(indexes)
      arranged = arranged_objects
      objects = T.let([], T::Array[T.untyped])
      indexes.each do |index|
        objects << arranged[index] if index >= 0 && index < arranged.length
      end
      self.selected_objects = objects
    end

    sig { params(object: T.untyped).void }
    def select_object(object)
      self.selected_objects = object.nil? ? [] : [object]
    end

    sig { void }
    def deselect_all
      self.selected_objects = []
    end

    sig { void }
    def select_first_if_nothing_selected
      select_indexes([0]) if selected_objects.empty? && !arranged_objects.empty?
    end

    sig { params(index: Integer).returns(T.untyped) }
    def object_at(index)
      objects = arranged_objects
      index >= 0 && index < objects.length ? objects[index] : nil
    end

    sig { params(object: T.untyped).returns(T.nilable(String)) }
    def identifier_for(object)
      return nil unless object
      return nil unless object.respond_to?(:id)

      value = object.id
      return nil if value.nil?

      value.to_s
    end

    sig { params(identifier: T.nilable(String)).returns(T.untyped) }
    def object_with_id(identifier)
      return nil if identifier.nil? || identifier.empty?

      arranged_objects.find { |object| identifier_for(object) == identifier }
    end

    sig { returns(T::Array[T.untyped]) }
    def current_selection
      selected_objects
    end

    sig { returns(T::Array[Integer]) }
    def current_indexes
      selected_indexes
    end

    # Compatibility for subclasses that previously reconciled after arranging.
    sig { void }
    def reconcile_selection
      selected_objects
    end
  end

  # Use directly, subclass to filter, or include the same module on a controller.
  class ArrayController < Swill::Object
    include CollectionArrangement
    include ObjectBindings
  end
end
