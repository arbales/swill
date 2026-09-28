# typed: true
# frozen_string_literal: true

module Swill
  # Named connections owned by an application, controller, or control.
  module OutletOwner
    extend T::Sig

    sig { params(base: T.class_of(Swill::Object)).void }
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      extend Swill::Declarations

      # Declares a property connected at launch/awakening to the element in
      # the owner's region with a matching `outlet` attribute. It holds nil
      # until then; a missing element raises unless `optional:` is true.
      macro def outlet(name, type:, optional: false, &computed)
        property name, type: Swill::Runtime.optional_type(type), default: nil,
                       outlet: true, optional: optional, &computed
      end
    end

    # Returns the value to assign to JSON outlet `name` from its parsed
    # `value`; nil when the script element was empty. Override to turn parsed
    # data into models before assignment. The default returns it unchanged.
    sig { params(name: String, value: T.untyped).returns(T.untyped) }
    def decode_outlet_data(name, value)
      value
    end

  end
end
