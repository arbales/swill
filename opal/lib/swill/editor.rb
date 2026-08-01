# frozen_string_literal: true

module Swill
  # Base object editor. Descendant bindings resolve against represented_object;
  # Enter commits and Escape discards through the responder chain.
  class Editor < Controller
    property :represented_object

    def binding_root
      "represented_object"
    end

    def commit
      represented_object
    end

    def discard; end

    def insert_newline(_event)
      commit
    end

    def cancel_operation(_event)
      discard
    end
  end
end
