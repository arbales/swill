# typed: true
# frozen_string_literal: true

module Swill
  # Distant Objects: server records presented in the browser as objects. The
  # browser half is `Object`, `Fields` and `Client`; the server half —
  # `Interface`, `Schema`, `Connection`, `Context` — is loaded by
  # `swill/server`. See [Server Data](rdoc-ref:doc/server_data.md).
  module Distant
    # `Fields` adds to `Object` the declarations the generator writes into
    # each model: `model_name`, `attribute` and the association macros, in
    # `ClassMethods`. Each field declares the property that holds its value
    # and the properties that report its state, so a binding can follow a
    # field as it loads.
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
        # whose read, on a saved object, requests it. Declares beside it the
        # field's state as properties: `<name>_loaded`, `<name>_loading`
        # and `<name>_error`.
        macro def attribute(name, type:, default: nil, key: name)
          model_attributes[name.to_s] = {
            "name" => name.to_s, "key" => key.to_s,
            "type" => Swill::Runtime.type_name(type), "default" => default
          }
          data_fields[name.to_s] = { "kind" => "field", "type" => Swill::Runtime.type_name(type) }
          property name, type: type, default: default, attribute: true, key: key, will_access: true
          declare_data_field_state(name, false)
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

        private

          # The target class of an association's options, `class:` being the
          # one option a client model takes; raises naming any other.
          macro def association_class(options)
            unknown = options.keys - [:class]
            raise ArgumentError, "unknown association options: #{unknown.join(', ')}" unless unknown.empty?

            options.fetch(:class)
          end

          # What every association macro declares. The value is held by a
          # stored property `data_<name>`, which the client writes; the public
          # `name` is a computed property reading it, so an assignment raises
          # `Read-only property` and internal writes are ordinary observable
          # writes. The public property is declared `will_access:` so a read
          # on a saved object requests the association. The field's state is
          # declared as for an attribute, with `<name>_stale` besides, and a
          # to-many association gets its `<name>_controller` accessor.
          macro def declare_data_association(name, model, kind, type)
            target = Swill::Runtime.class_name(model, self)
            data_fields[name.to_s] = { "kind" => kind, "model" => target, "association" => type }
            type = kind == "many" ? "Swill::Model::AssociationCollection[#{target}]" : "T.nilable(#{target})"
            property :"data_#{name}", type: type, default: nil
            property name, type: type, will_access: true, reads: "data_#{name}"
            declare_data_field_state(name, true)
            if kind == "many"
              forward :"#{name}_controller", to: :association_controller, with: [name.to_s],
                      returns: "Swill::ArrayController"
            end
          end

          # The state of one field as properties: `<name>_loaded`,
          # `<name>_loading` and `<name>_error`, and for an association
          # `<name>_stale`. These are what `field_loaded?` and its siblings
          # read, and what a binding follows.
          macro def declare_data_field_state(name, association)
            property :"#{name}_loaded", type: T::Boolean, default: false
            property :"#{name}_stale", type: T::Boolean, default: false if association
            property :"#{name}_loading", type: T::Boolean, default: false
            property :"#{name}_error", type: T.nilable(String), default: nil
          end
      end
    end

    # `Swill::Distant::Object` is the browser's representative of one server
    # record: the proxy of Distributed Objects. The generator writes a
    # subclass per model with a distant interface, declaring its fields and
    # associations through `Fields`; the application extends that subclass in
    # its extension file and never writes one by hand.
    #
    # A distant object is canonical — one instance per `(model, id)`, held by
    # its editing context — and partial: a field is nil until it is
    # loaded, and reading an unloaded field of a saved object requests it.
    # Each field's state is a set of properties beside it — `<name>_loaded`,
    # `<name>_loading`, `<name>_error`, and `<name>_stale` for an association
    # — read by the `field_*` predicates and bindable as any property is.
    # Editing goes through `Editable`'s attributes and `save`, or through a
    # an isolated editing context; associations change through commands.
    #
    #     post = await Post.find(id)   # a generated query
    #     post.title = "Revised"
    #     await post.save
    #
    # See [Models](rdoc-ref:doc/models.md).
    class Object < Model::Editable
      extend T::Sig
      include Fields

      property :conflicted_fields, type: T::Array[String], default: []
      property :saving, type: T::Boolean, default: false
      property :save_outcome_unknown, type: T::Boolean, default: false

      # Whether the server has deleted this record. A deleted object stays as
      # a tombstone: it cannot be saved or loaded.
      property :deleted, type: T::Boolean, default: false

      # `deleted`, as a predicate.
      property :deleted?, type: T::Boolean do
        deleted
      end

      # Creates an object with no loaded fields and a stable, empty
      # `AssociationCollection` for each to-many association.
      sig { void }
      def initialize
        super
        @editing_context = T.let(nil, T.nilable(Context))
        @parent_object = T.let(nil, T.nilable(Object))
        @confirmed = T.let({}, T::Hash[String, T.untyped])
        @versions = T.let({}, T::Hash[String, Integer])
        @submitted = T.let({}, T::Hash[String, T.untyped])
        @acknowledging = false
        @active_edit = T.let(nil, T.nilable(Edit))
        @data_generations = T.let({}, T::Hash[String, T::Hash[String, Integer]])
        @data_controllers = T.let({}, T::Hash[String, ArrayController])
        self.class.data_fields.each do |name, descriptor|
          next unless descriptor["kind"] == "many"
          collection = Model::AssociationCollection.new
          collection.attach_association(self, name)
          Swill::Runtime.write(self, "data_#{name}", collection)
        end
      end

      # :section: Field State
      # What the client knows about each field. Each predicate reads the
      # field's state property, so a binding may read the property instead.

      # Whether the field `name` holds a value the server sent, nil included.
      # Reads `<name>_loaded`.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loaded?(name)
        read_data_state(name.to_s, "loaded") == true
      end

      # Whether the server has invalidated the association `name` since it
      # was loaded. A stale association keeps its records readable until it
      # refreshes. Reads `<name>_stale`; false for a scalar field.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_stale?(name)
        read_data_state(name.to_s, "stale") == true
      end

      # Whether a request for the field `name` is in flight. Reads
      # `<name>_loading`.
      sig { params(name: Symbol).returns(T::Boolean) }
      def field_loading?(name)
        read_data_state(name.to_s, "loading") == true
      end

      # The message of the last failed request for the field `name`, or nil
      # when its last request succeeded or none was made. Reads
      # `<name>_error`.
      sig { params(name: Symbol).returns(T.nilable(String)) }
      def field_error(name)
        T.cast(read_data_state(name.to_s, "error"), T.nilable(String))
      end

      # :section: Associations
      # To-many associations as collections and controllers.

      # Returns the `ArrayController` that arranges the to-many association
      # `name`, creating it on first call and keeping it for the object's
      # lifetime, so views that bind to it share one sort and selection. The
      # generated `<name>_controller` accessor calls this. Constructing the
      # controller loads nothing. The controller is released when the object
      # deallocs, which the client does when it forgets the object. Raises
      # when `name` is not a to-many association.
      sig { params(name: String).returns(ArrayController) }
      def association_controller(name)
        existing = @data_controllers[name]
        return existing if existing
        descriptor = self.class.data_fields[name]
        raise "Unknown to-many association #{name}" unless descriptor && descriptor["kind"] == "many"
        controller = ArrayController.new
        controller.content = data_collection(name)
        @data_controllers[name] = controller
        retain(->() do
          controller.content = nil
          controller.dealloc
          @data_controllers.delete(name)
        end)
        controller
      end

      # :section: Loading Fields
      # Fields arrive when read; these load them on purpose.

      # Loads the field or association `name` from the server and returns its
      # value, or returns the current value when it is loaded and not stale.
      # Raises when the request fails, and for a deleted object or an
      # unsaved one.
      sig { params(name: Symbol).returns(T.untyped) }
      async def load_field(name)
        raise "A deleted distant object cannot hydrate fields" if deleted?
        raise "An unsaved distant object cannot hydrate fields" unless id
        await load_context_field(name.to_s, false)
      end

      # Loads the field or association `name` from the server again, whether or
      # not it is loaded, and returns its value. Raises as `load_field` does.
      sig { params(name: Symbol).returns(T.untyped) }
      async def reload_field(name)
        raise "A deleted distant object cannot hydrate fields" if deleted?
        raise "An unsaved distant object cannot hydrate fields" unless id
        await load_context_field(name.to_s, true)
      end

      # :section: Persisting
      # Writes go to the server and the response comes back as the truth.

      # Save into the parent context, or persist this record at the root.
      sig { returns(T.self_type) }
      async def save
        await context.save_object(self)
        self
      end

      sig { returns(Context) }
      def context
        Context.refuse("Record belongs to a released actor scope") if @context_invalid
        current = @editing_context
        return current if current
        current = Context.default
        @editing_context = current
        current.register(self)
        current
      end

      sig { params(value: Context).returns(T::Boolean) }
      def claim_context(value) # :nodoc:
        return false if @registered_context == value
        @registered_context = value
        @editing_context = value
        true
      end

      sig { params(value: Context).void }
      def attach_context(value) # :nodoc:
        @editing_context = value
      end

      sig { params(_previous: T.untyped, _value: T.untyped).void }
      def dirty_attributes_did_change(_previous, _value) # :nodoc:
        unless conflicted_fields.empty?
          self.conflicted_fields = conflicted_fields.select { |name| dirty_attributes.include?(name) }
        end
        context.changed(self)
      end

      # Versions distinguish edits made after a request was submitted.
      sig { override.params(name: T.any(Symbol, String), previous: T.untyped, value: T.untyped).void }
      def property_will_change(name, previous, value)
        name = name.to_s
        if (@dirty_suspensions || 0) == 0 && self.class.data_fields[name]
          context.check_active
          @versions[name] = (@versions[name] || 0) + 1
          @active_edit&.record(name, previous, T.must(@versions[name]), @confirmed[name])
        end
        super
      end

      sig { returns(Edit) }
      def begin_edit
        Context.refuse("This object already has an active inline editor") if @active_edit
        edit = Edit.new(self)
        @active_edit = edit
        edit
      end

      sig { params(edit: Edit).void }
      def finish_edit(edit) # :nodoc:
        @active_edit = nil if @active_edit == edit
      end

      sig { params(name: String, version: Integer, baseline: T.untyped).returns(T::Boolean) }
      def edit_matches(name, version, baseline) # :nodoc:
        @versions[name] == version && @confirmed[name] == baseline
      end

      sig { void }
      async def persist_changes # :nodoc:
        Context.refuse("Cannot persist a deleted record") if deleted?
        check_recovery
        Context.refuse("Resolve conflicting fields before saving: #{conflicted_fields.join(', ')}") unless conflicted_fields.empty?
        attributes = collect_dirty_attributes
        return if id && attributes.empty?
        @submitted = {}
        dirty_attributes.each do |name|
          key = name.to_s
          @submitted[key] = {"version" => @versions[key], "value" => Runtime.read(self, key)}
        end
        self.saving = true
        begin
          if id
            await Client.default.update(self, attributes)
          else
            await Client.default.create(self, attributes)
          end
        rescue Error => error
          self.save_outcome_unknown = true if error.code == "outcome_unknown"
          raise error
        ensure
          self.saving = false
          @submitted = {}
        end
      end

      sig { void }
      def check_recovery # :nodoc:
        context.check_active
        Context.refuse("Wait for the current save to finish") if saving
        Context.refuse("Save outcome is unknown; reconcile with the server before retrying or rolling back") if save_outcome_unknown
      end

      sig { void }
      def check_acceptance # :nodoc:
        check_recovery
        Context.refuse("Finish or cancel the active inline edit before accepting another editor's changes") if @active_edit
      end

      # Restores the latest known parent/server baseline, through bindings.
      sig { void }
      def rollback
        check_recovery
        baseline = @dirty_baseline || {}
        values = T.let({}, T::Hash[String, T.untyped])
        dirty_attributes.each { |name| values[name.to_s] = baseline[name] }
        apply_attributes(values)
        mark_clean!
        self.conflicted_fields = []
      end

      # Context counterparts can hydrate; associations stay in this workspace.
      sig { params(source: Object).void }
      def import_parent(source) # :nodoc:
        @parent_object = source
        self.class.data_fields.each do |name, descriptor|
          next unless descriptor["kind"] == "field"
          import_parent_field(name) if source.field_loaded?(name.to_sym)
        end
      end

      sig { params(name: String).void }
      def import_parent_field(name) # :nodoc:
        context.check_active
        source = T.must(@parent_object)
        descriptor = self.class.data_fields[name]
        return unless descriptor
        value = Runtime.read(source, name)
        if descriptor["kind"] == "many"
          value = T.cast(value.records, T::Array[Object]).map { |item| context.object(item) }
        elsif descriptor["kind"] == "one" && value
          value = context.object(value)
        end
        generation = T.must(data_generation(name)["applied"]) + 1
        apply_data_field(name, value, generation, false)
      end

      sig { params(name: String, reload: T::Boolean).returns(T.untyped) }
      async def load_context_field(name, reload) # :nodoc:
        context.check_active
        source = @parent_object
        if source
          begin_data_field_load(name, reload)
          begin
            await source.load_context_field(name, reload)
            # A closed editor no longer owns this hydration request.
            return nil if @context_invalid
            import_parent_field(name)
          rescue => error
            return nil if @context_invalid
            fail_data_field(name, error.message)
            raise error
          end
          Runtime.read(self, name)
        else
          await Client.default.load_field(self, name, reload)
        end
      end

      sig { params(name: String).void }
      async def demand_parent_field(name) # :nodoc:
        begin
          await load_context_field(name, false)
        rescue => error
          Context.report("Field did not load: #{error.message}")
        end
      end

      # Preflight every field before publishing any child changes.
      sig { void }
      def accept_into_parent # :nodoc:
        check_recovery
        source = T.must(@parent_object)
        source.check_acceptance
        Context.refuse("Cannot accept edits to a deleted record") if source.deleted?
        names = T.let(dirty_attributes.map { |name| name.to_s }, T::Array[String])
        names.each do |name|
          current = Runtime.read(source, name)
          proposed = Runtime.read(self, name)
          if current != @confirmed[name] && current != proposed
            Context.refuse("Parent changed #{name} while the editor was open; edits were kept")
          end
        end
        names.each do |name|
          Runtime.write(source, name, Runtime.read(self, name))
          @confirmed[name] = Runtime.read(source, name)
        end
        mark_clean!
        self.conflicted_fields = []
      end

      sig { void }
      def begin_acknowledgement # :nodoc:
        @acknowledging = true
      end

      sig { void }
      def end_acknowledgement # :nodoc:
        @acknowledging = false
      end

      # Deletion is immediate at the root; staging deletes is deferred.
      sig { returns(T.self_type) }
      async def delete
        check_recovery
        Context.refuse("Deleting inside an isolated editing context is not supported yet") if @parent_object
        raise "Cannot persist a deleted distant object" if deleted?
        raise "Cannot delete an unsaved distant object" unless id
        await Client.default.delete(self)
        self
      end

      # Distant editing uses contexts; local/REST models retain Drafts.
      sig { returns(T.self_type) }
      def draft
        Context.refuse("Use an editing context instead of a distant draft")
        self
      end

      sig { params(_copy: Object).returns(T.self_type) }
      async def apply_draft(_copy)
        Context.refuse("Use an editing context instead of apply_draft")
        self
      end

      # :section: Driven by the Client
      # The protocol between `Client` and the objects it holds. The client
      # calls these as responses, invalidations and failures arrive; an
      # application reads the field state they leave behind and does not
      # call them.
      #
      # Responses arrive out of order, so each field keeps two generation
      # watermarks: the generation of the response last applied to it, and
      # of the request last sent for it. A response older than what a field
      # already holds is ignored, and a failure older than either is ignored,
      # so a slow reply cannot undo a newer value or a newer invalidation.

      # Requests the field `name` when read on a saved, live object. The property system
      # invokes this before resolving a property declared `will_access:`,
      # and an `AssociationCollection` invokes it on its owner when its
      # records are read. Public because the collection calls it.
      sig { params(name: String).void }
      def property_will_access(name)
        super
        return if @context_invalid || deleted? || !self.class.data_fields.key?(name)
        source = @parent_object
        if source
          return unless id && begin_data_field_load(name, false)
          if source.field_loaded?(name.to_sym) && !source.field_stale?(name.to_sym)
            import_parent_field(name)
          else
            demand_parent_field(name)
          end
        else
          Client.default.demand(self, name)
        end
      end

      # Applies `value` as the server's value for the field `name` from a
      # response of `generation`, and marks the field loaded, current and
      # without error. Ignored when a newer response already applied. A
      # to-many association's collection replaces its membership; a scalar
      # field and `id` apply as attributes, cleanly; a to-one association is
      # written to its stored property. Dirty scalars retain local edits;
      # an acknowledgement replaces only the submitted version.
      sig { params(name: String, value: T.untyped, generation: Integer, _overwrite_dirty: T::Boolean).void }
      def apply_data_field(name, value, generation, _overwrite_dirty)
        generations = data_generation(name)
        return if generation < T.must(generations["applied"])
        generations["applied"] = generation

        descriptor = self.class.data_fields[name]
        if descriptor && descriptor["kind"] == "many"
          data_collection(name).apply_membership(T.cast(value || [], T::Array[T.untyped]))
        elsif (descriptor && descriptor["kind"] == "field") || name == "id"
          apply_confirmed_field(name, value)
        else
          Swill::Runtime.write(self, "data_#{name}", value)
        end
        present_data_field(name)
      end

      # A response advances the baseline without erasing later local edits.
      sig { params(name: String, value: T.untyped).void }
      def apply_confirmed_field(name, value) # :nodoc:
        dirty = dirty_attributes.include?(name)
        submitted = @acknowledging ? @submitted[name] : nil
        previous = @confirmed[name]
        known = @confirmed.key?(name)
        @confirmed[name] = value
        if !dirty || (submitted && submitted["version"] == @versions[name])
          apply_attributes({name => value})
        elsif !submitted && known && previous != value && Runtime.read(self, name) != value
          unless conflicted_fields.include?(name)
            self.conflicted_fields = [*conflicted_fields, name]
            Context.report("Server or parent changed #{name} during editing; local edits were kept")
          end
        end
        return unless dirty
        @dirty_baseline ||= {}
        @dirty_baseline[name] = value
        if Runtime.read(self, name) == value
          self.dirty_attributes = dirty_attributes.reject { |item| item == name }
          self.conflicted_fields = conflicted_fields.reject { |item| item == name }
        end
      end

      # Marks the association `name` stale from an invalidation of
      # `generation`, clearing its error and its loading flag; its records
      # stay readable. Ignored for a scalar field, and when a newer response
      # already applied. The client then requests the association again if
      # something observes it (`data_field_observed`), or when it is next
      # read.
      sig { params(name: String, generation: Integer).void }
      def invalidate_data_field(name, generation)
        descriptor = self.class.data_fields[name]
        return unless descriptor && descriptor["kind"] != "field"
        generations = data_generation(name)
        return if generation < T.must(generations["applied"])

        generations["applied"] = generation
        write_data_state(name, "stale", true)
        write_data_state(name, "loading", false)
        write_data_state(name, "error", nil)
      end

      # Whether something observes the field `name`: an observer or a live
      # computed property on the property itself, or on the `records` of a
      # to-many association's collection, as `Runtime.observed` reports.
      # The client refreshes an invalidated association only when this is
      # true; otherwise the next read requests it.
      sig { params(name: String).returns(T::Boolean) }
      def data_field_observed(name)
        return true if Runtime.observed(self, name)
        descriptor = self.class.data_fields[name]
        return false unless descriptor && descriptor["kind"] == "many"
        Runtime.observed(data_collection(name), "records")
      end

      # Records that a request of `generation` for the field `name` was sent,
      # so that `fail_data_field` can ignore the failure of an older one.
      sig { params(name: String, generation: Integer).void }
      def data_request_started(name, generation)
        data_generation(name)["requested"] = generation
      end

      # Marks the field `name` loading and clears its error, and returns
      # whether a request should be made: false, with nothing changed, when
      # the field is already loading, or is loaded and not stale — unless
      # `reload` is true, which always requests.
      sig { params(name: String, reload: T::Boolean).returns(T::Boolean) }
      def begin_data_field_load(name, reload)
        return false if !reload && read_data_state(name, "loaded") == true && read_data_state(name, "stale") != true
        return false if !reload && read_data_state(name, "loading") == true
        write_data_state(name, "loading", true)
        write_data_state(name, "error", nil)
        true
      end

      # Records `message` as the error of the field `name` and clears its
      # loading flag; its value and its loaded and stale state are kept. With
      # a `generation`, ignored when a newer response has applied or a newer
      # request has started, so an old failure cannot mark a field that has
      # since moved on.
      sig { params(name: String, message: String, generation: T.nilable(Integer)).void }
      def fail_data_field(name, message, generation = nil)
        generations = data_generation(name)
        if generation && (generation < T.must(generations["applied"]) ||
                          generation < T.must(generations["requested"]))
          return
        end
        write_data_state(name, "loading", false)
        write_data_state(name, "error", message)
      end

      # Returns every field to unloaded: not loaded, not stale, not loading,
      # without error, and with its generations forgotten. Values are kept.
      # The client calls this on each object it forgets when the connection
      # is reset, before the object deallocs.
      sig { void }
      def reset_data_fields
        @context_invalid = true
        @data_generations = {}
        self.class.data_fields.each do |name, _descriptor|
          write_data_state(name, "loaded", false)
          write_data_state(name, "stale", false)
          write_data_state(name, "loading", false)
          write_data_state(name, "error", nil)
        end
      end

      private

        # The two generation watermarks of the field `name`, created at -1 so
        # the first response of any generation applies. `id` has an entry
        # too; it is the one field with a generation and no state.
        sig { params(name: String).returns(T::Hash[String, Integer]) }
        def data_generation(name)
          @data_generations[name] ||= {"applied" => -1, "requested" => -1}
        end

        # Marks the field `name` loaded, current, not loading and without
        # error, as a response for it leaves it.
        sig { params(name: String).void }
        def present_data_field(name)
          write_data_state(name, "loaded", true)
          write_data_state(name, "stale", false)
          write_data_state(name, "loading", false)
          write_data_state(name, "error", nil)
        end

        # Writes `value` to the state property `<name>_<state>`, an ordinary
        # observable write. Nothing is written for a name that is not a
        # declared field, such as `id`, or for `stale` on a scalar field,
        # which declares no such property.
        sig { params(name: String, state: String, value: T.untyped).void }
        def write_data_state(name, state, value)
          descriptor = self.class.data_fields[name]
          return unless descriptor
          return if state == "stale" && descriptor["kind"] == "field"
          Swill::Runtime.write(self, "#{name}_#{state}", value)
        end

        # Reads the state property `<name>_<state>`; nil where
        # `write_data_state` would write nothing.
        sig { params(name: String, state: String).returns(T.untyped) }
        def read_data_state(name, state)
          descriptor = self.class.data_fields[name]
          return nil unless descriptor
          return nil if state == "stale" && descriptor["kind"] == "field"
          Swill::Runtime.read(self, "#{name}_#{state}")
        end

        # The stable collection of the to-many association `name`, held by
        # its stored `data_<name>` property.
        sig { params(name: String).returns(Model::AssociationCollection[T.untyped]) }
        def data_collection(name)
          T.cast(Swill::Runtime.read(self, "data_#{name}"), Model::AssociationCollection[T.untyped])
        end
    end
  end
end
