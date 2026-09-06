# Swill for Ruby2JS

This directory contains the Ruby2JS implementation of Swill. It supports a
deliberate Ruby subset rather than general Ruby execution.

The build produces two self-initializing browser scripts:

- `swill.js` contains the runtime and framework definitions.
- `app.js` contains application definitions and reuses the installed framework.

Shared model fixtures produce the same results on MRI and JavaScript, including
after bundling and minification.

## Requirements and commands

Use Ruby 3.3+, Bundler, Node 22+, and `esbuild`. No npm install is required.

```sh
cd ruby2js
BUNDLE_PATH=vendor/bundle bundle install
BUNDLE_PATH=vendor/bundle bundle exec rake
```

The default task builds, type-checks, tests on MRI and Node, minifies, and reports
artifact sizes. Individual tasks are `build`, `typecheck`, `test`, and `optimize`.

`build/` is disposable. `dist/` contains checked-in browser output. Regenerate it
with `rake build`; do not edit generated files.

### Browser checks

```sh
# macOS default Chrome path
BUNDLE_PATH=vendor/bundle bundle exec rake browser

# Explicit browser
CHROME_BIN=/path/to/chrome BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

The check uses Chrome's DevTools protocol with a temporary profile. It exercises
class lookup, input events, computed rendering, actions, and listener teardown.

For manual inspection:

```sh
BUNDLE_PATH=vendor/bundle bundle exec rake build
python3 -m http.server 3000 --bind 127.0.0.1
```

Open `http://127.0.0.1:3000/examples/index.html`. The page loads:

```html
<script src="../dist/swill.js"></script>
<script src="../dist/app.js"></script>
```

Load `swill.js` before `app.js`.

### Dependency updates

Ruby2JS tracks a lockfile-pinned upstream commit because the latest published gem
does not include the Pragma filter.

```sh
BUNDLE_PATH=vendor/bundle bundle update
BUNDLE_PATH=vendor/bundle bundle exec rake
BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

Commit `Gemfile.lock` after verification.

## Layout

| Path | Responsibility |
| --- | --- |
| `lib/swill/` | Ruby-authored framework code |
| `lib/swill/runtime.mjs` | Browser runtime and stateful framework protocols |
| `lib/swill-ruby2js/` | Compiler integration, filters, metadata, RBIs, and probes |
| `spec/mri_adapter.rb` | MRI adapter to the Opal observable implementation |
| `spec/` | Compiler, MRI, runtime, bundle, and browser checks |
| `examples/` | Browser example and application source |
| `sorbet/rbi/runtime.rbi` | Types for runtime and DSL boundaries |
| `build/` | Disposable intermediate modules and test files |
| `dist/` | Browser scripts and source maps |

## Architecture

### Compilation and metadata

The compiler parses Ruby without evaluating class bodies. It collects names,
inheritance, include order, method arity, and property declarations.

Framework compilation passes its interface to application compilation in memory.
Each artifact generates:

```text
application.classes.mjs  — class and mixin definitions
application.meta.mjs     — constructors, declarations, and methods
application.mjs          — Runtime.install(meta)
```

`meta` is a JavaScript object containing executable constructor and default
function references. It contains no Ruby source or compiler AST. Authors do not
write or maintain it.

Static references remain direct JavaScript references. Names read from markup use
the installed registry:

```js
new (Swill.Runtime.resolve("Demo::Person"))()
```

Only `Swill` is global. Application classes are not. Encoded names are readable
and collision-safe.

### Installation and bundle ownership

The framework bundle installs its runtime, classes, mixins, accessors, and
metadata before publishing `Swill`. The application bundle imports references
from that namespace and installs only application metadata.

Installation is superclass-first and idempotence is strict. Duplicate runtime or
class registration raises. Application-first loading raises. Definitions,
metadata, and entrypoints form an acyclic module graph.

### Mixins

Statically known method-only modules compile to subclass-layer factories.
Installation links prototype chains once, preserving native `super` without
copying methods or adding per-call dispatch.

This supports the tested static include forms. Dynamic composition, `prepend`,
runtime rewiring, and arbitrary included hooks are rejected.

Literal `base.attribute` and `base.property` declarations in
`self.included(base)` are collected statically and copied into each receiving
class. Hook execution is not interpreted at runtime.

### Properties and state

Generated accessors use one mutation path:

```text
read previous → coerce → compare → will-change
  → store → invalidate → did-change → notify
```

Computed properties capture dependencies. Branch changes replace subscriptions.
Bindings use the same property protocol and validate writers. Drafts copy
declared attributes but not subscriptions. Disposal releases dependencies and
observers.

## Supported Ruby policy

The supported subset is defined by accepted source and behavioral tests, not by
whatever JavaScript Ruby2JS can emit.

For each new construct:

1. Use Ruby2JS unchanged when its output preserves the required semantics.
2. Use an upstream filter only when its relevant behavior matches Swill's
   truthiness, naming, metadata, and packaging rules.
3. Add a Swill filter for syntax, static type-directed operations,
   declaration-aware access, or compile-time rejection.
4. Add runtime support only for execution-time types, shared state, identity, or
   an application-wide protocol.
5. Otherwise reject the construct explicitly.

Rules must cover a coherent class of values, not one fixture. The boundary may
expand for production use cases, but accepted behavior remains compatible unless
the source contract is deliberately migrated.

### Filter and runtime boundaries

Filters may lower syntax and choose operations from static knowledge. They must
not hold application state or create a second framework protocol.

Runtime helpers implement genuinely dynamic or shared behavior: property lookup,
truthiness, equality, dependency capture, mutation, observation, and
installation. They must not interpret Ruby source or compiler ASTs.

A universal dynamic call helper is intentionally excluded. It would hide the
supported surface and grow into a second Ruby VM.

Every addition should include:

- a production-shaped motivating expression;
- MRI comparison for shared Ruby code;
- relevant Ruby/JavaScript edge values;
- generated-code assertions when implementation placement matters;
- rejection of the nearest unsupported form;
- verification that application bundles do not duplicate the runtime.

### Current filter rules

The compiler preserves these Ruby semantics:

- Methods remain methods with or without parentheses.
- Declared property reads compile to property access.
- Dynamic property reads use generated metadata.
- Predicate names have collision-safe JavaScript encodings.
- `if`, `&&`, `||`, and unary `!` use native operators when static types make
  Ruby and JavaScript agree; dynamic cases use `Runtime.isTruthy`,
  `Runtime.logicalAnd`, and `Runtime.logicalOr`.
- `==` and `!=` use native identity for statically safe scalar/object cases and
  `Runtime.isEqual` when dynamic or array value equality is required.
- String operations and binding paths share value readers.

The pipeline uses Ruby2JS's Pragma and Return filters. Accepted pragmas are
`array`, `hash`, and `string`. Other pragmas are rejected.

Broad name-based filters are disabled:

| Facility | Reason |
| --- | --- |
| Functions | Can rewrite ordinary framework methods without type evidence |
| ActiveSupport | Its `blank?` behavior conflicts with Swill value readers |
| ESM / Require | Imports and exports come from compiler metadata |
| camelCase / underscore | Source names and metadata keys must remain stable |

### Sorbet

Class-body `extend T::Sig` and `sig` declarations are removed from executable
output. `T.must`, `T.cast`, `T.let`, `T.unsafe`, and `T::Struct` are rejected in
compiled method and computed-property bodies. No browser `sorbet-runtime` is
bundled.

Declarations carry explicit types:

```ruby
attribute :name, type: String, default: ""

property :label, type: String do
  loud ? name.upcase : name
end
```

Generated RBIs define readers and writers. Type-check-only probes validate
default and computed expressions; probes are neither executed nor shipped.

## Current scope

The implementation covers:

- separate framework and application bundles with one runtime;
- static classes, inheritance, method-only mixins, and native `super`;
- typed properties, attributes, computed values, and inherited defaults;
- class settings and inheritable registries;
- mutation hooks, observation, bindings, drafts, and disposal;
- compiled object, responder, view, controller, and awakening framework slices;
- generated RBIs and expression probes;
- readable and minified script bundles with source maps.

It does not claim general Ruby modules, reflection, mutable declaration defaults,
runtime Sorbet operations, dynamic class mutation, or a complete Awakening and
model-layer port. Unsupported forms fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
