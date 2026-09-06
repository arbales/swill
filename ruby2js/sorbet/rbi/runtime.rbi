# typed: true

# Browser intrinsics. Only this boundary is handwritten; declaration-created
# readers and writers live in generated.rbi.
module Swill
  module Declarations
    extend T::Sig

    sig { params(name: Symbol, initial: Symbol).void }
    def inheritable_registry(name, initial = :hash); end

    sig { params(name: Symbol).void }
    def class_setting(name); end
  end
end

class ReactiveObject
  extend T::Sig

  sig { params(name: Symbol, type: T.untyped, default: T.untyped, block: T.nilable(T.proc.bind(T.attached_class).returns(T.untyped))).void }
  def self.property(name, type:, default: nil, &block); end

  sig { params(name: Symbol, type: T.untyped, default: T.untyped, key: T.any(Symbol, String)).void }
  def self.attribute(name, type:, default:, key: name); end

  sig { params(name: Symbol, value: T.untyped, previous: T.untyped).returns(T.untyped) }
  def coerce_property_value(name, value, previous); end

  sig { params(name: Symbol, previous: T.untyped, value: T.untyped).void }
  def property_will_change(name, previous, value); end
end

module NameTracking
  extend T::Helpers
  requires_ancestor { ReactiveObject }
end

module NameValidation
  # MRI instances inherit Kernel through Object; the ancestor requirement alone
  # does not make Kernel's private methods visible to Sorbet inside the module.
  include Kernel
  extend T::Helpers
  requires_ancestor { ReactiveObject }
end

module StripName
  extend T::Helpers
  requires_ancestor { Record }
end

module DecorateName
  extend T::Helpers
  requires_ancestor { Record }
end

class Object
  extend T::Sig
  sig { returns(T::Boolean) }
  def blank?; end
end
