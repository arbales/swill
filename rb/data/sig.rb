# frozen_string_literal: true

module Swill
  # Small signature DSL for applications that do not use Sorbet.
  module Sig
    class Builder
      attr_reader :parameters, :return_type

      def initialize
        @parameters = {}
      end

      def params(**parameters)
        @parameters = parameters
        self
      end

      def returns(type)
        @return_type = type
        self
      end

      def void
        returns(nil)
      end
    end

    def sig(&block)
      builder = Builder.new
      builder.instance_eval(&block)
      @swill_pending_signature = builder
    end

    def swill_signatures
      @swill_signatures ||= {}
    end

    def method_added(name)
      capture_signature(:instance, name)
      super
    end

    def singleton_method_added(name)
      capture_signature(:class, name) unless name == :singleton_method_added
      super
    end

    def capture_signature(side, name)
      signature = @swill_pending_signature
      return unless signature

      @swill_pending_signature = nil
      swill_signatures[[side, name.to_sym]] = signature
    end
  end
end
