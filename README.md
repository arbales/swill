# Swill

Swill is a Cocoa-inspired browser UI framework. This repository holds two
implementations of it, each in a directory of its own: `rb/`, the Ruby2JS
implementation described here and the one under active development, and
`ts/`, the original TypeScript one ([`ts/README.md`](ts/README.md)). The
Ruby-shaped tooling — `Gemfile`, `Rakefile`, `swill.gemspec`, `sorbet/`,
`spec/` — is at the root, and serves `rb/`.

The Ruby2JS implementation supports a deliberate Ruby subset rather than
general Ruby execution.

The build produces two browser scripts:

- `swill.js` contains the runtime, framework definitions, and the plain
  JavaScript authoring API. It can be used by itself with no build step.
- `app.js` contains application definitions and reuses the installed framework.

Shared model fixtures produce the same results on MRI and JavaScript, including
after bundling and minification.

## Requirements and commands

Use Ruby 3.3+, Bundler, Node 22+, and `esbuild`. No npm install is required.
Ruby2JS selects its Prism walker on Ruby 3.4+ and the parser gem otherwise;
the compiler supports both, and the suite passes with identical bundles under
either. `RUBY2JS_PARSER=parser` or `RUBY2JS_PARSER=prism` forces one.

```sh
BUNDLE_PATH=vendor/bundle bundle install
BUNDLE_PATH=vendor/bundle bundle exec rake
```

The default task builds, type-checks, tests on MRI and Node, minifies, and reports
artifact sizes. Individual tasks are `build`, `typecheck`, `test`, and `optimize`.
`benchmark` reports non-gating runtime and warm compiler medians.


## Layout

| Path | Responsibility |
| --- | --- |
| `rb/swill.rb` | The gem's entry point; defines `Swill::ROOT`, from which every path below is read |
| `rb/framework/` | Ruby-authored framework code: `core/` for the kernel and `controller/` for higher-level controllers such as `List` |
| `rb/runtime/` | One protocol, two hosts: the JavaScript runtime (`runtime.mjs` and its modules — metadata, properties, values, paths, installation, attributes) beside the MRI host that runs the same declarations, plus `browser_api.mjs` for plain JavaScript declarations, friendly class aliases, and manual startup |
| `rb/compiler/` | Compiler, build time only: knowledge collection, filters, emission (`emit/`), and Sorbet artifacts |
| `rb/dist/` | Browser scripts and source maps |
| `spec/mri_host.rb` | The MRI host: declarations and the model subset, for the shared examples |
| `spec/` | Compiler, MRI, runtime, bundle, and browser checks |
| `examples/rb/` | Browser example and application source |
| `sorbet/rbi/runtime.rbi` | Types for runtime and DSL boundaries |
| `doc/` | The guides |
| `build/` | Disposable intermediate modules and test files |
| `ts/` | The TypeScript implementation: `src/`, its own `dist/`, and `build.sh` |

## Architecture

The compiler collects static facts from Ruby source without executing class
bodies, then emits readable JavaScript classes, mixin factories, and one
`meta` object per bundle. A small handwritten runtime installs that metadata,
implements the property protocol, and provides the only dynamic dispatch. The
framework and application compile into separate bundles that share one
runtime; only `Swill` is global. `Swill.register` translates JavaScript static
declarations and native getters into the same metadata rather than maintaining
a second framework implementation. Generated identifiers remain on `Swill` so
compiled application bundles can import them, but they are private browser API.

[The compiler](doc/compiler.md) is the reference for the pipeline, the
accepted Ruby subset, every lowering rule, the runtime API, and the rejected
forms. Update it whenever the supported boundary changes.


## Guides

Writing an application:

| Guide | Covers |
| --- | --- |
| [Getting started](doc/getting_started.md) | Building an application, installing the gem, application ports, and the static example |
| [Awakening](doc/awakening.md) | How markup becomes objects: managed and inert elements, ownership, JSON outlets, and templates |
| [Lifecycle](doc/lifecycle.md) | Activation order, restoration, teardown, and first responder |
| [Bindings](doc/bindings.md) | Markup bindings, key paths, binding roots, value transformers, and observation |
| [Models](doc/models.md) | Base, editable, resource, and distant model roles; identity, drafts, and partial fields |
| [Server data](doc/server_data.md) | Queries, resolvers, and commands over MessagePack WebSockets |

Boundaries and tooling:

| Guide | Covers |
| --- | --- |
| [DOM boundaries](doc/dom_boundaries.md) | Which code may name DOM types, and what the runtime is allowed to do |
| [Sorbet](doc/sorbet.md) | Typing the framework and typing an application |
| [Plain JavaScript](doc/plain_javascript.md) | Using `swill.js` with no build step, through `Swill.register` and `Swill.start` |
| [The compiler](doc/compiler.md) | The pipeline, the accepted Ruby subset, lowering rules, the runtime API, and rejected forms |
| [Declaration reference](doc/declarations.md) | Every declared property, outlet, attribute, and macro. Generated by `rake declarations` |

## Current scope

The implementation covers:

- separate framework and application bundles with one runtime;
- static classes, inheritance, method-only mixins, and native `super`;
- typed properties, attributes, computed values, and inherited defaults;
- class settings and inheritable registries;
- an open declaration vocabulary: the compiler loads the Ruby, so a macro is
  an ordinary class method marked `macro`, and `attribute`, `outlet`,
  `restorable`, resource relationships, and distant-object declarations are
  written in it rather than in the compiler.
  A plugin's own macro needs no compiler change;
- mutation hooks, observation, value bindings, actions, drafts, and disposal;
- compiled object, responder, view, controller, ownership, bindings, actions,
  and awakening framework slices;
- nested controllers with a sparse view tree, direct-owner wiring, responder
  chain actions, children-first lifecycle, and recursive unload;
- a markup-declared application that launches on `DOMContentLoaded`, tops the
  responder chain, and terminates on unload;
- managed elements: `klass` views, plain outlet views, declared outlets
  connected to their direct owner, and JSON outlets decoded through a hook;
- binding roots, `@` paths, `bind-*` property bindings, predicate readers,
  represented objects for child controllers, and object-to-object bindings;
- application-owned first responder with focus reconciliation and key routing
  through the responder chain;
- model attributes with `validate_<name>(value, previous)` validation,
  `from_attributes` materialization from a wire hash, and observable,
  baseline-aware dirty tracking, shared with MRI;
- window templates, named containers with replaceable content, dialogs, and
  observed awakening of code-created content;
- list controllers: template rows bound to their objects, row views and row
  controllers owned by the list, identity-based selection with a restorable
  pending id, mouse and keyboard selection, and activation through the
  responder chain;
- common methods and blocks on typed String, Symbol, Integer, Float, Boolean,
  nil, Array, and Hash receivers, with Ruby semantics checked against MRI and
  a build error for anything outside the tables; sends on untyped receivers
  resolve through installed metadata at run time;
- keyed URL restoration of window content and controller state with
  Back/Forward, declared per path and typed from declarations;
- generated RBIs and expression probes;
- readable and minified script bundles with source maps.

It does not claim general Ruby modules, runtime reflection, mutable declaration defaults,
Sorbet constructs beyond the compiled `T` operations, dynamic class mutation,
editor controllers, controls, or a complete model-layer port. Unsupported forms
fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
