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
  checked by the build.

Before beginning another feature slice, checkpoint the current verified work.

## Guardrails

1. **No second Ruby VM.** Do not add `eval`, general reflection, a universal
   dynamic-send helper, runtime AST interpretation, or global prototype
   patches.
2. **Ruby source owns framework behavior.** Handwritten JavaScript is limited
   to browser/runtime boundaries that genuinely require dynamic types, shared
   state, identity, or metadata installation.
3. **Static facts stay static.** Names, inheritance, declarations, method
   arity, and supported call forms belong in compiler metadata and filters.
4. **One coherent rule per behavior.** Do not add fixture-specific rewrites or
   name-based lowering without type or declaration evidence.
5. **Fail closed.** The nearest unsupported form should produce a useful build
   error rather than silently changing Ruby semantics.
6. **No package ecosystem expansion.** Keep the browser output dependency-free
   and the build limited to Ruby2JS, Sorbet, Node, and `esbuild`.
7. **Generated output is generated.** Change Ruby/compiler/runtime sources,
   regenerate `ruby2js/dist/`, and never hand-edit bundles.

## Immediate Next Slice: Ownership-Correct Nested Controllers

The next implementation target is nested controller ownership. It is the
dependency for correct outlets, responder routing, richer bindings, and
controller teardown.

### Work

1. Build the sparse managed `View` tree for controller roots.
2. Record parent/child controller ownership without treating every DOM element
   as a framework object.
3. Make binding and action scans stop at nested controller boundaries so a
   parent never wires a child's elements.
4. Route `next_responder` from a child controller through its owning region.
5. Teardown descendants exactly once, after the owner's disposers and before
   `view_did_disappear`.
6. Preserve the documented lifecycle order:
   `view_did_load` → framework wiring → `awake_from_dom` →
   `controller_did_load` → appearance.

### Exit Criteria

- A browser fixture contains parent and child controllers with identically
  named bindings and actions.
- Each element is wired by only its direct owner.
- Child actions can continue through the responder chain when unhandled.
- Replacing or tearing down the parent releases all descendant listeners and
  observers exactly once.
- Flat-controller behavior and bundle ownership remain unchanged.

## Ordered Roadmap

### 1. Managed Elements and Outlets

- Add `klass`, `controller`, and `outlet` awakening while leaving elements with
  only `bind`, `bind-*`, or `data-action` inert.
- Support controller root views, plain outlet views, and `klass` plus
  `controller` on the same element.
- Connect outlets to their direct owning controller.
- Decode `application/json` outlets through a controller hook.
- Test awakening order, ownership, duplicate connection failures, and teardown.

### 2. Binding Parity

- Add controller `binding_root` and `@` root overrides.
- Add `bind-*` DOM-property bindings.
- Add the finite value transforms needed by current markup, beginning with
  blank, present, and empty predicates.
- Bind child-controller `represented_object` values through the same ownership
  rules.
- Decide whether reusable object-to-object bindings belong in compiler metadata
  or in a small runtime protocol; do not infer this from method names.

### 3. Responder, Action, and Focus Parity

- Resolve actions from the sender's owned region instead of always invoking the
  root controller directly.
- Walk controller/application responders with explicit method metadata and
  arity validation.
- Add first-responder focus and keyboard routing only after ownership is stable.
- Keep action names constrained to installed generated methods.

### 4. Model Vertical Slice

Port model behavior as independently composable concerns:

1. validation and dirty tracking;
2. identity stores and model type registration;
3. plain JSON and JSON:API codecs;
4. observable datasets and the browser wire boundary;
5. create, update, reload, and delete;
6. `has_one` and `has_many`, loading state, reload methods, and included-record
   hydration.

Each step must run shared MRI examples where the source is genuinely portable.
Network behavior stays behind an injectable boundary; server persistence,
authorization, and transactions do not move into the browser.

### 5. Templates, Windows, and Restoration

- Awaken template-backed content without activating inert template DOM.
- Add named window containers and replaceable content.
- Add keyed URL restoration and Back/Forward behavior after bindings and
  controller ownership are reliable.
- Preserve one activation path for server-rendered and code-created views.

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
9. Update `ruby2js/README.md` when the supported boundary changes.

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
