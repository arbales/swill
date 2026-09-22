# Compiler and Runtime

This document describes how Swill's Ruby2JS build turns Ruby source into
browser JavaScript, which Ruby forms it accepts, how it lowers them, and what
the handwritten runtime provides. 

| Path | Holds |
| --- | --- |
| `rb/compiler/names.rb` | Identifier and member encoding, JavaScript intrinsics, `CompileError` |
| `rb/compiler/knowledge.rb` | The fact model: entries, constant resolution, method and property lookup |
| `rb/compiler/knowledge/collection.rb` | Walking class and module bodies into entries |
| `rb/compiler/knowledge/reflection.rb` | Loaded classes to entries: what a class body declared |
| `rb/compiler/knowledge/validation.rb` | What a method body may contain |
| `rb/compiler/loader.rb` | Containers, the shared framework container, DOM stubs, and load errors |
| `rb/compiler/knowledge/dom.rb` | The DOM and browser intrinsics as the compiler knows them; generates `sorbet/rbi/dom.rbi` |
| `rb/compiler/knowledge/signatures.rb` | Reading `sig` parameter and return types and source ranges |
| `rb/compiler/filters/shared_lowering.rb` | `raise`, callable invocation, constructor, static method, `warn`, and `respond_to?` lowering |
| `rb/compiler/filters/static_types.rb` | Static type facts: literal, local, signature, and result types |
| `rb/compiler/filters/core_types.rb` | Lowering tables for String, Symbol, Integer, Float, Boolean, nil, Array, and Hash receivers and their blocks |
| `rb/compiler/filters/ruby_surface.rb` | The shared-Ruby surface: AST hooks, receiver dispatch, truthiness, and logic |
| `rb/compiler/filters/ruby_calls.rb` | Explicit calls for whatever the shared surface left alone |
| `rb/compiler/filters/javascript_surface.rb` | The browser-boundary surface |
| `rb/compiler/compiler.rb` | Orchestration, validation, conversion, and definitions |
| `rb/compiler/emit/meta.rb` | The `meta` object and mixin factories |
| `rb/compiler/emit/sorbet.rb` | Generated RBIs and type probes |
| `swill/runtime.mjs` | The `Runtime` surface generated code calls |
| `swill/runtime/metadata.mjs` | Installed property and method tables |
| `swill/runtime/properties.mjs` | Observable state, computed capture, and the mutation path |
| `swill/runtime/values.mjs` | Ruby truthiness, equality, and value readers |
| `swill/runtime/paths.mjs` | Key paths, dynamic read and write, `respond_to?`, and action dispatch |
| `swill/runtime/install.mjs` | Installation, mixin linking, registries, and the class registry |
| `swill/runtime/attributes.mjs` | Outlet and attribute views of an object |
| `swill/runtime/declarations.rb` | The MRI host's declaration primitives: `property`, registries, settings, `forward`, `macro` |
| `swill/runtime/properties.rb` | The MRI host's mutation and read path, mirroring `properties.mjs` |
| `swill/runtime/attributes.rb` | The MRI host's attribute views, mirroring `attributes.mjs` |
| `swill/browser_api.mjs` | Plain JavaScript registration and manual application startup |

## Pipeline

```text
Ruby source
  → Ruby2JS.parse                 (Prism walker on Ruby 3.4+, parser gem otherwise)
  → Loader#evaluate               (class bodies run in a container; method bodies never do)
  → Knowledge#collect             (structure from the AST, declarations by reflection)
  → Compiler#validate!            (ordering, ancestry, member collisions)
  → Ruby2JS.convert per entry     (Swill filters + Return; Pragma on shared Ruby)
  → esbuild --loader=js           (formatting only; part of every emission)
  → *.classes.mjs / *.meta.mjs / *.mjs
  → esbuild --bundle              (readable and minified IIFEs with source maps)
```

Two compiler instances run per build. The framework instance compiles
`rb/framework/`. Its `knowledge.interface` is handed in memory to the application
instance, which compiles `examples/` against those facts and imports the
framework's identifiers from the published `Swill` global rather than
recompiling them.

Both Ruby2JS parsers are supported. Only expression ranges are read from
location objects, because the two parsers disagree on token-level locations.
The suite passes and produces identical bundles under either.

## Knowledge collection

To support more dynamism and metaprogramming than Ruby2JS is designed to to,
`Swill::Ruby2JS::Loader` evaluates every source on MRI inside an anonymous container
module, and `Swill::Ruby2JS::Knowledge` then builds one entry per class or mixin
from two sources: the AST and from the loaded class.

The knowledge bank holds: 

| Field | From | Content |
| --- | --- | --- |
| `name`, `identifier` | AST | Ruby constant path and its JavaScript identifier |
| `kind` | AST | `class` or `mixin` |
| `scope`, `parent` | AST | Enclosing namespaces and the superclass constant as written |
| `includes` | AST | Mixins in factory-nesting order (see [Mixins](#mixins)) |
| `methods` | AST, plus `forward` | Name, JavaScript member name, arity, signature parameter types, signature return type, and whether it is asynchronous |
| `class_methods` | AST | A mixin's `ClassMethods` bodies, compiled as written |
| `properties` | class | One descriptor per `property`, in declaration order, however it was declared |
| `registries`, `settings` | class | What a mixin's `ClassMethods` declares |
| `registry_values`, `setting_values` | class | The class's exact registry snapshots, and what it set a setting to |
| `restorations` | class | Bindable paths kept in the URL fragment |
| `included_properties` | class | What a mixin's `self.included` hook declares, read from a class that includes it |

Imported entries from another compiler carry the same fields, minus the AST.

### Containers

A container is an anonymous `Module` with a temporary name, so a build adds
nothing to the global namespace and is collectable when it ends. Inside one,
`require` and `require_relative` are inert: the build decides the order and
hands the sources over in it.

The framework's container is built once per process. Each application's
container is given the framework's own constants, so an application resolves
`Swill::Controller` and subclasses the same class object. An application may
not declare anything below an imported root such as `Swill`; its declarations
remain in its own namespaces. A watch rebuild evaluates only the application's
files.

Before Ruby evaluates a source, the collector checks its class and module
bodies against the declaration vocabulary known for the whole source. Loading
is transactional: evaluation and collection either both finish, or newly
defined constants, entries, and blocks are restored. Corrected source at the
same path can therefore be tried again after a failed build. Application and
plugin source is trusted Ruby; the preflight exists to make compiler behavior
deterministic, not as a security boundary.

Sigs and declarations may name a DOM class, so a stub for every entry in
`knowledge/dom.rb` is defined in the container first, parents before children.

### Modules

A `module` is a mixin, a namespace, or both. Nested classes and non-
`ClassMethods` modules are collected as their own entries under the module's
name. The module is also collected as a mixin when it is empty or has any
non-namespace body. Namespaces are not entries.

### Class bodies

A class or mixin body may contain only:

| Statement | Handling |
| --- | --- |
| `def name(positional, args)` | Collected as a method. Names match `/\A[a-z_]\w*[!?=]?\z/`; `method_missing` is rejected; `initialize` compiles to `constructor`. Arguments are positional; optional ones are contiguous and compile per [Optional positional arguments](#optional-positional-arguments) |
| `sig { ... }` | Parameter and return types are recorded for lowering, then erased |
| `extend T::Sig` | Erased |
| `include A, B` / `include A` | Recorded; targets must be previously defined mixins |
| `property :name, ...`, or any declaration macro | Ran when the class body ran; the entry reads what it declared off the class (see [Declaration macros](#declaration-macros)) |
| `def self.name(positional, args)` | Classes only: a static method under the same name rules. Inside it `self` is the class and a bare `new` constructs it; `self.new` is rejected as a name |
| `async def name(...)`, `async def self.name(...)` | The same, marked asynchronous: it compiles to an `async` method and its body may `await` |
| `def self.included(base)` | Mixins only; see [Included hooks](#included-hooks) |
| `module ClassMethods` | Mixins only; see [Class methods](#class-methods) |
| nested `class` / `module` | Mixins only; collected as namespaced entries |

Anything else is a compile error naming the statement.

### Declaration macros

A declaration is ordinary Ruby: a class method that runs when the class body
runs. `property` is the primitive every other declaration is built on, and a
macro is a class method marked with `macro`, which makes it callable in a class
body and keeps it out of the emitted JavaScript.

```ruby
module Taggable
  def self.included(base)
    base.extend(ClassMethods)
  end

  module ClassMethods
    extend Swill::Declarations
    inheritable_registry :tags, :array

    macro def tag(name)
      tags << name.to_s
    end
  end
end
```

A macro may declare five kinds of thing, all of them serializable:

| Primitive | Emits |
| --- | --- |
| `property` (and `outlet`, `restorable`, and `attribute` built on it) | A descriptor the runtime installs as a prototype accessor |
| `inheritable_registry` entries | Data in the class's own registry |
| `class_setting` values | A value applied at installation |
| `forward` | A real, typed method on the class |
| `will_access:` on a property | The read notifies the object, so a value can load itself |

Nothing else reaches the browser: no macro machinery is emitted, and a plugin's
macro emits the same shapes with no change to the compiler. A macro may not
`define_method` with a block, because the block closes over the macro's locals
and compiling it would mean substituting captured values into an AST.

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
| `default:` | Literal string, number, symbol, `nil`, `true`, `false`, or an empty `[]` or `{}`; the emitted default is a function, so each instance gets its own collection. Anything mutable is rejected |
| Block | A computed property: no block arguments, no `default:` |
| `attribute:`, `key:` | Marks the property as local model data with an external key, used by validation, dirty tracking, and attribute collection |
| `outlet:`, `optional:` | Marks the property an outlet, connected at awakening |
| `will_access:` | The getter calls `property_will_access(name)` before it resolves |

The framework's own macros:

| Macro | Declares |
| --- | --- |
| `attribute :name, type:, default:, key:` | A property marked as an attribute, and the same declaration as data in `model_attributes` |
| `outlet :field, type:, optional:` | A stored, nilable, observable property with `outlet` and `optional` metadata. Declared on `Swill::Controller`, so only a controller can call it. The type names the connected value: a framework class for a view or child controller, `T::Hash[...]` or `T::Array[...]` for decoded JSON, `T.untyped` for anything. Awakening checks a typed outlet's value against the type shallowly, as `T.cast` does, so a JSON script that decodes to the wrong shape fails by outlet name |
| `restorable :path, key: :k` | A dotted property path the application keeps in the URL fragment. The leaf's declared type is recorded when every segment is statically typed. Declared on `Swill::Controller` |
| `Resource.has_many :name, type:, key:, url:, will_access:` | An endpoint-backed array relationship, its loading properties, descriptor, and typed load/reload methods |
| `Resource.has_one :name, ...` | The endpoint-backed nilable form of the same declaration |
| `DistantObject.model_name "Name"` | The authoritative server model name as a class setting |
| `DistantObject.attribute :name, type:` | A partial scalar whose reads participate in data demand collection |
| `DistantObject.has_one :name, model:` | A partial nilable canonical model reference |
| `DistantObject.has_many :name, model:` | A partial stable `Collection` of canonical model references |

An outlet or resource relationship may name a class defined later by writing
its name as a string. Generated distant relationship declarations use
authoritative model-name strings so cyclic model graphs do not depend on
client class load order.

### Class settings

```ruby
module Cacheable
  def self.included(base)
    base.extend(ClassMethods)
  end

  module ClassMethods
    extend Swill::Declarations
    class_setting :cache_policy
  end
end

class Menu
  include Cacheable
  cache_policy "session"
end
```

A class body may set any `class_setting` an included `ClassMethods`, or an
ancestor's, declares. The value is emitted as `settings` in the meta object and
applied through the setting method at installation, and is stored under the
Ruby name so `Runtime.classWithSetting` can look a class up by it. Reading a
setting in a class body says nothing and is rejected; a name nothing declares
is rejected as an unsupported class-body statement, with the file and line it
was written on.

### Included hooks

A mixin may declare exactly one `def self.included(base)` whose body consists
only of `base.extend(ClassMethods)` and declarations on `base`. Every class
that includes the mixin runs the hook and so owns its own descriptors, and a
computed block compiles in each receiving class. The hook is never emitted, and
the compiler runs it once more against a throwaway class so the mixin's own
RBI can name what it declares.

### Class methods

A mixin's `module ClassMethods` may contain:

| Statement | Result |
| --- | --- |
| `extend Swill::Declarations` | Accepted and erased: the browser gets the declarations' result, not the primitives |
| `inheritable_registry :name` / `:name, :array` | A per-class registry that copies its parent's contents on first access. Its exact declaration-time contents travel in the meta object as `registries` and replace the runtime copy at installation |
| `class_setting :name` | A per-class value that falls back to the parent's; a class body sets it with a literal (see [Class settings](#class-settings)), and the value is stored under the Ruby name so `Runtime.classWithSetting` can look a class up by it |
| `def name(positional)` | Compiled as a class-side method; inside it `self` is the class, so bare calls reach static methods, other `ClassMethods` methods, registries, and settings |
| `macro def name(...)` | A declaration macro. It runs when a class body calls it and is never emitted, so its body may use the full declaration vocabulary |
| `extend T::Sig`, `sig { ... }` | Read for parameter and return types, never emitted |

### Optional positional arguments

JavaScript has no leading optional parameter — `function m(a = null, b, c)`
binds left to right, so a two-argument call fills `a` and `b` rather than `b`
and `c`. Rather than reshape the Ruby around that, a method with optional
arguments compiles the way Cocoa spells an overload: **one method per arity,
named for the optionals it takes.**

```ruby
sig { params(greeting: String, name: String).returns(String) }
def greet(greeting = "Hello", name)
  "#{greeting}, #{name}"
end
```

```js
greetWithGreeting(greeting, name) { return `${greeting}, ${name}`; }
greet(name) { return this.greetWithGreeting("Hello", name); }
```

| Rule | Detail |
| --- | --- |
| Naming | The variant taking no optionals keeps the plain name. Each wider one is `name_with_` followed by the optionals it takes, joined by `_and_`: `greet` / `greet_with_greeting`; `span` / `span_with_b` / `span_with_b_and_c` |
| Body | The widest variant carries the body. Every shorter one hands it the defaults in the positions Ruby's own binding would fill: required arguments first, optionals absorbing what is left |
| Metadata | Each variant is its own entry with a fixed arity; the wider ones carry `family`, which is how `Runtime.invoke`, `read`, and `performAction` resolve a name and an argument count to one method |
| Call sites | A send to a typed receiver emits the variant whose arity is the argument count, and the signature's parameter types follow the parameters, so a lambda passed to a shorter variant is still typed |
| `super` | Reaches the parent's variant of the same width, so an override keeps its own defaults |
| Rejected | Keyword, splat, and block parameters; non-contiguous optionals; a predicate, bang, or writer with an optional; optionals on a static or `ClassMethods` method; a block with an optional, since whatever yields to it calls at a fixed arity; an override whose accepted arities differ from the inherited family, which would shadow only part of it; and a statically resolved call with no matching arity. A signature must name the method's parameters in the same order |

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
| `Runtime`, `Superclass`, `Object`, `Array`, `String`, `Number`, `Math`, `JSON`, `Error`, `Promise`, `MutationObserver`, `URLSearchParams` | `Ruby_Runtime` and so on | Reserved plumbing and JavaScript intrinsics |
| `row_elements`, `awake_from_dom` | `rowElements`, `awakeFromDOM` | Members are camelCase; `DOM`, `URL`, `JSON`, and `HTML` stay upper-case |
| `row_element?`, `dirty?` | `isRowElement`, `isDirty` | A predicate gains `is` |
| `accepts_first_responder?`, `rows_are_views?`, `confirm_edit?` | `acceptsFirstResponder`, `rowsAreViews`, `confirmEdit` | A predicate phrased as a verb (first word in the compiler's verb list, or `are`, `is`, `has` inside) keeps its phrasing |
| `mark_clean!` | `markClean` | The bang is dropped; a class defining both `x` and `x!` is rejected as a member collision |
| `__swill_view__` | `__swill_view__` | A leading underscore marks a JavaScript expando, left as written |

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
                 defaultValue() { return ""; }},
        "label": {type: "String", attribute: false,
                  compute: function computeLabel() { return this.loud ? Runtime.upcase(this.name) : this.name; }},
        "blank?": {js: "isBlank", type: "T::Boolean", attribute: false, compute: ...},
        "badge": {type: "T.nilable(Demo::Badge)", attribute: false, outlet: true, optional: false,
                  defaultValue() { return null; }},
        "books": {type: "T::Array[Demo::Book]", attribute: false, willAccess: true,
                  defaultValue() { return []; }}
      },
      registries: {
        modelAttributes: {"name": {"name": "name", "key": "name", "type": "String", "default": ""}},
        modelRelationships: {"books": {"name": "books", "key": "books", "kind": "many",
                                       "type": "Demo::Book", "url": "/api/authors/:id/books"}}
      },
      methods: {"greeting": {"arity": 0}, "loadBooks": {"arity": 0}}
    }
  }
};
```

`meta` is the serialization of each class's declaration-time state, and
`Runtime.install` is its deserializer. Registry values and settings are plain
data the runtime applies without knowing what any of it means; a plugin's macro
emits the same shapes. `meta` contains no Ruby source and no compiler AST. Object keys use the Ruby name; `js` is present only
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

The generic compiler can publish and launch directly with these options. The
Swill distribution instead compiles the framework without them and bundles a
small handwritten browser entrypoint. That entrypoint installs the framework,
passes its definitions to `browserAPI`, freezes the returned `Swill` global,
and installs `Swill::Launcher`. The browser API retains the definitions for
compiled bundles and adds friendly class names, JavaScript registration, and
manual startup. `Swill::Launcher` starts an application declared by
`[application]`; `Swill.start()` starts a JavaScript application explicitly.
The application build imports every framework identifier from that global
through a generated shim, so the application bundle contains neither the
runtime nor the framework classes. Only `Swill` is global.

`Swill.register` converts `static properties`, `static outlets`, explicit
actions, and native getters into the same `meta.classes` descriptors emitted
by the compiler. An outlet descriptor takes `optional`; its value is untyped. It then delegates to `Runtime.install`; JavaScript classes do
not have a separate observation or dispatch path.

### Sorbet artifacts

| Artifact | Purpose |
| --- | --- |
| `Compiler#rbi` | Typed readers and writers for every declared property, plus `ClassMethods` registries and settings |
| `Compiler#type_probes` | One typed method per declaration whose body is the default or computed expression, so Sorbet checks it against the declared type |

Both are regenerated by `rake build` into `sorbet/rbi/generated.rbi` and
`sorbet/checks/declarations.rb`. Neither is executed or shipped.

## Native types

One filter chain compiles every entry: `RubySurface`, then `Return` for
implicit returns, then `RubyCalls`, which turns any remaining send into an
explicit call. What decides between Ruby semantics and JavaScript's is the
static type of the receiver, never the file.

The browser is described to the compiler once, in
`rb/compiler/knowledge/dom.rb`: the DOM classes and JavaScript intrinsics
framework code may name (`Element`, `Node`, `Document`, `DOMWindow`, `Event`,
`KeyboardEvent`, `MouseEvent`, `HTMLTemplateElement`, `DocumentFragment`,
`HTMLCollection`, `NodeList`, `DOMTokenList`, `Selection`, `Location`,
`History`, `MutationObserver`, `MutationRecord`, `Promise`, `URLSearchParams`)
with the members the framework uses, each marked as an attribute, an accessor,
or a method, with its type and parameters. The build writes that table out as
`sorbet/rbi/dom.rbi`, so framework signatures say `Element` where a DOM value
is meant and Sorbet checks the calls; the compiler reads the same table to
lower them. `DOMWindow` is the browser's window, since `Swill::Window` is the
framework's own class.

| Receiver | Emitted |
| --- | --- |
| A DOM class, nilable or not | A listed attribute or accessor is property access, a listed method is a call, whatever the source's parentheses; `name = value` is an assignment. An unlisted member follows the source: parentheses or arguments call, none reads. `?.` is JavaScript's own and keeps the source's parentheses. Operators and indexing stay with the converter |
| The result of a native member | The member's declared type when listed (`getAttribute` yields `T.nilable(String)`, so `strip` is Ruby's), the indexed element type for `[]` on a collection, `T.self_type` for `cloneNode`, otherwise an untyped JavaScript value on which every member is native |
| A DOM class constant | `new` constructs it (`MutationObserver.new(...)`); a JavaScript intrinsic such as `JSON` passes through by name. A source constant of the same name wins and is encoded (`Ruby_JSON`) so it cannot shadow the global |
| A lambda or block passed to a native member | Its parameters take the types the table declares for that callback (`addEventListener`'s listener receives an `Event`, `NodeList#forEach` an `Element`, the `MutationObserver` constructor its records), and locals assigned from them are typed in the body |

DOM-typed values have JavaScript truthiness and identity equality, and a
block on one is a JavaScript callback. A `T.let` or `T.cast` to a DOM type, or
to `T.untyped`, is an annotation for Sorbet and the typer with no runtime
check: the browser's classes are not the runtime's to verify. `T.untyped`
means a Ruby object dispatched by name at run time, so a DOM value must be
typed as one; passing it through `T.untyped` would fail at first use.

`Runtime`, bare or as `Swill::Runtime`, names the handwritten runtime when no
source constant of that name is in scope.

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
| Local variable | Inferred when its assignments' types merge (the same class or core type, nilable when any is nil, an empty `[]` or `{}` fitting a typed collection) and its first assignment is a statement, in the body or in a branch, loop, or block, that precedes every read; an assignment may refer to the variable itself; an assigned parameter loses its signature type |
| Instance variable | `T.nilable(Class)` when every assignment anywhere in the class has a static type and the non-nil ones name one framework class; otherwise none. Inferred from the class's own AST, so a computed property's block, which is converted on its own, types its instance variables the same way a method does |
| `left \|\| right` | The right's type when both sides name the same class, nilable or not on the left: a nil left yields the right |
| `Const.member(...)` | The `sig` return type of the static method, or of the method, registry, or setting an included `ClassMethods` provides; registries and settings are `T.untyped`. `T.attached_class` and `T.self_type` in the type stand for the receiving class |
| `self.class`, `receiver.class` for a framework-class receiver, `self` in a class method | `T.class_of(Class)` |
| `receiver.member(...)` where the receiver is `T.class_of(Class)` | As `Const.member`, and `receiver.new` yields the class |
| `name(...)` for an async method, without `await` | `Promise` |
| `await expression` | An async member's declared type (its signature names the value it yields); the element of a `Promise[X]` type from the DOM table; otherwise the expression's own type, and none for an untyped JavaScript value |
| `fetch(...)`, `encodeURIComponent(...)`, `setTimeout(...)`, `clearTimeout(...)`, `queueMicrotask(...)`: the bare browser functions the DOM table lists as globals, when the class defines no method of that name | The table's type; `fetch` yields `Promise[Response]`, `setTimeout` an `Integer` |
| `left + right`, `-`, `*`, `/`, `%` on `Integer` or `Float` operands | `Float` when either side is, else `Integer`; `String + String` is `String` |
| A `rescue => name` variable | `Error`, the DOM table's class for a thrown JavaScript error, so `name.message` reads |
| `name` or `self.name` for a declared property | The declared type, including inherited and included declarations |
| `name(...)` or `self.name(...)` for a collected method | Its `sig` return type; `void` yields no type |
| `super(...)` / `super` | The enclosing method's return type |
| `receiver.name` where the receiver has a framework class type | That class's property type or method return type |
| `receiver.strip` / `upcase` / `downcase` on a `String` receiver | `String` |
| `receiver.blank?` / `present?` / `empty?` / `nil?` | `T::Boolean` |
| `(expression)` | The inner expression's type |
| A member of a DOM-typed receiver | The DOM table's type for a listed member, the element type for `[]` on a collection, otherwise an untyped JavaScript value |
| `DOMClass.new(...)` | That class |
| `T.must(expression)` | The expression's type without `T.nilable`; none when the expression is `nil` or untyped |
| `T.cast(expression, Type)`, `T.let(expression, Type)`, `T.assert_type!(expression, Type)` | `Type`, as written |
| `T.unsafe(expression)` | `T.untyped`, so sends on it are dynamic |
| `receiver&.member` | What the member yields, made nilable: the expression is nil when the receiver is |

Nilable wrappers are unwrapped where the rule says "class type". Anything not
listed has no static type.

### Truthiness

Used by `if`, `unless`, ternaries, and unary `!`. Loops are not lowered.

| Static type | Emitted condition |
| --- | --- |
| `T::Boolean`, framework class, DOM class, `Array`, `Hash`, `T::Array[...]`, `T::Hash[...]`, nilable class | The value itself |
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
in Ruby. Ruby2JS's own `||` handling is forced to logical `||`; its nullish `??` would
keep a Ruby `false`.

### Equality

`==` and `!=` compile to `===` / `!==` when either operand has an
identity-comparable type: `String`, `Integer`, `Float`, `Symbol`, `T::Boolean`,
`NilClass`, a nilable form of those, a framework class, or a DOM class. Otherwise they
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
| Framework class | `class` | `receiver.constructor` |
| A class object (`T.class_of(Class)`, `self.class`, a class constant) | A static method, or a `ClassMethods` method, registry, or setting | `receiver.name(args)`, lambdas typed by the signature |
| A class object | `new(args)` | `new receiver(args)` |
| A JavaScript intrinsic or DOM class named as the receiver (`JSON`, `Promise`, `Math`) | Anything but `new` | Native; `JSON.generate` is `JSON.stringify` |
| Any | `is_a?(Array)`, `kind_of?(Array)`, `instance_of?(Array)` | `Array.isArray(receiver)`, so an array from another realm (a page's JSON) counts |
| Framework class | `receiver&.name` for a declared property | `Runtime.nilable(receiver?.name)` |
| Framework class | `receiver&.name(args)` for a collected method | `Runtime.nilable(receiver?.name(args))` |
| DOM class | `receiver&.name` | `receiver?.name`, JavaScript's own, since a DOM value is a JavaScript value |
| Core value type, unknown, or `T.untyped` | `receiver&.name` | Rejected: these lower through helpers that take the receiver as an argument, which `?.` cannot guard |
| Core collection | A block of several statements | The block's last expression is its value, as in Ruby: the body compiles with an explicit return (the converter alone returns only single-expression bodies) |
| DOM class or untyped JavaScript value | Anything | Native, per [Native types](#native-types) |
| Any | `nil?` | `receiver == null` |
| Core value type (below), nilable or not | A method in its table | The table's form; a method outside the table is rejected |
| Core value type | Operators, indexing, `new`, or a send with an `array`/`hash`/`string` pragma | Left to the converter and the Pragma filter, except the array and integer operators the tables name |
| Any, or implicit self | `respond_to?(:name)` with a literal name | `Runtime.respondsTo(receiver, "name")`; a dynamic name is rejected |
| Unknown, `T.untyped`, or `T.proc...` | `call(args)` or `.(args)` | `receiver(args)` for a local receiver; `receiver.call(null, args)` otherwise |
| Unknown or `T.untyped` | Operators, indexing, `new`, unary operators, or a send with an `array`/`hash`/`string` pragma | Left to the converter and the Pragma filter |
| Unknown or `T.untyped` | No arguments | `Runtime.read(receiver, "name")` |
| Unknown or `T.untyped` | `name = value` | `Runtime.write(receiver, "name", value)` |
| Unknown or `T.untyped` | Arguments | `Runtime.invoke(receiver, "name", args)`, resolved against metadata by name and argument count |
| Unknown or `T.untyped` | Any block | Rejected: collected methods take no blocks, so only a collection can receive one, and its type must be declared |
| Any other type | Anything | Pragma filter if it applies, else an explicit call |

No operation is chosen by method name alone. A typed receiver is resolved
statically; an untyped receiver is dynamic, and every send on it is resolved
through installed metadata at run time, as Ruby itself would resolve it. A
model may define its own `strip`: a typed receiver calls it, and an untyped
receiver reaches it through `Runtime.read`, which prefers a collected method
over the string reader. Constants and `self` are never dynamic, and
`Const.new` types its result as that class when the class is collected.

### Core value types

`filters/core_types.rb` holds one table per Ruby core type. A method in a
table compiles to the JavaScript form where Ruby and JavaScript agree, or to a
`Runtime` helper in `values.mjs` that carries Ruby's rule where they differ.
Each entry also fixes the static type of its result, so chains such as
`name.strip.length > 0` stay typed. A method on one of these receivers that
no table lists is a build error naming the type and method: a gap is
reported, not compiled into a call to a method JavaScript lacks. The tables
grow with real code; `spec/compiler_test.rb` runs one fixture over them on
MRI and as compiled JavaScript and requires identical results.

A `T.nilable(X)` receiver uses `X`'s table. Ruby would raise on nil, and the
JavaScript forms and helpers throw on `null` too, except `to_s`, which is
nil-safe (`Runtime.stringify`) because `nil.to_s` is `""`.

| Type | Direct JavaScript | Runtime helper (Ruby semantics) |
| --- | --- | --- |
| `String` | `length`/`size` (`.length`); `include?`, `start_with?`, `end_with?` (`includes`, `startsWith`, `endsWith`); `to_s`, `to_sym`, `dup` (identity); `chars` (`Array.from`) | `strip`, `upcase`, `downcase`, `capitalize`, `blank?`, `present?`, `empty?`, `to_i` (leading integer or 0), `to_f`, `split` (whitespace or separator, trailing empties dropped), `slice(index)` / `slice(start, length)` |
| `Symbol` | `to_s`, `to_sym` (identity) | |
| `Integer` | `zero?`, `positive?`, `negative?`, `even?`, `odd?` (comparisons); `abs` (`Math.abs`); `to_i`, `to_f` (identity) | `to_s`, `clamp`, `between?`; `/` and `%` with an Integer divisor floor and take the divisor's sign (`intDiv`, `modulo`) |
| `Float` | `floor`, `ceil`, `round`, `to_i` (`Math`); `zero?`, `positive?`, `negative?`, `abs` | `to_s`, `clamp`, `between?` |
| `T::Boolean`, `NilClass` | `nil.to_a` (`[]`), `nil.to_i` (`0`) | `to_s` (`nil.to_s` is `""`) |
| `Array` | `length`/`size`/`count` (`.length`); `first` (`[0]`); `last` (`at(-1)`); `include?` (`includes`); `pop`, `shift`; `join` (default `""`); `take`, `drop` (`slice`); `dup` (`slice()`); `to_a`; `+` (`concat`) | `blank?`, `present?`, `empty?`, `index` (Ruby equality, nil when absent), `push` and `<<` (return the array), `unshift`, `reverse`, `sort` (copy, Ruby ordering), `uniq`, `compact`, `flatten`, `sum`, `min`, `max` (nil when empty), `-` (Ruby equality) |
| `Hash` | `length`/`size`/`count`, `keys`, `values`, `key?`/`has_key?`/`include?` (`Object.keys`, `Object.values`, `Object.hasOwn`); `merge`, `dup` (`Object.assign`); `to_h` | `blank?`, `present?`, `empty?`, `fetch` (default or error), `delete` (the value or nil) |

Blocks on arrays and hashes:

| Receiver | Methods | Emitted |
| --- | --- | --- |
| `Array` | `each`, `each_with_index`, `map`, `flat_map` | `forEach`, `map`, `flatMap` with an arrow function; parameters take the element type, and the index is an `Integer` |
| `Array` | `select`/`filter`, `reject`, `find`/`detect`, `any?`, `all?`, `none?`, `count` | `filter`, `find`, `some`, `every`, negated or `.length` as needed; the block's last expression is read with Ruby truthiness, so `0` and `""` stay true |
| `Array` | `sort_by`, `min_by`, `max_by` | `Runtime.sortBy`, `minBy`, `maxBy` with the arrow function |
| `Hash` | `each`, `map`, `select`/`filter`, `reject`, `any?`, `all?`, `count` | The same over `Object.entries`; `\|key, value\|` destructures each pair and `select`/`reject` rebuild a hash with `Object.fromEntries` |

Any other block on a core receiver is rejected. Untyped receivers are covered
above: a send on one is dynamic, and a block on one is rejected.

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

### Sorbet runtime operations

Executable code may use the `T` methods below; they compile to runtime
checks with sorbet-runtime's behavior, so shared Ruby behaves the same on MRI
and in the browser, and they give the static typer facts. No other `T`
construct is allowed in a body, and no `sorbet-runtime` is bundled.

| Source | Emitted | Runtime behavior |
| --- | --- | --- |
| `T.must(value)` | `Runtime.must(value)` | Throws `TypeError` for `null` or `undefined`, else returns the value |
| `T.cast(value, Type)`, `T.let(value, Type)`, `T.assert_type!(value, Type)` | `Runtime.cast(value, "Type")` | Throws `TypeError` unless the value conforms, else returns it |
| `T.unsafe(value)` | `value` | None |
| `T.absurd(value)` | `Runtime.absurd(value)` | Always throws `TypeError` |

A checkable `Type` is a declaration type, `Float`, `Symbol`, `NilClass`, or
`T.untyped`. A class name is resolved in Ruby scope and emitted as the name the
class is installed under, so the check is `instanceof` against the installed
class. A DOM class or intrinsic is accepted, and a cast to one, or to
`T.untyped`, is an annotation only, with no runtime check. `T::Array[...]` and `T::Hash[...]` check the container only,
not its elements, as sorbet-runtime does. Unions, procs, mixins, and unknown
constants are rejected. `T.let` on an assignment keeps its check and types the
local; the upstream Pragma filter would otherwise erase it.

### Asynchrony

`async` and `await` are reserved forms with JavaScript's meaning. `async def
name` (Ruby parses it as `async(def ...)`) declares an asynchronous method,
compiled with the `async` keyword, so calling it yields a promise. `await
expression` inside such a method compiles to `await`. `await` outside an
async method, or inside a block or lambda within one (their functions are
not the method), is rejected. On MRI, `Swill::Object` provides `async` as a
no-op wrapper and `await` as the identity, so shared code runs synchronously
there.

An async method's signature names the value it yields, not the promise:
`sig { returns(ResultSet[Post]) }` on `async def self.search(text)` means
`await Post.search(text)` is a `ResultSet[Post]` to the compiler and, through
`await`'s generic identity signature, to Sorbet. A call without `await` is a `Promise`. The
DOM table writes `Promise[Response]` for `fetch`; the RBI shows Sorbet the
element, as MRI's `await` would yield it, and the compiler types the awaited
value. `Promise.all`, `Promise.resolve`, and the rest of the browser's
promise API are native, as any DOM class is, and their awaited values are
untyped.

### Exceptions

`raise "message"` and `raise "interpolated #{message}"` compile to
`throw new Error(...)`. Bare `raise`, `raise SomeClass`, `raise SomeClass, msg`,
and `raise variable` are rejected. `begin`/`rescue => error`/`ensure` is the
converter's `try`/`catch`/`finally`; the rescued variable is typed `Error`,
so `error.message` is a native read. Rescuing a named class is outside the
boundary: a thrown value is whatever JavaScript threw.

### Safe navigation

`receiver&.member` is lowered wherever the compiler resolves the member
statically: a declared property reads, a collected method is called, and each
hop guards the next, so `recipe&.detail&.glassware` is one expression. A core
value type and an untyped receiver are rejected, because both lower through
helpers that take the receiver as an argument, and `?.` cannot guard an
argument.

Two things about the output are deliberate. The result passes through
`Runtime.nilable`, because JavaScript's optional chaining answers `undefined`
where Ruby answers `nil`, and `undefined` is a second spelling of nothing that
would leak to application JavaScript and disappear from `JSON.stringify`. A
chain normalizes once, at the end. And a DOM receiver keeps plain `?.`
without that wrapper: those are JavaScript values, which the compiler already
types as such.

## Runtime reference

`rb/runtime/runtime.mjs` exports one object, `Runtime`. It holds browser state
and installs metadata. It never interprets Ruby source or ASTs, never patches
prototypes it did not create, and provides no universal dynamic send.

### Installation

| Function | Behavior |
| --- | --- |
| `install(meta)` | Validates every entry first, then installs classes superclass-first regardless of key order. Errors: `Duplicate class`, `Missing constructor`, `Unknown mixin for`, `Duplicate constructor in meta`, `Mixin factory must be a function`, `ClassMethods factory must be a function`, `Unresolvable superclass order in meta` |
| `include(klass, mixins, incoming)` | Rewires `klass` and `klass.prototype` through the mixin layers once, before instances exist, and copies `ClassMethods` helpers onto the constructor. Error: `Mixins must be attached before class installation` |
| `installClass(klass, name, properties, methods, registries, restorations, settings)` | Records metadata, applies settings and exact registry snapshots, defines accessors on the prototype, and registers the name. Errors: `Duplicate class`, `Setter method for declared property`, `Restorable path must start with a declared property`, `Duplicate restorable key`, `Missing registry declaration`, `Missing setting declaration` |
| `resolve(name)` | Returns the registered constructor for a Ruby name. Fails closed with `Unknown class`; markup cannot reach globals or prototypes |

Metadata is inherited: a class's property and method tables start from its
parent's, so lookups do not walk the chain at call time.

Conflicts with installed metadata are rejected here, not by the compiler:
the compiler rejects what it cannot compile or emit, and the runtime rejects
metadata it cannot install or honor. A `name=` method for a declared or
inherited property would be replaced or bypassed by the installed accessor;
mutation belongs in `name_did_change`. A `restorable` path must start at a
declared property for the path writer to reach it, and fragment keys must be
unique along the class chain. Checking at installation also covers classes
registered from JavaScript, which the compiler never sees.

### Metadata-driven dispatch

| Function | Behavior |
| --- | --- |
| `read(object, name)` | On a null receiver, `nil?`, `blank?`, `present?`, `to_s`, `to_i`, and `to_f` answer for nil and every other name yields `null`. Primitives go straight to `valueRead`. A plain object is a Hash: its entry by key, `null` when absent, then the value readers, as key-value coding treats a dictionary; entries are not observable. Otherwise a declared property, then a collected method that takes no arguments, then `valueRead` for the value reader names. Error: `Unknown reader` |
| `write(object, name, value)` | A declared stored property through the property protocol, or a collected `name=` accessor. A plain object is a Hash: an entry it already has is set, as key-value coding does for a dictionary. Errors: `Cannot write ... on nil`, `Read-only property`, `Unknown writer`, `Unknown key` |
| `readPath(object, "a.b.c")` | Folds `read` over the segments; a null intermediate yields `null`; the empty path is the object itself |
| `writePath(object, path, value)` / `assertWritablePath(object, path)` | Resolves the owner with `read` and requires a stored property, or an existing key of a Hash owner, at the end. A missing intermediate owner makes the write a no-op, since the owner may appear later. Errors: `Read-only binding` when the leaf is computed, not a property, or the path is empty; `Unknown key` for a Hash owner without the key |
| `invoke(object, name, ...args)` | Calls the member of the named method's family whose arity is the argument count; the dynamic call compiled for an untyped receiver. Errors: `Cannot call ... on nil`, `Unknown method or wrong arity` |
| `respondsTo(object, name)` | Ruby `respond_to?` over metadata: a declared property, its writer when stored, a collected method, or a value reader on nil and plain values. The JavaScript object shape is never consulted. The responder chain uses it to decide which responder handles an action |
| `outlets(object)` | The property descriptors declared with `outlet`, including inherited ones; awakening connects them |
| `restorations(object)` | The `restorable` declarations, including inherited ones, as `{path, key, type}` |
| `decodeFragment(type, text)` / `encodeFragment(value)` | Fragment values are strings; a declared `Integer` or `T::Boolean` leaf decodes, anything else stays text, and an undecodable value is `undefined`. Encoding maps nil and `""` to removal |
| `warn(message)` | The one console boundary, for wrong untrusted URL input |
| `isAttribute(object, name)` | Whether `name` is a declared `attribute` on the object's class |
| `validateAttribute(object, name, value, previous)` | Runs a collected `validate_<name>(value, previous)` method for a declared attribute, else returns the value. A `validate_<name>` that cannot take both throws rather than silently never running. The MRI host implements the same convention with `respond_to?` |
| `performAction(object, name, sender, event)` | Calls the widest member of the named method's family that takes at most two arguments, with `sender` and `event` sliced to fit. Same error |
| `nameOf(object)` | The installed name of the object's nearest installed class, or `null` |
| `valueRead(value, name)` / `valueInvoke(value, name, args)` | Ruby's core methods on plain values, reached by `read` and `invoke` when the receiver has no declared member of that name: the predicates, `size`, `length`, `strip`, `upcase`, `downcase`, `capitalize`, `dup`, `first`, `last`, `compact`, `uniq`, `reverse`, `sum`, `min`, `max`, `to_s`, `to_sym`, `to_i`, `to_f`, and with arguments `index`, `take`, `drop`, `include?`. `dup` copies an array or hash; on an object with declared properties, `read` answers `dup` with a new instance carrying the stored properties, written through the property protocol; array methods refuse other values. Errors: `Unknown value reader`, `Unknown value method` |

### Values

| Function | Semantics |
| --- | --- |
| `isTruthy(value)` | Ruby truthiness: everything except `false`, `null`, and `undefined` |
| `logicalAnd(left, thunk)` / `logicalOr(left, thunk)` | Ruby `&&` / `\|\|` with a deferred right operand |
| `isEqual(left, right)` | `===`, or element-wise for two arrays. Hashes and custom `==` are not implemented; framework objects compare by identity |
| `isBlank(value)` | `null`, `undefined`, `false`, a string that strips to empty, or an empty array |
| `isPresent(value)` | The negation of `isBlank` |
| `isEmpty(value)` | Zero length for a string or array; anything else throws `TypeError` |
| `strip(value)` | Removes ASCII whitespace and NUL from both ends, as Ruby does; JavaScript `trim` would also remove NBSP. Non-strings throw `TypeError` |
| `upcase(value)` / `downcase(value)` | `toUpperCase` / `toLowerCase`; non-strings throw `TypeError` |
| `length`, `stringify`, `toInteger`, `toFloat`, `capitalize`, `split`, `slice`, `sort`, `sortBy`, `minBy`, `maxBy`, `min`, `max`, `sum`, `uniq`, `compact`, `flatten`, `reverse`, `indexOf`, `append`, `prepend`, `difference`, `fetch`, `deleteKey`, `intDiv`, `modulo`, `between`, `clamp` | Core type methods whose Ruby rule differs from JavaScript's; the core value types section lists which method each serves. `isBlank`, `isEmpty`, and `length` also accept a plain object as a Hash |

### Sorbet runtime operations

| Function | Semantics |
| --- | --- |
| `must(value)` | Returns the value; throws `TypeError` for `null` or `undefined` |
| `cast(value, type)` | Returns the value when it conforms to the type text (a declaration type, `Float`, `Symbol`, `NilClass`, `T.untyped`, or an installed class name); otherwise throws `TypeError`. Containers are checked shallowly |
| `absurd(value)` | Throws `TypeError` |
| `conforms(value, type)` | The check behind `cast`, as a boolean; awakening uses it for typed outlets |

### Observation

| Function | Behavior |
| --- | --- |
| `observe(object, name, callback)` | Subscribes to a declared property; the callback receives `(value, previous)`. Observing a computed property computes it first so its dependencies exist. Returns a disposer. `Swill::Observable#observe` retains it on the observer, so framework plumbing whose disposer belongs to something else — a wired region, a list row — calls this primitive instead. Error: `Unknown observable property` |
| `observePath(object, path, callback)` | Subscribes along every observable segment, rehooks the subtree before invoking the callback when an intermediate changes, and passes the new path value. Returns a disposer that also stops any in-flight rehook |
| `retain(object, disposer)` | The object claims the disposer and is responsible for letting it go, as Cocoa's retain claims an object. Answers the disposer |
| `release(object, disposer)` | Gives up a claim before the object goes away, ending the disposer. One never retained still ends |
| `dealloc(object)` | End of life: releases everything the object retained, then disconnects it. Draining first means nothing an observer does can re-enter |
| `disconnect(object)` | Releases computed dependency subscriptions and observers, invalidates outside computed values that depended on the object, and keeps stored values. A later or eagerly observed read builds a fresh dependency graph |

### Attributes and class configuration

| Function | Behavior |
| --- | --- |
| `collectAttributes(object, only = null)` | `{key: value}` for every stored `attribute` declaration, including inherited ones; with an array of names, only those |
| `identityStore(klass)` | The class's endpoint-strategy identity store, created on first use |
| `classWithSetting(name, value)` | The installed class whose own setting, by Ruby name, has the value, or `null` |
| `applyAttributes(object, source)` | Assigns each attribute from `source[key]`, else `source[name]`, through the property protocol |
| `Model::Attributes.from_attributes(source)` | Class method from the shared mixin: `new` plus `apply_attributes`, so `decode_outlet_data` can hand an outlet typed `T::Array[Person]` real people |
| `inheritableRegistry(klass, name, "hash" \| "array")` | Returns the class's own registry, created on first access as a copy of the parent's |
| `classSetting(klass, name, values)` | With one value, stores it; with none, returns the class's own value or the parent's; more than one value throws. `installClass` applies a class body's `settings` through the setting method after mixins are attached, and throws for a setting no `ClassMethods` declares |

## Property protocol

Accessors installed by `installClass` share one mutation path, and one read
path:

```text
write: read previous → coerce_property_value(name, value, previous)
  → compare with isEqual → property_will_change(name, previous, value)
  → store → notify

read: record the dependency → property_will_access(name) → resolve
```

The three hooks are Cocoa's, and a class overrides them rather than redefining
an accessor:

| Cocoa | Swill | When |
| --- | --- | --- |
| `-validateValue:forKey:error:` | `coerce_property_value(name, value, previous)` | Before a write |
| `-willChangeValueForKey:` | `property_will_change(name, previous, value)` | Before a write lands |
| `-willAccessValueForKey:` | `property_will_access(name)` | Before a read returns |

`property_will_access` runs only for a property declared `will_access:`, so an
ordinary read costs nothing. `Swill::Model::Resource` uses the hook for its
endpoint relationships. Reading an unloaded `recipe.ingredients` answers with
the current value and starts the relationship request. The record id and the
`ingredients_loaded`, `ingredients_loading`, and `ingredients_error` state
prevent repeated requests during rendering; `reload_<name>` asks again.

`Swill::Model::DistantObject` uses the same hook for fields and relationships
that are absent from a partial object. It queues missing members for batched
hydration through the data connection. Reads and explicit loads share the same
in-flight request in both strategies.

Those four properties are the whole of a relationship's key-value loading
state, in AVFoundation's sense, and every one of them is observable. A spinner,
an empty state, and a failure are bindings. An explicit `load_<name>` or
`reload_<name>` rejects after recording the error, so a caller that chose to
await it handles the failure normally. The automatic load started by a read
catches and warns after recording the same error:

```ruby
property :menu_recipes, type: T::Array[MenuRecipe] do
  menu = selected_menu
  menu ? menu.recipes : []
end
```

Reading `menu.recipes` inside the computed both registers the dependency and
starts the request, so selecting a menu fills the list and nothing calls a
loader.

`notify` runs, in order: dependents of the property (computed invalidation),
the `name_did_change(previous, value)` method if the class collected one, then
public observers. Dependents run first so a hook that reads a derived property
sees a fresh value.

Computed properties record every `(object, property)` read during `compute`
through a capture stack. Each recompute replaces the previous dependency
subscriptions, so a branch that stops reading an object stops observing it.
Invalidation drops the cache and recomputes eagerly only for something that
must learn of the change: an observer, or the property's own
`name_did_change` hook. A computed property whose class defines that hook is
therefore evaluated when the object's state is first touched, so the hook
runs on every dependency change with the previous and new values, as
`Swill::Controller::List` relies on for `selected_object_did_change`; a
computed property without a hook stays lazy until read or observed. Cycles
throw `Computed cycle`; an exception inside `compute` unwinds the capture
stack.

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
| Methods | Names outside `/\A[a-z_]\w*[!?=]?\z/`; `method_missing`; optional, keyword, splat, or block parameters; a method whose name is also an inherited property |
| Declarations | A macro's own keywords are Ruby's, so a missing or unknown one is rejected where it is written. The declaration primitives reject: an unsupported property name, a stored property ending in `?`, a duplicate name, a mutable default, a computed property with a default, a computed outlet, a restorable path that is not dotted property names, and registry storage other than `:hash` or `:array`. The compiler rejects a declared class name that does not name a class, and a class body that calls something no ancestor declares. Which classes may declare `outlet` and `restorable` is where their macros are defined; whether a `restorable` path starts at a declared property, and whether keys collide, is checked by the runtime at installation |
| Mixins | Properties or includes on a mixin itself; a second `self.included`; non-literal hook bodies; `base.extend` of anything but `ClassMethods`; declaring `ClassMethods` without contents; the same mixin included twice along one ancestor chain; `prepend` |
| `ClassMethods` | Non-literal registry or setting names; registry storage other than `:hash` / `:array`; `class_setting` coercion blocks; any other statement |
| Expressions | Any `T` construct in an executable body other than `T.must`, `T.cast`, `T.let`, `T.assert_type!`, `T.unsafe`, and `T.absurd` with the right number of arguments; a type argument outside the checkable types, or naming a mixin or an unknown constant; `public_send`, `send`, `__send__`, `const_get`, `define_method`, `instance_exec`, `eval`; `respond_to?` with a non-literal name; a block on an untyped receiver; a method or block on a core value type receiver outside its lowering table, or with the wrong number of arguments; safe navigation (`&.`) on the shared surface |
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
