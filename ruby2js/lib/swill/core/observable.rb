# typed: true
# frozen_string_literal: true

module Swill
  module Observable
    extend T::Sig

    sig { params(name: T.any(Symbol, String), callback: T.proc.params(value: T.untyped).void).returns(T.proc.void) }
    def observe(name, callback)
      Runtime.observe(self, name, callback)
    end

    sig { void }
    def dispose
      Runtime.dispose(self)
    end

    sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous)
      value
    end

    sig { params(name: String, previous: T.untyped, value: T.untyped).void }
    def property_will_change(name, previous, value)
    end
  end
end
