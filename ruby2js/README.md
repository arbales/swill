# Swill for Ruby2JS

This directory contains the working Ruby2JS implementation track alongside the
TypeScript and Opal implementations. It is still deliberately narrow rather
than a complete Swill port, but its compiler and framework sources now live in
their intended production structure instead of a parallel `Spike` namespace.

The build ships two self-initializing script bundles, `swill.js` and `app.js`.
Readable classes and one generated `meta` POJO per artifact are combined at
build time. The application reuses the framework runtime, classes, and registry;
it does not contain a second framework implementation.

The same shared model scenario runs under MRI and JavaScript with matching
results, including after bundling/minification.

The Ruby API is a **flexible contract**: preserve its intent and useful semantics,
but use experiments to identify changes worth making. Generated JavaScript uses
recognizable class names and keeps support wiring separate from class bodies.

## Current status

- The compiler API is `Swill::Ruby2JS::Compiler`, with
  `Swill::Ruby2JS::Knowledge` and `Swill::Ruby2JS::CompileError`.
- Ruby-authored framework code belongs under `lib/swill/`; compiler integration
  belongs under `lib/swill-ruby2js/`.
- `Swill::Declarations` and `Swill::Model::Attributes` are in their final
  framework directories. The build compiles the real Attributes concern, and
  generated attribute descriptors populate its inherited class registry.
- The handwritten browser runtime is `lib/swill/runtime.mjs`.
- Framework and application compilation are separate. The application imports
  framework references and shares its installed runtime and registry.
- MRI/shared-model, compiler, runtime, bundle-boundary, Sorbet, minification,
  and real-browser checks are available.

The synthetic `Catalogued` concern has been removed. MRI and JavaScript tests now
exercise the real Attributes registry across `Record`, `Person`, and
`SpecialPerson`, including copy-on-first-touch isolation and descriptor defaults.
Validation and dirty mutation hooks still use focused concerns while the
remaining production model protocols are ported.

## Run

Use Ruby 3.3 or later, Bundler, Node 22 or later, and `esbuild` (already a
dependency of the root project). Every build uses esbuild's parser/printer to
format generated modules and bundle them. Minification is a separate task.
No npm packages are needed.

```sh
cd ruby2js
BUNDLE_PATH=vendor/bundle bundle install
BUNDLE_PATH=vendor/bundle bundle exec rake
```

### Dependency updates

Use the latest compatible gems, with exact resolutions recorded in
`Gemfile.lock` rather than version ceilings in `Gemfile`. Ruby2JS currently
tracks upstream `master` because the latest published gem (5.1.2) does not
include the Pragma filter. The lockfile records the exact Git commit, so
`bundle install` remains reproducible.

```sh
BUNDLE_PATH=vendor/bundle bundle update
BUNDLE_PATH=vendor/bundle bundle exec rake
BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

Review and retain the lockfile after verification. Updating upstream is an
explicit step, not something each build does. The current upgrade includes
Minitest 6 and its Prism dependency; `sorbet/rbi/prism_lex_compat.rbi` supplies
a missing Prism 1.9.0 type declaration until upstream includes it.

### Verification

The default task:

1. Collects compiler facts in memory and generates class/meta/entrypoint modules.
2. Generates declaration RBIs and type-check-only expression probes.
3. Runs `srb tc`.
4. Runs compiler tests, including executable compilation and negative type checks.
5. Executes shared models on MRI using the Opal observation kernel as an oracle.
6. Executes the readable script bundles under Node and compares the shared
   scenario to MRI's output.
7. Builds minified bundles, checks them, and reports separate artifact sizes.

Individual tasks: `build`, `typecheck`, `test`, `optimize`.
Workspace-local gems, `build/` intermediates, and generated Sorbet files are
ignored by Git. `dist/` contains the checked-in browser-facing output. Change
the compiler or Ruby source and regenerate these bundles with `rake build`;
do not edit generated files directly. `build` also regenerates the Sorbet files
before checks, so an initial `srb tc` without building is not the supported
workflow.

### Inspect the generated code

From `ruby2js/`:

```sh
BUNDLE_PATH=vendor/bundle bundle exec rake build
python3 -m http.server 3000 --bind 127.0.0.1
```

Open `http://127.0.0.1:3000/examples/index.html`. Inspect `dist/swill.js` and
`dist/app.js` for the formatted, unminified output. Both have source maps back
to the generated modules (not yet to the original Ruby). `optimize` separately
writes `swill.min.js` and `app.min.js`, also with source maps.

The browser loads ordinary scripts, in this order:

```html
<script src="../dist/swill.js"></script>
<script src="../dist/app.js"></script>
```

After the first script executes, `Swill` is ready. After the second, application
classes are installed. No manual include/install calls, module loader, or
runtime-metadata JSON requests are needed. Application startup/awakening still
belongs to the example; installing definitions does not itself create a UI.

### Real browser

```sh
# Defaults to the standard Google Chrome path on macOS.
BUNDLE_PATH=vendor/bundle bundle exec rake browser

# Elsewhere:
CHROME_BIN=/path/to/chrome BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

This uses Node's built-in WebSocket and Chrome's DevTools protocol. It starts a
loopback-only server and a fresh browser profile under `build/`, then removes the
profile. It neither installs a browser nor uses the user's normal browser
profile. The check exercises generated class lookup, a real input event,
computed rendering, action dispatch, and listener teardown.

To inspect manually, serve the repository root and open
`/ruby2js/examples/index.html`. For example, run `python3 -m http.server 3000
--bind 127.0.0.1` from the repository root. The example is a small lookup/binding
adapter, not a replacement for Swill Awakening.

## Layout

| Path | Responsibility |
| --- | --- |
| `lib/swill/core/declarations.rb` | Shared-Ruby class declaration helpers |
| `lib/swill/model/attributes.rb` | Production-shaped model attribute concern |
| `lib/swill/runtime.mjs` | Browser-only stateful framework support; intentionally handwritten JavaScript |
| `lib/swill-ruby2js.rb` | Compiler integration entry point |
| `lib/swill-ruby2js/compiler.rb` | Ruby2JS compilation policy, static knowledge, filters, class/meta/entrypoint generation, RBIs, and type probes |
| `spec/fixtures/framework.rb` | Validation-only base class and cooperating mixins used to exercise framework compilation |
| `spec/fixtures/models.rb` | Sorbet-checked fixture models executed on MRI and JavaScript |
| `spec/fixtures/concerns.rb` | Validation fixtures for concern composition and declaration hooks |
| `examples/application.rb` | Example browser controller with a changing model reference and computed title |
| `sorbet/rbi/runtime.rbi` | Handwritten types only for browser/DSL boundaries and mixin ancestor requirements |
| `spec/mri_adapter.rb` | Tiny test adapter to the existing Opal DOM-free observable implementation |
| `spec/` | Compiler, MRI, runtime, optimizer, and real-browser checks |
| `examples/index.html` | Manual browser smoke test |
| `build/` | Disposable `.mjs` modules, framework reference adapter, MRI results, and test scratch files |
| `dist/` | Readable/minified `swill.js` and `app.js` script bundles and source maps |

## What the experiment establishes

### Compiler facts are internal; runtime data is `meta`

The collector parses Ruby; it does not evaluate application class bodies.
It gathers qualified class/module names, inheritance, include order, method
names/arity, and typed property/attribute declarations.

The framework compilation passes its declaration interface to the application
compilation **in memory**. No JSON knowledge manifest is emitted or consumed.
The current Rake build drives both compilations; a disposable compiler cache
can be added if separate build processes become necessary.

Each artifact generates three intermediate modules:

```text
application.classes.mjs  — class and mixin definitions; no installation calls
application.meta.mjs     — one POJO with actual constructor/factory/function references
application.mjs          — one Runtime.install(meta) call
```

For example, the application metadata contains:

```js
export const meta = {
  mixins: {},
  classes: {
    "Demo::Person": {
      constructor: Demo__Person,
      mixins: [StripName, DecorateName],
      properties: {
        name: {
          type: "String",
          attribute: true,
          defaultValue() { return ""; }
        }
      },
      methods: {
        normalize: { arity: 1 }
      }
    }
  }
};
```

Computed/default functions are executable references, not serialized Ruby or
strings to evaluate. Property/method names are object keys; a separate `js`
name is emitted only when different, such as `blank?` → `blank_predicate`.
Application authors do not write this object or maintain a second registry.

A static superclass becomes a direct reference; a string from markup uses the
installed table:

```js
new (Swill.Runtime.resolve("Demo::Person"))()
```

Only the framework namespace `Swill` is published globally. Application class
names do not require global application namespaces. Ordinary
names such as `Record` remain unchanged; `Demo::Person` becomes `Demo__Person`.
Source underscores are escaped as `_u`, so `A::B` cannot collide with `A__B`.
Compiler-reserved names have a distinct `Ruby_` prefix.
The installer normalizes the POJO into runtime maps.
Declaration maps are merged once per installed class/layer, not reconstructed
on every property read.

Registrations are intentional side effects: constructors reachable only by
markup names must survive tree shaking. More selective reachability analysis
would require knowledge of application entrypoints/markup, not just ordinary
JavaScript call sites.

### One runtime, automatic initialization

The framework bundle includes the runtime, its definitions, its `meta`, and an
entrypoint that installs everything before publishing `Swill`.

The application bundle imports a generated reference adapter to that initialized
namespace. Its classes and `meta` are bundled locally; the framework/runtime
implementation is not. It ends with one shared `Runtime.install(meta)` call.
The installer registers mixin descriptions, attaches method chains, installs
accessors and inherited metadata in superclass-first order, and registers names.
Object key ordering is not a dependency-order contract.

Loading the application first raises `Load swill.js before app.js`. Duplicate
framework loading and duplicate class registration raise rather than silently
replace the runtime/identity domain. The generated modules have no circular
imports: definitions do not import metadata or their own initialization entry.

### Statically known mixins can use native `super`

Method-only Ruby modules compile to named functions returning subclass layers.
The application class keeps its ordinary superclass declaration:

```js
export class Demo__Person extends Record {
  normalize(value) {
    return `[${super.normalize(value)}]`;
  }
}
```

Its mixin references live in `meta`, not in executable wiring beside the class.
The installer links the class and instance prototype chains once during
initialization, before accessor installation or instance construction.
It does not copy methods or add a dispatch wrapper to every call. Rewiring an
already installed class is rejected. This keeps plumbing out of the class header
while preserving native `super`; it is not a facility for changing live classes.

For separate `include StripName` and `include DecorateName`, the resulting
method chain is:

```text
Person → DecorateName layer → StripName layer → Record
```

The class's own override is above both modules. Every layer can call native
JavaScript `super`. Tests cover both separate includes and `include A, B`, whose
Ruby lookup order differs, and compare them to MRI. Additional checks cover
explicit/default construction, `instanceof`, readable collision-safe names,
and formatting idempotence.

This is evidence for **static method-chain lowering**, not general Ruby module
support. Included/extended hooks, class-method concerns, `prepend`, nested
module composition, and repeated-module ancestor deduplication remain work.
The compiler rejects the unsupported class-body forms used in rejection tests;
it does not silently substitute `Object.assign`.

### Ruby2JS needs a deliberate Swill filter

The filter establishes the conventions used by this spike:

- Ruby methods remain callable methods regardless of parentheses in their
  definitions or call sites.
- Declared properties compile to property access; dynamically typed property
  reads can consult generated metadata.
- Predicates have generated JavaScript names while retaining their Ruby names
  in dynamic lookup.
- Ruby2JS's `truthy: :ruby` option handles `if`, `&&`, and `||`, preserving
  short-circuit operand values. In particular, `0` and `""` are truthy.
- Unary `!` uses the same truthiness contract through the runtime helper because
  Ruby2JS does not currently apply its truthy option to negation.
- `==`/`!=` use the scoped equality helper.
- Compiled string operations and string binding paths share value readers.
  Ruby `strip` whitespace is not blindly replaced with JavaScript `trim`.

The filter is **not** a general Ruby compatibility layer. The accepted and
tested source subset is the evidence; arbitrary Ruby method bodies are not
guaranteed merely because Ruby2JS can emit something for them.

#### Built-in filter boundary

The pipeline uses the upstream **Pragma** and **Return** filters. `RubySurface`
wraps Pragma so framework properties and the semantic rules above take priority;
ordinary method-call fallback runs after the built-ins, not before them.
Methods use Ruby2JS's explicit `defm` node instead of deleting source locations
to force callable methods. Original class/mixin source and complete computed
block contents preserve comments for the upstream pragma scanner.

The spike currently accepts `# Pragma: array`, `# Pragma: hash`, and
`# Pragma: string`. For example:

```ruby
def copy(value)
  value.dup # Pragma: array
end
```

Pragma handles this as a shallow array copy, and also infers local literal types.
Execution tests cover array/hash copies, hash keys, method-scope isolation, and
a trailing pragma in a computed property, with MRI agreement. Core Ruby2JS
handles arithmetic/index syntax; Return handles implicit method returns. Its
`truthy: :ruby` converter option replaces the spike's former custom
`if`/`&&`/`||` AST lowering with generated `$T`/`$rand`/`$ror` helpers.
These are tested examples, not a claim that every operation on those types has
Ruby-equivalent semantics.

Other pragmas fail at collection, rather than silently changing shared Ruby
behavior. In particular, `skip`/`extend` could invalidate generated metadata;
`nullish`/`logical` would bypass the chosen Ruby truthiness contract. Likewise,
the global Ruby2JS `or` modes (`auto`, `logical`, and `nullish`) are not useful
here: `truthy: :ruby` intentionally takes precedence, since nullish coalescing
would incorrectly preserve `false` for Ruby `false || fallback`.

The audit did **not** justify enabling every built-in:

| Facility | Decision |
| --- | --- |
| Functions | Removed the previously mostly bypassed filter. Broad name-based rewrites can turn an ordinary framework `empty?` into a length check; add typed operations when a real slice needs them. |
| ActiveSupport | Not enabled: its `blank?` lowering differs from our shared value-reader contract (including whitespace strings). |
| ESM / Require | Not enabled: module imports/exports and bundle boundaries come from collected framework/application metadata, not Ruby `require` calls. |
| camelCase / underscore | Not enabled: ordinary names remain stable, and predicates use the same encoding in emitted methods and runtime metadata. |

### Sorbet checks more than the accessor names

Ruby2JS now comes from the commit-pinned upstream checkout described above.
Class-body `extend T::Sig` and `sig` are recognized during collection and omitted
from executable definitions. Runtime Sorbet constructs are rejected in source
method/computed bodies **before** upstream filters can erase them or extract
type hints from `T.let`. No browser `sorbet-runtime` is bundled. Type names may
remain as inert strings in `meta`.

For now, declarations carry explicit type information:

```ruby
attribute :name, type: String, default: ""

property :label, type: String do
  if loud
    name.upcase
  else
    name
  end
end
```

`type:` is an experimental API choice, not a decision that all Opal declarations
must change this way.

Generated RBIs describe readers and writable setters. The DSL block signature
uses `T.proc.bind(T.attached_class)` so Sorbet checks block bodies in instance
context. That alone does not enforce the declared return type, so the compiler
also generates typed instance-method probes for each default/computed
expression. These probes are checked, never executed or shipped.

Negative tests prove that a wrong setter argument and a wrong generated
computed return fail checking. Runtime-affecting constructs such as `T.must`,
`T.cast`, `T.let`, `T.unsafe`, and `T::Struct` are rejected in compiled code rather
than assumed to be harmless annotations. Broader Sorbet support needs an
explicit policy and more fixtures.

### State remains shared runtime machinery

Generated accessors call one runtime mutation path:

```text
resolve previous → coerce → equality check → will-change hook
  → store → invalidate dependents → did-change hook → notify observers
```

Computed reads capture dependencies, including reads through ordinary methods.
Changing an intermediate object or conditional branch replaces subscriptions.
Bindings share the same property protocol and validate writers. Drafts construct
a fresh instance and copy declared attributes without copying subscriptions.
Explicit disposal releases computed dependencies and observers, retaining
stored values.

Framework implementation code does not have to run on MRI. Only designated
shared code does. The MRI adapter intentionally reuses the working Opal kernel
rather than building a second observation implementation just for this spike.

## Static concern declaration slice

`shared/concerns.rb` exercises an ordinary Ruby `self.included(base)` hook
containing literal `base.attribute`/`base.property` declarations. The compiler
collects these without executing Ruby and copies their descriptors onto each
including class. They use the existing metadata installation and setter path;
no runtime hook interpreter or second mutation path was added.

The shared fixture compares MRI (using Opal's Observable implementation) with
the script bundles for validation through `super`, coercion before equality,
baseline-aware dirty state, rejection without mutation, restoring the baseline,
and observer ordering. A subclass overrides a default without changing the
parent or another including class. Generated RBIs cover both the concern's
instance-side accessor contract and the receiving classes.

This is deliberately **not** the complete Attributes/DirtyTracking port:
only literal, non-block property declarations and the class-side protocol below
are accepted in hooks. Arbitrary hook code, nested concern composition, and
duplicate declarations on one receiver fail compilation. The single-name dirty
fixture does not implement clean application, tracking suspension, or mark-clean.
Ruby2JS currently lowers `raise "message"` to a thrown string; tests compare the
rejection and unchanged state, not Ruby exception-class identity.

## Class-side concern configuration slice

The compiler now recognizes the conventional `self.included(base)` /
`base.extend(ClassMethods)` protocol. A nested `ClassMethods` module is lowered
to a separate class-side prototype layer, referenced from the concern's
generated metadata. The installer attaches that layer without copying methods,
including when the concern is compiled into `swill.js` and consumed by a class
compiled later into `app.js`.

The supported declaration helpers match the core behavior in
`Swill::Declarations`:

- `inheritable_registry :name` lazily copies a hash from the superclass;
- `inheritable_registry :name, :array` does the same for an array;
- `class_setting :name` reads through to the superclass until assigned on the
  receiving class.

The shared fixture verifies MRI/JavaScript agreement for parent, child, and
unrelated includers. Child registry mutation cannot alter the parent or sibling,
and class-setting overrides remain local. Generated RBIs expose registry and
setting readers to Sorbet.

This remains a finite protocol rather than general `extend`: registry initial
values are only `:hash` or `:array`, class-setting coercion blocks are rejected,
and class methods accept required positional arguments only. Class-body calls
to arbitrary class macros and general singleton-class mutation are still
outside the spike.

## Boundaries and unresolved work

- **Not a port yet:** relationships/loading state, codecs, dirty tracking,
  persistence, lists/editors, windows, restoration, responder ownership, and
  full awakening are not implemented.
- **Static class bodies:** literal declarations and known, already defined
  superclasses/mixins only. No reopened classes, dynamic declarations, autoload,
  or general Ruby constant lookup. Batch installation assumes no class-body
  code constructs instances before installation; general Ruby module hooks need
  an execution-order policy beyond the static declaration subset above.
- **Mixin support is narrow:** instance methods and required positional
  arguments, literal declaration-only included hooks, and the finite
  `ClassMethods` configuration protocol above; no general hook execution or
  ancestor manipulation.
- **Reflection is narrow:** generated properties, zero-argument readers,
  fixed-arity actions, and selected value readers. It is not full
  `respond_to?`/`public_send`, and arbitrary object properties are not exposed.
- **Defaults are immutable literals:** mutable collections and factory defaults
  need a deliberate typed lowering. The shared draft fixture has scalar
  attributes; deep relationship/object-copy semantics are not established.
- **Equality is scoped:** scalars and acyclic arrays compare by value; framework
  objects compare by identity. Hash equality, custom `==`, and cyclic collections
  are not implemented.
- **String support is scoped:** stripping follows Ruby's whitespace set; Unicode
  case-mapping equivalence across Ruby and JavaScript is not established.
- **Reactivity is synchronous:** no batching/scheduling policy, exhaustive
  reentrancy analysis, or broad performance claims. Passing these fixtures does
  not establish a production-ready reactive kernel.
- **Sorbet adoption is scoped:** framework/application/shared authoring source
  is checked. Compiler tooling and the MRI adapter are not fully Sorbet-typed.

## Assessment after the metadata/bundle change

**Keep this architecture.** It separates three responsibilities cleanly:
in-memory compiler analysis, runtime descriptions in a generated POJO, and
browser packaging. Neither applications nor the server need to understand the
intermediate module layout.

Evidence from the checks:

- Class/meta modules remain inert until the entrypoint installs their data.
- Superclass-first installation works even when metadata keys are reversed.
- Separate script bundles share constructor identity, observation, and lookup.
- The app source map confirms the runtime/framework implementation is absent.
- Both readable and minified script bundles pass; the real Chrome example
  exercises the ordinary two-script path, not a different module-only setup.
- MRI agreement, generated Sorbet checks, mixin ordering, and teardown remain
  intact after changing the packaging.

Measured with esbuild 0.28.2 (source maps excluded), including the added
three-class concern fixture:

| Artifact | Minified JS | Gzip |
| --- | ---: | ---: |
| `swill.min.js` | 8,313 bytes | 3,090 bytes |
| `app.min.js` | 3,477 bytes | 1,112 bytes |

Before adding the concern fixture, the application was 1,614 bytes minified /
687 gzip. The framework is unchanged; the increase is the additional compiled
concern methods, classes, and declaration metadata.

The previous single-module fixture was 7,285 bytes minified / 2,533 gzip.
The new two-file total is larger: it adds batch installation, the explicit
framework boundary, and separate compression streams. This is a packaging and
inspectability improvement, **not a demonstrated size or execution-speed win**.
The application remains small and does not duplicate the framework. These are
fixture measurements, not predictions for a full Swill port.

The concern slices now establish module-installed properties,
validation/dirty hooks using `super`, isolated inherited property defaults,
class-side methods, copy-on-first-touch registries, and inherited class
settings across separate bundles.

Then port a real controller/awakening/binding slice against the existing Opal
behavioral tests. Expand supported semantics in response to those examples,
not by attempting an unbounded Ruby runtime.

`rake optimize` reports current measurements for each artifact.
