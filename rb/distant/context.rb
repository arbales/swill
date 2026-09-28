# frozen_string_literal: true

module Swill
  module Distant
    # A `Context` is what a remote method runs under: the viewer context, the
    # actor and the scope token the connection was authenticated with, and the
    # record of the effects the method declares on other objects. The
    # `Dispatcher` creates the connection's context from the authenticator's
    # result and installs it for each message, so the context is current for
    # the duration of one remote method or write and absent between them. A
    # method reaches it through `Swill::Distant.context`.
    #
    # A command that moves a post to another author refreshes the post's
    # author fields and marks both authors' `posts` associations stale:
    #
    #     def move_to_author!(author_id)
    #       context = Swill::Distant.context
    #       previous = author
    #       update(author_id: author_id)
    #       context.refresh(self, :author_id, :author)
    #       context.invalidate(previous, :posts)
    #       context.invalidate(author, :posts)
    #     end
    #
    # The dispatcher encodes the refreshed fields into the response as
    # patches and the invalidated associations as invalidations. See
    # [Server Data](rdoc-ref:doc/server_data.md).
    class Context
      # The thread-local key under which the current context is installed.
      KEY = :__swill_data_context
      # The thread-local key under which the current invocation's effects are
      # collected.
      EFFECTS_KEY = :__swill_data_effects

      # The viewer context the connection was authenticated with, or nil when
      # the application does not use sequel-privacy.
      attr_reader :viewer_context

      # The actor the connection was authenticated as; the application's own
      # object, such as its user record.
      attr_reader :actor

      # The opaque string identifying the authenticated scope, sent to the
      # browser in the `WELCOME` message.
      attr_reader :scope_token

      # Creates a context holding `viewer_context`, `actor` and `scope_token`.
      # The `Dispatcher` creates it from the authenticator's result;
      # application code reads the current one through `Context.current`.
      def initialize(viewer_context:, actor:, scope_token:)
        @viewer_context = viewer_context
        @actor = actor
        @scope_token = scope_token
      end

      # Returns the context installed for the remote method or write running
      # on the current thread. Raises `RuntimeError` when none is running,
      # such as from a model method called outside the dispatcher.
      def self.current
        Thread.current[KEY] || raise("no Swill data operation is active")
      end

      # :section: Recording Effects
      # What a remote method tells the browser about objects it changed
      # besides its return value.

      # Sends the current values of `fields` on `record` with the response.
      # A field name is a field or an association of `record`'s distant
      # interface; an association sends its complete membership. The
      # dispatcher fetches `record` again under the viewer context before
      # encoding, and answers `unknown_field` when a name is not declared.
      # Raises `ArgumentError` when `record` is not a saved `Sequel::Model` or
      # `fields` is empty; raises `RuntimeError` when this context is not the
      # current one. Returns nil. `invalidate` is the counterpart that sends
      # no values.
      def refresh(record, *fields)
        record_effect(:refresh, record, fields)
      end

      # Marks `associations` of `record` stale in the browser: their cached
      # membership stays until a bound or accessed association reloads it. An
      # association also named in `refresh` for the same record is refreshed
      # instead. The dispatcher answers `unknown_field` when a name is not a
      # declared association. Raises `ArgumentError` when `record` is not a
      # saved `Sequel::Model` or `associations` is empty; raises
      # `RuntimeError` when this context is not the current one. Returns nil.
      def invalidate(record, *associations)
        record_effect(:invalidate, record, associations)
      end

      # :section: Driven by the Dispatcher
      # How the dispatcher installs the context around a message and collects
      # what the method recorded. Application code does not call these.

      # Installs this context as the current one for the duration of `block`
      # with an empty effects list, restoring the previous context and
      # effects afterwards, and returns the block's value. Effects recorded
      # inside a nested `use` are discarded with it. When sequel-privacy is
      # loaded, the block runs inside a privacy cache scope.
      def use(&block)
        previous = Thread.current[KEY]
        previous_effects = Thread.current[EFFECTS_KEY]
        Thread.current[KEY] = self
        Thread.current[EFFECTS_KEY] = []
        if defined?(Sequel::Privacy)
          Sequel::Privacy.with_cache_scope(&block)
        else
          block.call
        end
      ensure
        Thread.current[KEY] = previous
        Thread.current[EFFECTS_KEY] = previous_effects
      end

      # Returns the effects recorded during the current `use`, in the order
      # they were recorded, each a Hash with `kind:` (`:refresh` or
      # `:invalidate`), `model:`, `id:` and `fields:`; an empty array when
      # none were recorded. Raises `RuntimeError` when this context is not
      # the current one, so effects belong to an invocation and never to the
      # connection.
      def effects
        raise "no Swill data operation is active" unless Thread.current[KEY].equal?(self)

        Thread.current[EFFECTS_KEY]
      end

      private

      # Appends an effect of `kind` for `fields` of `record` after checking
      # that the record is saved and the fields are named; `refresh` and
      # `invalidate` differ only in the kind.
      def record_effect(kind, record, fields)
        raise ArgumentError, "effects require a saved Sequel model" unless record.is_a?(Sequel::Model) && record.pk
        raise ArgumentError, "effects require at least one field" if fields.empty?

        effects << { kind: kind, model: record.class.name, id: record.pk.to_s, fields: fields.map(&:to_s).uniq }
        nil
      end
    end

    # Returns the `Context` of the remote method or write running on the
    # current thread. Raises `RuntimeError` when none is running. This is how
    # a model method reaches its viewer context and records effects.
    def self.context
      Context.current
    end
  end
end
