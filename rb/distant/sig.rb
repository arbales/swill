# frozen_string_literal: true

module Swill
  # `Sig` is the signature DSL `swill/server` supplies to an application that
  # does not load Sorbet: `extend T::Sig` and `sig { params(...).returns(...) }`
  # spelled as Sorbet spells them, recording each method's parameter and
  # return types for the `Schema` without checking them at the call. When
  # `sorbet-runtime` is required before `swill/server`, Sorbet's own `T::Sig`
  # is used and this module is not installed.
  #
  # A model signs a resolver the schema then exports with typed parameters:
  #
  #     class User < Sequel::Model
  #       extend T::Sig
  #
  #       sig { params(email: String).returns(T.nilable(User)) }
  #       def self.by_email(email)
  #         first(email: email)
  #       end
  #     end
  #
  # See [Server Data](rdoc-ref:doc/server_data.md).
  module Sig
    # A `Builder` collects the parameter and return types one `sig` block
    # declares; `sig` evaluates its block against a new builder.
    class Builder
      # The parameter types declared with `params`, a Hash from parameter
      # name to type; an empty Hash when none were declared.
      attr_reader :parameters

      # The return type declared with `returns`; nil until declared, and nil
      # after `void`.
      attr_reader :return_type

      # Creates a builder with no parameters and no return type.
      def initialize
        @parameters = {}
      end

      # Declares the parameter types as keyword arguments, each parameter
      # name to its type, replacing any declared before. Returns the builder.
      def params(**parameters)
        @parameters = parameters
        self
      end

      # Declares the return type `type`. Returns the builder.
      def returns(type)
        @return_type = type
        self
      end

      # Declares that the method returns nothing; the schema records a
      # `dynamic` return type. Returns the builder.
      def void
        returns(nil)
      end
    end

    # Declares the signature of the method defined next, from a block
    # evaluated against a `Builder`: `sig { params(name: String).returns(Post) }`.
    # The signature attaches to the next instance or singleton method the
    # class defines and is read by `swill_signatures`.
    def sig(&block)
      builder = Builder.new
      builder.instance_eval(&block)
      @swill_pending_signature = builder
    end

    # Returns the signatures recorded on this class, a Hash from
    # `[side, name]` — `side` is `:instance` or `:class`, `name` a Symbol —
    # to the `Builder` that declared it; an empty Hash when none were
    # declared. The `Schema` reads this for each remote method.
    def swill_signatures
      @swill_signatures ||= {}
    end

    # Invoked by Ruby after an instance method `name` is defined; attaches
    # the pending signature to it.
    def method_added(name)
      capture_signature(:instance, name)
      super
    end

    # Invoked by Ruby after a singleton method `name` is defined; attaches
    # the pending signature to it.
    def singleton_method_added(name)
      capture_signature(:class, name) unless name == :singleton_method_added
      super
    end

    private

    # Moves the signature a preceding `sig` left pending onto the method
    # `name` on `side`; does nothing when no signature is pending.
    def capture_signature(side, name)
      signature = @swill_pending_signature
      return unless signature

      @swill_pending_signature = nil
      swill_signatures[[side, name.to_sym]] = signature
    end
  end
end
