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

      # Gives each to-many relationship its stable collection.
      sig { void }
      def initialize
        super
        @data_field_states = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @data_draft_source = T.let(nil, T.nilable(DistantObject))
        self.class.data_fields.each do |name, descriptor|
          next unless descriptor["kind"] == "many"
          Swill::Runtime.write(self, name, Swill::Model::Collection.new)
        end
      end

      # Schedules hydration when a declared member is unknown.
      sig { params(name: String).void }
      def property_will_access(name)
        super
        return if draft? || deleted?
        DistantClient.default.demand(self, name) if self.class.data_fields.key?(name)
      end

      # Loads a field explicitly, surfacing any transport error.
      sig { params(name: Symbol).returns(T.untyped) }
      async def load_field(name)
        raise "A distant draft cannot hydrate fields" if draft?
        raise "A deleted distant object cannot hydrate fields" if deleted?
        raise "An unsaved distant object cannot hydrate fields" unless id
        await DistantClient.default.load_field(self, name.to_s, false)
      end

      # Loads a field again even when it already has a value.
      sig { params(name: Symbol).returns(T.untyped) }
      async def reload_field(name)
        raise "A distant draft cannot hydrate fields" if draft?
        raise "A deleted distant object cannot hydrate fields" if deleted?
        raise "An unsaved distant object cannot hydrate fields" unless id
        await DistantClient.default.load_field(self, name.to_s, true)
      end

      # Creates or updates this record and applies the authoritative response.
      sig { returns(T.self_type) }
      async def save
        raise "Cannot persist a deleted distant object" if deleted?
        raise "Save a distant draft with original.apply_draft(draft)" if draft?

        attributes = collect_dirty_attributes
        return self if id && attributes.empty?

        if id
          await DistantClient.default.update(self, attributes)
        else
          await DistantClient.default.create(self, attributes)
        end
        mark_clean!
        self
      end

      # Persists changes from a draft made by this object.
      sig { params(copy: DistantObject).returns(T.self_type) }
      async def apply_draft(copy)
        raise "Cannot persist a deleted distant object" if deleted?
        unless copy.draft_from?(self)
          raise "apply_draft requires a draft created from this distant object"
        end

        attributes = copy.collect_dirty_attributes
        return self if attributes.empty?

        await DistantClient.default.update(self, attributes)
        copy.mark_clean!
        self
      end

      # Deletes this record and leaves this reference as a tombstone.
      sig { returns(T.self_type) }
      async def delete
        raise "Cannot persist a deleted distant object" if deleted?
        raise "Save a distant draft with original.apply_draft(draft)" if draft?
        raise "Cannot delete an unsaved distant object" unless id

        await DistantClient.default.delete(self)
        self
      end

      # Returns a detached editable copy that never hydrates independently.
      sig { returns(T.self_type) }
      def draft
        raise "Cannot draft a deleted distant object" if deleted?
        raise "Save a distant object before drafting it" unless id

        copy = self.class.new
        copy.attach_data_draft(self)
        attributes = T.let({"id" => id}, T::Hash[T.untyped, T.untyped])
        self.class.data_fields.each do |name, descriptor|
          next unless descriptor["kind"] == "field" && data_field_loaded(name)
          attributes[name] = Swill::Runtime.read(self, name)
        end
        copy.apply_attributes(attributes)
        copy.present_data_field("id")
        attributes.each { |name, _value| copy.present_data_field(name.to_s) }
        copy.mark_clean!
        copy
      end

      # Whether this object is a detached editing copy.
      sig { returns(T::Boolean) }
      def draft?
        !@data_draft_source.nil?
      end

      # Internal distant-data state. It is ordinary Ruby state so the model's
      # behavior is the same on MRI and in compiled applications.
      sig { params(original: DistantObject).void }
      def attach_data_draft(original)
        @data_draft_source = original
      end

      sig { params(original: DistantObject).returns(T::Boolean) }
      def draft_from?(original)
        @data_draft_source == original
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_loaded(name)
        data_field_state(name)["status"] == "present"
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_loading(name)
        data_field_state(name)["status"] == "loading"
      end

      sig { params(name: String).returns(T.nilable(String)) }
      def data_field_error(name)
        T.cast(data_field_state(name)["error"], T.nilable(String))
      end

      # Returns whether a request should be made.
      sig { params(name: String, reload: T::Boolean).returns(T::Boolean) }
      def begin_data_field_load(name, reload)
        state = data_field_state(name)
        return false if !reload && state["status"] == "present"
        return false if !reload && state["status"] == "loading"
        state["status"] = "loading"
        state["error"] = nil
        true
      end

      sig { params(name: String, message: String).void }
      def fail_data_field(name, message)
        state = data_field_state(name)
        state["status"] = "failed"
        state["error"] = message
      end

      sig { params(name: String).void }
      def present_data_field(name)
        state = data_field_state(name)
        state["status"] = "present"
        state["error"] = nil
      end

      # Apply one authoritative member unless a newer response already won.
      sig { params(name: String, value: T.untyped, generation: Integer, overwrite_dirty: T::Boolean).void }
      def apply_data_field(name, value, generation, overwrite_dirty)
        state = data_field_state(name)
        return if generation < T.cast(state["generation"], Integer)
        state["generation"] = generation
        state["status"] = "present"
        state["error"] = nil
        return if !overwrite_dirty && dirty_attributes.include?(name)

        descriptor = self.class.data_fields[name]
        if descriptor && descriptor["kind"] == "many"
          T.cast(Swill::Runtime.read(self, name), Collection[T.untyped]).replace(T.cast(value, T::Array[T.untyped]))
        elsif (descriptor && descriptor["kind"] == "field") || name == "id"
          apply_attributes({name => value})
        else
          Swill::Runtime.write(self, name, value)
        end
      end

      sig { void }
      def reset_data_fields
        @data_field_states = {}
      end

      sig { params(name: String).returns(T::Hash[String, T.untyped]) }
      def data_field_state(name)
        @data_field_states[name] ||= {"status" => "unknown", "error" => nil, "generation" => -1}
      end
    end
  end
end
