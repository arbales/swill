# Compiler and Runtime

This document describes how Swill's Ruby2JS build turns Ruby source into
browser JavaScript, which Ruby forms it accepts, how it lowers them, and what
the handwritten runtime provides. It is the reference for the supported
boundary. The README covers commands and layout; `PLAN.md` at the repository
root covers goals and roadmap.

Source of truth: `lib/swill-ruby2js/compiler.rb` and `lib/swill/runtime.mjs`.
When this document and the code disagree, fix one of them in the same change.

## Contents

1. [Pipeline](#pipeline)
2. [Knowledge collection](#knowledge-collection)
3. [Generated output](#generated-output)
4. [Compilation surfaces](#compilation-surfaces)
5. [Lowering rules](#lowering-rules)
6. [Runtime reference](#runtime-reference)
7. [Property protocol](#property-protocol)
8. [Rejected forms](#rejected-forms)
9. [Extending the boundary](#extending-the-boundary)

## Pipeline

```text
Ruby source
  → Ruby2JS.parse                 (Prism walker on Ruby 3.4+, parser gem otherwise)
  → Knowledge#collect             (static facts; class bodies are never executed)
  → Compiler#validate!            (ordering, ancestry, member collisions)
  → Ruby2JS.convert per entry     (Swill filters + Return; Pragma on shared Ruby)
  → esbuild --loader=js           (formatting only; part of every emission)
  → *.classes.mjs / *.meta.mjs / *.mjs
  → esbuild --bundle              (readable and minified IIFEs with source maps)
```

Two compiler instances run per build. The framework instance compiles
`lib/swill/`. Its `knowledge.interface` is handed in memory to the application
instance, which compiles `examples/` against those facts and imports the
framework's identifiers from the published `Swill` global rather than
recompiling them.

Both Ruby2JS parsers are supported. Only expression ranges are read from
location objects, because the two parsers disagree on token-level locations.
The suite passes and produces identical bundles under either.

## Knowledge collection

`Swill::Ruby2JS::Knowledge` walks the AST and records one entry per class or
mixin. Nothing is evaluated. An entry holds:

| Field | Content |
| --- | --- |
| `name`, `identifier` | Ruby constant path and its JavaScript identifier |
| `kind` | `class` or `mixin` |
| `scope`, `parent` | Enclosing namespaces and the superclass constant as written |
| `includes` | Mixins in factory-nesting order (see [Mixins](#mixins)) |
| `properties` | Own declarations plus copies of included-hook declarations |
| `methods` | Name, JavaScript member name, arity, signature parameter types, signature return type |
| `included_properties` | Declarations a mixin's `self.included` hook contributes |
| `class_methods`, `registries`, `settings` | A mixin's `ClassMethods` protocol |
| `javascript_only` | Which [surface](#compilation-surfaces) compiles the entry |

Imported entries from another compiler carry the same fields, minus the AST.

### Modules

A `module` is a mixin, a namespace, or both. Nested classes and non-
`ClassMethods` modules are collected as their own entries under the module's
name. The module is also collected as a mixin when it is empty or has any
non-namespace body. Namespaces are not entries.

### Class bodies

A class or mixin body may contain only:

| Statement | Handling |
| --- | --- |
| `def name(positional, args)` | Collected as a method. Names match `/\A[a-z_]\w*[!?=]?\z/`; `method_missing` is rejected; `initialize` is allowed only on the JavaScript surface |
| `sig { ... }` | Parameter and return types are recorded for lowering, then erased |
| `extend T::Sig` | Erased |
| `include A, B` / `include A` | Recorded; targets must be previously defined mixins |
| `property` / `attribute` | Collected as declarations (below) |
| `def self.included(base)` | Mixins only; see [Included hooks](#included-hooks) |
| `module ClassMethods` | Mixins only; see [Class methods](#class-methods) |
| nested `class` / `module` | Mixins only; collected as namespaced entries |

Anything else is a compile error naming the statement.

### Declarations

```ruby
property :loud, type: T::Boolean, default: false
attribute :name, type: String, default: "", key: :display_name

property :label, type: String do
  loud ? name.upcase : name
end
```

| Rule | Detail |
| --- | --- |
| Name | Literal symbol matching `/\A[a-z_]\w*\??\z/`; a `?` suffix only on computed properties |
| Keywords | `type:` required; `default:` optional for `property`, required for `attribute`; `key:` only meaningful for `attribute` |
| Types | `String`, `Integer`, `T::Boolean`, `T.nilable(String)`, `T.nilable(Const)`, or a constant path |
| Defaults | Literal string, integer, `nil`, `true`, or `false`. Mutable literals are rejected |
| Computed | Block form, `do`/`end` or braces, no block arguments, no `default:`; `attribute` cannot be computed |
| Key | Literal symbol or string; defaults to the name |

Each entry rejects duplicate property names, including duplicates between its
own declarations and those copied from included hooks.

### Included hooks

A mixin may declare exactly one `def self.included(base)` whose body consists
only of `base.extend(ClassMethods)` and literal `base.property` /
`base.attribute` calls. Those declarations are copied into every class that
includes the mixin, each class receiving its own descriptor. The hook itself is
never emitted or executed.

### Class methods

A mixin's `module ClassMethods` may contain:

| Statement | Result |
| --- | --- |
| `extend Swill::Declarations` (or any `...Declarations`) | Accepted and erased; the compiler implements the protocol |
| `inheritable_registry :name` / `:name, :array` | A per-class registry that copies its parent's contents on first access |
| `class_setting :name` | A per-class value that falls back to the parent's |
| `def name(positional)` | Compiled as a class-side method |
| `sig { ... }` | Erased |

`Swill::Model::Attributes::ClassMethods#attribute` is special-cased: its MRI
body is metaprogramming, so the compiler lowers the `attribute` declaration
protocol directly and skips that definition.

### Pragmas

Comments of the form `# Pragma: array`, `# Pragma: hash`, and
`# Pragma: string` are passed to Ruby2JS's Pragma filter as type hints on the
shared surface. Any other pragma name is rejected, because control pragmas
such as `skip` or `extend` would desynchronize collected metadata.

## Generated output

### Identifiers

| Ruby | JavaScript | Rule |
| --- | --- | --- |
| `Person` | `Person` | Plain names are unchanged |
| `Demo::Person` | `Demo__Person` | `::` becomes `__` |
| `Demo_Thing` | `Demo_uThing` | Source `_` becomes `_u` first, so `A::B` and `A__B` stay distinct |
| `Runtime`, `Superclass`, `Object`, `Array`, `String`, `Number`, `Math`, `JSON`, `Error` | `Ruby_Runtime` and so on | Reserved plumbing and JavaScript intrinsics |
| `blank?` | `blank_predicate` | Member names replace `?` |
| `save!` | `save_bang` | Member names replace `!` |

`Swill::Runtime` in source always refers to the handwritten runtime.

### Classes and mixins

A class compiles to `class Demo__Person extends Swill__Model__Base { ... }`
containing only its methods. Properties are not on the class; the runtime
installs accessors from metadata. Instance variables compile to underscored
fields (`@view` becomes `this._view`).

A mixin compiles to a subclass-layer factory:

```js
function StripName(Superclass) {
  class StripName_Layer extends Superclass {
    normalize(value) { return Runtime.strip(super.normalize(value)); }
  }
  return StripName_Layer;
}
```

At install time the runtime inserts the layers between the class and its
parent, so native `super` works and no method is copied.

`include A, B` places `A` before `B` in Ruby lookup; two separate `include`
statements place the later one first. `entry["includes"]` stores factory
nesting order, which is the reverse of lookup order, and both forms are tested
against MRI.

A `ClassMethods` module compiles to a second factory,
`Feature_ClassMethods(Superclass)`, that returns a prototype object. The
runtime copies its own property descriptors onto the receiving constructor
instead of splicing it into the constructor chain, because a JavaScript
subclass uses that chain as its `super()` target.

### The meta object

```js
export const meta = {
  mixins: {
    "StripName": {factory: StripName, methods: {"normalize": {"arity": 1}}},
    "Swill::Model::Attributes": {factory: ..., classFactory: ..., methods: {...}}
  },
  classes: {
    "Demo::Person": {
      constructor: Demo__Person,
      mixins: [NormalizeName, StripName, DecorateName],
      properties: {
        "name": {type: "String", attribute: true, key: "name",
                 defaultValue: function default_name() { return ""; }},
        "label": {type: "String", attribute: false,
                  compute: function compute_label() { return this.loud ? Runtime.upcase(this.name) : this.name; }},
        "blank?": {js: "blank_predicate", type: "T::Boolean", attribute: false, compute: ...}
      },
      registries: {model_attributes: {"name": {property: "name", key: "name"}}},
      methods: {"greeting": {"arity": 0}, "rename": {"arity": 1}}
    }
  }
};
```

`meta` contains executable functions and plain data. It contains no Ruby
source and no compiler AST. Object keys use the Ruby name; `js` is present only
when the JavaScript member differs. A `__proto__` key is emitted as a computed
key so it stays an ordinary entry.

### Modules and publishing

`Compiler#modules(name:, runtime:, framework:, publish:, launch:)` emits three
files:

| File | Content |
| --- | --- |
| `name.classes.mjs` | Imports plus class and factory definitions; inert |
| `name.meta.mjs` | Imports the definitions and exports `meta` |
| `name.mjs` | `Runtime.install(meta)`; with `publish:`, also freezes the global |

The framework entrypoint throws if the global already exists, installs, then
publishes `globalThis.Swill = Object.freeze({...definitions, Runtime, install})`.
With `launch:`, it also instantiates the named class and calls `install(document)`
when a `document` exists, which is how `Swill::Launcher` starts the application
declared by `[application]` in a page while Node loading stays inert.
The application build imports every framework identifier from that global
through a generated shim, so the application bundle contains neither the
runtime nor the framework classes. Only `Swill` is global.

### Sorbet artifacts

| Artifact | Purpose |
| --- | --- |
| `Compiler#rbi` | Typed readers and writers for every declared property, plus `ClassMethods` registries and settings |
| `Compiler#type_probes` | One typed method per declaration whose body is the default or computed expression, so Sorbet checks it against the declared type |

Both are regenerated by `rake build` into `sorbet/rbi/generated.rbi` and
`sorbet/checks/declarations.rb`. Neither is executed or shipped.

## Compilation surfaces

Each entry is compiled with one of two filter chains, chosen by the
`javascript_only:` flag passed to `Compiler#add`.

| | Shared Ruby | JavaScript-only |
| --- | --- | --- |
| Filters | `RubySurface`, `Return`, `RubyCalls` | `JavaScriptSurface`, `Return` |
| Used for | Models, concerns, controllers, application code that also runs on MRI | `Swill::Bindings`, `Actions`, `Awakening`, `View`, `Controller`: code that touches the DOM |
| Truthiness, equality, `\|\|` | Lowered from static types (below) | Ruby2JS defaults; Ruby is used as JavaScript syntax |
| Unqualified call `foo(x)` | Always a method call | A method call when `foo` is a collected method on the entry, its mixins, or its ancestors; otherwise native |
| `param.foo` where `param` has a signature type | Resolved through the receiver rules | A method call when the type names a collected entry; otherwise native property access |
| `initialize` | Rejected | Compiles to `constructor` |
| `raise "message"` | `throw new Error("message")` | Same |
| `callback.call(x)` / `callback.(x)` | `callback(x)` for a local; `receiver.call(null, x)` otherwise | Same |
| `->(x) { ... }` | Arrow function | Arrow function |
| Constants | Resolved in Ruby scope to encoded identifiers | Same |

`Return` provides implicit returns. `RubyCalls` runs last on the shared
surface and converts any remaining send into an explicit call, so
`person.greeting` and `person.greeting()` compile identically. It leaves
`new`, `raise`, `lambda`, `proc`, operators, and indexing to the converter.

On the JavaScript-only surface a call on a receiver other than `self` or a
typed parameter is native JavaScript: `view.superview` is property access and
`view.superview()` is a call. Framework code on that surface writes explicit
parentheses for every Ruby method call on a local.

## Lowering rules

These apply to the shared Ruby surface. Every rule is chosen from static facts;
the runtime is reached only where a fact is genuinely unavailable.

### Static types

| Expression | Type |
| --- | --- |
| String, integer, boolean, `nil`, symbol, array, hash literals | `String`, `Integer`, `T::Boolean`, `NilClass`, `Symbol`, `Array`, `Hash` |
| Interpolated string | `String` |
| `==`, `!=`, `!` | `T::Boolean` |
| Parameter | Its `sig` parameter type |
| Local variable | Inferred when every assignment has one static type and the first read follows the first assignment; an assigned parameter loses its signature type |
| `name` or `self.name` for a declared property | The declared type, including inherited and included declarations |
| `name(...)` or `self.name(...)` for a collected method | Its `sig` return type; `void` yields no type |
| `super(...)` / `super` | The enclosing method's return type |
| `receiver.name` where the receiver has a framework class type | That class's property type or method return type |
| `receiver.strip` / `upcase` / `downcase` on a `String` receiver | `String`; `blank?` yields `T::Boolean` |
| `(expression)` | The inner expression's type |

Nilable wrappers are unwrapped where the rule says "class type". Anything not
listed has no static type.

### Truthiness

Used by `if`, `unless`, ternaries, and unary `!`. Loops are not lowered.

| Static type | Emitted condition |
| --- | --- |
| `T::Boolean`, framework class, `Array`, `Hash`, `T::Array[...]`, `T::Hash[...]`, nilable class | The value itself |
| `NilClass` | `false` |
| `String`, `Integer`, `Symbol`, and their nilable forms | `value != null` |
| Unknown or `T.untyped` | `Runtime.isTruthy(value)` |

### Logical operators

| Left operand | `left && right` | `left \|\| right` |
| --- | --- | --- |
| Boolean, nil, or native kind (see above) | `left && right` | `left \|\| right` |
| Stable scalar (literal or local) | `right` | `left` |
| Stable nilable scalar | `left != null ? right : left` | `left != null ? left : right` |
| Otherwise | `Runtime.logicalAnd(left, () => right)` | `Runtime.logicalOr(left, () => right)` |

The right operand is deferred in the runtime forms so it evaluates lazily, as
in Ruby. Ruby2JS's own `||` handling is forced to logical `||` on this surface;
its nullish `??` would keep a Ruby `false`. The JavaScript surface keeps
Ruby2JS's operator selection.

### Equality

`==` and `!=` compile to `===` / `!==` when either operand has an
identity-comparable type: `String`, `Integer`, `Float`, `Symbol`, `T::Boolean`,
`NilClass`, a nilable form of those, or a framework class. Otherwise they
compile to `Runtime.isEqual(left, right)`, negated for `!=`. Collections such
as `T::Array[String]` are never identity-compared.

### Receivers

For `receiver.name(args)` where the receiver is not `self`:

| Receiver's static type | Form | Emitted |
| --- | --- | --- |
| Framework class | Declared property, no arguments | `receiver.name` |
| Framework class | `name = value` for a declared property | `receiver.name = value` |
| Framework class | Collected method | `receiver.name(args)` |
| Framework class | Anything else | Pragma filter if it applies, else an explicit call |
| `String` or `T.nilable(String)` | `strip`, `upcase`, `downcase`, `blank?` | `Runtime.strip(receiver)`, `Runtime.upcase(...)`, `Runtime.downcase(...)`, `Runtime.isBlank(...)` |
| `String` | Anything else | Pragma filter if it applies, else an explicit call |
| Unknown or `T.untyped` | No arguments and the name is a property on any collected entry, or a string reader name | `Runtime.read(receiver, "name")` |
| Unknown, `T.untyped`, or `T.proc...` | `call(args)` or `.(args)` | `receiver(args)` for a local receiver; `receiver.call(null, args)` otherwise |
| Unknown or `T.untyped` | `name = value` where `name` is a property on any collected entry | `Runtime.write(receiver, "name", value)` |
| Unknown or `T.untyped` | Anything else | `receiver.name(args)` via `RubyCalls` |
| Any other type | Anything | Pragma filter if it applies, else an explicit call |

No operation is chosen by method name alone. A model may define its own
`strip`; a typed receiver calls it, and an untyped receiver reaches it through
`Runtime.read`, which prefers a collected method over the string reader.

### Self and implicit receivers

| Source | Emitted |
| --- | --- |
| `name` / `self.name` for a declared property | `this.name` |
| `self.name = value` for a declared property | `this.name = value` |
| `name(args)` for anything else | `this.name(args)` |
| `self.class` | `this.constructor` |
| `super(args)` | `super.name(args)` |
| `Swill::Runtime` | `Runtime` |
| Any other constant | Resolved through Ruby lexical scope to an encoded identifier; unknown constants are rejected |

### Exceptions

`raise "message"` and `raise "interpolated #{message}"` compile to
`throw new Error(...)`. Bare `raise`, `raise SomeClass`, `raise SomeClass, msg`,
and `raise variable` are rejected. `rescue` is outside the current boundary.

## Runtime reference

`lib/swill/runtime.mjs` exports one object, `Runtime`. It holds browser state
and installs metadata. It never interprets Ruby source or ASTs, never patches
prototypes it did not create, and provides no universal dynamic send.

### Installation

| Function | Behavior |
| --- | --- |
| `install(meta)` | Validates every entry first, then installs classes superclass-first regardless of key order. Errors: `Duplicate class`, `Missing constructor`, `Unknown mixin for`, `Duplicate constructor in meta`, `Mixin factory must be a function`, `ClassMethods factory must be a function`, `Unresolvable superclass order in meta` |
| `include(klass, mixins, incoming)` | Rewires `klass` and `klass.prototype` through the mixin layers once, before instances exist, and copies `ClassMethods` helpers onto the constructor. Error: `Mixins must be attached before class installation` |
| `installClass(klass, name, properties, methods, registries)` | Records metadata, seeds registries, defines accessors on the prototype, and registers the name. Errors: `Duplicate class`, `Missing registry declaration`, `Unknown registry property` |
| `resolve(name)` | Returns the registered constructor for a Ruby name. Fails closed with `Unknown class`; markup cannot reach globals or prototypes |

Metadata is inherited: a class's property and method tables start from its
parent's, so lookups do not walk the chain at call time.

### Metadata-driven dispatch

| Function | Behavior |
| --- | --- |
| `read(object, name)` | `null` for a null receiver. Primitives go straight to `valueRead`. Otherwise a declared property, then an arity-0 collected method, then `valueRead` for the four string reader names. Error: `Unknown reader` |
| `write(object, name, value)` | A declared stored property through the property protocol, or a collected `name=` accessor. Errors: `Cannot write ... on nil`, `Read-only property`, `Unknown writer` |
| `readPath(object, "a.b.c")` | Folds `read` over the segments; a null intermediate yields `null` |
| `writePath(object, path, value)` / `assertWritablePath(object, path)` | Resolves the owner with `read` and requires a stored property at the end. Errors: `Unavailable binding owner` when an intermediate is null, `Read-only binding` when the target is computed or not a property |
| `invoke(object, name, ...args)` | Calls a collected method with an exact arity match. Error: `Unknown action or wrong arity` |
| `hasAction(object, name)` | Whether a collected method of arity 0, 1, or 2 exists; the responder chain uses it to decide where an action stops |
| `performAction(object, name, sender, event)` | Calls a collected method of arity 0, 1, or 2 with `sender` and `event` sliced to fit. Same error |
| `valueRead(value, name)` | `blank?`, `strip`, `upcase`, `downcase` on plain values. Error: `Unknown value reader` |

### Values

| Function | Semantics |
| --- | --- |
| `isTruthy(value)` | Ruby truthiness: everything except `false`, `null`, and `undefined` |
| `logicalAnd(left, thunk)` / `logicalOr(left, thunk)` | Ruby `&&` / `\|\|` with a deferred right operand |
| `isEqual(left, right)` | `===`, or element-wise for two arrays. Hashes and custom `==` are not implemented; framework objects compare by identity |
| `isBlank(value)` | `null`, `undefined`, `false`, a string that strips to empty, or an empty array |
| `strip(value)` | Removes ASCII whitespace and NUL from both ends, as Ruby does; JavaScript `trim` would also remove NBSP. Non-strings throw `TypeError` |
| `upcase(value)` / `downcase(value)` | `toUpperCase` / `toLowerCase`; non-strings throw `TypeError` |

### Observation

| Function | Behavior |
| --- | --- |
| `observe(object, name, callback)` | Subscribes to a declared property; the callback receives `(value, previous)`. Observing a computed property computes it first so its dependencies exist. Returns a disposer. Error: `Unknown observable property` |
| `observePath(object, path, callback)` | Subscribes along every observable segment, rehooks the subtree before invoking the callback when an intermediate changes, and passes the new path value. Returns a disposer that also stops any in-flight rehook |
| `dispose(object)` | Releases computed dependency subscriptions, observers, and dependents. Stored values are kept, so the object remains usable and lazily recomputes |

### Attributes and class configuration

| Function | Behavior |
| --- | --- |
| `collect_attributes(object)` | `{key: value}` for every stored `attribute` declaration, including inherited ones |
| `apply_attributes(object, source)` | Assigns each attribute from `source[key]`, else `source[name]`, through the property protocol |
| `inheritableRegistry(klass, name, "hash" \| "array")` | Returns the class's own registry, created on first access as a copy of the parent's |
| `classSetting(klass, name, values)` | With one value, stores it; with none, returns the class's own value or the parent's; more than one value throws |

## Property protocol

Accessors installed by `installClass` share one mutation path:

```text
read previous → coerce_property_value(name, value, previous)
  → compare with isEqual → property_will_change(name, previous, value)
  → store → notify
```

`notify` runs, in order: dependents of the property (computed invalidation),
the `name_did_change(previous, value)` method if the class collected one, then
public observers. Dependents run first so a hook that reads a derived property
sees a fresh value.

Computed properties record every `(object, property)` read during `compute`
through a capture stack. Each recompute replaces the previous dependency
subscriptions, so a branch that stops reading an object stops observing it.
Invalidation drops the cache and, only when something observes the computed
property, recomputes eagerly and notifies if the value changed. Cycles throw
`Computed cycle`; an exception inside `compute` unwinds the capture stack.

Per-object state lives in a `WeakMap`, so objects need no reserved fields and
are collected normally. Drafts copy attributes through `apply_attributes` and
therefore carry no subscriptions or computed state.

## Rejected forms

Every rejection is a `Swill::Ruby2JS::CompileError` at build time. Grouped by
where it is raised:

| Area | Rejected |
| --- | --- |
| Top level | Anything other than `class` and `module` |
| Constants | Unknown or non-static constants; reopened or duplicate constants; a superclass or mixin defined later in the same build; a superclass that is a mixin; an include target that is a class |
| Methods | Names outside `/\A[a-z_]\w*[!?=]?\z/`; `method_missing`; `initialize` on the shared surface; optional, keyword, splat, or block parameters; a method whose name is also an inherited property |
| Declarations | Non-literal names, keywords, types, defaults, or keys; unknown keywords; unsupported types; `attribute` without `default:`; mutable defaults; computed `attribute`; computed with `default:`; block arguments; duplicate names; a stored property ending in `?` |
| Mixins | Properties or includes on a mixin itself; a second `self.included`; non-literal hook bodies; `base.extend` of anything but `ClassMethods`; declaring `ClassMethods` without contents; the same mixin included twice along one ancestor chain; `prepend` |
| `ClassMethods` | Non-literal registry or setting names; registry storage other than `:hash` / `:array`; `class_setting` coercion blocks; any other statement |
| Expressions | `T.must`, `T.cast`, `T.let`, `T.unsafe`, `T::Struct`, and any other `T` constant in executable bodies; `public_send`, `send`, `__send__`, `const_get`, `define_method`, `instance_exec`, `eval` |
| Exceptions | Any `raise` form other than a literal message string |
| Pragmas | Any pragma other than `array`, `hash`, `string` |
| Members | Two members with the same encoded JavaScript name |
| Build | Application compilation without a framework import; missing `esbuild`; unformattable output |

Ruby that reaches Ruby2JS unlowered and that Ruby2JS cannot convert also fails
the build with Ruby2JS's own error.

### Disabled upstream filters

| Facility | Reason |
| --- | --- |
| Functions | Rewrites ordinary framework methods without type evidence |
| ActiveSupport | Its `blank?` behavior conflicts with Swill value readers |
| ESM / Require | Imports and exports come from compiler metadata |
| camelCase / underscore | Source names and metadata keys must remain stable |

## Extending the boundary

The supported subset is defined by accepted source and behavioral tests, not
by whatever JavaScript Ruby2JS can emit. For each new construct, in order:

1. Use Ruby2JS unchanged when its output preserves the required semantics.
2. Use an upstream filter only when its relevant behavior matches Swill's
   truthiness, naming, metadata, and packaging rules.
3. Add a Swill filter for syntax, static type-directed operations,
   declaration-aware access, or compile-time rejection.
4. Add runtime support only for execution-time types, shared state, identity,
   or an application-wide protocol.
5. Otherwise reject the construct explicitly.

Filters may lower syntax and choose operations from static knowledge. They must
not hold application state or create a second framework protocol. Runtime
helpers implement genuinely dynamic or shared behavior and must not interpret
Ruby source. A universal dynamic call helper is intentionally excluded; it
would hide the supported surface and grow into a second Ruby VM.

Rules must cover a coherent class of values, not one fixture. Every addition
should include:

- a production-shaped motivating expression;
- MRI comparison for shared Ruby code (`spec/shared_test.rb`);
- relevant Ruby/JavaScript edge values;
- generated-code assertions when placement matters (`spec/compiler_test.rb`);
- executable runtime coverage (`spec/runtime_test.mjs`);
- rejection of the nearest unsupported form;
- verification that application bundles do not duplicate the runtime
  (`spec/bundle_test.mjs`);
- an update to this document when the boundary moves.
