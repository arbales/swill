# typed: false
# frozen_string_literal: true

# Declaration-time state, on MRI. A class body's declarations are the one
# thing about a Ruby class that cannot be ported to the browser 1:1: they run
# when the class is defined, and the browser must receive classes whose
# accessors and metadata are already installed. So they run here, the compiler
# reads the result back by reflection, and Runtime.install replays it.
#
# This file mirrors the class side of runtime/install.mjs: the same
# descriptors, recorded rather than installed.
module Swill
  # The one "no value given" sentinel the declaration macros share.
  UNSET = ::Object.new
  def UNSET.inspect
    "Swill::UNSET"
  end

  # The five things a macro may declare, all serializable: properties,
  # registry entries, settings, forwarded methods, and a property's
  # will_access: flag. Extended into a concern's ClassMethods module, and into
  # Swill::Object so that every class body can declare.
  module Declarations
    # A declaration macro: callable in a class body and never emitted. Marks
    # the name and answers it, as `private def` does, so it wraps a
    # definition: `macro def has_many(name, type:) ... end`.
    def macro(name)
      swill_macros << name.to_sym
      name
    end

    def swill_macros
      @swill_macros ||= []
    end

    def swill_registries
      @swill_registries ||= []
    end

    def swill_settings
      @swill_settings ||= []
    end

    def swill_forwards
      @swill_forwards ||= []
    end

    # A per-class collection that copies from the superclass on first touch:
    # Runtime.inheritableRegistry, spelled as Ruby. Emitted, and read by the
    # browser, so it is not a declaration.
    def inheritable_registry(name, initial = :hash)
      unless %i[hash array].include?(initial.to_sym)
        raise ArgumentError, "registry storage must be :hash or :array"
      end
      swill_registries << {"name" => name.to_s, "initial" => initial.to_s}
      ivar = :"@#{name}"
      empty = initial.to_s == "array" ? -> { [] } : -> { {} }
      swill_declaration_target.define_method(name) do
        existing = instance_variable_get(ivar)
        next existing if existing
        inherited = superclass.respond_to?(name) ? superclass.public_send(name) : nil
        instance_variable_set(ivar, inherited ? inherited.dup : empty.call)
      end
    end

    # A class-level value that reads through to the superclass until written:
    # `endpoint "/api/menus"`. Callable in a class body *and* emitted, because
    # the browser reads it.
    def class_setting(name, &on_write)
      swill_settings << name.to_s
      ivar = :"@#{name}"
      swill_declaration_target.define_method(name) do |*values|
        if values.empty?
          next instance_variable_get(ivar) if instance_variable_defined?(ivar)
          next(superclass.respond_to?(name) ? superclass.public_send(name) : nil)
        end
        raise ArgumentError, "#{name} expects zero or one argument" unless values.length == 1
        value = values.first
        value = instance_exec(value, &on_write) if on_write
        instance_variable_set(ivar, value)
      end
    end

    # A real, typed method that hands its arguments to another: what gives a
    # macro a callable member. `load_ingredients` is nothing but
    # `load_relationship("ingredients")`, so the macro declares it rather than
    # every application writing the wrapper and casting the untyped result.
    def forward(name, to:, with: [], parameters: {}, returns: nil, async: false)
      swill_forwards << {
        "name" => name.to_s, "to" => to.to_s, "with" => with,
        "parameters" => parameters, "returns" => returns, "async" => async
      }
      define_method(name) do |*arguments|
        __send__(to, *with, *arguments)
      end
    end

    # A declaration made on a module becomes a class method of whatever
    # includes it; one made on a class is a class method of that class.
    def swill_declaration_target
      is_a?(::Class) ? singleton_class : self
    end
  end
end

module Swill
  # Every Swill object's class body can declare. The accessors installed here
  # are what Runtime.installClass defines on the prototype in the browser;
  # the descriptor recorded beside them is what the compiler serializes.
  class Object
    extend Declarations

    # Descriptors declared on this class itself, in declaration order.
    def self.swill_properties
      @swill_properties ||= {}
    end

    # property :name, type: String, default: ""        — stored
    # property :label, type: String do ... end          — computed
    #
    # will_access: flags the read path: the getter notifies the object before
    # it resolves, so a value can load itself. attribute:, key:, outlet: and
    # optional: are the marks the macros built on property set.
    def self.property(name, type:, default: UNSET, key: nil, attribute: false,
                      outlet: false, optional: false, will_access: false, writer: nil, &computed)
      name = name.to_s
      unless name.match?(/\A[a-z_]\w*\??\z/) && (computed || !name.end_with?("?"))
        raise ArgumentError, "unsupported property name #{name}"
      end
      raise ArgumentError, "writer requires a computed property" if writer && !computed
      raise ArgumentError, "computed default is ambiguous" if computed && !default.equal?(UNSET)
      raise ArgumentError, "outlets cannot be computed" if computed && outlet
      raise ArgumentError, "duplicate property #{name} in #{self}" if swill_properties.key?(name)
      unless computed || default.equal?(UNSET) || immutable_default?(default)
        raise ArgumentError, "only immutable literal or empty collection defaults are supported"
      end

      descriptor = {
        "name" => name, "type" => type, "attribute" => attribute,
        "computed" => !computed.nil?, "will_access" => will_access,
        "owner" => self, "origin" => Swill::Runtime.declaration_origin
      }
      descriptor["writer"] = writer.to_s if writer
      descriptor["key"] = (key || name).to_s if attribute
      if outlet
        descriptor["outlet"] = true
        descriptor["optional"] = optional
      end
      if computed
        descriptor["block"] = computed.source_location
        descriptor["compute"] = computed
      else
        value = default.equal?(UNSET) ? nil : default
        descriptor["default"] = value
        # A generated defaultValue() returns a fresh literal per instance.
        descriptor["default_value"] = value.is_a?(::Array) || value.is_a?(::Hash) ? -> { value.dup } : -> { value }
      end
      swill_properties[name] = descriptor
      Swill::Runtime.declarations_changed!

      define_method(name) do
        Swill::Runtime.record(self, name)
        # Cocoa's -willAccessValueForKey:. The read path is record,
        # will-access, resolve.
        property_will_access(name) if will_access
        descriptor["computed"] ? Swill::Runtime.computed_value(self, descriptor) : Swill::Runtime.stored_value(self, descriptor)
      end

      if !computed || writer
        define_method("#{name}=") do |value|
          Swill::Runtime.write_property(self, descriptor, value)
        end
      end
      name.to_sym
    end

    # Restorable paths declared on this class itself, in declaration order.
    def self.swill_restorations
      @swill_restorations ||= []
    end

    # Declaration-time state the runtime installs beside the property
    # descriptors: a bindable path the application keeps in the URL fragment.
    # Controller's restorable macro is the spelling.
    def self.declare_restoration(path, key: path)
      path = path.to_s
      unless path.match?(/\A[a-z_]\w*(?:\.[a-z_]\w*)*\z/)
        raise ArgumentError, "restorable path must be a dotted property path"
      end
      swill_restorations << {"path" => path, "key" => key.to_s,
                             "origin" => Swill::Runtime.declaration_origin}
      Swill::Runtime.declarations_changed!
      path
    end

    # A stored default is emitted as a literal a generated function returns,
    # so each instance gets its own array or hash. Anything else would be
    # shared, which is never what a declaration means.
    def self.immutable_default?(value)
      case value
      when ::String, ::Integer, ::Float, ::Symbol, ::NilClass, ::TrueClass, ::FalseClass then true
      when ::Array, ::Hash then value.empty?
      else false
      end
    end

    # async/await compile to JavaScript's keywords; on MRI a method is what it
    # is and await answers its argument.
    def self.async(definition)
      definition
    end

    def self.await(value)
      value
    end

    def await(value)
      value
    end
  end
end
