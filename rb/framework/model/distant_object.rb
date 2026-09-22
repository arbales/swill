# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # A generated client representative of an authoritative server record.
    class DistantObject < Editable
      extend T::Sig
      include DistantData

      property :deleted, type: T::Boolean, default: false
      property :deleted?, type: T::Boolean do
        deleted
      end

      # Initializes partial-field tracking for the generated declarations.
      sig { void }
      def initialize
        super()
        Swill::Runtime.initialize_distant_data(self)
      end

      # Schedules hydration when a declared member is unknown.
      sig { params(name: String).void }
      def property_will_access(name)
        super(name)
        Swill::Runtime.data_field_will_access(self, name) if self.class.data_fields.key?(name)
      end

      # Creates or updates this record and applies the authoritative response.
      sig { returns(T.self_type) }
      async def save
        T.unsafe(await Swill::Runtime.data_save(self))
      end

      # Persists changes from a draft made by this object.
      sig { params(copy: T.self_type).returns(T.self_type) }
      async def apply_draft(copy)
        T.unsafe(await Swill::Runtime.apply_data_draft(self, copy))
      end

      # Deletes this record and leaves this reference as a tombstone.
      sig { returns(T.self_type) }
      async def delete
        T.unsafe(await Swill::Runtime.data_delete(self))
      end

      # Returns a detached editable copy that never hydrates independently.
      sig { returns(T.self_type) }
      def draft
        T.unsafe(Swill::Runtime.data_draft(self))
      end
    end
  end
end
