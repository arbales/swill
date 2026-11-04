# typed: true
# frozen_string_literal: true

module Swill
  module Distant
    # A browser editing workspace. Identity and unsaved changes belong here;
    # all contexts share Client's transport. The server's operation Context
    # is a separate class, loaded only by swill/server.
    class Context < Swill::Object
      extend T::Sig

      sig { returns(Context) }
      def self.default
        @default ||= new(nil)
      end

      property :changed_objects, type: T::Array[Object], default: []
      property :has_changes, type: T::Boolean do
        !changed_objects.empty?
      end

      sig { returns(T.nilable(Context)) }
      attr_reader :parent

      sig { params(parent: T.nilable(Context)).void }
      def initialize(parent)
        super()
        @parent = parent
        @stores = T.let({}, T::Hash[String, T::Hash[String, T.untyped]])
        @objects = T.let([], T::Array[Object])
        @children = T.let([], T::Array[Context])
        @active = true
      end

      sig { returns(Context) }
      def new_editing_context
        check_active
        child = Context.new(self)
        @children << child
        child
      end

      # One instance per record, including when reached through a relationship.
      sig { params(record: Object).returns(Object) }
      def object(record)
        check_active
        return record if record.context == self
        if record.context.parent == self && record.id
          existing = model_store(record.class.data_model_name.to_s)[record.id.to_s]
          return T.cast(existing, Object) if existing
        end
        ancestor = @parent
        Context.refuse("Import objects from the parent editing context") unless ancestor
        source = T.let(T.must(ancestor).object(record), Object)
        Context.refuse("Save a new record before opening an isolated editor") unless source.id
        Context.refuse("Cannot edit a deleted record") if source.deleted?
        store = model_store(source.class.data_model_name.to_s)
        existing = store[source.id.to_s]
        return T.cast(existing, Object) if existing

        copy = source.class.new
        copy.attach_context(self)
        copy.apply_data_field("id", source.id, 0, true)
        register(copy) # Register before traversing cyclic relationships.
        copy.import_parent(source)
        copy
      end

      sig { params(object: Object).void }
      def register(object) # :nodoc:
        @objects << object if object.claim_context(self)
        model_store(object.class.data_model_name.to_s)[object.id.to_s] = object if object.id
        changed(object)
      end

      sig { params(object: Object).void }
      def changed(object) # :nodoc:
        present = changed_objects.include?(object)
        if object.dirty? && !present
          self.changed_objects = [*changed_objects, object]
        elsif !object.dirty? && present
          self.changed_objects = changed_objects.reject { |item| item == object }
        end
      end

      # Tombstones live in Client only while older requests can reference them.
      sig { params(object: Object).void }
      def forget(object) # :nodoc:
        @objects = @objects.reject { |item| item == object }
        model_store(object.class.data_model_name.to_s).delete(object.id.to_s)
        self.changed_objects = changed_objects.reject { |item| item == object }
      end

      sig { params(model: String).returns(T::Hash[String, T.untyped]) }
      def model_store(model) # :nodoc:
        @stores[model] ||= {}
      end

      # Context-wide saves deliberately reject multiple records until the
      # server supplies an atomic change-set operation.
      sig { void }
      async def save
        check_active
        objects = changed_objects
        Context.refuse("Saving multiple changed records is not supported yet; no changes were saved") if objects.length > 1
        object = objects.first
        await save_object(object) if object
      end

      sig { params(object: Object).void }
      async def save_object(object) # :nodoc:
        check_active
        Context.refuse("Object belongs to another editing context") unless object.context == self
        if @parent
          object.accept_into_parent
        else
          await object.persist_changes
        end
      end

      # Rollback concerns this workspace only, never an already-saved child.
      sig { void }
      def rollback
        check_active
        objects = changed_objects
        objects.each(&:check_recovery)
        objects.each(&:rollback)
      end

      sig { void }
      def check_active # :nodoc:
        Context.refuse("Editing context has been released or its actor changed") unless @active
      end

      sig { params(message: String).void }
      def self.report(message) # :nodoc:
        Runtime.warn(message)
      end

      sig { params(message: String).void }
      def self.refuse(message) # :nodoc:
        report(message)
        raise message
      end

      sig { void }
      def reset # :nodoc:
        @children.dup.each(&:dealloc)
        @objects.each do |object|
          object.reset_data_fields
          object.dealloc
        end
        @objects = []
        @stores = {}
        self.changed_objects = []
      end

      sig { params(child: Context).void }
      def release_child(child) # :nodoc:
        @children = @children.reject { |item| item == child }
      end

      sig { override.void }
      def dealloc
        return unless @active
        reset
        @active = false
        @parent&.release_child(self)
        super
      end
    end
  end
end
