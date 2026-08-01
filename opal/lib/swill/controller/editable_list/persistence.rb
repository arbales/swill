# frozen_string_literal: true

module Swill
  class Controller::EditableList
    # Optional asynchronous save policy. The base editable list has no wire or
    # persistence dependency; including this concern opts into model saving.
    module Persistence
      protected

      def commit_edit(copy, original, index)
        return super unless copy.respond_to?(:save)

        copy.save(wire: persistence_wire).then do
          final = if copy.respond_to?(:id) && copy.class.respond_to?(:get)
                    copy.class.get(copy.id) || copy
                  else
                    copy
                  end
          final = apply_edit(final, original, index) unless final.equal?(original)
          finish_edit(index, final)
          final
        end.fail do |error|
          editing_did_fail_save(error)
          open_editor(index, original, copy)
          nil
        end
      end

      def persistence_wire
        Wire
      end
    end
  end
end
