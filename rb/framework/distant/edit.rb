# typed: true
# frozen_string_literal: true

module Swill
  module Distant
    # One inline interaction. Retaining a finished edit permits scoped undo;
    # later writes or changed baselines refuse undo instead of erasing work.
    class Edit < Swill::Object
      extend T::Sig

      sig { params(object: Object).void }
      def initialize(object)
        super()
        @object = object
        @entries = T.let({}, T::Hash[String, T.untyped])
      end

      sig { params(name: String, previous: T.untyped, version: Integer, baseline: T.untyped).void }
      def record(name, previous, version, baseline) # :nodoc:
        entry = @entries[name] ||= {"previous" => previous, "baseline" => baseline}
        entry["version"] = version
      end

      sig { void }
      def finish
        @object.finish_edit(self)
      end

      sig { void }
      def rollback
        @object.check_recovery
        @entries.each do |name, entry|
          unless @object.edit_matches(name, entry["version"], entry["baseline"])
            Context.refuse("Cannot undo #{name}: it changed after this edit; changes were kept")
          end
        end
        finish
        @entries.each { |name, entry| Runtime.write(@object, name, entry["previous"]) }
        @entries = {}
      end
    end
  end
end
