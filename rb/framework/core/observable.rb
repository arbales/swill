# typed: true
# frozen_string_literal: true

module Swill
  # Property observation and the object lifetime that goes with it.
  #
  # An observer retains what it observes and lets it go when it deallocs, so
  # a controller that observes a model does not outlive its own region. See
  # the Bindings guide for how markup reaches the same machinery.
  module Observable
    extend T::Sig

    # Observes a property, on the receiver or on +object+, calling +callback+
    # with each new value. The receiver is the observer: it retains the
    # observation and releases it on `dealloc`.
    #
    #     observe(:query, ->(value) { reload })
    #     observe(document, :selection, ->(value) { reload })
    #
    # sorbet-runtime will not wrap a method whose optional parameter comes
    # first, so this signature is static only.
    T::Sig::WithoutRuntime.sig do
      params(object: T.nilable(Swill::Object), name: T.any(Symbol, String),
             callback: T.proc.params(value: T.untyped).void).returns(T.proc.void)
    end
    def observe(object = nil, name, callback)
      retain(Runtime.observe(object == nil ? self : object, name, callback))
    end

    # Claims ownership of +disposer+; the receiver releases it on `dealloc`.
    # Anything with the receiver's lifetime goes through here — an
    # observation, a notification, a DOM listener, a binding's release.
    # Answers the disposer.
    sig { params(disposer: T.proc.void).returns(T.proc.void) }
    def retain(disposer)
      Runtime.retain(self, disposer)
    end

    # Gives up a disposer ahead of `dealloc`.
    sig { params(disposer: T.proc.void).void }
    def release(disposer)
      Runtime.release(self, disposer)
    end

    # Releases everything retained and leaves the observation graph. End of
    # life for the object.
    sig { void }
    def dealloc
      Runtime.dealloc(self)
    end

    # Leaves the observation graph without ending: stored values are kept and
    # computed properties resubscribe on the next read.
    sig { void }
    def disconnect
      Runtime.disconnect(self)
    end

    # Runs before a write lands, answering the value to store. Override it to
    # coerce or to reject the write by raising.
    sig { params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous)
      value
    end

    # Runs before a write lands, after coercion.
    sig { params(name: String, previous: T.untyped, value: T.untyped).void }
    def property_will_change(name, previous, value)
    end

    # Runs before a read resolves, for a property declared `will_access:`, so
    # the value can load itself.
    sig { params(name: String).void }
    def property_will_access(name)
    end
  end
end
