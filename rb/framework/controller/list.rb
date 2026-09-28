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
    include CollectionArrangement

    # bind accepts either content or an explicit arrangement owner.
    property :represented_object, type: T.untyped, writer: :set_represented_object do
      array_controller || content
    end

    sig { params(objects: T.untyped).void }
    def set_represented_object(objects)
      return if represented_object == objects
      @setting_content = true
      begin
        if objects.is_a?(ArrayController)
          self.content = nil
          self.array_controller = T.cast(objects, ArrayController)
        else
          self.array_controller = nil
          self.content = objects
        end
      ensure
        @setting_content = false
      end
      render_all if @awakened
    end

    # NSTableHeaderView analog; never a row.
    outlet :header_view, type: Swill::View, optional: true

    # Where rows mount; without it, rows go into the list's own element.
    outlet :rows, type: Swill::View, optional: true

    # Shift-click extends the selection from the last plain click. A multiple
    # attribute on the root turns this on from markup.
    property :allows_multiple_selection, type: T::Boolean, default: false

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

    # The index of the row containing element, or -1 when it is in none; the
    # way an action handler learns which row its sender sits in.
    sig { params(element: Element).returns(Integer) }
    def row_for(element)
      row = container_view.child_containing(element)
      index = row ? row_elements.index(row) : nil
      index == nil ? -1 : index
    end

    # ---- lifecycle ----

    sig { override.void }
    def view_did_load
      super
      @view.ensure_focusable
      self.allows_multiple_selection = true if @view.has_attribute?("multiple")
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
    def represented_object_did_change(_previous, _objects); end

    sig { params(_previous: T.untyped, _objects: T.untyped).void }
    def arranged_content_did_change(_previous, _objects)
      @selection_anchor = nil
      render_all if @awakened && !@setting_content
    end

    sig { params(_previous: T.untyped, _objects: T.untyped).void }
    def selected_objects_did_change(_previous, _objects)
      sync_selected_rows unless @setting_content
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
    sig { override.params(event: KeyboardEvent).void }
    def key_down(event)
      total = arranged_objects.length
      return super if total == 0

      indexes = current_indexes
      current = indexes.empty? ? -1 : T.must(indexes[0])
      if event.key == "ArrowDown"
        event.preventDefault
        index = current < 0 ? 0 : current + 1
        index = total - 1 if index > total - 1
        select_indexes([index])
        @selection_anchor = index
      elsif event.key == "ArrowUp"
        event.preventDefault
        if current <= 0
          cancel_operation(event)
        else
          select_indexes([current - 1])
          @selection_anchor = current - 1
        end
      else
        super
      end
    end

    # Enter activates the selection when there is one.
    sig { override.params(event: KeyboardEvent).void }
    def insert_newline(event)
      if !current_selection.empty?
        event.preventDefault
        activate_selection
      else
        super
      end
    end

    # ---- rows ----

    # Where rows mount.
    sig { returns(Element) }
    def container
      self.rows&.element || @view.element
    end

    sig { returns(View) }
    def container_view
      mount = self.rows
      mount ? mount : @view
    end

    # Rows in order: the container's children other than templates and
    # whatever row_element? rejects.
    sig { returns(T::Array[Element]) }
    def row_elements
      found = T.let([], T::Array[Element])
      DOM.each_child(container, ->(child) { found << child if child.tagName != "TEMPLATE" && row_element?(child) })
      found
    end

    # Override when other children share the container. The header view is
    # never a row.
    sig { params(element: Element).returns(T::Boolean) }
    def row_element?(element)
      header = self.header_view
      header == nil || header.element != element
    end

    # Real views per row, or bare elements when many rows must stay cheap.
    sig { returns(T::Boolean) }
    def rows_are_views?
      true
    end

    sig { returns(T.nilable(HTMLTemplateElement)) }
    def row_template
      found = DOM.owned_matching(@view.element, 'template[for="row"]')
      found.empty? ? nil : T.cast(found[0], HTMLTemplateElement)
    end

    # The element for item. Clones the row template; override to build rows
    # in code. Bindings, actions, selection, and configure_row still apply.
    sig { params(_item: T.untyped).returns(Element) }
    def make_row_element(_item)
      template = row_template
      raise 'List has no <template for="row"> and no make_row_element override' unless template
      container_view.clone_template(template)
    end

    # NSTableView willDisplayCell analog.
    sig { params(_element: Element, _item: T.untyped).void }
    def configure_row(_element, _item); end

    sig { void }
    def render_all
      clear_rows
      arranged_objects.each { |item| attach_row(item) }
      sync_selected_rows
    end

    sig { params(item: T.untyped).void }
    def attach_row(item)
      element = make_row_element(item)
      container_view.append(element)
      if rows_are_views?
        row_view = View.of(element) || View.new(element)
        container_view.adopt_subview(row_view)
      end
      # Managed elements inside the row awaken under it before its bindings
      # are wired, so a controller root in a row is fed by bind like any
      # child, and finishes loading with its represented object in place.
      controllers = Awakening.awaken(element)
      release_bindings = Connections::Bindings.establish_in(element, item)
      release_actions = Connections::Actions.establish_in(element, self)
      element.__swill_row__ = ->() do
        release_bindings.()
        release_actions.()
      end
      Awakening.finish(controllers)
      configure_row(element, item)
    end

    sig { void }
    def clear_rows
      row_elements.each { |element| release_row(element) }
    end

    sig { params(element: Element).void }
    def release_row(element)
      Awakening.detach(element)
      release = element.__swill_row__
      if release
        release.()
        element.__swill_row__ = nil
      end
      row_view = View.of(element)
      row_view.remove_from_superview if row_view
      container_view.remove(element)
    end

    # Reflect the selection onto the rendered rows and keep the leading
    # selected row in view.
    sig { void }
    def sync_selected_rows
      return unless @awakened
      indexes = current_indexes
      elements = row_elements
      elements.each_with_index do |element, index|
        container_view.mark_selected(element, indexes.include?(index))
      end
      first = indexes.empty? ? nil : elements[T.must(indexes[0])]
      container_view.reveal(first) if first
    end

    # ---- mouse: click selects, shift-click extends, double-click activates ----

    sig { void }
    def install_selection
      stop_mouse_down = @view.listen("mousedown", ->(event) { row_mouse_down(event) })
      # Capture, so the selection is current before a row's own action runs.
      stop_click = @view.listen("click", ->(event) { row_clicked(event) }, capture: true)
      stop_double_click = @view.listen("dblclick", ->(event) { row_double_clicked(event) })
      retain(->() do
        stop_mouse_down.()
        stop_click.()
        stop_double_click.()
        clear_rows
        @awakened = false
      end)
    end

    # Shift-click extends the selection; suppress the browser's text
    # selection sweep across rows.
    sig { params(event: MouseEvent).void }
    def row_mouse_down(event)
      return unless self.allows_multiple_selection && event.shiftKey
      return if row_for(event.target) < 0
      event.preventDefault
      @view.clear_text_selection
    end

    sig { params(event: MouseEvent).void }
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

    sig { params(event: MouseEvent).void }
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
      indexes = T.let([], T::Array[Integer])
      current = low
      while current <= high
        indexes << current
        current += 1
      end
      select_indexes(indexes)
    end

  end
end
