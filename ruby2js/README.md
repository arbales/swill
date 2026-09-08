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

`Swill::Bindings`, `Swill::Actions`, and `Swill::Awakening` are Ruby-authored
framework classes compiled with the JavaScript-only surface. DOM traversal,
control rendering, event selection, action parsing, and listener ownership stay
in those classes. The handwritten runtime only resolves metadata-aware key paths
and dispatches generated method names.

Current value bindings support text content, text controls, selects, checkboxes,
readonly controls, nested observable paths, and teardown. Actions default to
`click`; `event:action` selects another DOM event.

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
- compiled object, responder, view, controller, bindings, actions, and awakening
  framework slices;
- generated RBIs and expression probes;
- readable and minified script bundles with source maps.

It does not claim general Ruby modules, reflection, mutable declaration defaults,
runtime Sorbet operations, dynamic class mutation, `bind-*` DOM property
bindings, nested controller ownership, or a complete Awakening and model-layer
port. Unsupported forms fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
