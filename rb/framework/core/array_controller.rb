# typed: true
# frozen_string_literal: true

module Swill
  # `ArrayController` manages a collection of objects: its arrangement and
  # its selection, through `CollectionArrangement`, with no view of its own.
  # A list given one through its `bind` or its `array_controller` property
  # delegates arrangement and selection to it, so a table, a detail pane and
  # a toolbar that bind to the same controller share one selection.
  #
  #     members = MembersController.new
  #     members.content = mailing_list.members
  #
  # Subclass it to filter, by overriding `includes_object?`. The object that
  # creates a controller retains it and releases it when it unloads. See
  # [Collections](rdoc-ref:doc/collections.md).
  class ArrayController < Swill::Object
    include CollectionArrangement
    include ObjectBindings

    property :loading, type: T::Boolean, default: false
    property :loaded, type: T::Boolean, default: false
    property :stale, type: T::Boolean, default: false
    property :error, type: T.nilable(String), default: nil

    sig { void }
    def initialize
      super
      @fetch_generation = T.let(0, Integer)
      @fetch_operation = T.let(nil, T.nilable(T.proc.returns(T.untyped)))
      @pending_content = T.let(nil, T.untyped)
      @has_pending_content = false
      @fetch_disposed = T.let(false, T::Boolean)
    end

    # Remember the operation, not its result. Old rows remain available while
    # it runs. A successful fetch can wait for editors before being displayed.
    sig { params(operation: T.nilable(T.proc.returns(T.untyped))).returns(T::Boolean) }
    async def fetch(&operation)
      raise "Cannot fetch with a released ArrayController" if @fetch_disposed
      @fetch_operation = operation if operation
      request = @fetch_operation
      raise "fetch requires a block on its first call" unless request
      raise "Fetch on the owning array controller" if array_controller

      @fetch_generation += 1
      generation = @fetch_generation
      clear_pending_content
      self.error = nil
      return false unless current_fetch?(generation)
      self.stale = true
      return false unless current_fetch?(generation)
      self.loading = true
      return false unless current_fetch?(generation)
      begin
        result = await request.call
        return false unless current_fetch?(generation)
        unless result.is_a?(Array) || (collection?(result) && result.records.is_a?(Array))
          raise "fetch must return an array or collection"
        end
        @pending_content = result
        @has_pending_content = true
        publish_pending_content if registered_editors.empty?
        current_fetch?(generation)
      rescue => failure
        return false unless current_fetch?(generation)
        self.stale = true
        self.error = failure.message if current_fetch?(generation)
        false
      ensure
        self.loading = false if current_fetch?(generation)
      end
    end

    # Retire work that no longer establishes current membership. The caller
    # decides when to fetch again; invalidation never replays a request.
    sig { void }
    def invalidate
      generation = retire_fetch
      self.loading = false if current_fetch?(generation)
    end

    # Schedulers can retire membership while keeping their pending work busy.
    sig { returns(Integer) }
    def retire_fetch # :nodoc:
      @fetch_generation += 1
      clear_pending_content
      generation = @fetch_generation
      self.stale = true
      generation
    end

    sig { override.params(object: T.untyped).void }
    def show_first(object)
      invalidate if @fetch_operation || loading
      super
    end

    sig { override.params(editor: T.untyped).void }
    def object_did_end_editing(editor)
      # Replace content while arrangement is held, so releasing the last
      # editor renders the new result once, rather than the old result first.
      if registered_editors.length == 1 && registered_editors.include?(editor)
        publish_pending_content
      end
      super
    end

    sig { params(generation: Integer).returns(T::Boolean) }
    def current_fetch?(generation) # :nodoc:
      !@fetch_disposed && generation == @fetch_generation
    end

    sig { void }
    def clear_pending_content # :nodoc:
      @pending_content = nil
      @has_pending_content = false
    end

    sig { void }
    def publish_pending_content # :nodoc:
      return unless @has_pending_content && !@fetch_disposed
      generation = @fetch_generation
      result = @pending_content
      clear_pending_content
      self.content = result
      return unless current_fetch?(generation)
      # Equal membership can still retire a temporary first placement.
      content_did_change(content, result)
      return unless current_fetch?(generation)
      self.loaded = true
      self.stale = false if current_fetch?(generation)
    end

    sig { override.void }
    def dealloc
      @fetch_disposed = true
      @fetch_generation += 1
      @fetch_operation = nil
      clear_pending_content
      self.loading = false
      unbind_all
      super
    end

    sig { returns(T::Boolean) }
    async def commit_editing_async
      editors = registered_editors
      index = 0
      while index < editors.length
        return false unless await editors[index].commit_editing
        index += 1
      end
      true
    end
  end
end
