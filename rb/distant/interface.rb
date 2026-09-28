# frozen_string_literal: true

module Swill
  module Distant
    # The distant interface of one server model: which fields, associations,
    # and writable fields a client sees, and which remote methods it may call.
    # A model declares its interface as a nested module named
    # DistantInterface that extends this one, so the declaration sits beside
    # the model without adding methods to the model class.
    module Interface
      # The interface declared on +klass+ as its own +DistantInterface+
      # constant, or nil. An interface is not inherited: each model declares
      # its own.
      def self.of(klass)
        return unless klass.is_a?(Module) && klass.const_defined?(:DistantInterface, false)

        interface = klass.const_get(:DistantInterface, false)
        interface if interface.is_a?(Interface)
      end

      # The model and its interface, given either one.
      def self.pair(item)
        return [item.model, item] if item.is_a?(Interface)

        interface = of(item)
        raise ArgumentError, "#{item} has no distant interface" unless interface

        [item, interface]
      end

      # Fields the client sees. A bare name reflects its type from the
      # database column; +name: type+ states the type instead.
      def fields(*names, **typed)
        declare("fields", names + typed.keys)
        typed.each { |name, type| field_types[name.to_s] = Types.normalize(type) }
      end

      # Sequel associations the client may follow.
      def associations(*names)
        declare("associations", names)
      end

      # Fields the client may set through create and update.
      def writable(*names)
        declare("writable", names)
      end

      def query(name, returns: nil, preload: [])
        declare_remote(:query, name, returns:, projection: preload)
      end

      def resolver(name, returns: nil, preload: [])
        declare_remote(:resolver, name, returns:, projection: preload)
      end

      def command(name, on: :instance, returns: nil, changes: [], preload: [], transaction: true)
        raise ArgumentError, "command on: must be :instance or :class" unless %i[instance class].include?(on)
        if on == :class && !changes.empty?
          raise ArgumentError, "class commands have no receiver fields; use preload: for their return value"
        end
        declare_remote(:command, name, returns:, projection: preload,
                       target: on, transaction: transaction, changes:)
      end

      def declaration
        {
          "fields" => declared("fields"),
          "field_types" => field_types,
          "associations" => declared("associations"),
          "writable" => declared("writable")
        }
      end

      def remote_methods
        @remote_methods ||= {}
      end

      # The model this interface describes, found by the module's name.
      def model
        ::Object.const_get(name.delete_suffix("::DistantInterface"))
      end

      private

      def declared(group)
        @declared ||= {}
        @declared[group] ||= []
      end

      def field_types
        @field_types ||= {}
      end

      def declare(group, names)
        list = declared(group)
        names.map(&:to_s).each do |item|
          raise ArgumentError, "duplicate #{group.delete_suffix('s')} #{item}" if list.include?(item)

          list << item
        end
      end

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
