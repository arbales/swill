# Swill

Swill is a Cocoa-inspired, highly object-oriented, partially (largely?) vibe-coded,
anti-vogue, high-personality, delightfully comfortable, excellent, bad-idea,
browser UI framework.

It's implemented in Ruby, typed with Sorbet, and transpiled to JavaScript
by Ruby2JS. The Ruby2JS output is highly customized with filters, and a
(pretty small) runtime adds back some dynamism and flexibilty that a plain
transpilation would lose.

There's also a [Distributed Objects](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/DistrObjects/DistrObjects.html) inspired Data layer, and some more traditional JSON Model classes you can use to communicate with a server. You will almost certainly not like the Distributed Object model
system!

You can use Swill without writing Ruby or using the compiler in this repository.
There's a plain JavaScript entry point, and you just load it and use it.

## Interesting

I don't enjoy Javascript at all anymore, and this project might be evidence of that. I also don't enjoy passing HTML fragments around, because I've tried that and its confusing. Nor do I want my side projects to smell, taste or have a hint of anything React.

## Requirements and commands

What you need depends on what you are doing:

| To | You need |
| --- | --- |
| Use Swill from plain JavaScript | Nothing: load `swill.js` from jsDelivr (`https://cdn.jsdelivr.net/gh/arbales/swill@v0.0.2/rb/dist/swill.js`) or a [release's zip](https://github.com/arbales/swill/releases); see [Getting Swill](doc/javascript_getting_started.md#getting-swill) |
| Build an application written in Ruby | Ruby 3.2+, Bundler, and `esbuild` |
| Serve it with `Swill::Server` | Rack, which the gem depends on; see [Serving](doc/serving.md) |
| Serve Distant Objects | Sequel, and `falcon` with `async-websocket` for the WebSocket; neither is a dependency of the gem |
| Type-check it | The `sorbet` gem |
| Work on Swill itself | The above, plus Deno 2.9+ for the JavaScript tests, and Chrome for `rake browser` |

Swill uses neither Node nor npm. `esbuild` is a standalone binary, and the
compiler uses it to format and bundle what it generates.

Ruby2JS selects its Prism walker on Ruby 3.4+ and the parser gem otherwise;
the compiler supports both, and the suite passes with identical bundles under
either. `RUBY2JS_PARSER=parser` or `RUBY2JS_PARSER=prism` forces one.

```sh
BUNDLE_PATH=vendor/bundle bundle install
BUNDLE_PATH=vendor/bundle bundle exec rake
```

The default task builds, type-checks, tests on MRI and Deno, minifies, and reports
artifact sizes. Individual tasks are `build`, `typecheck`, `test`, and `optimize`.
`benchmark` reports non-gating runtime and warm compiler medians.

Applications can use `bundle exec swill build` or `bundle exec swill watch`
with a `swill.yml` to coordinate data generation, compilation, framework
copying, and type artifacts. See [the project workflow](doc/getting_started.md#project-workflow).


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
| `ts/` | The legacy TypeScript implementation: `src/`, its own `dist/`, `build.sh`, and its dev server (`dev.sh`, `dev_server.py`) |

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

[Compiler and Runtime](doc/compiler.md) is the reference for the pipeline,
the accepted Ruby subset, every lowering rule, and the rejected forms;
[Runtime](doc/runtime.md) is the reference for the runtime API. Update them
whenever the supported boundary changes.


## Guides

Writing an application:

| Guide | Covers |
| --- | --- |
| [Getting Started](doc/getting_started.md) | Building with the `swill` command, the `swill.yml` project workflow, and installing the gem |
| [Awakening](doc/awakening.md) | How markup becomes objects: managed and inert elements, regions and ownership, the awakening order, windows and templates |
| [Markup](doc/markup.md) | Every attribute Swill reads, each linking to the guide for its mechanism |
| [Declarations](doc/declarations.md) | The `property`, `attribute`, `outlet` and `restorable` keywords, the framework macros, and the property protocol |
| [Bindings](doc/bindings.md) | Key paths, binding roots, writing back, value transformers, observers, and computed properties |
| [Swell](doc/swell.md) | Chained DOM edits, attribute and property values, descendant lookup, and event listeners |
| [Controls](doc/controls.md) | Buttons, text fields, selects, segmented choices, value bindings, keyboard behavior, and control templates |
| [Resources](doc/resources.md) | Bundles: images, templates and stylesheets found by name and loaded when used, the image control, and the server's view of the same bundles |
| [Lifecycle](doc/lifecycle.md) | Activation order, restoration from the URL fragment, unloading, and ownership |
| [Responders](doc/responders.md) | The responder chain, actions, key events, first responder, and focus |
| [Collections](doc/collections.md) | Lists and tables: row templates, sorting, filtering, editing in place, `ArrayController`, and shared selection |
| [Models & Data](doc/models.md) | Client models: `Base`, `Editable`, `Resource` and `Distant::Object`; identity, partial fields, collection state, and drafts |
| [Server Data](doc/server_data.md) | Distant Objects: distant interfaces, remote methods, effects, types and authorization, generation, and the MessagePack WebSocket connection |
| [A bound data form](doc/data_form.md) | A complete plain-Sequel model, endpoint, Ruby form, and project build |

Boundaries and tooling:

| Guide | Covers |
| --- | --- |
| [Sorbet](doc/sorbet.md) | How types drive lowering, the `T` operations a body may use, declared types, and typing an application |
| [Getting Started in JavaScript](doc/javascript_getting_started.md) | A page in plain JavaScript: getting `swill.js`, controllers, lists, keys, resources, and which build to load |
| [Plain JavaScript](doc/plain_javascript.md) | Using `swill.js` with no build step, through `Swill.register` and `Swill.start` |
| [Compiler and Runtime](doc/compiler.md) | The pipeline, the accepted Ruby subset, lowering rules, rejected forms, and extending the boundary |
| [Runtime](doc/runtime.md) | The `Runtime` API generated code calls: installation, dispatch, values, Sorbet operations, and observation |
| [Development](doc/development.md) | Working on Swill: browser checks, typechecking the framework, dependency updates, benchmarks, and build output |
| [Documentation Style](doc/documentation_style.md) | How the guides, the README and API comments are written: voice, structure, examples, and vocabulary |

## Current scope

The implementation covers:

- separate framework and application bundles with one runtime;
- static classes, inheritance, method-only mixins, and native `super`;
- typed properties, attributes, computed values, and inherited defaults;
- class settings and inheritable registries;
- an open declaration vocabulary: the compiler loads the Ruby, so a macro is
  an ordinary class method marked `macro`, and `attribute`, `outlet`,
  `restorable`, resource associations, and distant-object declarations are
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
or a complete model-layer port. Unsupported forms
fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
