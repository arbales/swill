# typed: true

# A protocol slice, not the full Attributes/DirtyTracking port. The hook is
# ordinary Ruby on MRI and a statically collected declaration list in JS.
module NameTracking
  extend T::Sig

  sig { params(base: T.class_of(Swill::Object)).void }
  def self.included(base)
    base.attribute :name, type: String, default: "Ada"
    base.property :baseline, type: T.nilable(String), default: nil
    base.property :dirty, type: T::Boolean, default: false
  end

  sig { params(name: Symbol, previous: T.untyped, value: T.untyped).void }
  def property_will_change(name, previous, value)
    super(name, previous, value)
    if name == :name
      if baseline == nil
        self.baseline = previous
      end
      self.dirty = value != baseline
    end
  end
end

module NameValidation
  extend T::Sig

  sig { params(name: Symbol, value: T.untyped, previous: T.untyped).returns(T.untyped) }
  def coerce_property_value(name, value, previous)
    value = super(name, value, previous)
    if name == :name
      value = value.strip
      if value == ""
        raise "name must not be blank"
      end
    end
    value
  end
end

class ConcernRecord < Swill::Object
  include NameTracking
  include NameValidation
end

class SpecializedRecord < ConcernRecord
  attribute :name, type: String, default: "Grace"
end

class OtherConcernRecord < Swill::Object
  include NameTracking
  include NameValidation
end

