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
| Use Swill from plain JavaScript | Nothing: load `swill.js` |
| Build an application written in Ruby | Ruby 3.2+, Bundler, and `esbuild` |
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
| [Lifecycle](doc/lifecycle.md) | Activation order, restoration, and teardown |
| [Bindings](doc/bindings.md) | Key paths, binding roots, value transformers, and observation |
| [Responders](doc/responders.md) | The responder chain, actions, key events, and first responder |
| [Markup](doc/markup.md) | Every attribute Swill reads, in one reference |
| [Models](doc/models.md) | Base, editable, resource, and distant model roles; identity, drafts, and partial fields |
| [Server data](doc/server_data.md) | Queries, resolvers, and commands over MessagePack WebSockets |
| [A bound data form](doc/data_form.md) | A complete plain-Sequel model, endpoint, Ruby form, and project build |

Boundaries and tooling:

| Guide | Covers |
| --- | --- |
| [Sorbet](doc/sorbet.md) | Typing the framework and typing an application |
| [Plain JavaScript](doc/plain_javascript.md) | Using `swill.js` with no build step, through `Swill.register` and `Swill.start` |
| [The compiler](doc/compiler.md) | The pipeline, the accepted Ruby subset, lowering rules, the runtime API, and rejected forms |

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
or a complete model-layer port. Unsupported forms
fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
