# frozen_string_literal: true

module Swill
  module Distant
    # An `Interface` is the distant interface of a server model: the fields,
    # associations and writable fields a browser sees of it, and the remote
    # methods a browser may call on it. A model declares its interface in a
    # nested module named `DistantInterface` that extends this one, so the
    # declaration sits beside the model and adds nothing to the model class.
    # The `Schema` reads each interface through `declaration` and
    # `remote_methods`, resolves the names against the model's columns,
    # associations and methods, and raises `ArgumentError` for a name the
    # model does not have.
    #
    # A post exposes its fields and associations, lets the browser edit some
    # of them, and exports a search and a command:
    #
    #     class Post < Sequel::Model
    #       module DistantInterface
    #         extend Swill::Distant::Interface
    #
    #         fields :author_id, :title, :excerpt, :body, :published
    #         associations :author, :comments
    #         writable :author_id, :title, :excerpt, :body
    #
    #         query :search, returns: Swill::Distant::ResultSet[Post],
    #                        preload: [:title, :excerpt, { author: %i[name] }]
    #         command :publish!, changes: %i[published published_at]
    #       end
    #     end
    #
    # See [Server Data](rdoc-ref:doc/server_data.md).
    module Interface
      # :section: Fields and Associations
      # What the browser sees of the model and may write to it.

      # Declares the fields the browser sees. A bare name in `names` takes
      # its type from the database column, nilable when the column allows
      # null; a `name: type` pair in `typed` states the type in Sorbet's
      # spelling instead, and its nullability is as written. The primary key
      # is always a field. Raises `ArgumentError` when a name is declared
      # twice; the `Schema` raises when a bare name is not a column, or a
      # field has no reader on the model.
      def fields(*names, **typed)
        declare("fields", names + typed.keys)
        typed.each { |name, type| field_types[name.to_s] = Types.normalize(type) }
      end

      # Declares the Sequel associations in `names` the browser may follow.
      # Supported types are `many_to_one`, `one_to_one`, `one_to_many`,
      # `many_to_many` and `one_through_one`; the associated model must have
      # an interface in the same schema. Raises `ArgumentError` when a name
      # is declared twice; the `Schema` raises for an association the model
      # does not define, of another type, or to a model outside the schema.
      def associations(*names)
        declare("associations", names)
      end

      # Declares the fields in `names` the browser may set through create and
      # update. Each must also be declared with `fields`, have a writer on
      # the model, and not be the primary key; the `Schema` raises otherwise.
      # Raises `ArgumentError` when a name is declared twice. A field not
      # declared writable is answered `invalid_attributes` when a browser
      # sends it.
      def writable(*names)
        declare("writable", names)
      end

      # :section: Remote Methods
      # The model methods a browser may call: queries, resolvers and commands.

      # Exports the dataset method `name` as a query, called in the browser
      # as `await Post.name(...)` on the model's dataset — the privacy-scoped
      # dataset when sequel-privacy is loaded — and loaded as an array when
      # it returns a dataset. `returns` is the return type in Sorbet's
      # spelling or a `Generic`, and may be omitted when the method has a
      # signature. `preload` is the projection: the fields and associations
      # of each returned record sent with the result, as names and
      # `{association: [...]}` Hashes. Raises `ArgumentError` when a remote
      # method `name` is already declared.
      # Queries and their projected readers are read operations and must be
      # safe to overlap. A connection runs up to two, with writes as barriers.
      def query(name, returns: nil, preload: [])
        declare_remote(:query, name, returns:, projection: preload)
      end

      # Exports the class method `name` as a resolver, called in the browser
      # as `await Post.name(...)` and answering state that is not a dataset
      # operation, such as the current user. `returns` and `preload` are as
      # for `query`. Raises `ArgumentError` when a remote method `name` is
      # already declared.
      def resolver(name, returns: nil, preload: [])
        declare_remote(:resolver, name, returns:, projection: preload)
      end

      # Exports the method `name` as a command, a mutation the browser
      # invokes as `await post.name(...)` on a saved instance when `on:` is
      # `:instance` (the default) or as `await Post.name(...)` on the class
      # when `on:` is `:class`. `returns` and `preload` are as for `query`;
      # `changes` names the receiver's fields sent back with the response,
      # for what the command alters on the record it runs on. The command
      # runs in a database transaction Swill opens; `transaction: false`
      # leaves the transaction to the method. Raises `ArgumentError` when
      # `on` is neither `:instance` nor `:class`, when a class command names
      # `changes` (it has no receiver record; use `preload` for its return
      # value), or when a remote method `name` is already declared.
      def command(name, on: :instance, returns: nil, changes: [], preload: [], transaction: true)
        raise ArgumentError, "command on: must be :instance or :class" unless %i[instance class].include?(on)
        if on == :class && !changes.empty?
          raise ArgumentError, "class commands have no receiver fields; use preload: for their return value"
        end
        declare_remote(:command, name, returns:, projection: preload,
                       target: on, transaction: transaction, changes:)
      end

      # :section: Discovery
      # How the `Schema` finds an interface and reads what it declares.

      # Returns the interface declared on `klass` as its own `DistantInterface`
      # constant, or nil when `klass` is not a module, declares none, or its
      # constant does not extend `Interface`. An interface is not inherited:
      # each model declares its own.
      def self.of(klass)
        return unless klass.is_a?(Module) && klass.const_defined?(:DistantInterface, false)

        interface = klass.const_get(:DistantInterface, false)
        interface if interface.is_a?(Interface)
      end

      # Returns `[model, interface]` for `item`, which is either a model class
      # or its interface. Raises `ArgumentError` when `item` is a model
      # without a distant interface.
      def self.pair(item)
        return [item.model, item] if item.is_a?(Interface)

        interface = of(item)
        raise ArgumentError, "#{item} has no distant interface" unless interface

        [item, interface]
      end

      # Returns the declared fields, associations and writable fields as a
      # Hash with string keys `"fields"`, `"field_types"` (name to `Type`,
      # for the explicitly typed fields), `"associations"` and `"writable"`,
      # each list in declaration order; empty lists when nothing is declared.
      def declaration
        {
          "fields" => declared("fields"),
          "field_types" => field_types,
          "associations" => declared("associations"),
          "writable" => declared("writable")
        }
      end

      # Returns the declared remote methods, a Hash from method name to its
      # declaration in declaration order: `"kind"` (`"query"`, `"resolver"`
      # or `"command"`), `"name"`, `"returns"` (as given, or nil), and
      # `"projection"`; a command also has `"target"`, `"changes"` and
      # `"transaction"`. An empty Hash when none are declared.
      def remote_methods
        @remote_methods ||= {}
      end

      # Returns the model this interface describes, the constant the module's
      # name is nested in. Raises `NameError` when the module is anonymous or
      # not nested in its model.
      def model
        ::Object.const_get(name.delete_suffix("::DistantInterface"))
      end

      private

      # Returns the list declared under `group`, creating it empty.
      def declared(group)
        @declared ||= {}
        @declared[group] ||= []
      end

      # Returns the explicit field types, name to `Type`, creating the Hash
      # empty.
      def field_types
        @field_types ||= {}
      end

      # Appends `names` to `group`'s list as strings, raising `ArgumentError`
      # for a name already in it.
      def declare(group, names)
        list = declared(group)
        names.map(&:to_s).each do |item|
          raise ArgumentError, "duplicate #{group.delete_suffix('s')} #{item}" if list.include?(item)

          list << item
        end
      end

      # Records the remote method `name` of `kind` with its return type and
      # projection, and the command-only `target`, `transaction` and
      # `changes` when given; `query`, `resolver` and `command` differ in
      # what they pass. Raises `ArgumentError` for a name already recorded.
      def declare_remote(kind, name, returns:, projection:, target: nil, transaction: nil, changes: nil)
        key = name.to_s
        raise ArgumentError, "duplicate remote method #{key}" if remote_methods.key?(key)

        remote_methods[key] = {
          "kind" => kind.to_s,
          "name" => key,
          "returns" => returns,
          "projection" => projection,
          **(target ? {"target" => target.to_s} : {}),
          **(changes ? {"changes" => changes} : {}),
          **(!transaction.nil? ? {"transaction" => transaction} : {})
        }
      end
    end
  end
end
