# Ruby2JS Port Plan

## Goal

Determine whether Swill can keep a Ruby-native authoring model while compiling
to small, understandable browser JavaScript without shipping a Ruby runtime.

The target is not general Ruby compatibility. The target is the finite Swill
surface needed by real applications, with unsupported Ruby rejected at build
time. Product behavior is defined by the root documentation; the Opal port is a
useful reference for Ruby-native APIs and intentional divergences.

## Current Baseline

The initial kernel and DOM-boundary spike is complete and verified:

- framework and application Ruby compile into separate, self-initializing
  `swill.js` and `app.js` bundles that share one runtime;
- static classes, inheritance, namespaced constants, mixins, native `super`,
  included declaration hooks, class settings, and inheritable registries work;
- typed properties, attributes, computed dependencies, nested key paths,
  mutation hooks, observation, drafts, and disposal work;
- Ruby truthiness, equality, selected String operations, and Sorbet erasure are
  handled by explicit compiler filters or finite runtime helpers;
- `Swill::Object`, `Responder`, `View`, `Controller`, `Bindings`, `Actions`, and
  `Awakening` are Ruby-authored framework classes;
- value bindings cover text, form controls, selects, checkboxes, readonly
  controls, nested observable paths, and teardown;
- actions support `data-action="name"` and `data-action="event:name"`;
- modules may act as both mixins and namespaces without losing nested classes;
- generated RBIs, readable bundles, minified bundles, and source maps are
  checked by the build;
- nested controllers own a sparse `View` tree: parent and child ownership is
  derived from it, binding and action scans stop at controller boundaries,
  unhandled actions continue up the responder chain, the lifecycle runs
  children first per phase, and teardown releases descendants exactly once;
- the compiler lowers receivers from static types, compiles `raise` to
  `Error`, invokes callables correctly, and builds under both Ruby2JS parsers;
- `<body application="...">` launches a `Swill::Application` on
  `DOMContentLoaded` with no inline script; it tops the responder chain for
  root controllers and terminates on a real `pagehide`. Lifecycle hooks keep
  Cocoa names (`application_did_launch`, `application_will_terminate`);
- managed elements: `klass`, `controller`, and `outlet` awaken into the sparse
  view tree, `klass` and `controller` may share an element, declared outlets
  connect to their direct owner as controllers, views, templates, or decoded
  JSON, and mistakes fail at awakening by outlet name;
- binding parity: `binding_root` and `@` roots, `bind-*` property bindings,
  `present?`/`empty?`/`nil?` readers that answer for nil intermediates,
  child-controller `represented_object` fed by the parent's `bind` (nil
  included, an intentional divergence from Opal, which skips nil), writes
  through a missing owner dropped, and object-to-object bindings as a
  Ruby-authored `ObjectBindings` mixin over the runtime's existing path
  observation and metadata-checked writes, with no new compiler metadata;
- responder parity: the application owns the first responder with Cocoa's
  accept/resign/become protocol, `focusin` reconciliation with refusal
  restoring focus, and `keydown`/`keyup` routing through the responder chain
  with Escape, Enter, and Tab as `cancel_operation`, `insert_newline`, and
  `complete`; teardown releases a first responder inside the region;
- model step 1: `validate_<name>(value, previous)` resolved from metadata (the
  MRI adapter uses `respond_to?`), and `Swill::Model::DirtyTracking` with
  observable `dirty_attributes` and computed `dirty?`, baseline-aware
  clean-again semantics, and clean codec/draft application; the shared MRI
  and Node fixture produce identical results. The compiler accepts
  `T::Array[...]`/`T::Hash[...]` types, empty collection defaults, and
  computed declarations in included hooks;
- templates and windows: inert window templates, `[window]` containers
  filled from templates or keeping captured pre-rendered content,
  `load_window_content`, `show_window` dialogs with a `closed` promise and
  first-responder restoration on `dismiss`, `Awakening#detach`, and a
  `MutationObserver` so code-created content shares the markup activation
  path;
- restoration: `restorable :path, key:` declarations compiled with
  their leaf types, applied and observed through the binding path machinery
  between the load phase and `controller_did_load`, with
  `controller_did_restore(restored)`, `main=content` and `main.key=value`
  fragment keys, push on navigation, replace on state change, and
  Back/Forward reloading fragment-named content without writing history.

Before beginning another feature slice, checkpoint the current verified work.

## Immediate Next Slice: List Controllers

Model work beyond step 1 is deferred (decided September 2026) until the UI
surface is complete. Roadmap item 5 is done; next is item 6, beginning with
list selection and row ownership.

## Ordered Roadmap

### 1. Managed Elements and Outlets (done)

- `klass`, `controller`, and `outlet` awaken; elements with only `bind`,
  `bind-*`, or `data-action` stay inert.
- Controller root views, plain outlet views, and `klass` plus `controller` on
  the same element are supported.
- Outlets connect to their direct owning controller; `application/json`
  outlets decode through `decode_outlet_data`.
- Awakening order, ownership, duplicate and unresolved outlet failures, and
  teardown are tested.

### 2. Binding Parity (done)

- `binding_root` and `@` root overrides.
- `bind-*` DOM-property bindings.
- Reader chains ending in blank, present, empty, and nil predicates.
- Child-controller `represented_object` bound through ownership rules.
- Object-to-object bindings are a Ruby mixin over existing runtime
  primitives; neither compiler metadata nor a new runtime protocol.

### 3. Responder, Action, and Focus Parity (done)

- Actions resolve from the sender's owned region and walk controller and
  application responders through `respond_to?` metadata.
- First-responder focus and keyboard routing sit on top of stable ownership.
- Action names remain constrained to installed generated methods.

### 4. Model Vertical Slice

Port model behavior as independently composable concerns:

1. validation and dirty tracking (done);
2. identity stores and model type registration (deferred);
3. plain JSON and JSON:API codecs;
4. observable datasets and the browser wire boundary;
5. create, update, reload, and delete;
6. `has_one` and `has_many`, loading state, reload methods, and included-record
   hydration.

Each step must run shared MRI examples where the source is genuinely portable.
Network behavior stays behind an injectable boundary; server persistence,
authorization, and transactions do not move into the browser.

### 5. Templates, Windows, and Restoration

- Awaken template-backed content without activating inert template DOM (done).
- Add named window containers and replaceable content (done).
- Add keyed URL restoration and Back/Forward behavior after bindings and
  controller ownership are reliable (done).
- Preserve one activation path for server-rendered and code-created views
  (done).

### 6. Higher-Level Controllers and Controls

- Port list selection and row ownership first.
- Then add sortable lists, editors, inline editing, and detached drafts.
- Add native text/select controls before custom wrappers.
- Prefer application-shaped APIs over broad compiler support added only for a
  single implementation technique.

### 7. Application Proof

Use two increasingly demanding proofs:

1. Port the static example to exercise nested controllers, outlets, bindings,
   actions, focus, templates, controls, and teardown.
2. Port one backend-backed Giraffic flow covering dataset loading, selection,
   detached editing, persistence, restoration, and a relationship.

Do not claim parity from isolated unit fixtures alone.

## Slice Workflow

For every roadmap item:

1. Start with one production-shaped Ruby example and its expected browser
   behavior.
2. Compare shared Ruby behavior on MRI where applicable.
3. Add compiler output assertions when placement matters.
4. Add executable Node coverage for runtime semantics.
5. Add or extend a real-browser check for DOM behavior.
6. Add a rejection test for the nearest unsupported Ruby or markup form.
7. Run:

   ```sh
   cd ruby2js
   bundle exec rake
   bundle exec rake browser
   ```

8. Regenerate and review both readable and minified artifacts, including source
   maps and bundle-size output.
9. Update `ruby2js/docs/compiler.md` when the supported boundary changes.

## Decision Checkpoints

### UI Kernel Checkpoint

After nested ownership, outlets, richer bindings, responder routing, and the
static example work, compare Ruby2JS with the Opal implementation:

- authoring clarity;
- compiler complexity and rejection quality;
- browser debugging and source maps;
- bundle size and startup behavior;
- amount of handwritten runtime code.

Continue only if avoiding the Ruby runtime still produces a materially smaller
and simpler system rather than moving Ruby's complexity into custom filters.

### Application Checkpoint

After the model vertical slice and one Giraffic flow, decide whether to:

- continue toward broader Swill parity;
- keep Ruby2JS as a constrained client framework for selected applications; or
- stop and retain Opal as the Ruby implementation.

Stop or narrow the experiment if production features repeatedly require
application-specific lowering, general reflection, runtime source
interpretation, or duplicated framework protocols.

## Explicitly Deferred

- general Ruby module semantics and arbitrary `included` hooks;
- `prepend`, runtime class mutation, metaprogramming, and mutable declaration
  defaults;
- runtime Sorbet operations or a browser `sorbet-runtime`;
- arbitrary ActiveSupport compatibility;
- server ORM behavior, transactions, and authorization;
- publishing an npm package or introducing a client package toolchain.
