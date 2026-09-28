# frozen_string_literal: true

module Swill
  module Distant
    # A `Value` is a typed, immutable result a remote method returns that is
    # not a persistent model: a lookup outcome, a summary, a pair of records
    # with a status. A subclass declares its fields with `field`, the
    # `Schema` records the class and its fields when a remote method's return
    # type names it, and the `Dispatcher` sends an instance as its fields,
    # with any model among them sent as a reference and a patch. The browser
    # receives a plain object with the same fields.
    #
    # A lookup that may or may not find a post:
    #
    #     class PostLookup < Swill::Distant::Value
    #       field :post, type: T.nilable(Post)
    #       field :status, type: Swill::Distant::Enum[:found, :missing]
    #     end
    #
    #     PostLookup.new(post: post, status: post ? :found : :missing)
    #
    # See [Server Data](rdoc-ref:doc/server_data.md).
    class Value
      class << self
        # Returns the fields declared on this class and its superclasses, a
        # Hash from field name to `Type` in declaration order with the
        # superclass's fields first; an empty Hash when none are declared.
        def fields
          inherited = superclass.respond_to?(:fields) ? superclass.fields : {}
          inherited.merge(@fields || {})
        end

        # Declares a field `name` of `type`, in Sorbet's spelling or a
        # `Generic`, and defines its reader. Raises `ArgumentError` when the
        # class already declares `name`.
        def field(name, type:)
          @fields ||= {}
          key = name.to_s
          raise ArgumentError, "duplicate value field #{key}" if @fields.key?(key)
          @fields[key] = Types.normalize(type)
          attr_reader name
        end
      end

      # Creates a frozen value from `attributes`, one keyword per declared
      # field. Raises `ArgumentError` when a keyword is not a declared field
      # or a declared field is missing; an explicit nil satisfies a field.
      def initialize(**attributes)
        unknown = attributes.keys.map(&:to_s) - self.class.fields.keys
        raise ArgumentError, "unknown value field #{unknown.first}" unless unknown.empty?

        self.class.fields.each_key do |name|
          raise ArgumentError, "missing value field #{name}" unless attributes.key?(name.to_sym)
          instance_variable_set("@#{name}", attributes.fetch(name.to_sym))
        end
        freeze
      end

      # Returns the fields as a Hash from field name to value, in the order
      # `fields` lists them.
      def to_h
        self.class.fields.to_h { |name, _type| [name, public_send(name)] }
      end
    end
  end
end
