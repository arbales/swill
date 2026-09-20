# typed: true
# frozen_string_literal: true

module Swill
  module Observable
    extend T::Sig

    # I observe a property: my own, or another object's. Either way the
    # receiver is the observer, so either way it retains the observation and
    # lets it go when it deallocs.
    # sorbet-runtime will not wrap a method whose optional parameter comes
    # first, so this signature is static only.
    T::Sig::WithoutRuntime.sig do
      params(object: T.nilable(Swill::Object), name: T.any(Symbol, String),
             callback: T.proc.params(value: T.untyped).void).returns(T.proc.void)
    end
    def observe(object = nil, name, callback)
      retain(Runtime.observe(object == nil ? self : object, name, callback))
    end

    # Cocoa's retain: I claim this disposer and am responsible for letting it
    # go. Every disposer with my lifetime goes through here — an observation,
    # a notification, a DOM listener, a binding's release.
    sig { params(disposer: T.proc.void).returns(T.proc.void) }
    def retain(disposer)
      Runtime.retain(self, disposer)
    end

    # Cocoa's release, the counterpart of retain: give one up before I go.
    sig { params(disposer: T.proc.void).void }
    def release(disposer)
      Runtime.release(self, disposer)
    end

    # End of life: release everything retained, then leave the observation
    # graph.
    sig { void }
    def dealloc
      Runtime.dealloc(self)
    end

    # Leave the observation graph without ending: stored values are kept and
    # computed properties resubscribe on the next read.
    sig { void }
    def disconnect
      Runtime.disconnect(self)
    end

    sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous)
      value
    end

    sig { params(name: String, previous: T.untyped, value: T.untyped).void }
    def property_will_change(name, previous, value)
    end

    # Cocoa's -willAccessValueForKey:, and the third of the three hooks this
    # framework speaks. A property declared will_access: notifies its object
    # before the read resolves, so the value can load itself.
    sig { params(name: String).void }
    def property_will_access(name)
    end
  end
end
