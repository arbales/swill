# typed: true

# Browser intrinsics. Only this boundary is handwritten; declaration-created
# readers and writers live in generated.rbi.
module Swill
  module Runtime
    extend T::Sig

    sig { params(receiver: T.untyped, name: String, sender: T.untyped, event: T.untyped).returns(T.untyped) }
    def self.performAction(receiver, name, sender, event); end

    sig { params(name: T.untyped).returns(T.untyped) }
    def self.resolve(name); end

    sig { params(object: T.untyped, name: T.any(Symbol, String), callback: T.proc.params(value: T.untyped).void).returns(T.proc.void) }
    def self.observe(object, name, callback); end

    sig { params(object: T.untyped).void }
    def self.dispose(object); end

    sig { params(object: T.untyped).returns(T::Hash[T.untyped, T.untyped]) }
    def self.collect_attributes(object); end

    sig { params(object: T.untyped, source: T.untyped).returns(T.untyped) }
    def self.apply_attributes(object, source); end
  end

  module Declarations
    extend T::Sig

    sig { params(name: Symbol, initial: Symbol).void }
    def inheritable_registry(name, initial = :hash); end

    sig { params(name: Symbol).void }
    def class_setting(name); end
  end
end

class Swill::Object
  extend T::Sig

  sig { params(name: Symbol, type: T.untyped, default: T.untyped, block: T.nilable(T.proc.bind(T.attached_class).returns(T.untyped))).void }
  def self.property(name, type:, default: nil, &block); end

  sig { params(name: Symbol, type: T.untyped, default: T.untyped, key: T.any(Symbol, String)).void }
  def self.attribute(name, type:, default:, key: name); end
end

module Swill::Model::Drafts
  extend T::Sig
  extend T::Helpers
  requires_ancestor { Swill::Object }
  requires_ancestor { Swill::Model::Attributes }

  sig { returns(T.class_of(Swill::Model::Base)) }
  def class; end

  sig { returns(T::Hash[T.untyped, T.untyped]) }
  def collect_attributes; end
end

module Swill::Model::Attributes::ClassMethods
  extend T::Sig

  sig { params(name: Symbol, type: T.untyped, default: T.untyped).void }
  def property(name, type:, default:); end
end

module NameTracking
  extend T::Helpers
  requires_ancestor { Swill::Object }
end

module NameValidation
  # MRI instances inherit Kernel through Object; the ancestor requirement alone
  # does not make Kernel's private methods visible to Sorbet inside the module.
  include Kernel
  extend T::Helpers
  requires_ancestor { Swill::Object }
end

module NormalizeName
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end

module StripName
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end

module DecorateName
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end

class Object
  extend T::Sig
  sig { returns(T::Boolean) }
  def blank?; end
end
