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
Ruby2JS selects its Prism walker on Ruby 3.4+ and the parser gem otherwise;
the compiler supports both, and the suite passes with identical bundles under
either. `RUBY2JS_PARSER=parser` or `RUBY2JS_PARSER=prism` forces one.

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
class lookup, input events, computed rendering, nested controller ownership,
actions through the responder chain, and listener teardown.

For manual inspection:

```sh
BUNDLE_PATH=vendor/bundle bundle exec rake build
python3 -m http.server 3000 --bind 127.0.0.1
```

Open `http://127.0.0.1:3000/examples/index.html`. The page declares its
application and loads the two scripts; nothing else is needed:

```html
<body application="Demo::Application">
  <main controller="Demo::Controller">...</main>
  <script src="../dist/swill.js"></script>
  <script src="../dist/app.js"></script>
</body>
```

Load `swill.js` before `app.js`. The framework launches the named application
on `DOMContentLoaded` and terminates it on a real `pagehide`.

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
| `lib/swill/runtime.mjs` | Browser state, metadata installation, and dynamic key paths |
| `lib/swill-ruby2js/` | Compiler integration, filters, metadata, RBIs, and probes |
| `spec/mri_adapter.rb` | MRI adapter to the Opal observable implementation |
| `spec/` | Compiler, MRI, runtime, bundle, and browser checks |
| `examples/` | Browser example and application source |
| `sorbet/rbi/runtime.rbi` | Types for runtime and DSL boundaries |
| `docs/compiler.md` | Compiler, lowering rules, runtime API, and rejected forms |
| `build/` | Disposable intermediate modules and test files |
| `dist/` | Browser scripts and source maps |

## Architecture

The compiler collects static facts from Ruby source without executing class
bodies, then emits readable JavaScript classes, mixin factories, and one
`meta` object per bundle. A small handwritten runtime installs that metadata,
implements the property protocol, and provides the only dynamic dispatch. The
framework and application compile into separate bundles that share one
runtime; only `Swill` is global.

[`docs/compiler.md`](docs/compiler.md) is the reference for the pipeline, the
accepted Ruby subset, every lowering rule, the runtime API, and the rejected
forms. Update it whenever the supported boundary changes.

### DOM boundaries

`Swill::View`, `Swill::Controller`, `Swill::Ownership`, `Swill::Bindings`,
`Swill::Actions`, and `Swill::Awakening` are Ruby-authored framework classes
compiled with the JavaScript-only surface. DOM traversal, control rendering,
event selection, action parsing, and listener ownership stay in those classes.
The handwritten runtime only resolves metadata-aware key paths and dispatches
generated method names.

Ownership follows a sparse view tree. An element becomes a `View` only when it
carries `klass`, `controller`, or `outlet`; elements with only `bind` or
`data-action` stay raw DOM, and templates and JSON scripts are inert content.
`klass` names a `View` subclass and may share an element with `controller`. A
controller's `parent` and `child_controllers` are derived from that tree.

Controllers declare `outlet :name, type: ...` and markup names the element with
`outlet="name"`. Outlets connect between `view_did_load` and bindings, only from
the controller's owned region including child-controller roots. The value is
the child controller, the element's view, an inert `<template>`, or JSON from a
`<script type="application/json">` passed through `decode_outlet_data`.
Undeclared, duplicate, and unresolved required outlets raise; `optional: true`
outlets may be absent. Binding and action
scans stop at nested `[controller]` boundaries, so each element is wired by its
direct owner only. Awakening runs `view_did_load`, wiring, and `awake_from_dom`
for each controller children first, then `controller_did_load`, then the
appearance hooks. Teardown runs `view_will_disappear`, the controller's own
disposers and observable state, its descendants, and `view_did_disappear`,
exactly once.

`Swill::Application` is the top of the responder chain for one launched region.
It records itself on its root element, so a root controller finds it by walking
up from its own element; `application_did_launch` and
`application_will_terminate` bracket its life. Actions resolve through the
responder chain: a controller handles an action when it has a matching
generated method, otherwise its parent tries, then the application, and an
action nobody handles raises. Actions default to `click`; `event:action`
selects another DOM event.

Bindings are Ruby key paths. `bind="path"` is two-way for form controls and
one-way for text; `bind-prop="path"` writes the DOM property named by the
HTML attribute one way, so `bind-disabled`, `bind-hidden`, and `bind-readonly`
set the matching properties with Ruby truthiness, and `bind-data-*` names go
through attributes because they are not properties. Paths resolve under the
controller's `binding_root`, a Symbol naming a property or nil for the
controller itself, and a leading `@` binds against the controller regardless
of the root. Reader chains may end in `strip`, `upcase`,
`downcase`, `blank?`, `present?`, `empty?`, or `nil?`; the first three
predicates answer for a nil intermediate, and any other reader on nil yields
nil. A write through a missing owner is dropped; a read-only leaf on a
writable control fails at wiring.

A `bind` on a child controller's root belongs to the parent and assigns the
child's `represented_object`, nil included; it is wired when the parent loads,
so a fragment awakened later must be present under its parent before the
parent awakens or be bound by the parent explicitly. `bind-*` on that root
belongs to the child. `bind(:target, to: source, key_path: "a.b")` keeps a declared
property equal to a path on another object until `unbind`, `unbind_all`, or
teardown.

### Sorbet

Declarations carry explicit types, and method signatures feed the compiler's
static lowering as well as Sorbet:

```ruby
attribute :name, type: String, default: ""

property :label, type: String do
  loud ? name.upcase : name
end
```

`extend T::Sig` and `sig` are erased from output. Runtime Sorbet operations are
rejected and no browser `sorbet-runtime` is bundled. The build generates RBIs
for declared accessors and type-check-only probes for declaration expressions.

## Current scope

The implementation covers:

- separate framework and application bundles with one runtime;
- static classes, inheritance, method-only mixins, and native `super`;
- typed properties, attributes, computed values, and inherited defaults;
- class settings and inheritable registries;
- mutation hooks, observation, value bindings, actions, drafts, and disposal;
- compiled object, responder, view, controller, ownership, bindings, actions,
  and awakening framework slices;
- nested controllers with a sparse view tree, direct-owner wiring, responder
  chain actions, children-first lifecycle, and recursive teardown;
- a markup-declared application that launches on `DOMContentLoaded`, tops the
  responder chain, and terminates on unload;
- managed elements: `klass` views, plain outlet views, declared outlets
  connected to their direct owner, and JSON outlets decoded through a hook;
- binding roots, `@` paths, `bind-*` property bindings, predicate readers,
  represented objects for child controllers, and object-to-object bindings;
- generated RBIs and expression probes;
- readable and minified script bundles with source maps.

It does not claim general Ruby modules, reflection, mutable declaration defaults,
runtime Sorbet operations, dynamic class mutation, first-responder focus,
keyboard routing, templates as content, or a complete model-layer port.
Unsupported forms fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
