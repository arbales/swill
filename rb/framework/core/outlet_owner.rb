# typed: true
# frozen_string_literal: true

module Swill
  # Named connections owned by an application or controller.
  module OutletOwner
    extend T::Sig

    sig { params(base: T.class_of(Swill::Object)).void }
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      extend Swill::Declarations

      # Connected at launch/awakening; nil until then, even when required.
      macro def outlet(name, type:, optional: false, &computed)
        property name, type: Swill::Runtime.optional_type(type), default: nil,
                       outlet: true, optional: optional, &computed
      end
    end

    # Coercion hook for JSON outlets: turn parsed data into value objects
    # before the outlet is assigned. nil means the script was empty.
    sig { params(name: String, value: T.untyped).returns(T.untyped) }
    def decode_outlet_data(name, value)
      value
    end

  end
end
