# Runtime

`rb/runtime/runtime.mjs` exports the `Runtime` object used by generated code. It
installs declarations and provides property access, observation, Ruby value
operations, and dispatch by method name. These functions are the compiler's
runtime interface; application code generally uses the corresponding framework
classes and methods. This guide has one section per area. For the Ruby forms
that compile to these calls, see [Compiler and Runtime](compiler.md); for the
declarations the metadata describes, see [Declarations](declarations.md).

## Installation

| Function | Behavior |
| --- | --- |
| `install(meta)` | Validates every entry first, then installs classes superclass-first regardless of key order. Errors: `Duplicate class`, `Missing constructor`, `Unknown mixin for`, `Duplicate constructor in meta`, `Mixin factory must be a function`, `ClassMethods factory must be a function`, `Unresolvable superclass order in meta` |
| `include(klass, mixins, incoming)` | Relinks `klass` and `klass.prototype` through the mixin layers once, before instances exist, and copies `ClassMethods` helpers onto the constructor. Error: `Mixins must be attached before class installation` |
| `installClass(klass, name, properties, methods, registries, restorations, settings)` | Records metadata, applies settings and exact registry snapshots, defines accessors on the prototype, and registers the name. Errors: `Duplicate class`, `Setter method for declared property`, `Restorable path must start with a declared property`, `Duplicate restorable key`, `Missing registry declaration`, `Missing setting declaration` |
| `resolve(name)` | Returns the registered constructor for a Ruby name. Raises `Unknown class` for an unregistered name; markup cannot reach globals or prototypes |

A class inherits its parent's property and method metadata. Installation
validates declarations for both compiled Ruby and classes registered from
JavaScript.

A `name=` method cannot replace the accessor installed for a declared property.
Use the property's hooks to validate or respond to a change, or a computed
property's `writer:` to assign its underlying state. A `restorable` path must
start at a declared property, and its fragment key must be unique within the
class's inheritance chain. See [Property
Protocol](declarations.md#property-protocol) and
[restoration](lifecycle.md#restoration).

## Metadata-Driven Dispatch

`read` returns a property value or the result of a method that takes no
arguments. Its behavior depends on the object being read:

| Object | Read Behavior |
| --- | --- |
| `null` or `undefined` | Applies the supported nil readers (`nil?`, `blank?`, `present?`, `to_s`, `to_i`, `to_f`); otherwise returns `null`. |
| Primitive value | Applies the corresponding value reader. |
| Plain object (Hash) | Returns an existing key's value, then tries a supported value reader; returns `null` for an absent key. Hash entries are not observable. |
| Installed framework object | Reads a declared property, invokes a collected zero-argument method, or applies a supported value reader. An `attr_reader` is read as a property. An unknown name raises `Unknown reader`. |
| Other JavaScript object | Calls a function member or reads a property using its JavaScript name. An absent member returns `undefined`. |

The remaining operations use the same declared names and property rules:

| Function | Behavior |
| --- | --- |
| `write(object, name, value)` | Writes a declared property through its stored or computed writer, or calls a collected `name=` accessor. A plain object is a Hash: an entry it already has is set, as key-value coding does for a dictionary. Errors: `Cannot write ... on nil`, `Read-only property`, `Unknown writer`, `Unknown key` |
| `readPath(object, "a.b.c")` | Folds `read` over the segments; a null intermediate yields `null`; the empty path is the object itself |
| `writePath(object, path, value)` / `assertWritablePath(object, path)` | Requires a declared property with a writer, or an existing Hash key, at the end of the path. A missing intermediate owner makes the write a no-op, since the owner may appear later; [Writing Back](bindings.md#writing-back) states the rule. Errors: `Read-only binding` when the leaf is a computed property without a writer, is not a declared property, or the path is empty; `Unknown key` for a Hash owner without the key |
| `send(object, name)` | Reads a property or invokes a zero-argument method, using the rules for `read`. Unlike `read`, it raises `Cannot call ... on nil` for names outside the supported nil readers. The compiler uses it for untyped calls without arguments or parentheses. |
| `invoke(object, name, ...args)` | Invokes a collected method that accepts the supplied argument count. With no arguments, it can read a declared property or `attr_reader`. For an unregistered JavaScript object other than a Hash, it calls a function member or reads a property when no arguments are supplied. Errors include `Cannot call ... on nil`, `Unknown method or wrong arity`, `Unknown method`, and `Not a method`. |
| `respondsTo(object, name)` | Ruby `respond_to?` over metadata: a declared property, its writer when writable, a collected method, or a value reader on nil and plain values, including existing Hash keys. Native JavaScript members are not inspected. The responder chain uses it to decide which responder handles an action |
| `outlets(object)` | The property descriptors declared with `outlet`, including inherited ones; awakening connects them |
| `restorations(object)` | The `restorable` declarations, including inherited ones, as `{path, key, type}` |
| `decodeFragment(type, text)` / `encodeFragment(value)` | Fragment values are strings; a declared `Integer` or `T::Boolean` leaf decodes, anything else stays text, and an undecodable value is `undefined`. Encoding maps nil and `""` to removal |
| `warn(message)` | Writes a warning to the browser console. |
| `isAttribute(object, name)` | Whether `name` is a declared `attribute` on the object's class |
| `validateAttribute(object, name, value, previous)` | Runs a collected `validate_<name>(value, previous)` method for a declared attribute, else returns the value. Raises if the validation method cannot accept both arguments. The MRI host implements the same convention with `respond_to?` |
| `performAction(object, name, sender, event)` | Invokes the widest method variant accepting at most two arguments, supplying `sender` and `event` as needed. An `attr_reader` cannot handle an action. Raises `Unknown action or wrong arity` if no variant matches. |
| `nameOf(object)` | The installed name of the object's nearest installed class, or `null` |
| `valueRead(value, name)` / `valueInvoke(value, name, args)` | Applies supported Ruby operations to plain values. Readers include predicates, collection queries, text formatting, and conversions; argument-taking methods include `index`, `take`, `drop`, and `include?`. Collection methods reject incompatible values. Unknown names raise `Unknown value reader` or `Unknown value method`. |

The `dup` reader copies an array or Hash. For an installed framework object,
it creates an instance of the same class and copies stored properties through
the [property protocol](declarations.md#property-protocol).

## Values

| Function | Semantics |
| --- | --- |
| `isTruthy(value)` | Ruby truthiness: everything except `false`, `null`, and `undefined` |
| `logicalAnd(left, thunk)` / `logicalOr(left, thunk)` | Ruby `&&` / `\|\|` with a deferred right operand |
| `isEqual(left, right)` | `===`, or element-wise for two arrays. Hashes and custom `==` are not implemented; framework objects compare by identity |
| `isBlank(value)` | `null`, `undefined`, `false`, a string that strips to empty, or an empty array or Hash |
| `isPresent(value)` | The negation of `isBlank` |
| `isEmpty(value)` | Returns whether a string, array, or Hash is empty; other types throw `TypeError` |
| `strip(value)` | Removes ASCII whitespace and NUL from both ends, as Ruby does; JavaScript `trim` would also remove NBSP. Non-strings throw `TypeError` |
| `upcase(value)` / `downcase(value)` | `toUpperCase` / `toLowerCase`; non-strings throw `TypeError` |
| `length`, `stringify`, `toInteger`, `toFloat`, `capitalize`, `split`, `slice`, `sort`, `sortBy`, `minBy`, `maxBy`, `min`, `max`, `sum`, `uniq`, `compact`, `flatten`, `reverse`, `indexOf`, `append`, `prepend`, `difference`, `fetch`, `deleteKey`, `intDiv`, `modulo`, `between`, `clamp` | Core type methods whose Ruby rule differs from JavaScript's; [Core Value Types](compiler.md#core-value-types) lists which method each serves. `isBlank`, `isEmpty`, and `length` also accept a plain object as a Hash |

## Sorbet Runtime Operations

| Function | Semantics |
| --- | --- |
| `must(value)` | Returns the value; throws `TypeError` for `null` or `undefined` |
| `cast(value, type)` | Returns the value when it conforms to the type text (a declaration type, `Float`, `Symbol`, `NilClass`, `T.untyped`, or an installed class name); otherwise throws `TypeError`. Containers are checked shallowly |
| `absurd(value)` | Throws `TypeError` |
| `conforms(value, type)` | The check behind `cast`, as a boolean; awakening uses it for typed outlets |

## Observation

| Function | Behavior |
| --- | --- |
| `observe(object, name, callback)` | Subscribes to a declared property; the callback receives `(value, previous)`. Observing a computed property computes it first so its dependencies exist. Returns a release callable. Unlike `Swill::Observable#observe`, this function leaves ownership of the observation to the caller. Error: `Unknown observable property` |
| `observePath(object, path, callback)` | Observes declared properties along the path and calls `callback` with the new path value. Replacing an intermediate object updates the remaining observations before the callback runs. Returns a callable that releases the observation |
| `retain(object, disposer)` | Retains the release callable on the object and returns it |
| `release(object, disposer)` | Removes the callable from the object's retained connections and invokes it, even if it was not retained |
| `dealloc(object)` | Releases all retained connections, then disconnects the object |
| `disconnect(object)` | Releases computed dependency subscriptions and observers, invalidates outside computed values that depended on the object, and keeps stored values. A later or eagerly observed read builds a fresh dependency graph |

## Attributes and Class Configuration

| Function | Behavior |
| --- | --- |
| `collectAttributes(object, only = null)` | `{key: value}` for every stored `attribute` declaration, including inherited ones; with an array of names, only those |
| `identityStore(klass)` | The class's endpoint-strategy identity store, created on first use |
| `classWithSetting(name, value)` | The installed class whose own setting, by Ruby name, has the value, or `null` |
| `applyAttributes(object, source)` | Assigns each attribute from `source[key]`, else `source[name]`, through the [property protocol](declarations.md#property-protocol) |
| `Model::Attributes.from_attributes(source)` | Creates an instance and assigns its attributes from `source`. An override of `decode_outlet_data` can use it to convert parsed JSON into model instances. |
| `inheritableRegistry(klass, name, "hash" \| "array")` | Returns the class's own registry, created on first access as a copy of the parent's |
| `classSetting(klass, name, values)` | With one value, stores it; with none, returns the class's own value or the parent's; more than one value throws. `installClass` applies a class body's `settings` through the setting method after mixins are attached, and throws for a setting no `ClassMethods` declares |

