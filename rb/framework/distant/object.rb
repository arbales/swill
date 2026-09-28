# typed: true
# frozen_string_literal: true

module Swill
  # Distant Objects: server records presented in the browser as objects. The
  # browser half is `Object`, `Fields` and `Client`; the server half —
  # `Interface`, `Schema`, `Connection`, `Context` — is loaded by
  # `swill/server`. See [Server Data](rdoc-ref:doc/server_data.md).
  module Distant
    # `Fields` adds to `Object` the declarations the generator writes into
    # each model — `model_name`, `attribute` and the association macros, in
    # `ClassMethods` — and the predicates that report each field's state.
    module Fields
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base) # :nodoc:
        base.extend(ClassMethods)
      end

      # The declarations of a generated distant model. The generator writes
      # them; an application reads them on the class page and does not call
      # them.
      module ClassMethods
        extend Swill::Declarations

        class_setting :data_model_name
        inheritable_registry :data_fields

        # Declares the server model this class represents, as named on the
        # wire.
        macro def model_name(name)
          data_model_name(name)
        end

        # Declares a scalar field: an attribute that is nil until loaded and
        # whose read, on a saved object, requests it.
        macro def attribute(name, type:, default: nil, key: name)
          model_attributes[name.to_s] = {
            "name" => name.to_s, "key" => key.to_s,
            "type" => Swill::Runtime.type_name(type), "default" => default
          }
          data_fields[name.to_s] = { "kind" => "field", "type" => Swill::Runtime.type_name(type) }
          property name, type: type, default: default, attribute: true, key: key, will_access: true
        end

        # Declares a to-one association to `class:`, read-only and nil until
        # loaded. The five macros are Sequel's association kinds; every
        # option but `class:` stays on the server.
        macro def many_to_one(name, **options)
          declare_data_association(name, association_class(options), "one", "many_to_one")
        end

        # Declares a to-one association to `class:`, as `many_to_one` does.
        macro def one_to_one(name, **options)
          declare_data_association(name, association_class(options), "one", "one_to_one")
        end

        # Declares a to-many association to `class:`: a stable, read-only
        # `AssociationCollection` the server keeps current, and a
        # `<name>_controller` accessor for arranging it.
        macro def one_to_many(name, **options)
          declare_data_association(name, association_class(options), "many", "one_to_many")
        end

        # Declares a to-many association to `class:`, as `one_to_many` does.
        macro def many_to_many(name, **options)
          declare_data_association(name, association_class(options), "many", "many_to_many")
        end

        # Declares a to-one association to `class:`, as `many_to_one` does.
        macro def one_through_one(name, **options)
          declare_data_association(name, association_class(options), "one", "one_through_one")
        end

        macro def association_class(options) # :nodoc:
          unknown = options.keys - [:class]
          raise ArgumentError, "unknown association options: #{unknown.join(', ')}" unless unknown.empty?

          options.fetch(:class)
        end

        macro def declare_data_association(name, model, kind, type) # :nodoc:
          target = Swill::Runtime.class_name(model, self)
          data_fields[name.to_s] = { "kind" => kind, "model" => target, "association" => type }
          type = kind == "many" ? "Swill::Model::AssociationCollection[#{target}]" : "T.nilable(#{target})"
          property name, type: type, default: nil, will_access: true
          if kind == "many"
            forward :"#{name}_controller", to: :association_controller, with: [name.to_s],
                    returns: "Swill::ArrayController"
          end
        end
      end

      # :section: Field State
      # What the client knows about each field.

      # Whether the field `name` holds a value the server sent, nil included.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loaded?(name)
        data_field_loaded(name.to_s)
      end

      # Whether the server has invalidated the association `name` since it
      # was loaded. A stale association keeps its records readable until it
      # refreshes.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_stale?(name)
        data_field_stale(name.to_s)
      end

      # Whether a request for the field `name` is in flight.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loading?(name)
        data_field_loading(name.to_s)
      end

      # The message of the last failed request for the field `name`, or nil
      # when its last request succeeded or none was made.
      sig { params(name: Symbol).returns(T.nilable(String)) }
      def field_error(name)
        data_field_error(name.to_s)
      end
    end

    # `Swill::Distant::Object` is the browser's representative of one server
    # record: the proxy of Distributed Objects. The generator writes a
    # subclass per model with a distant interface, declaring its fields and
    # associations through `Fields`; the application extends that subclass in
    # its extension file and never writes one by hand.
    #
    # A distant object is canonical — one instance per `(model, id)`, held by
    # `Swill::Distant::Client` — and partial: a field is nil until it is
    # loaded, and reading an unloaded field of a saved object requests it.
    # Editing goes through `Editable`'s attributes and `save`, or through a
    # `draft`; associations are read-only and change through commands.
    #
    #     post = await Post.find(id)   # a generated query
    #     post.title = "Revised"
    #     await post.save
    #
    # See [Models](rdoc-ref:doc/models.md).
    class Object < Model::Editable
      extend T::Sig
      include Fields

      # Whether the server has deleted this record. A deleted object stays as
      # a tombstone: it cannot be saved, drafted or loaded.
      property :deleted, type: T::Boolean, default: false

      # `deleted`, as a predicate.
      property :deleted?, type: T::Boolean do
        deleted
      end

      # Creates an object with no loaded fields and a stable, empty
      # `AssociationCollection` for each to-many association.
      # Gives each to-many association its stable collection.
      sig { void }
      def initialize
        super
        @data_field_states = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @data_draft_source = T.let(nil, T.nilable(Object))
        @applying_association = T.let(false, T::Boolean)
        @data_controllers = T.let({}, T::Hash[String, ArrayController])
        @data_collections = T.let({}, T::Hash[String, Model::AssociationCollection[T.untyped]])
        self.class.data_fields.each do |name, descriptor|
          next unless descriptor["kind"] == "many"
          collection = Model::AssociationCollection.new
          collection.attach_association(self, name)
          @data_collections[name] = collection
          write_data_association(name, collection)
        end
      end

      # :section: Associations
      # To-many associations as collections and controllers.

      # Returns the `ArrayController` that arranges the to-many association
      # `name`, creating it on first call and keeping it for the object's
      # lifetime, so views that bind to it share one sort and selection. The
      # generated `<name>_controller` accessor calls this. Constructing the
      # controller loads nothing. Raises when `name` is not a to-many association.
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
      def release_association_controllers # :nodoc:
        @data_controllers.each do |_name, controller|
          controller.content = nil
          controller.dealloc
        end
        @data_controllers = {}
      end

      # Releases the object's association controllers, then disconnects as an
      # `Editable` does. The client calls this when the object is deleted or the
      # connection is reset.
      sig { override.void }
      def disconnect
        release_association_controllers
        super
      end

      sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
      def coerce_property_value(name, value, previous) # :nodoc:
        descriptor = self.class.data_fields[name]
        if descriptor && descriptor["kind"] != "field" && !@applying_association
          raise "Association #{name} is read-only; use a server operation"
        end

        super
      end

      # Internal writes still use the ordinary observation machinery.
      sig { params(name: String, value: T.untyped).void }
      def write_data_association(name, value) # :nodoc:
        @applying_association = true
        begin
          Swill::Runtime.write(self, name, value)
        ensure
          @applying_association = false
        end
      end

      # Schedules hydration when a declared member is unknown.
      sig { params(name: String).void }
      def property_will_access(name) # :nodoc:
        super
        return if @syncing_data_collection || draft? || deleted?
        Client.default.demand(self, name) if self.class.data_fields.key?(name)
      end

      # :section: Loading Fields
      # Fields arrive when read; these load them on purpose.

      # Loads the field or association `name` from the server and returns its
      # value, or returns the current value when it is loaded and not stale.
      # Raises when the request fails, and for a draft, a deleted object, or an
      # unsaved one.
      # Loads a field explicitly, surfacing any transport error.
      sig { params(name: Symbol).returns(T.untyped) }
      async def load_field(name)
        raise "A distant draft cannot hydrate fields" if draft?
        raise "A deleted distant object cannot hydrate fields" if deleted?
        raise "An unsaved distant object cannot hydrate fields" unless id
        await Client.default.load_field(self, name.to_s, false)
      end

      # Loads the field or association `name` from the server again, whether or
      # not it is loaded, and returns its value. Raises as `load_field` does.
      # Loads a field again even when it already has a value.
      sig { params(name: Symbol).returns(T.untyped) }
      async def reload_field(name)
        raise "A distant draft cannot hydrate fields" if draft?
        raise "A deleted distant object cannot hydrate fields" if deleted?
        raise "An unsaved distant object cannot hydrate fields" unless id
        await Client.default.load_field(self, name.to_s, true)
      end

      # :section: Persisting
      # Writes go to the server and the response comes back as the truth.

      # Sends the dirty writable fields to the server — a `CREATE` for an
      # object with no id, an `UPDATE` otherwise — applies the response, marks the
      # object clean, and returns it. A saved object with nothing dirty sends
      # nothing. An object created this way becomes the canonical instance for the
      # id the server assigns. Raises for a deleted object, and for a draft, which
      # is saved through `apply_draft` on its original.
      # Creates or updates this record and applies the authoritative response.
      sig { returns(T.self_type) }
      async def save
        raise "Cannot persist a deleted distant object" if deleted?
        raise "Save a distant draft with original.apply_draft(draft)" if draft?

        attributes = collect_dirty_attributes
        return self if id && attributes.empty?

        if id
          await Client.default.update(self, attributes)
        else
          await Client.default.create(self, attributes)
        end
        mark_clean!
        self
      end

      # Sends the dirty fields of `copy`, a draft made from this object, as an
      # `UPDATE` of this object, applies the response here, marks the draft clean,
      # and returns this object. A draft with nothing dirty sends nothing. Raises
      # when `copy` was not drafted from this object, or this object is deleted.
      # Persists changes from a draft made by this object.
      sig { params(copy: Object).returns(T.self_type) }
      async def apply_draft(copy)
        raise "Cannot persist a deleted distant object" if deleted?
        unless copy.draft_from?(self)
          raise "apply_draft requires a draft created from this distant object"
        end

        attributes = copy.collect_dirty_attributes
        return self if attributes.empty?

        await Client.default.update(self, attributes)
        copy.mark_clean!
        self
      end

      # Sends a `DELETE` for this object and returns it. Afterwards `deleted?`
      # is true, the object is disconnected, and it stays as a tombstone so that
      # an older response cannot bring it back. Raises for a deleted object, a
      # draft, or an unsaved one.
      # Deletes this record and leaves this reference as a tombstone.
      sig { returns(T.self_type) }
      async def delete
        raise "Cannot persist a deleted distant object" if deleted?
        raise "Save a distant draft with original.apply_draft(draft)" if draft?
        raise "Cannot delete an unsaved distant object" unless id

        await Client.default.delete(self)
        self
      end

      # :section: Drafting
      # Editing a copy and applying it.

      # Returns a detached copy of this object holding its id and every loaded
      # field, for editing without touching the original. A draft never loads
      # fields on its own; `apply_draft` on the original saves it. Raises for a
      # deleted or unsaved object.
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

      # Whether this object is a draft made by `draft`.
      # Whether this object is a detached editing copy.
      sig { returns(T::Boolean) }
      def draft?
        !@data_draft_source.nil?
      end

      # :section: Field State
      # How the client records what each field holds; internal.

      # Internal distant-data state. It is ordinary Ruby state so the model's
      # behavior is the same on MRI and in compiled applications.
      sig { params(original: Object).void }
      def attach_data_draft(original) # :nodoc:
        @data_draft_source = original
      end

      sig { params(original: Object).returns(T::Boolean) }
      def draft_from?(original) # :nodoc:
        @data_draft_source == original
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_loaded(name) # :nodoc:
        data_field_state(name)["loaded"] == true
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_stale(name) # :nodoc:
        data_field_state(name)["stale"] == true
      end

      # A generation watermark prevents older hydration from clearing staleness.
      sig { params(name: String, generation: Integer).void }
      def invalidate_data_field(name, generation) # :nodoc:
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
      def data_field_observed(name) # :nodoc:
        return true if Runtime.observed(self, name)
        collection = @data_collections[name]
        collection != nil && Runtime.observed(collection, "records")
      end

      sig { params(name: String, generation: Integer).void }
      def data_request_started(name, generation) # :nodoc:
        data_field_state(name)["request_generation"] = generation
      end

      sig { params(name: String).returns(T::Boolean) }
      def data_field_loading(name) # :nodoc:
        data_field_state(name)["status"] == "loading"
      end

      sig { params(name: String).returns(T.nilable(String)) }
      def data_field_error(name) # :nodoc:
        T.cast(data_field_state(name)["error"], T.nilable(String))
      end

      # Returns whether a request should be made.
      sig { params(name: String, reload: T::Boolean).returns(T::Boolean) }
      def begin_data_field_load(name, reload) # :nodoc:
        state = data_field_state(name)
        return false if !reload && state["loaded"] && !state["stale"]
        return false if !reload && state["status"] == "loading"
        state["status"] = "loading"
        state["error"] = nil
        sync_data_collection(name)
        true
      end

      sig { params(name: String, message: String, generation: T.nilable(Integer)).void }
      def fail_data_field(name, message, generation = nil) # :nodoc:
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
      def present_data_field(name) # :nodoc:
        state = data_field_state(name)
        state["status"] = "present"
        state["loaded"] = true
        state["stale"] = false
        state["error"] = nil
        sync_data_collection(name)
      end

      # Apply one authoritative member unless a newer response already won.
      sig { params(name: String, value: T.untyped, generation: Integer, overwrite_dirty: T::Boolean).void }
      def apply_data_field(name, value, generation, overwrite_dirty) # :nodoc:
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
      def reset_data_fields # :nodoc:
        release_association_controllers
        @data_field_states = {}
        self.class.data_fields.each do |name, descriptor|
          sync_data_collection(name) if descriptor["kind"] == "many"
        end
      end

      # Mirror the owner's authoritative state without demanding another load.
      sig { params(name: String).void }
      def sync_data_collection(name) # :nodoc:
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
      def data_field_state(name) # :nodoc:
        @data_field_states[name] ||= {"status" => "unknown", "loaded" => false, "stale" => false,
                                      "error" => nil, "generation" => -1, "request_generation" => -1}
      end
    end
  end
end
