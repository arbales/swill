# typed: true

# Browser intrinsics. Only this boundary is handwritten; declaration-created
# readers and writers live in generated.rbi.
module Swill
  module Runtime
    extend T::Sig

    sig { returns(T.untyped) }
    def self.omitted_argument; end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.omitted_argument?(value); end

    sig { params(receiver: T.untyped, name: String).returns(T::Boolean) }
    def self.respondsTo(receiver, name); end

    sig { params(receiver: T.untyped, name: String).returns(T::Boolean) }
    def self.responds_to(receiver, name); end

    sig { params(receiver: T.untyped, name: String, count: Integer).returns(T::Boolean) }
    def self.method_accepts(receiver, name, count); end

    sig { params(receiver: T.untyped, name: String, arguments: T.untyped).returns(T.untyped) }
    def self.invoke(receiver, name, *arguments); end

    sig { params(receiver: T.untyped, name: String, sender: T.untyped, event: T.untyped).returns(T.untyped) }
    def self.performAction(receiver, name, sender, event); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.isTruthy(value); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.isBlank(value); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.isPresent(value); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.isEmpty(value); end

    sig { params(name: T.untyped).returns(T.untyped) }
    def self.resolve(name); end

    sig { params(object: T.untyped, name: String).returns(T.untyped) }
    def self.read(object, name); end

    sig { params(object: T.untyped, path: String).returns(T.untyped) }
    def self.readPath(object, path); end

    sig { params(object: T.untyped, path: String, value: T.untyped).returns(T.untyped) }
    def self.writePath(object, path, value); end

    sig { params(object: T.untyped, name: T.any(Symbol, String), value: T.untyped).returns(T.untyped) }
    def self.write(object, name, value); end

    sig { params(object: T.untyped, path: String).void }
    def self.assertWritablePath(object, path); end

    sig { params(object: T.untyped, path: String, callback: T.proc.params(value: T.untyped).void).returns(T.proc.void) }
    def self.observePath(object, path, callback); end

    sig { params(object: T.untyped, name: T.any(Symbol, String), callback: T.proc.params(value: T.untyped).void).returns(T.proc.void) }
    def self.observe(object, name, callback); end

    sig { params(object: T.untyped, name: String).returns(T::Boolean) }
    def self.observed(object, name); end


    sig { params(object: T.untyped, disposer: T.proc.void).returns(T.proc.void) }
    def self.retain(object, disposer); end

    sig { params(object: T.untyped, disposer: T.proc.void).void }
    def self.release(object, disposer); end

    sig { params(object: T.untyped).void }
    def self.dealloc(object); end

    sig { params(object: T.untyped).void }
    def self.disconnect(object); end

    sig { params(object: T.untyped).returns(T.untyped) }
    def self.restorations(object); end

    sig { params(message: String).void }
    def self.warn(message); end

    # Calls +callback+ with each message warn reports, until the returned
    # proc is called.
    sig { params(callback: T.proc.params(message: String).void).returns(T.proc.void) }
    def self.observeWarnings(callback); end

    # The message of a failed build a development build reported, or nil.
    sig { returns(T.nilable(String)) }
    def self.buildFailure; end

    sig { params(value: T.untyped).returns(T.untyped) }
    def self.duplicate(value); end

    sig { params(object: T.untyped).returns(T.nilable(String)) }
    def self.nameOf(object); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.is_number(value); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.is_boolean(value); end

    sig { params(left: String, right: String).returns(Integer) }
    def self.compare_text(left, right); end

    sig { params(object: T.untyped).returns(T.untyped) }
    def self.outlets(object); end

    sig { params(value: T.untyped, type: String).returns(T::Boolean) }
    def self.conforms(value, type); end

    sig { params(klass: T.untyped).returns(T.untyped) }
    def self.identity_store(klass); end

    sig { params(name: String, value: T.untyped).returns(T.untyped) }
    def self.class_with_setting(name, value); end

    sig { void }
    def self.close_data; end

    sig { params(url: String, schema_hash: String).void }
    def self.configure_data(url, schema_hash); end

    sig { params(reset: T.proc.void, opened: T.proc.void).void }
    def self.register_data_lifecycle(reset, opened); end

    sig { returns(T::Boolean) }
    def self.data_connected; end

    sig { params(type: String, contents: T::Hash[String, T.untyped]).returns(T.untyped) }
    def self.data_request(type, contents); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.data_time(value); end

    sig { params(value: T.untyped).returns(String) }
    def self.data_time_iso(value); end

    sig { params(value: String).returns(T.untyped) }
    def self.data_time_from_iso(value); end

    sig { params(value: T.untyped).returns(T::Boolean) }
    def self.data_record(value); end

    # Declaration-time helpers. These run while a class body is evaluated on
    # MRI and are never compiled into the browser.
    sig { params(type: T.untyped).returns(T.untyped) }
    def self.type_name(type); end

    sig { params(type: T.untyped).returns(T.untyped) }
    def self.optional_type(type); end

    sig { params(type: T.untyped, owner: T.untyped).returns(String) }
    def self.class_name(type, owner); end
  end

  # The five things a declaration macro may declare, all serializable.
  module Declarations
    extend T::Sig

    # macro def has_many(...) — a declaration macro, callable in a class body
    # and never emitted.
    sig { params(name: Symbol).returns(Symbol) }
    def macro(name); end

    sig { params(name: Symbol, initial: Symbol).void }
    def inheritable_registry(name, initial = :hash); end

    sig { params(name: Symbol).void }
    def class_setting(name); end

    # A real, typed method that hands its arguments to another.
    sig do
      params(name: T.any(Symbol, String), to: T.any(Symbol, String), with: T::Array[T.untyped],
             parameters: T::Hash[T.untyped, T.untyped], returns: T.untyped, async: T::Boolean).void
    end
    def forward(name, to:, with: [], parameters: {}, returns: nil, async: false); end
  end
end

class Swill::Object
  extend T::Sig
  extend Swill::Declarations

  # Computed blocks are checked per receiving class by the generated type
  # probes, so the block itself binds loosely here.
  sig do
    params(name: T.any(Symbol, String), type: T.untyped, default: T.untyped,
           key: T.nilable(T.any(Symbol, String)), attribute: T::Boolean, outlet: T::Boolean,
           optional: T::Boolean, will_access: T::Boolean, writer: T.nilable(Symbol),
           reads: T.nilable(T.any(Symbol, String)),
           block: T.nilable(T.proc.bind(T.untyped).returns(T.untyped))).void
  end
  def self.property(name, type:, default: nil, key: nil, attribute: false, outlet: false,
                    optional: false, will_access: false, writer: nil, reads: nil, &block); end

  # A bindable path the application keeps in the URL fragment. Controller's
  # restorable macro is the spelling.
  sig { params(path: T.any(Symbol, String), key: T.any(Symbol, String)).returns(String) }
  def self.declare_restoration(path, key: path); end

  sig { returns(T::Hash[String, T.untyped]) }
  def self.swill_properties; end

  # async def name ... end: the method is asynchronous; await inside it
  # yields the awaited value. Both compile to JavaScript's own keywords. An
  # async method's signature names the value it yields, and await is the
  # identity, as it is on MRI.
  sig { params(definition: Symbol).returns(Symbol) }
  def self.async(definition); end

  sig { type_parameters(:T).params(value: T.type_parameter(:T)).returns(T.type_parameter(:T)) }
  def await(value); end

  sig { type_parameters(:T).params(value: T.type_parameter(:T)).returns(T.type_parameter(:T)) }
  def self.await(value); end
end

module Swill::Model::Associations
  extend T::Helpers
  mixes_in_class_methods(ClassMethods)
end

module Swill::Model::Associations::ClassMethods
  extend T::Sig
  extend T::Helpers
  extend T::Generic
  has_attached_class!(:out) { {upper: Swill::Model::Base} }
  requires_ancestor { T.class_of(Swill::Model::Base) }
end

module Swill::Model::Identity
  extend T::Helpers
  mixes_in_class_methods(ClassMethods)
end

module Swill::Model::Identity::ClassMethods
  extend T::Helpers
  extend T::Generic
  has_attached_class!(:out) { {upper: Swill::Model::Base} }
  requires_ancestor { T.class_of(Swill::Model::Base) }
end

module Swill::Model::DirtyTracking
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end

module Swill::Model::Drafts
  extend T::Sig
  extend T::Helpers
  requires_ancestor { Swill::Object }
  requires_ancestor { Swill::Model::Attributes }

  sig { returns(T::Hash[T.untyped, T.untyped]) }
  def collect_attributes; end
end

module Swill::Distant::Fields
  extend T::Helpers
  mixes_in_class_methods(ClassMethods)
  requires_ancestor { Swill::Distant::Object }
end

module Swill::Distant::Fields::ClassMethods
  extend T::Helpers
  extend T::Generic
  has_attached_class!(:out) { {upper: Swill::Distant::Object} }
  requires_ancestor { T.class_of(Swill::Distant::Object) }
end

# Object bindings are an object's own; raising reaches Kernel through it.
module Swill::ObjectBindings
  extend T::Helpers
  requires_ancestor { Swill::Object }
end

# The mixin's class-side protocol. Sorbet learns here what the source's
# included hook does at run time (base.extend(ClassMethods)), and that inside
# those methods self is a model class.
module Swill::Model::Attributes
  extend T::Helpers
  mixes_in_class_methods(ClassMethods)
  requires_ancestor { Swill::Model::Base }
end

module Swill::Model::Attributes::ClassMethods
  extend T::Sig
  extend T::Helpers
  extend T::Generic
  has_attached_class!(:out) { {upper: Swill::Model::Base} }
  requires_ancestor { T.class_of(Swill::Model::Base) }

  sig { params(source: T::Hash[T.untyped, T.untyped]).returns(T.attached_class) }
  def from_attributes(source); end
end

class Object
  extend T::Sig
  sig { returns(T::Boolean) }
  def blank?; end

  sig { returns(T::Boolean) }
  def present?; end
end

module Swill::CollectionArrangement
  extend T::Helpers
  requires_ancestor { Swill::Object }
end

module Swill::OutletOwner
  extend T::Helpers
  mixes_in_class_methods(ClassMethods)
end

module Swill::OutletOwner::ClassMethods
  extend T::Helpers
  requires_ancestor { T.class_of(Swill::Object) }
end
