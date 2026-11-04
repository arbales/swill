# Compiler and Runtime

Swill's compiler translates Ruby classes and modules into browser JavaScript. It
preserves Ruby behavior for supported expressions and emits metadata for
properties, methods, and declarations. The runtime uses that metadata to provide
observation, bindings, and method dispatch.

This guide describes the accepted Ruby forms and their JavaScript output. The
`Runtime` functions that generated code calls are listed in
[Runtime](runtime.md); the declaration keywords and the property protocol are
in [Declarations](declarations.md). For build commands, see [Getting
Started](getting_started.md); for type checking, see [Sorbet](sorbet.md).

## Pipeline

During a build, the compiler processes sources in the supplied order:

1. Parses the source with Ruby2JS.
2. Evaluates class bodies on MRI in an isolated container. It does not execute
   instance method bodies.
3. Collects class and module structure from the syntax tree and declarations
   from the loaded classes.
4. Validates declaration order, ancestry, and member names.
5. Converts each entry to JavaScript and formats the output with esbuild.
6. Emits class definitions, metadata, and an installation module.

The build then bundles the modules into readable and minified browser scripts
with source maps. See [Generated Output](#generated-output) for the files and
publishing options.

The framework and application compile separately. The application compiler uses
the framework's collected declarations to resolve its classes and methods.
Application bundles import those definitions from the `Swill` global, so they do
not contain another copy of the framework or runtime.

Ruby2JS's Prism walker on Ruby 3.4 and later and its parser-gem implementation
are both supported.

## Knowledge Collection

`Swill::Ruby2JS::Knowledge` records the classes and mixins available to the
compiler. Each entry combines syntax from the source with declarations made when
`Swill::Ruby2JS::Loader` evaluates the class body on MRI. This allows a
class-body macro to declare properties that the compiler can type and emit.

The collected entries contain:

| Field | From | Content |
| --- | --- | --- |
| `name`, `identifier` | AST | Ruby constant path and its JavaScript identifier |
| `kind` | AST | `class` or `mixin` |
| `scope`, `parent` | AST | Enclosing namespaces and the superclass constant as written |
| `includes` | AST | Mixins in factory-nesting order (see [Classes and Mixins](#classes-and-mixins)) |
| `methods` | AST, plus `forward` | Name, JavaScript member name, arity, signature parameter types, signature return type, and whether it is asynchronous |
| `class_methods` | AST | A mixin's `ClassMethods` bodies, compiled as written |
| `properties` | class | One descriptor per `property`, in declaration order, however it was declared |
| `registries`, `settings` | class | What a mixin's `ClassMethods` declares |
| `registry_values`, `setting_values` | class | The class's exact registry snapshots, and what it set a setting to |
| `restorations` | class | Bindable paths kept in the URL fragment; the leaf's declared type is recorded when every segment is statically typed |
| `included_properties` | class | What a mixin's `self.included` hook declares, read from a class that includes it |

Imported entries from another compiler carry the same fields, minus the AST.

### Containers

A container isolates a build's Ruby constants from the global namespace. Sources
run inside an anonymous module with a temporary name. Calls to `require` and
`require_relative` inside the container do not load files; the build supplies
the sources in their evaluation order.

The framework container is shared within the process. Application containers use
its constants, so a subclass of `Swill::Controller` inherits from the loaded
framework class. Applications declare their own namespaces and cannot add
declarations under an imported root such as `Swill`. A watch rebuild evaluates
only application files.

Before evaluation, the compiler checks class and module bodies for supported
declarations. If evaluation or collection fails, it restores the previous
constants and collected entries. Corrected source can be submitted again at the
same path. Source files and plugins are trusted Ruby; this validation is not a
security boundary.

DOM class stubs are available during evaluation so signatures and declarations
can refer to browser types. See [Native Types](#native-types).

### Modules

A `module` is a mixin, a namespace, or both. Nested classes and modules other
than `ClassMethods` are collected as entries under the enclosing module's name.
The module is also collected as a mixin when it is empty or has any
non-namespace body. Namespaces are not entries.

### Class Bodies

The compiler accepts the following statements in class and mixin bodies:

| Statement | Handling |
| --- | --- |
| `def name(...)` | Collects a method. Names match `/\A[a-z_]\w*[!?=]?\z/`; `method_missing` is rejected; `initialize` compiles to `constructor`. See [Optional Positional Arguments](#optional-positional-arguments) and [Keywords, Rest Arguments, and Blocks](#keywords-rest-arguments-and-blocks) |
| `sig { ... }` | Parameter and return types are recorded for lowering, then erased |
| `extend T::Sig` | Erased |
| `include A, B` / `include A` | Recorded; targets must be previously defined mixins |
| `property :name, ...`, or any declaration macro | Evaluated in the class body; the compiler collects the resulting declarations (see [Declaration macros](#declaration-macros)) |
| `def self.name(...)` | Classes only: a static method under the same name rules. Inside it `self` is the class and a bare `new` constructs it; `self.new` is rejected as a name |
| `async def name(...)`, `async def self.name(...)` | The same, marked asynchronous: it compiles to an `async` method and its body may `await` |
| `private`, `protected`, `private def name(...)`, `private :name` | Visibility is recorded per method and enforced by Ruby: the generated RBI declares the method under a `private` or `protected` section, so `srb tc` checks its callers. JavaScript methods stay ordinary; the browser does not enforce visibility |
| `def self.included(base)` | Mixins only; see [Included hooks](#included-hooks) |
| `module ClassMethods` | Mixins only; see [Class methods](#class-methods) |
| nested `class` / `module` | Mixins only; collected as namespaced entries |

An unsupported statement raises a compile error that names the statement.

### Declaration Macros

A declaration macro is a Ruby class method marked with `macro`. It runs when
called in a class body and is not emitted as JavaScript. Macros can declare
properties and record class configuration for the browser.

For example, `tag` records a name in an inheritable registry:

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

Macros produce declarations that can be serialized for the browser:

| Primitive | Emits |
| --- | --- |
| `property` (and `outlet`, `restorable`, and `attribute` built on it) | A descriptor the runtime installs as a prototype accessor |
| `inheritable_registry` entries | Data in the class's own registry |
| `class_setting` values | A value applied at installation |
| `forward` | A method that calls another method with preset arguments followed by its own arguments. `parameters:` and `returns:` declare its parameter and return types. |
| `will_access:` on a property | The read notifies the object, so a value can load itself |

The compiler translates declarations made by a macro into property descriptors,
class configuration, and method definitions. Plugin macros use the primitives
in this table to declare those members.

The `forward` declaration generates a method that delegates a call. For example,
`forward :load_ingredients, to: :load_association, with: ["ingredients"]`
declares `load_ingredients` as a call to `load_association("ingredients")`.
Methods created with a `define_method` block in a macro are unsupported by the
compiler.

The keywords `property`, `attribute`, `outlet`, and `restorable` accept, and
the declaration macros the framework provides, are listed in
[Declarations](declarations.md).

### Class Settings

A class setting supplies configuration inherited by subclasses. A mixin declares
the setting, and a class assigns its value in the class body:

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

A class can assign a setting declared by an included `ClassMethods` module or an
ancestor. The compiler records the value in metadata, and the runtime applies it
when the class is installed. Settings retain their Ruby names so
[`Runtime.classWithSetting`](runtime.md#attributes-and-class-configuration)
can find a class by a setting's value.

A setting call in a class body must assign a value. A read or a call to an
undeclared setting raises a compile error with the source file and line.

### Included Hooks

A mixin can define one `self.included(base)` hook containing
`base.extend(ClassMethods)` and declarations on `base`. Each including class
receives its own property descriptors. Computed property blocks compile in the
context of that class.

The hook runs during compilation and is not emitted. The generated RBI also
includes the declarations supplied by the hook.

### Class Methods

A mixin's `module ClassMethods` may contain:

| Statement | Result |
| --- | --- |
| `extend Swill::Declarations` | Makes declaration methods available while the class body runs on MRI. |
| `inheritable_registry :name` / `:name, :array` | A per-class registry that copies its parent's contents on first access. Its exact declaration-time contents travel in the meta object as `registries` and replace the runtime copy at installation |
| `class_setting :name` | A per-class value that falls back to the parent's; a class body sets it with a literal (see [Class settings](#class-settings)), and the value is stored under the Ruby name so `Runtime.classWithSetting` can look a class up by it |
| `def name(...)` | Compiled as a class-side method; inside it `self` is the class, so bare calls reach static methods, other `ClassMethods` methods, registries, and settings |
| `macro def name(...)` | A declaration macro. It runs when a class body calls it and is never emitted, so its body may use the full declaration vocabulary |
| `extend T::Sig`, `sig { ... }` | Read for parameter and return types, never emitted |

### Optional Positional Arguments

An ordinary method with only required and optional positional parameters
compiles to one
JavaScript method for each accepted argument count. The method that takes no
optional arguments keeps the original name; variants include the names of the
optional parameters they accept.

This preserves Ruby's binding of leading optional arguments. In this example, a
call with one argument supplies `name`, while a call with two also supplies
`greeting`:

```ruby
sig { params(greeting: String, name: String).returns(String) }
def greet(greeting = "Hello", name)
  "#{greeting}, #{name}"
end
```

The compiler emits a full method and a variant that supplies the default:

```js
greetWithGreeting(greeting, name) { return `${greeting}, ${name}`; }
greet(name) { return this.greetWithGreeting("Hello", name); }
```

| Rule | Detail |
| --- | --- |
| Naming | The variant taking no optionals keeps the plain name. Each wider one is `name_with_` followed by the optionals it takes, joined by `_and_`: `greet` / `greet_with_greeting`; `span` / `span_with_b` / `span_with_b_and_c` |
| Body | The widest variant carries the body. Every shorter one hands it the defaults in the positions Ruby's own binding would fill: required arguments first, optionals absorbing what is left |
| Metadata | Each variant is its own entry with a fixed arity; the wider ones carry `family`, which is how `Runtime.invoke`, `read`, and `performAction` ([Metadata-Driven Dispatch](runtime.md#metadata-driven-dispatch)) resolve a name and an argument count to one method |
| Call sites | A send to a typed receiver emits the variant whose arity is the argument count, and the signature's parameter types follow the parameters, so a lambda passed to a shorter variant is still typed |
| `super` | Forwards the current bound parameters, including the override's defaults and reassigned values, to the parent's matching variant |
| Overrides | An override must accept the same method variants as its ancestor. Its signature must name parameters in declaration order. A statically resolved call with no matching argument count raises a compile error. |

### Keywords, Rest Arguments, and Blocks

Methods can declare named rest parameters, required and optional keywords,
keyword rest parameters, and a block parameter. Calls can supply splatted
arguments, keyword arguments, and a block. `yield` and `block_given?` are
supported in method bodies.

These methods use a runtime argument adapter to preserve Ruby's parameter
binding. Keyword arguments remain distinct from a positional Hash, and an
omitted optional argument remains distinct from an explicit `nil`. Missing
required keywords, unknown keywords, and invalid positional argument counts
raise errors when the method is called. Static and `ClassMethods` methods also
support optional and keyword parameters, and so does `initialize`: `new` passes
its keywords as any call to such a method does, and the constructor returns
nothing, since an object a JavaScript constructor returns replaces the instance.

A block passed to a collected method requires a statically resolved call. Blocks
on typed collections use the rules in [Core Value Types](#core-value-types).
Anonymous parameter forwarding forms and optional parameters on blocks are
rejected. Overrides must preserve their ancestor's accepted argument structure.

### Pragmas

Comments of the form `# Pragma: array`, `# Pragma: hash`, and `# Pragma: string`
are passed to Ruby2JS's Pragma filter as type hints on the shared surface. Any
other pragma name is rejected, because control pragmas such as `skip` or
`extend` would desynchronize collected metadata.

## Generated Output

### Identifiers

| Ruby | JavaScript | Rule |
| --- | --- | --- |
| `Person` | `Person` | Plain names are unchanged |
| `Demo::Person` | `Demo__Person` | `::` becomes `__` |
| `Demo_Thing` | `Demo_uThing` | Source `_` becomes `_u` first, so `A::B` and `A__B` stay distinct |
| `Runtime`, `Superclass`, `Object`, `Array`, `String`, `Number`, `Math`, `JSON`, `Error`, `Promise`, `MutationObserver`, `URLSearchParams` | `Ruby_Runtime` and so on | Reserved compiler names and JavaScript intrinsics |
| `row_elements`, `awake_from_dom` | `rowElements`, `awakeFromDOM` | Members are camelCase; `DOM`, `URL`, `JSON`, and `HTML` stay upper-case |
| `row_element?`, `dirty?` | `isRowElement`, `isDirty` | A predicate gains `is` |
| `accepts_first_responder?`, `rows_are_views?`, `confirm_edit?` | `acceptsFirstResponder`, `rowsAreViews`, `confirmEdit` | A predicate phrased as a verb (first word in the compiler's verb list, or `are`, `is`, `has` inside) keeps its phrasing |
| `mark_clean!`, `save!` | `markCleanBang`, `saveBang` | A bang becomes `Bang`, so `save` and `save!` are separate members. Two Ruby names that still come out the same, such as `save_bang` and `save!`, are rejected, whether one class defines both or a class defines one and an ancestor or included module the other, since the class's member would silently replace the ancestor's |
| `__swill_view__` | `__swill_view__` | A leading underscore marks a JavaScript expando, left as written |

`Swill::Runtime` in source always refers to the handwritten runtime.

### Classes and Mixins

A Ruby class becomes a JavaScript class with the corresponding superclass and
method definitions. For example, `Demo::Person < Swill::Model::Base` becomes
`class Demo__Person extends Swill__Model__Base { ... }`. Declared properties
become metadata from which the runtime installs accessors.

Instance variables compile to underscored fields (`@view` becomes
`this._view`). `attr_reader :view` compiles to a native
getter, `get view() { return this._view; }`, and `attr_writer` to a native
setter, the form `def name=(value)` already takes; `attr_accessor` is both.
Their names must be literal symbols, and a `sig` above one types each name as
Sorbet reads it. A reader is read at every call site, so an override must keep
its form: a `def` cannot override an `attr_reader`, nor the reverse.

A mixin compiles to a subclass-layer factory:

```js
function StripName(Superclass) {
  class StripName_Layer extends Superclass {
    normalize(value) { return Runtime.strip(super.normalize(value)); }
  }
  return StripName_Layer;
}
```

At install time the runtime inserts the layers between the class and its parent,
so native `super` works and no method is copied.

`include A, B` places `A` before `B` in Ruby lookup; two separate `include`
statements place the later one first. `entry["includes"]` stores factory nesting
order, which is the reverse of lookup order, preserving Ruby lookup precedence.

A `ClassMethods` module compiles to a second factory,
`Feature_ClassMethods(Superclass)`, that returns a prototype object. The runtime
copies its own property descriptors onto the receiving constructor instead of
splicing it into the constructor chain, because a JavaScript subclass uses that
chain as its `super()` target.

### The Meta Object

The `meta` object describes class and mixin declarations for runtime
installation. It contains constructors and factories together with property
descriptors, registries, settings, and method signatures. The following excerpt
shows their arrangement; ellipses omit function bodies and entries:

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
      methods: {"greeting": {"arity": 0}, "load_books": {"js": "loadBooks", "arity": 0}}
    }
  }
};
```

[`Runtime.install`](runtime.md#installation) installs these declarations.
Registry values and settings are serialized data; custom macros use the same
format. Metadata contains no Ruby source or syntax tree.

Member keys use Ruby names. A descriptor includes `js` when its JavaScript
member name differs. A `__proto__` key is emitted as a computed key to preserve
it as an ordinary entry.

### Modules and Publishing

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
passes its definitions to `browserAPI`, freezes the returned `Swill` global, and
installs `Swill::Launcher`. The browser API keeps the definitions for compiled
bundles and adds readable class names, JavaScript registration, and manual
startup. `Swill::Launcher` starts an application declared by `[application]`;
`Swill.start()` starts a JavaScript application explicitly. The application
build imports every framework identifier from that global through a generated
shim, so the application bundle contains neither the runtime nor the framework
classes. Only `Swill` is global.

`Swill.register` converts a JavaScript class's static declarations into the
same `meta.classes` descriptors and passes them to `Runtime.install`; see
[Plain JavaScript](plain_javascript.md).

### Sorbet Artifacts

| Artifact | Purpose |
| --- | --- |
| `Compiler#rbi` | Typed readers and writers for every declared property, plus `ClassMethods` registries and settings |
| `Compiler#type_probes` | One typed method per declaration whose body is the default or computed expression, so Sorbet checks it against the declared type |

Both are regenerated by `rake build` into `sorbet/rbi/generated.rbi` and
`sorbet/checks/declarations.rb`. Neither is executed or shipped.

## Native Types

The compiler chooses Ruby or JavaScript behavior from the static type of an
expression, not from its source file. A DOM-typed expression uses browser
members directly. A Ruby string or collection uses the supported Ruby
operations, even when it was returned by a browser method.

All entries use the same filters: `RubySurface` applies Swill's translation
rules, `Return` supplies implicit returns, and `RubyCalls` emits explicit calls
for remaining method expressions.

Browser types and their supported members are declared in
`rb/compiler/knowledge/dom.rb`: the DOM classes and JavaScript intrinsics
framework code may name (`Element`, `Node`, `Document`, `DOMWindow`, `Event`,
`KeyboardEvent`, `MouseEvent`, `HTMLTemplateElement`, `DocumentFragment`,
`HTMLCollection`, `NodeList`, `DOMTokenList`, `Selection`, `Location`,
`History`, `MutationObserver`, `MutationRecord`, `Promise`, `URLSearchParams`)
with the members the framework uses, each marked as an attribute, an accessor,
or a method, with its type and parameters. The build writes that table out as
`sorbet/rbi/dom.rbi`, so framework signatures say `Element` where a DOM value is
meant and Sorbet checks the calls; the compiler reads the same table to lower
them. `DOMWindow` is the browser's window, since `Swill::Window` is the
framework's own class.

| Receiver | Emitted |
| --- | --- |
| A DOM class, nilable or not | A listed attribute or accessor is property access, a listed method is a call, whatever the source's parentheses; `name = value` is an assignment. An unlisted member with parentheses or arguments is called; with neither it could be a property or a method, so it lowers to `Runtime.send`, resolved at runtime. `?.` is JavaScript's own and keeps the source's parentheses. Operators and indexing stay with the converter |
| The result of a native member | The member's declared type when listed (`getAttribute` yields `T.nilable(String)`, so `strip` is Ruby's), the indexed element type for `[]` on a collection, `T.self_type` for `cloneNode`, otherwise an untyped JavaScript value on which every member is native |
| A DOM class constant | `new` constructs it (`MutationObserver.new(...)`); a JavaScript intrinsic such as `JSON` passes through by name. A source constant of the same name wins and is encoded (`Ruby_JSON`) so it cannot shadow the global |
| A lambda or block passed to a native member | Its parameters take the types the table declares for that callback (`addEventListener`'s listener receives an `Event`, `NodeList#forEach` an `Element`, the `MutationObserver` constructor its records), and locals assigned from them are typed in the body |

DOM-typed values have JavaScript truthiness and identity equality, and a block
on one is a JavaScript callback. A `T.let` or `T.cast` to a DOM type, or to
`T.untyped`, is an annotation for Sorbet and the typer with no runtime check:
the browser's classes are not the runtime's to verify. `T.untyped` means a Ruby
object dispatched by name at run time, so a DOM value must be typed as one;
passing it through `T.untyped` does not preserve the compiler's native member
and callback typing.

`Runtime`, bare or as `Swill::Runtime`, names the handwritten runtime when no
source constant of that name is in scope.

## Lowering Rules

Lowering translates a Ruby expression into its JavaScript equivalent. Static
type information determines which rule applies. Runtime helpers provide
operations whose Ruby behavior differs from JavaScript or whose types are known
only during execution.

### Static Types

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

### Logical Operators

| Left operand | `left && right` | `left \|\| right` |
| --- | --- | --- |
| Boolean, nil, or native kind (see above) | `left && right` | `left \|\| right` |
| Stable scalar (literal or local) | `right` | `left` |
| Stable nilable scalar | `left != null ? right : left` | `left != null ? left : right` |
| Otherwise | `Runtime.logicalAnd(left, () => right)` | `Runtime.logicalOr(left, () => right)` |

The right operand is deferred in the runtime forms so it evaluates lazily, as in
Ruby. Ruby2JS's own `||` handling is forced to logical `||`; its nullish `??`
would keep a Ruby `false`.

### Equality

`==` and `!=` compile to `===` / `!==` when either operand has an
identity-comparable type: `String`, `Integer`, `Float`, `Symbol`, `T::Boolean`,
`NilClass`, a nilable form of those, a framework class, or a DOM class.
Otherwise they compile to `Runtime.isEqual(left, right)`, negated for `!=`.
Collections such as `T::Array[String]` are never identity-compared.

### Receivers

For `receiver.name(args)` where the receiver is not `self`:

| Receiver's static type | Form | Emitted |
| --- | --- | --- |
| Framework class | Declared property, no arguments | `receiver.name` |
| Framework class | `name = value` for a declared property | `receiver.name = value` |
| Framework class | `attr_reader` or `attr_accessor` reader | `receiver.name` |
| Framework class | Collected method | `receiver.name(args)` |
| Framework class | Anything else, such as a member only a subclass declares | Pragma filter if it applies, else resolved on the object at run time, as for an untyped receiver below |
| Framework class | `class` | `receiver.constructor` |
| A class object (`T.class_of(Class)`, `self.class`, a class constant) | A static method, or a `ClassMethods` method, registry, or setting | `receiver.name(args)`, lambdas typed by the signature |
| A class object | `new(args)` | `new receiver(args)` |
| A JavaScript intrinsic or DOM class named as the receiver (`JSON`, `Promise`, `Math`) | Anything but `new` | Native; `JSON.generate` is `JSON.stringify` |
| Any | `is_a?(Array)`, `kind_of?(Array)`, `instance_of?(Array)` | `Array.isArray(receiver)`, so an array from another realm (a page's JSON) counts |
| Framework class | `receiver&.name` for a declared property | `Runtime.nilable(receiver?.name)` |
| Framework class | `receiver&.name(args)` for a collected method | `Runtime.nilable(receiver?.name(args))` |
| DOM class | `receiver&.name` | `receiver?.name`, JavaScript's own, since a DOM value is a JavaScript value |
| Core value type, unknown, or `T.untyped` | `receiver&.name` | Rejected: these lower through helpers that take the receiver as an argument, which `?.` cannot guard |
| Core collection | A block of several statements | Returns the value of the block's last expression. The compiler emits an explicit `return`. |
| DOM class or untyped JavaScript value | Anything | Native, per [Native types](#native-types) |
| Any | `nil?` | `receiver == null` |
| Core value type (below), nilable or not | A method in its table | The table's form; a method outside the table is rejected |
| Core value type | Operators, indexing, `new`, or a send with an `array`/`hash`/`string` pragma | Left to the converter and the Pragma filter, except the array and integer operators the tables name |
| Any, or implicit self | `respond_to?(:name)` with a literal name | `Runtime.respondsTo(receiver, "name")`; a dynamic name is rejected |
| Unknown, `T.untyped`, or `T.proc...` | `call(args)` or `.(args)` | `receiver(args)` for a local receiver; `receiver.call(null, args)` otherwise |
| Unknown or `T.untyped` | Operators, indexing, `new`, unary operators, or a send with an `array`/`hash`/`string` pragma | Left to the converter and the Pragma filter |
| Unknown or `T.untyped` | No arguments and no parentheses, the name not ending in `!` | `Runtime.send(receiver, "name")`: a property or a method, resolved at run time |
| Unknown or `T.untyped` | `name = value` | `Runtime.write(receiver, "name", value)` |
| Unknown or `T.untyped` | Arguments, parentheses, or a name ending in `!` | `Runtime.invoke(receiver, "name", args)`, resolved against metadata by name and argument count; no property is named with `!` |
| Unknown or `T.untyped` | Any block | Rejected: block calls require a statically resolved collected method or a supported typed collection |
| Any other type | Anything | Pragma filter if it applies, else an explicit call |

Member translation considers both the name and the available type information. A
typed receiver is resolved statically; an untyped receiver is dynamic, and every
send on it is resolved through installed metadata at run time, as Ruby itself
would resolve it. A model may define its own `strip`: a typed receiver calls it,
and an untyped receiver reaches it through `Runtime.send`, which prefers a
collected method over the string reader. Constants and `self` are never dynamic,
and `Const.new` types its result as that class when the class is collected.

### Core Value Types

Core value types have a defined set of supported methods. When Ruby and
JavaScript agree, the compiler emits the JavaScript operation directly.
Otherwise it uses a helper that implements Ruby's behavior. The result keeps its
static type, so a chain such as `name.strip.length > 0` remains typed.

A method absent from the supported table raises a compile error naming the type
and method. The tables below describe both the accepted methods and their
emitted operations.

A `T.nilable(X)` receiver uses `X`'s table. Ruby would raise on nil, and the
JavaScript forms and helpers throw on `null` too, except `to_s`, which is
nil-safe (`Runtime.stringify`) because `nil.to_s` is `""`.

| Type | Direct JavaScript | Runtime helper (Ruby semantics) |
| --- | --- | --- |
| `String` | `length`/`size` (`.length`); `include?`, `start_with?`, `end_with?` (`includes`, `startsWith`, `endsWith`); `to_s`, `to_sym`, `dup` (identity); `chars` (`Array.from`) | `strip`, `upcase`, `downcase`, `capitalize`, `blank?`, `present?`, `empty?`, `to_i` (leading integer or 0), `to_f`, `split` (whitespace or separator, trailing empties dropped), `slice(index)` / `slice(start, length)` |
| `Symbol` | `to_s`, `to_sym` (identity) | |
| `Integer` | `zero?`, `positive?`, `negative?`, `even?`, `odd?` (comparisons); `abs` (`Math.abs`); `to_i`, `to_f` (identity) | `to_s`, `clamp`, `between?`; `/` with an Integer divisor floors (`intDiv`); `%` takes the divisor's sign (`modulo`), on any receiver the compiler cannot tell is a String |
| `Float` | `floor`, `ceil`, `round`, `to_i` (`Math`); `zero?`, `positive?`, `negative?`, `abs` | `to_s`, `clamp`, `between?` |
| `T::Boolean`, `NilClass` | `nil.to_a` (`[]`), `nil.to_i` (`0`) | `to_s` (`nil.to_s` is `""`) |
| `Array` | `length`/`size`/`count` (`.length`); `first` (`[0]`); `last` (`at(-1)`); `include?` (`includes`); `pop`, `shift`; `join` (default `""`); `take`, `drop` (`slice`); `dup` (`slice()`); `freeze` (`Object.freeze`, shallow); `to_a`; `+` (`concat`) | `blank?`, `present?`, `empty?`, `index` (Ruby equality, nil when absent), `push` and `<<` (return the array), `unshift`, `reverse`, `sort` (copy, Ruby ordering), `uniq`, `compact`, `flatten`, `sum`, `min`, `max` (nil when empty), `-` (Ruby equality) |
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

### Self and Implicit Receivers

| Source | Emitted |
| --- | --- |
| `name` / `self.name` for a declared property | `this.name` |
| `self.name = value` for a declared property | `this.name = value` |
| `name(args)` for anything else | `this.name(args)` |
| `self.class` | `this.constructor` |
| `super(args)` | Calls the parent's variant matching the supplied arguments |
| `super` | Forwards bound positional, rest, and keyword parameters and the incoming block |
| `super()` | Passes no positional or keyword arguments; the parent's defaults apply. The incoming block is still forwarded |
| `Swill::Runtime` | `Runtime` |
| Any other constant | Resolved through Ruby lexical scope to an encoded identifier; unknown constants are rejected |

### Sorbet Runtime Operations

Executable code may use the `T` methods below; they compile to runtime checks
and give the static typer facts. No other `T` construct is allowed in a body.
[Sorbet](sorbet.md#runtime-operations) describes the runtime behavior of each
operation and what a check conforms.

| Source | Emitted | Runtime behavior |
| --- | --- | --- |
| `T.must(value)` | `Runtime.must(value)` | Throws `TypeError` for `null` or `undefined`, else returns the value |
| `T.cast(value, Type)`, `T.let(value, Type)`, `T.assert_type!(value, Type)` | `Runtime.cast(value, "Type")` | Throws `TypeError` unless the value conforms, else returns it |
| `T.unsafe(value)` | `value` | None |
| `T.absurd(value)` | `Runtime.absurd(value)` | Always throws `TypeError` |
| `T.bind(self, Type)` | nothing | None; `self` is already the instance |

A checkable `Type` is a declaration type, `Float`, `Symbol`, `NilClass`, or
`T.untyped`. A class name is resolved in Ruby scope and emitted as the name the
class is installed under, so the check is `instanceof` against the installed
class. A DOM class or intrinsic is accepted, and a cast to one, or to
`T.untyped`, is an annotation only, with no runtime check. `T::Array[...]` and
`T::Hash[...]` check the container only, not its elements, as sorbet-runtime
does, and a `T.proc` type checks for a function. Unions, mixins, and unknown
constants are rejected. The upstream Pragma filter would erase `T.let` on an
assignment; the compiler keeps its check.

### Asynchrony

`async` and `await` are reserved forms with JavaScript's meaning. `async def
name` (Ruby parses it as `async(def ...)`) declares an asynchronous method,
compiled with the `async` keyword, so calling it yields a promise. `await
expression` inside such a method compiles to `await`. `await` outside an async
method is rejected. Ordinary blocks and lambdas are synchronous, even inside
an async method. A block passed to a known async method with a block parameter
may itself await; it compiles to an async callback when necessary. The receiving
method must await the callback's result. For example, `fetch do; await
Movie.search(text); end` supplies an asynchronous operation. To await the whole
call, use `await(fetch do ... end)`; Ruby attaches the block in `await fetch do`
to `await` instead of `fetch`. On MRI, `Swill::Object` provides `async` as a no-op
wrapper and `await` as the identity, so shared code runs synchronously there.

An async method's signature names the value it yields, not the promise: `sig {
returns(ResultSet[Post]) }` on `async def self.search(text)` means `await
Post.search(text)` is a `ResultSet[Post]` to the compiler and, through `await`'s
generic identity signature, to Sorbet. A call without `await` is a `Promise`.
The DOM table writes `Promise[Response]` for `fetch`; the RBI shows Sorbet the
element, as MRI's `await` would yield it, and the compiler types the awaited
value. `Promise.all`, `Promise.resolve`, and the rest of the browser's promise
API are native, as any DOM class is, and their awaited values are untyped.

### Development Blocks

`in_development { ... }` runs its body in place, without a function of its own,
only while the application is in development (see
[Getting Started](getting_started.md#development)). It compiles to
`if (globalThis.__SWILL_DEV__ !== false && Runtime.isDevelopment()) { ... }`. A
minified build (`swill build --minify`, `rake optimize`) defines
`globalThis.__SWILL_DEV__` as `false`, so the bundler leaves the body out
entirely: checks written this way cost an optimized build nothing. On MRI the
block never runs. The framework's [focus checks](responders.md#development-checks)
are written this way.

### Console Output

`warn message` is `Runtime.warn`, which a development application also shows
as an alert; `puts message` is `console.log`. Each takes one message. A class
that defines its own `warn` or `puts` keeps it.

### Exceptions

`raise "message"` and `raise "interpolated #{message}"` compile to `throw new
Error(...)`. `raise error` rethrows a rescued (statically typed `Error`) object
unchanged. Bare `raise`, exception class forms, and raising arbitrary untyped
variables are rejected. `begin`/`rescue => error`/`ensure` is the converter's
`try`/`catch`/`finally`; the rescued variable is typed `Error`, so
`error.message` is a native read. Rescuing a named class is outside the
boundary: a thrown value is whatever JavaScript threw.

### Safe Navigation

`receiver&.member` is lowered wherever the compiler resolves the member
statically: a declared property or an `attr_reader` reads, a collected method is
called, and each hop guards the next, so `recipe&.detail&.glassware` is one
expression. A proc, or a value with no static type, called with `&.()` or
`&.call` is JavaScript's optional call, which skips nil as Ruby does. Otherwise
a core value type and an untyped receiver are rejected, because both lower
through helpers that take the receiver as an argument, and `?.` cannot guard an
argument.

For framework objects, the result is normalized to `null`, matching Ruby's
`nil`. JavaScript optional chaining returns `undefined`, which is omitted from
JSON objects when serialized. Normalization occurs once, at the end of the
chain. DOM expressions retain JavaScript's `undefined` result.

## Rejected Forms

The compiler reports unsupported forms as `Swill::Ruby2JS::CompileError` during
the build. The following table groups these restrictions by construct:

| Area | Rejected |
| --- | --- |
| Top level | Anything other than `class` and `module` |
| Constants | Unknown or non-static constants; reopened or duplicate constants; a superclass or mixin defined later in the same build; a superclass that is a mixin; an include target that is a class |
| Methods | Names outside `/\A[a-z_]\w*[!?=]?\z/`; `method_missing`; anonymous parameter forwarding; parameters outside the supported [argument forms](#keywords-rest-arguments-and-blocks); a method whose name is also an inherited property |
| Declarations | A macro's own keywords are Ruby's, so a missing or unknown one is rejected where it is written. The declaration primitives reject: an unsupported property name, a stored property ending in `?`, a duplicate name, a mutable default other than an empty array or Hash, a computed property with a default, a computed outlet, a restorable path that is not dotted property names, and registry storage other than `:hash` or `:array`. The compiler rejects a declared class name that does not name a class, and a class body that calls something no ancestor declares. Which classes may declare `outlet` and `restorable` is where their macros are defined; whether a `restorable` path starts at a declared property, and whether keys collide, is checked by the runtime at installation |
| Mixins | Properties or includes on a mixin itself; a second `self.included`; non-literal hook bodies; `base.extend` of anything but `ClassMethods`; declaring `ClassMethods` without contents; the same mixin included twice along one ancestor chain; `prepend` |
| `ClassMethods` | Non-literal registry or setting names; registry storage other than `:hash` / `:array`; `class_setting` coercion blocks; any other statement |
| Expressions | Any `T` construct in an executable body other than `T.must`, `T.cast`, `T.let`, `T.assert_type!`, `T.unsafe`, `T.absurd`, and `T.bind(self, ...)` with the right number of arguments; a type argument outside the checkable types, or naming a mixin or an unknown constant; `public_send`, `send`, `__send__`, `const_get`, `define_method`, `instance_exec`, `eval`; `respond_to?` with a non-literal name; a block on an untyped receiver; a method or block on a core value type receiver outside its lowering table, or with the wrong number of arguments; safe navigation (`&.`) on a core value type or an untyped receiver, other than calling it with `&.()` |
| Exceptions | Any `raise` form other than a message string (a literal, or an expression typed `String`) or a typed rescued error |
| Pragmas | Any pragma other than `array`, `hash`, `string` |
| Members | Two members with the same encoded JavaScript name |
| Build | Application compilation without a framework import; missing `esbuild`; unformattable output |

Ruby that reaches Ruby2JS unlowered and that Ruby2JS cannot convert also fails
the build with Ruby2JS's own error.

### Disabled Upstream Filters

| Facility | Reason |
| --- | --- |
| Functions | Rewrites ordinary framework methods without type evidence |
| ActiveSupport | Its `blank?` behavior conflicts with Swill value readers |
| ESM / Require | Imports and exports come from compiler metadata |
| camelCase / underscore | Source names and metadata keys must remain stable |

### Upstream Corrections

`rb/compiler/converter_patches.rb` prepends fixes to Ruby2JS's own converter,
each as narrow as the handler it corrects, until upstream has them.

| Handler | Correction |
| --- | --- |
| `lvasgn` | A local first assigned inside an expression, as in `if (match = find)` or `(owner = element) && owner.contains?(other)`, is declared with `let` at the top of its scope. Upstream emits a bare assignment to an undeclared name, a ReferenceError in strict mode, and records it as declared so no later assignment declares it either. |

## Extending the Boundary

The supported subset is defined by accepted source and behavioral tests, not by
whatever JavaScript Ruby2JS can emit. For each new construct, in order:

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
helpers implement dynamic or shared behavior and must not interpret Ruby source.
Dynamic dispatch remains limited to the supported method and value operations.

Rules must cover a coherent class of values, not one fixture. Every addition
should include:

- an expression drawn from application or framework code;
- MRI comparison for shared Ruby code (`spec/shared_test.rb`);
- relevant Ruby/JavaScript edge values;
- generated-code assertions when placement matters (`spec/compiler_test.rb`);
- executable runtime coverage (`spec/runtime_test.mjs`);
- rejection of the nearest unsupported form;
- verification that application bundles do not duplicate the runtime
  (`spec/bundle_test.mjs`);
- documentation of the accepted form and its restrictions.

## Source Map

The compiler and runtime implementations are organized as follows:

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
| `rb/compiler/converter_patches.rb` | Corrections to upstream converter handlers |
| `rb/compiler/filters/shared_lowering.rb` | `raise`, callable invocation, constructor (including keyword constructors), static method, `warn`, `puts`, `in_development`, and `respond_to?` lowering |
| `rb/compiler/filters/static_types.rb` | Static type facts: literal, local, signature, and result types |
| `rb/compiler/filters/core_types.rb` | Lowering tables for String, Symbol, Integer, Float, Boolean, nil, Array, and Hash receivers and their blocks |
| `rb/compiler/filters/ruby_surface.rb` | The shared-Ruby surface: AST hooks, receiver dispatch, truthiness, and logic |
| `rb/compiler/filters/ruby_calls.rb` | Explicit calls for whatever the shared surface left alone |
| `rb/compiler/filters/sorbet_operations.rb` | Validation and translation of executable Sorbet operations |
| `rb/compiler/compiler.rb` | Orchestration, validation, conversion, and definitions |
| `rb/compiler/emit/meta.rb` | The `meta` object and mixin factories |
| `rb/compiler/emit/sorbet.rb` | Generated RBIs and type probes |
| `rb/runtime/runtime.mjs` | The `Runtime` surface generated code calls; see [Runtime](runtime.md) |
| `rb/runtime/arguments.mjs` | Binding positional arguments, keywords, and blocks to method parameters |
| `rb/runtime/metadata.mjs` | Installed property and method tables |
| `rb/runtime/properties.mjs` | Observable state, computed capture, and the mutation path |
| `rb/runtime/values.mjs` | Ruby truthiness, equality, and value readers |
| `rb/runtime/paths.mjs` | Key paths, dynamic read and write, `respond_to?`, and action dispatch |
| `rb/runtime/install.mjs` | Installation, mixin linking, registries, and the class registry |
| `rb/runtime/attributes.mjs` | Outlet and attribute views of an object |
| `rb/runtime/declarations.rb` | The MRI host's declaration primitives: `property`, registries, settings, `forward`, `macro` |
| `rb/runtime/properties.rb` | The MRI host's mutation and read path, mirroring `properties.mjs` |
| `rb/runtime/attributes.rb` | The MRI host's attribute views, mirroring `attributes.mjs` |
| `rb/runtime/browser_api.mjs` | Plain JavaScript registration and manual application startup |
