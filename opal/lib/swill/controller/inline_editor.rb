# frozen_string_literal: true
# backtick_javascript: true

module Swill
  # NSWindow field-editor analogue loaned to an EditableList for one row.
  class Controller::InlineEditor < Controller::Editor
    def insert_newline(_event)
      parent.end_editing(true)
    end

    def cancel_operation(_event)
      parent.end_editing(false)
    end

    def resign_first_responder(next_responder = nil)
      return false unless allow_resignation_to?(next_responder)

      super
    end

    def control_should_resign_first_responder(_control, next_responder)
      allow_resignation_to?(next_responder)
    end

    private

    def allow_resignation_to?(responder)
      element = Focus.responder_element(responder)
      return true if element && `#{view.element}.contains(#{element})`
      return true unless parent&.respond_to?(:editor_should_end_editing)

      parent.editor_should_end_editing(self)
    end
  end
end
