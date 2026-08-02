# backtick_javascript: true

module Swill
  class Controller::EditableList < Controller::SortableList
    property :edited_object

    def activate_selection
      index = selected_indexes.first
      index ? begin_editing(index) : super
    end

    def editing?
      !@editor.nil?
    end

    def begin_editing(index)
      return false unless index && arranged_objects[index]
      return false if editing? && !end_editing(true)

      original = arranged_objects[index]
      copy = original.respond_to?(:draft) ? original.draft : original.dup
      open_editor(index, original, copy)
    end

    def end_editing(commit)
      editor = @editor
      index = @editing_index
      original = @editing_original
      return true unless editor && index

      copy = commit ? editor.commit : nil
      if commit && (error = validation_error(copy))
        editing_did_fail_validation(error)
        return false
      end

      editor.discard unless commit
      close_editor
      if commit
        commit_edit(copy, original, index)
      else
        finish_edit(index)
      end
      true
    end

    def commit_editing_if_needed
      !editing? || end_editing(true)
    end

    def editor_should_end_editing(editor)
      copy = editor.commit
      unless edited_object_has_changes?(copy, @editing_original)
        end_editing(false)
        return true
      end
      return false unless confirm_edit?(copy, @editing_original)
      return false if (error = validation_error(copy)) && editing_did_fail_validation(error) != true

      end_editing(true)
    end

    def cancel_operation(event)
      return end_editing(false) if editing?

      super
    end

    def toggle_sort(key)
      return false unless commit_editing_if_needed

      super
    end

    protected

    def commit_edit(copy, original, index)
      final = apply_edit(copy, original, index)
      finish_edit(index, final)
      final
    end

    def apply_edit(copy, original, index)
      if original.respond_to?(:apply_draft)
        original.apply_draft(copy)
        original
      else
        source_index = represented_object.index(original)
        values = represented_object.dup
        values[source_index] = copy if source_index
        self.represented_object = values
        copy
      end
    end

    def validation_error(object)
      return unless object&.respond_to?(:validate)

      result = object.validate
      result if result.is_a?(Exception)
    rescue StandardError => error
      error
    end

    # Whether a focus-out commit should proceed. Defaults to committing;
    # applications override to interpose their own confirmation UI.
    def confirm_edit?(_copy, _original)
      true
    end

    def edited_object_has_changes?(copy, original)
      return copy.dirty? if copy.respond_to?(:dirty?)

      copy != original
    end

    def editing_did_fail_validation(error)
      warn("[Swill] #{self.class}: #{error.message}")
      false
    end

    def editing_did_fail_save(error)
      warn("[Swill] #{self.class}: save failed: #{error.message}")
    end

    def is_row_element?(element)
      super && (!@editor || `#{element} !== #{@editor.view.element}`)
    end

    # Direct child first so a nested list's editor template is not grabbed;
    # plain iteration rather than :scope>/[for=…] selectors keeps the DOM
    # shim's minimal selector engine sufficient.
    def editor_template_element
      direct = `Array.from(#{view.element}.children)`.find do |child|
        `#{child}.tagName === "TEMPLATE" && #{child}.getAttribute("for") === "editor"`
      end
      direct || `#{view.element}.querySelector('template[for="editor"]')`
    end

    def open_editor(index, original, copy)
      template = editor_template_element
      row = row_elements[index]
      unless template && row
        warn("[Swill] #{self.class}: missing <template for=\"editor\">")
        return false
      end

      node = `#{template}.content.firstElementChild && #{template}.content.firstElementChild.cloneNode(true)`
      return false unless node

      self.edited_object = copy
      `#{row}.classList.add("being-edited")`
      `#{row}.after(#{node})`
      controllers = Awakening.wire(node)
      editor = View.controller_for(node) || controllers.first
      unless editor.is_a?(Controller::InlineEditor)
        Awakening.detach(node)
        `#{node}.remove()`
        raise TypeError, "editable-list editor must use Swill::Controller::InlineEditor"
      end
      editor.bind(:represented_object, to: self, key_path: "edited_object")
      # Controls inside the editor delegate resignation to it, so a focus-out
      # commit consults editor_should_end_editing before letting go.
      editor.view.subviews.each do |subview|
        subview.delegate = editor if subview.is_a?(Control)
      end
      @editor = editor
      @editing_index = index
      @editing_original = original
      application.make_first_responder(editor)
      true
    end

    def close_editor
      editor = @editor
      @editor = nil
      @editing_index = nil
      @editing_original = nil
      self.edited_object = nil
      return unless editor

      element = editor.view.element
      Awakening.detach(element)
      `#{element}.remove()`
    end

    def finish_edit(index, final = nil)
      row = row_elements[index]
      `#{row}.classList.remove("being-edited")` if row
      self.selected_object = final if final
      application.make_first_responder(self)
    end
  end
end
