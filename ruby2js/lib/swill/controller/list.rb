# typed: true
# frozen_string_literal: true

module Swill
  # NSTableView analog. One row per arranged object, cloned from the list's
  # own <template for="row">; cells bind straight to their object, and a
  # row's actions reach this controller first. Rows are owned views by
  # default, and a controller inside a row belongs to this list. Pre-rendered
  # rows are replaced at awakening, so they carry no bindings of their own.
  #
  # Selection is identity-based: the selected objects are the stored value
  # and the indexes and leading object derive from them, so a rerender or
  # reorder keeps the selection without bookkeeping. selected_object_id names
  # the selection by model id: it follows the selection, and writing it
  # selects the matching object now or, when no arranged object carries the
  # id yet, once the collection changes. That is the path to restore.
  class Controller::List < Controller
    extend T::Sig
    include Ownership

    # NSTableHeaderView analog; never a row.
    outlet :header_view, type: Swill::View, optional: true

    # Where rows mount; without it, rows go into the list's own element.
    outlet :rows, type: Swill::View, optional: true

    # Shift-click extends the selection from the last plain click. A multiple
    # attribute on the root turns this on from markup.
    property :allows_multiple_selection, type: T::Boolean, default: false

    property :selected_objects, type: T::Array[T.untyped], default: []

    property :selected_object_id, type: T.nilable(String), default: nil

    # Indexes of the selected objects among the arranged objects, ascending.
    property :selected_indexes, type: T::Array[Integer] do
      selection = current_selection
      found = []
      arranged_objects.forEach { |object, index| found.push(index) if selection.includes(object) }
      found
    end

    property :selected_object, type: T.untyped do
      leading(current_selection)
    end

    # ---- selection ----

    sig { params(indexes: T.untyped).void }
    def select_indexes(indexes)
      arranged = arranged_objects
      objects = []
      indexes.forEach do |index|
        objects.push(arranged[index]) if index >= 0 && index < arranged.length
      end
      self.selected_objects = objects
    end

    sig { params(object: T.untyped).void }
    def select_object(object)
      self.selected_objects = object == nil ? [] : [object]
    end

    sig { void }
    def deselect_all
      self.selected_objects = []
    end

    sig { void }
    def select_first_if_nothing_selected
      select_indexes([0]) if current_selection.length == 0 && arranged_objects.length > 0
    end

    # Enter and double-click. By default the owner receives an
    # activate_selection target-action with this list as the sender; when no
    # responder handles it, nothing happens.
    sig { void }
    def activate_selection
      target = next_responder
      handler = target ? target.action_target("activate_selection") : nil
      Runtime.performAction(handler, "activate_selection", self, nil) if handler
    end

    # Runs when the leading selected object changes, not when only the
    # indexes do. The runtime keeps selected_object current because this
    # hook exists, and dispatches it before selected_objects_did_change.
    sig { params(_previous: T.untyped, _object: T.untyped).void }
    def selected_object_did_change(_previous, _object); end

    # The arranged object at index, or nil.
    sig { params(index: Integer).returns(T.untyped) }
    def object_at(index)
      arranged = arranged_objects
      index >= 0 && index < arranged.length ? arranged[index] : nil
    end

    # The index of the row containing element, or -1 when it is in none; the
    # way an action handler learns which row its sender sits in.
    sig { params(element: T.untyped).returns(Integer) }
    def row_for(element)
      mount = container
      node = element
      node = node.parentElement while node && node.parentElement != mount
      node ? row_elements.indexOf(node) : -1
    end

    # ---- lifecycle ----

    sig { override.void }
    def view_did_load
      super
      root = @view.element()
      root.setAttribute("tabindex", "0") unless root.hasAttribute("tabindex")
      self.allows_multiple_selection = true if root.hasAttribute("multiple")
    end

    # After outlets connect, so rows and header_view are known.
    sig { override.void }
    def awake_from_dom
      super
      install_selection
      @awakened = true
      render_all
    end

    sig { params(_previous: T.untyped, _objects: T.untyped).void }
    def represented_object_did_change(_previous, _objects)
      @selection_anchor = nil
      render_all if @awakened
      reconcile_selection
    end

    sig { params(_previous: T.untyped, objects: T.untyped).void }
    def selected_objects_did_change(_previous, objects)
      sync_selected_rows
      return if @syncing_selection
      syncing_selection(->() { self.selected_object_id = identifier_for(leading(objects)) })
    end

    # An id nobody carries clears the selection and stays pending.
    sig { params(_previous: T.untyped, identifier: T.nilable(String)).void }
    def selected_object_id_did_change(_previous, identifier)
      return if @syncing_selection
      object = object_with_id(identifier)
      syncing_selection(->() { self.selected_objects = object ? [object] : [] })
    end

    # ---- keyboard ----

    # Taking the keyboard selects the first row when nothing is selected.
    sig { override.returns(T::Boolean) }
    def become_first_responder
      return false unless super
      select_first_if_nothing_selected
      true
    end

    # Arrow keys move a single selection; everything else continues up.
    sig { override.params(event: T.untyped).void }
    def key_down(event)
      total = arranged_objects.length
      key = event.key
      if total > 0 && (key == "ArrowDown" || key == "ArrowUp")
        event.preventDefault()
        indexes = current_indexes
        current = indexes.length > 0 ? indexes[0] : -1
        index = key == "ArrowDown" ? current + 1 : current - 1
        index = 0 if index < 0
        index = total - 1 if index > total - 1
        select_indexes([index])
        @selection_anchor = index
      else
        super
      end
    end

    # Enter activates the selection when there is one.
    sig { override.params(event: T.untyped).void }
    def insert_newline(event)
      if current_selection.length > 0
        event.preventDefault()
        activate_selection
      else
        super
      end
    end

    # ---- rows ----

    # The objects the rows show, in order; subclasses may sort or filter.
    sig { returns(T.untyped) }
    def arranged_objects
      self.represented_object || []
    end

    # Where rows mount.
    sig { returns(T.untyped) }
    def container
      mount = self.rows
      mount ? mount.element() : @view.element()
    end

    sig { returns(View) }
    def container_view
      mount = self.rows
      mount ? mount : @view
    end

    # Rows in order: the container's children other than templates and
    # whatever row_element? rejects.
    sig { returns(T.untyped) }
    def row_elements
      found = []
      each_child(container, ->(child) { found.push(child) if child.tagName != "TEMPLATE" && row_element?(child) })
      found
    end

    # Override when other children share the container. The header view is
    # never a row.
    sig { params(element: T.untyped).returns(T::Boolean) }
    def row_element?(element)
      header = self.header_view
      header == nil || header.element() != element
    end

    # Real views per row, or bare elements when many rows must stay cheap.
    sig { returns(T::Boolean) }
    def rows_are_views?
      true
    end

    sig { returns(T.untyped) }
    def row_template
      found = owned_matching(@view.element(), 'template[for="row"]')
      found.length > 0 ? found[0] : nil
    end

    # The element for item. Clones the row template; override to build rows
    # in code. Bindings, actions, selection, and configure_row still apply.
    sig { params(_item: T.untyped).returns(T.untyped) }
    def make_row_element(_item)
      template = row_template
      node = template ? template.content.firstElementChild : nil
      raise 'List has no <template for="row"> and no make_row_element override' unless node
      node.cloneNode(true)
    end

    # NSTableView willDisplayCell analog.
    sig { params(_element: T.untyped, _item: T.untyped).void }
    def configure_row(_element, _item); end

    sig { void }
    def render_all
      clear_rows
      arranged_objects.forEach { |item| attach_row(item) }
      sync_selected_rows
    end

    sig { params(item: T.untyped).void }
    def attach_row(item)
      element = make_row_element(item)
      container.appendChild(element)
      if rows_are_views?
        row_view = element.__swill_view__ || View.new(element)
        container_view.adopt_subview(row_view)
      end
      # Managed elements inside the row awaken under it before its bindings
      # are wired, so a controller root in a row is fed by bind like any
      # child, and finishes loading with its represented object in place.
      awakening = Awakening.new
      controllers = awakening.awaken(element)
      release_bindings = Bindings.new.wire_object(item, element)
      release_actions = Actions.new.wire_into(self, element)
      element.__swill_row__ = ->() do
        release_bindings.()
        release_actions.()
      end
      awakening.finish(controllers)
      configure_row(element, item)
    end

    sig { void }
    def clear_rows
      row_elements.forEach { |element| release_row(element) }
    end

    sig { params(element: T.untyped).void }
    def release_row(element)
      Awakening.new.detach(element)
      release = element.__swill_row__
      if release
        release.()
        element.__swill_row__ = nil
      end
      row_view = element.__swill_view__
      row_view.remove_from_superview() if row_view
      element.remove()
    end

    # Reflect the selection onto the rendered rows and keep the leading
    # selected row in view.
    sig { void }
    def sync_selected_rows
      return unless @awakened
      indexes = current_indexes
      elements = row_elements
      elements.forEach do |element, index|
        selected = indexes.includes(index)
        element.classList.toggle("selected", selected)
        element.setAttribute("aria-selected", selected ? "true" : "false")
      end
      first = indexes.length > 0 ? elements[indexes[0]] : nil
      first.scrollIntoView({block: "nearest"}) if first && first.scrollIntoView
    end

    # ---- mouse: click selects, shift-click extends, double-click activates ----

    sig { void }
    def install_selection
      root = @view.element()
      @on_mouse_down = ->(event) { row_mouse_down(event) }
      @on_click = ->(event) { row_clicked(event) }
      @on_double_click = ->(event) { row_double_clicked(event) }
      root.addEventListener("mousedown", @on_mouse_down)
      # Capture, so the selection is current before a row's own action runs.
      root.addEventListener("click", @on_click, true)
      root.addEventListener("dblclick", @on_double_click)
      register_teardown(->() do
        root.removeEventListener("mousedown", @on_mouse_down)
        root.removeEventListener("click", @on_click, true)
        root.removeEventListener("dblclick", @on_double_click)
        clear_rows
        @awakened = false
      end)
    end

    # Shift-click extends the selection; suppress the browser's text
    # selection sweep across rows.
    sig { params(event: T.untyped).void }
    def row_mouse_down(event)
      return unless self.allows_multiple_selection && event.shiftKey
      return if row_for(event.target) < 0
      event.preventDefault()
      owner_document = @view.element().ownerDocument
      selection = owner_document.getSelection ? owner_document.getSelection() : nil
      selection.removeAllRanges() if selection
    end

    sig { params(event: T.untyped).void }
    def row_clicked(event)
      index = row_for(event.target)
      return if index < 0
      anchor = @selection_anchor
      if self.allows_multiple_selection && event.shiftKey && anchor != nil
        select_range(anchor, index)
      else
        select_indexes([index])
        @selection_anchor = index
      end
    end

    sig { params(event: T.untyped).void }
    def row_double_clicked(event)
      index = row_for(event.target)
      return if index < 0
      select_indexes([index])
      @selection_anchor = index
      activate_selection
    end

    sig { params(anchor: Integer, index: Integer).void }
    def select_range(anchor, index)
      low = anchor < index ? anchor : index
      high = anchor < index ? index : anchor
      indexes = []
      current = low
      while current <= high
        indexes.push(current)
        current += 1
      end
      select_indexes(indexes)
    end

    # ---- identity ----

    # The model id of object as a string, or nil when it has none.
    sig { params(object: T.untyped).returns(T.nilable(String)) }
    def identifier_for(object)
      return nil unless object && Runtime.respondsTo(object, "id")
      value = Runtime.read(object, "id")
      value == nil ? nil : "#{value}"
    end

    sig { params(identifier: T.nilable(String)).returns(T.untyped) }
    def object_with_id(identifier)
      return nil if identifier == nil || identifier == ""
      arranged_objects.find { |candidate| identifier_for(candidate) == identifier }
    end

    # Selection survivors after the collection changed; when none remain, the
    # id that is still wanted may now resolve.
    sig { void }
    def reconcile_selection
      arranged = arranged_objects
      survivors = current_selection.filter { |object| arranged.includes(object) }
      if survivors.length == 0
        requested = object_with_id(self.selected_object_id)
        survivors = [requested] if requested
      end
      syncing_selection(->() { self.selected_objects = survivors })
    end

    # A write from one side of the selection to the other is marked so the
    # other side's hook does not write back.
    sig { params(callback: T.proc.void).void }
    def syncing_selection(callback)
      @syncing_selection = true
      begin
        callback.()
      ensure
        @syncing_selection = false
      end
    end

    sig { params(objects: T.untyped).returns(T.untyped) }
    def leading(objects)
      objects && objects.length > 0 ? objects[0] : nil
    end

    # The selection and its indexes as JavaScript arrays for the DOM code here.
    sig { returns(T.untyped) }
    def current_selection
      self.selected_objects
    end

    sig { returns(T.untyped) }
    def current_indexes
      self.selected_indexes
    end
  end
end
