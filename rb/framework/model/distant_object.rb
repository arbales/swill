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

      # Gives each to-many association its stable collection.
      sig { void }
      def initialize
        super
        @data_field_states = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @data_draft_source = T.let(nil, T.nilable(DistantObject))
        @applying_association = T.let(false, T::Boolean)
        @data_controllers = T.let({}, T::Hash[String, ArrayController])
        @data_collections = T.let({}, T::Hash[String, AssociationCollection[T.untyped]])
        self.class.data_fields.each do |name, descriptor|
          next unless descriptor["kind"] == "many"
          collection = Swill::Model::AssociationCollection.new
          collection.attach_association(self, name)
          @data_collections[name] = collection
          write_data_association(name, collection)
        end
      end

      # Shared presentation is opt-in; constructing the controller does not load.
      sig { params(name: String).returns(ArrayController) }
      def association_controller(name)
        existing = @data_controllers[name]
        return existing if existing
        collection = @data_collections[name]
        raise "Unknown to-many association #{name}" unless collection
        controller = ArrayController.new
        controller.content = collection
        @data_controllers[name] = controller
        controller
      end

      sig { void }
      def release_association_controllers
        @data_controllers.each do |_name, controller|
          controller.content = nil
          controller.dealloc
        end
        @data_controllers = {}
      end

      sig { override.void }
      def disconnect
        release_association_controllers
        super
      end

      sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
      def coerce_property_value(name, value, previous)
        descriptor = self.class.data_fields[name]
        if descriptor && descriptor["kind"] != "field" && !@applying_association
          raise "Association #{name} is read-only; use a server operation"
        end

        super
      end

      # Internal writes still use the ordinary observation machinery.
      sig { params(name: String, value: T.untyped).void }
      def write_data_association(name, value)
        @applying_association = true
        begin
          Swill::Runtime.write(self, name, value)
        ensure
          @applying_association = false
        end
      end

      # Schedules hydration when a declared member is unknown.
      sig { params(name: String).void }
      def property_will_access(name)
        super
        return if @syncing_data_collection || draft? || deleted?
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
        data_field_state(name)["loaded"] == true
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_stale(name)
        data_field_state(name)["stale"] == true
      end

      # A generation watermark prevents older hydration from clearing staleness.
      sig { params(name: String, generation: Integer).void }
      def invalidate_data_field(name, generation)
        descriptor = self.class.data_fields[name]
        return unless descriptor && descriptor["kind"] != "field"
        state = data_field_state(name)
        return if generation < T.cast(state["generation"], Integer)

        state["generation"] = generation
        state["stale"] = true
        state["status"] = "stale"
        state["error"] = nil
        sync_data_collection(name)
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_observed(name)
        return true if Runtime.observed(self, name)
        collection = @data_collections[name]
        collection != nil && Runtime.observed(collection, "records")
      end

      sig { params(name: String, generation: Integer).void }
      def data_request_started(name, generation)
        data_field_state(name)["request_generation"] = generation
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
        return false if !reload && state["loaded"] && !state["stale"]
        return false if !reload && state["status"] == "loading"
        state["status"] = "loading"
        state["error"] = nil
        sync_data_collection(name)
        true
      end

      sig { params(name: String, message: String, generation: T.nilable(Integer)).void }
      def fail_data_field(name, message, generation = nil)
        state = data_field_state(name)
        if generation && (generation < T.cast(state["generation"], Integer) ||
                          generation < T.cast(state["request_generation"], Integer))
          return
        end
        state["status"] = "failed"
        state["error"] = message
        sync_data_collection(name)
      end

      sig { params(name: String).void }
      def present_data_field(name)
        state = data_field_state(name)
        state["status"] = "present"
        state["loaded"] = true
        state["stale"] = false
        state["error"] = nil
        sync_data_collection(name)
      end

      # Apply one authoritative member unless a newer response already won.
      sig { params(name: String, value: T.untyped, generation: Integer, overwrite_dirty: T::Boolean).void }
      def apply_data_field(name, value, generation, overwrite_dirty)
        state = data_field_state(name)
        return if generation < T.cast(state["generation"], Integer)
        state["generation"] = generation
        state["status"] = "present"
        state["loaded"] = true
        state["stale"] = false
        state["error"] = nil
        return if !overwrite_dirty && dirty_attributes.include?(name)

        descriptor = self.class.data_fields[name]
        if descriptor && descriptor["kind"] == "many"
          collection = T.must(@data_collections[name])
          collection.apply_membership(T.cast(value || [], T::Array[T.untyped]))
        elsif (descriptor && descriptor["kind"] == "field") || name == "id"
          apply_attributes({name => value})
        else
          write_data_association(name, value)
        end
        sync_data_collection(name)
      end

      sig { void }
      def reset_data_fields
        release_association_controllers
        @data_field_states = {}
        self.class.data_fields.each do |name, descriptor|
          sync_data_collection(name) if descriptor["kind"] == "many"
        end
      end

      # Mirror the owner's authoritative state without demanding another load.
      sig { params(name: String).void }
      def sync_data_collection(name)
        descriptor = self.class.data_fields[name]
        return unless descriptor && descriptor["kind"] == "many"

        @syncing_data_collection = true
        begin
          collection = T.must(@data_collections[name])
          state = data_field_state(name)
          collection.loaded = state["loaded"] == true
          collection.stale = state["stale"] == true
          collection.loading = state["status"] == "loading"
          collection.error = T.cast(state["error"], T.nilable(String))
        ensure
          @syncing_data_collection = false
        end
      end

      sig { params(name: String).returns(T::Hash[String, T.untyped]) }
      def data_field_state(name)
        @data_field_states[name] ||= {"status" => "unknown", "loaded" => false, "stale" => false,
                                      "error" => nil, "generation" => -1, "request_generation" => -1}
      end
    end
  end
end
