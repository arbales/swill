# typed: true
# frozen_string_literal: true

module Swill
  # NSWindow field-editor analog: one editor loaned to the row being edited
  # by an EditableList, its host. Enter and Escape end the edit through the
  # host, and focus may leave the editor only when the host agrees, so a
  # focus-out commit or discard is the host's decision.
  class Controller::InlineEditor < Controller::Editor
    extend T::Sig

    sig { override.params(event: T.untyped).void }
    def insert_newline(event)
      event.preventDefault()
      host = editing_host
      host ? host.end_editing(true) : commit_editing
    end

    sig { override.params(event: T.untyped).void }
    def cancel_operation(event)
      host = editing_host
      host ? host.end_editing(false) : discard_editing
    end

    sig { override.params(next_responder: T.nilable(Responder)).returns(T::Boolean) }
    def resign_first_responder(next_responder)
      return false unless allow_resignation_to?(next_responder)
      super(next_responder)
    end

    # Focus moving within the editor is free; leaving it asks the host. No
    # host means the editor is already released.
    sig { params(responder: T.nilable(Responder)).returns(T::Boolean) }
    def allow_resignation_to?(responder)
      element = responder_element(responder)
      return true if element && @view.contains?(element)
      host = editing_host
      host ? host.editor_should_end_editing(self) : true
    end

    # The parent, when it hosts inline editing.
    sig { returns(T.untyped) }
    def editing_host
      owner = parent
      owner && owner.respond_to?(:editor_should_end_editing) ? owner : nil
    end

    sig { params(responder: T.nilable(Responder)).returns(T.untyped) }
    def responder_element(responder)
      return responder.view().element() if responder.is_a?(Controller)
      return responder.element() if responder.is_a?(View)
      nil
    end
  end
end
