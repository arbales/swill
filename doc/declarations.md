# Declarations

A declaration is a class-body statement that describes a value the class
provides: `property`, `attribute`, `outlet`, `restorable`, and the association
macros of `Swill::Model::Resource` and `Swill::Model::DistantObject`. This
guide covers the keywords each accepts and the property protocol: the access
and notification rules every declared property follows on MRI and in the
browser. How the compiler collects a declaration and emits it is described in
[Compiler and Runtime](compiler.md#declaration-macros).

## Properties, Attributes, and Outlets

Property, attribute, and outlet declarations describe the values a class
provides. A block declares a computed value:

```ruby
property :loud, type: T::Boolean, default: false
attribute :name, type: String, default: "", key: :display_name

property :label, type: String do
  loud ? name.upcase : name
end

outlet :name_field, type: Swill::View
outlet :seed, type: T::Hash[String, String]
outlet :extra, type: T.untyped, optional: true
```

| Keyword | Detail |
| --- | --- |
| Name | Matches `/\A[a-z_]\w*\??\z/`; a `?` suffix only on computed properties |
| `type:` | A Sorbet type, or its text when the class it names is defined later |
| `default:` | Literal string, number, symbol, `nil`, `true`, `false`, or an empty `[]` or `{}`; the emitted default is a function, so each instance gets its own collection. Other mutable defaults are rejected |
| Block | A [computed property](bindings.md#computed-properties): no block arguments, no `default:` |
| `writer:` | Optional method name for a computed property's setter; the method updates its source state, and the getter remains computed |
| `attribute:`, `key:` | Marks the property as local model data with an external key, used by validation, dirty tracking, and attribute collection |
| `outlet:`, `optional:` | Marks the property an outlet, connected at [awakening](awakening.md); the [`outlet`](markup.md#outlet) attribute names it in markup |
| `will_access:` | The getter calls `property_will_access(name)` before it resolves |

A `name=` method cannot replace the accessor of a declared property, and a
`restorable` path must start at a declared property with a fragment key unique
within the class's inheritance chain; the runtime raises for either at
[installation](runtime.md#installation).

## Framework Macros

The framework provides these declaration macros:

| Macro | Declares |
| --- | --- |
| `attribute :name, type:, default:, key:` | A property marked as an attribute, and the same declaration as data in `model_attributes` |
| `outlet :field, type:, optional:` | A stored, nilable, observable property with `outlet` and `optional` metadata. Declared on `Swill::Controller`, so only a controller can call it. The type names the connected value: a framework class for a view or child controller, `T::Hash[...]` or `T::Array[...]` for decoded JSON, `T.untyped` for anything. Awakening checks a typed outlet's value against the type shallowly, as `T.cast` does, so a JSON script that decodes to the wrong shape fails by outlet name |
| `restorable :path, key: :k` | A dotted property path the application keeps in the URL fragment; see [restoration](lifecycle.md#restoration). Declared on `Swill::Controller` |
| `Resource.has_many :name, type:, key:, url:, will_access:` | An endpoint-backed array association, its loading properties, descriptor, and typed load/reload methods |
| `Resource.has_one :name, ...` | The endpoint-backed nilable form of the same declaration |
| `DistantObject.model_name "Name"` | The server model name as a class setting |
| `DistantObject.attribute :name, type:` | A partial scalar whose reads participate in data demand collection |
| `DistantObject.many_to_one`, `one_to_one`, `one_through_one` with `class:` | A read-only partial nilable model reference |
| `DistantObject.one_to_many`, `many_to_many` with `class:` | A read-only partial stable `AssociationCollection` of model references |

An outlet or resource association may name a class defined later by writing
its name as a string. Generated distant association declarations use server
model names as strings so cyclic model graphs do not depend on client class load
order.

## Property Protocol

Declared properties use the same access and notification rules on MRI and in the
browser. Stored properties hold a value; computed properties derive their value
from a block and may declare a writer for changes to their source state.

When a stored property is assigned, the runtime:

1. Reads the previous value and calls
   `coerce_property_value(name, value, previous)`.
2. Compares the coerced value with the previous value. If they are equal, it
   leaves the property unchanged and sends no notifications.
3. Calls `property_will_change(name, previous, value)`.
4. Stores the value and notifies dependent computed properties, the
   `name_did_change(previous, value)` hook, and observers, in that order.

A coercion hook can return a replacement value or raise to reject the write. The
notification order ensures that a change hook or observer reading a computed
property receives its current value. See [Observers](bindings.md#observers) for
application-level observation and [Computed
Properties](bindings.md#computed-properties) for computed values in bindings.

### Reading Properties

A read records the property as a dependency of any computed property being
evaluated. For a property declared with `will_access:`, it also invokes
`property_will_access(name)` before returning the value.

`Swill::Model::Resource` uses this hook to load endpoint associations on
access. `Swill::Model::DistantObject` uses it to request fields and
associations absent from a partial object. Reads and explicit loads share
in-flight requests. See [Models](models.md) for loading behavior and error
handling.

### Computed Values

A computed property depends on the observable properties read by its block. Each
evaluation replaces those dependencies, so a branch that stops reading a
property also stops observing it.

A dependency change invalidates the cached value. The runtime evaluates it again
when read, or immediately when an observer or a `name_did_change` hook needs the
result. It sends a notification only when the computed value has changed.
Properties with change hooks are first evaluated when the object's state is
initialized; other computed properties remain unevaluated until read or
observed.

A computation cycle raises `Computed cycle`. If the block raises, the runtime
cleans up dependency capture before propagating the error. Copies made through
`apply_attributes` carry attribute values without copying observations or cached
computed values.
