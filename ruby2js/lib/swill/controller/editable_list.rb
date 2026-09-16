# typed: true
# frozen_string_literal: true

module Swill
  # A sortable list whose rows can be edited in place. At most one editor
  # exists at a time, cloned from the list's own <template for="editor">
  # whose root is an InlineEditor controller, mounted after the row being
  # edited. The edit works on a copy: a model's draft, or a duplicate of a
  # plain object. The copy is edited_object here and the editor's
  # represented_object through an object binding; a commit applies the draft
  # back to the original (or replaces a plain object in the collection) and
  # a discard drops it. Enter commits, Escape discards, and focus leaving the
  # editor asks editor_should_end_editing. The editor's commit_editing is
  # asked first; an editor that cannot push its pending edit keeps it open.
  # One edit in progress: the editor loaned to a row, the row's index, and
  # the object the row showed. The copy being edited lives on the list as
  # edited_object.
  class RowEdit < Swill::Object
    extend T::Sig

    sig { params(editor: Controller::InlineEditor, index: Integer, original: T.untyped).void }
    def initialize(editor, index, original)
      super()
      @editor = editor
      @index = index
      @original = original
    end

    sig { returns(Controller::InlineEditor) }
    def editor
      @editor
    end

    sig { returns(Integer) }
    def index
      @index
    end

    sig { returns(T.untyped) }
    def original
      @original
    end
  end

  class Controller::EditableList < Controller::SortableList
    extend T::Sig

    property :edited_object, type: T.untyped, default: nil

    # Activation edits the selected row instead of telling the owner.
    sig { override.void }
    def activate_selection
      indexes = current_indexes
      if indexes.empty?
        super
      else
        begin_editing(T.must(indexes[0]))
      end
    end

    sig { returns(T::Boolean) }
    def editing?
      @edit != nil
    end

    # Teardown closes an open editor without committing.
    sig { override.void }
    def awake_from_dom
      super
      register_teardown(->() { close_editor })
    end

    # Whether the editor opened. An edit in progress is committed first; a
    # refused commit keeps that editor.
    sig { params(index: Integer).returns(T::Boolean) }
    def begin_editing(index)
      original = object_at(index)
      return false unless original
      return false if editing? && !end_editing(true)
      copy = original.respond_to?(:draft) ? original.draft : original.dup
      open_editor(index, original, copy)
    end

    # False only when a commit was refused; the editor then stays open.
    sig { params(commit: T::Boolean).returns(T::Boolean) }
    def end_editing(commit)
      edit = @edit
      return true unless edit
      if commit
        return false unless edit.editor.commit_editing
        copy = self.edited_object
        error = validation_error(copy)
        if error
          editing_did_fail_validation(error)
          return false
        end
        close_editor
        commit_edit(copy, edit.original, edit.index)
      else
        edit.editor.discard_editing
        close_editor
        finish_edit(edit.index, nil)
      end
      true
    end

    # NSEditor commitEditing: ask before anything that cannot proceed past an
    # edit in progress.
    sig { returns(T::Boolean) }
    def commit_editing_if_needed
      !editing? || end_editing(true)
    end

    # Asked by the inline editor when focus is leaving it. An unchanged copy
    # is discarded; otherwise the edit commits when confirm_edit? agrees.
    # Return false to keep focus in the editor.
    sig { params(_editor: T.untyped).returns(T::Boolean) }
    def editor_should_end_editing(_editor)
      edit = @edit
      return true unless edit
      copy = self.edited_object
      unless edited_object_has_changes?(copy, edit.original)
        end_editing(false)
        return true
      end
      return false unless confirm_edit?(copy, edit.original)
      end_editing(true)
    end

    sig { override.params(event: KeyboardEvent).void }
    def cancel_operation(event)
      if editing?
        end_editing(false)
      else
        super(event)
      end
    end

    sig { override.params(key: String).void }
    def toggle_sort(key)
      super(key) if commit_editing_if_needed
    end

    # A new collection ends an edit without committing: its row is gone.
    sig { override.params(previous: T.untyped, objects: T.untyped).void }
    def represented_object_did_change(previous, objects)
      end_editing(false) if editing?
      super(previous, objects)
    end

    # ---- policy hooks ----

    sig { params(copy: T.untyped, original: T.untyped, index: Integer).void }
    def commit_edit(copy, original, index)
      finish_edit(index, apply_edit(copy, original, index))
    end

    # A model takes its draft back and stays the row's object; a plain object
    # is replaced by the copy in a new collection. Returns the final object.
    sig { params(copy: T.untyped, original: T.untyped, _index: Integer).returns(T.untyped) }
    def apply_edit(copy, original, _index)
      if original.respond_to?(:apply_draft)
        original.apply_draft(copy)
        return original
      end
      source = T.let(self.represented_object || [], T::Array[T.untyped])
      source_index = source.index(original)
      values = source.dup
      values[source_index] = copy if source_index
      self.represented_object = values
      copy
    end

    # An error that refuses the commit, or nil. Attribute validators already
    # ran when the draft was written; a model's own validate, when it has
    # one, is asked here.
    sig { params(object: T.untyped).returns(T.untyped) }
    def validation_error(object)
      return nil unless object && object.respond_to?(:validate)
      object.validate
    end

    # Whether a focus-out commit should proceed. Override to confirm.
    sig { params(_copy: T.untyped, _original: T.untyped).returns(T::Boolean) }
    def confirm_edit?(_copy, _original)
      true
    end

    # Dirty tracking decides for a model; a plain copy counts as changed.
    sig { params(copy: T.untyped, _original: T.untyped).returns(T::Boolean) }
    def edited_object_has_changes?(copy, _original)
      return true unless copy && copy.respond_to?(:dirty?)
      copy.dirty? == true
    end

    # Override to show the error; the editor stays open.
    sig { params(error: T.untyped).void }
    def editing_did_fail_validation(error)
      warn("Edit refused: #{error.message}")
    end

    # ---- rows and the editor ----

    # The editor sits among the rows while editing, but is not one.
    sig { override.params(element: Element).returns(T::Boolean) }
    def row_element?(element)
      return false unless super(element)
      edit = @edit
      edit == nil || edit.editor.view.element != element
    end

    sig { returns(T.nilable(HTMLTemplateElement)) }
    def editor_template
      found = owned_matching(@view.element, 'template[for="editor"]')
      found.empty? ? nil : T.cast(found[0], HTMLTemplateElement)
    end

    # Mount an editor after the row, bind it to the copy, and give it the
    # keyboard.
    sig { params(index: Integer, original: T.untyped, copy: T.untyped).returns(T::Boolean) }
    def open_editor(index, original, copy)
      row = row_elements[index]
      return false unless row
      node = instantiate_editor
      self.edited_object = copy
      container_view.mark(row, "being-edited", true)
      container_view.insert_after(row, node)
      editor = awaken_editor(node)
      editor.bind(:represented_object, to: self, key_path: "edited_object")
      @edit = RowEdit.new(editor, index, original)
      application.make_first_responder(editor)
      true
    end

    # A fresh element from the editor template.
    sig { returns(Element) }
    def instantiate_editor
      template = editor_template
      raise 'EditableList has no <template for="editor">' unless template
      node = container_view.clone_template(template)
      raise 'The editor template is empty' unless node
      node
    end

    # The inline editor rooted at a mounted node; anything else is torn back
    # down before the mistake is reported.
    sig { params(node: Element).returns(Controller::InlineEditor) }
    def awaken_editor(node)
      Awakening.wire(node)
      editor = View.controller_for(node)
      return T.cast(editor, Controller::InlineEditor) if editor.is_a?(Controller::InlineEditor)
      Awakening.detach(node)
      container_view.remove(node)
      raise 'The editor template root must be a Swill::Controller::InlineEditor'
    end

    sig { void }
    def close_editor
      edit = @edit
      @edit = nil
      self.edited_object = nil
      return unless edit
      element = edit.editor.view.element
      Awakening.detach(element)
      container_view.remove(element)
    end

    # The row is a row again, the final object is selected, and the list
    # takes the keyboard back.
    sig { params(index: Integer, final: T.untyped).void }
    def finish_edit(index, final)
      row = row_elements[index]
      container_view.mark(row, "being-edited", false) if row
      select_object(final) if final
      application.make_first_responder(self)
    end
  end
end
