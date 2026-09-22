# Ruby2JS Port Plan

## Goal

Determine whether Swill can keep a Ruby-native authoring model while compiling
to small, understandable browser JavaScript without shipping a Ruby runtime.

The target is not general Ruby compatibility. The target is the finite Swill
surface needed by real applications, with unsupported Ruby rejected at build
time. Product behavior is defined by the root documentation. The Opal port, which
shipped the Ruby runtime to the browser, was retired on 20 September 2026; its
two example applications are kept as reference in `examples/opal/`.

## Current Baseline

The initial kernel and DOM-boundary spike is complete and verified:

- framework and application Ruby compile into separate, self-initializing
  `swill.js` and `app.js` bundles that share one runtime;
- `swill.js` also exposes a no-build JavaScript API: friendly framework class
  names, metadata-backed static properties and outlets, native computed
  getters, explicit actions, lifecycle hooks under the same camelCase names
  the compiled framework uses, and manual `Swill.start()` application launch;
- static classes, inheritance, namespaced constants, mixins, native `super`,
  included declaration hooks, class settings, and inheritable registries work;
- typed properties, attributes, computed dependencies, nested key paths,
  mutation hooks, observation, drafts, and disposal work;
- Ruby truthiness, equality, selected String operations, and Sorbet erasure are
  handled by explicit compiler filters or finite runtime helpers;
- `Swill::Object`, `Responder`, `View`, `Controller`, `Bindings`, `Actions`, and
  `Awakening` are Ruby-authored framework classes;
- value bindings cover text, form controls, selects, checkboxes, readonly
  controls, nested observable paths, and unload;
- actions support `data-action="name"` and `data-action="event:name"`;
- modules may act as both mixins and namespaces without losing nested classes;
- generated RBIs, readable bundles, minified bundles, and source maps are
  checked by the build;
- nested controllers own a sparse `View` tree: parent and child ownership is
  derived from it, binding and action scans stop at controller boundaries,
  unhandled actions continue up the responder chain, the lifecycle runs
  children first per phase, and unload releases descendants exactly once;
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
  included, an intentional divergence from the Opal port, which skipped nil), writes
  through a missing owner dropped, and object-to-object bindings as a
  Ruby-authored `ObjectBindings` mixin over the runtime's existing path
  observation and metadata-checked writes, with no new compiler metadata;
- responder parity: the application owns the first responder with Cocoa's
  accept/resign/become protocol, `focusin` reconciliation with refusal
  restoring focus, and `keydown`/`keyup` routing through the responder chain
  with Escape, Enter, and Tab as `cancel_operation`, `insert_newline`, and
  `complete`; unload releases a first responder inside the region;
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
  Back/Forward reloading fragment-named content without writing history;
- list controllers: `Swill::Controller::List` clones template rows bound
  straight to their objects, owns row views and any controller inside a row
  (`bind="@"` hands it the row's object), wires row actions to the list with
  `row_for(sender)`, selects by identity with derived `selected_indexes` and
  `selected_object`, keeps a restorable `selected_object_id` that resolves
  now or when the object arrives, and routes clicks, shift-click ranges,
  arrow keys, Enter, and double-click activation through the responder
  chain. A computed property with a `did_change` hook is now kept current so
  the hook runs on every dependency change;
- compiler audit (September 2026): the compiler rejects what it cannot
  compile or emit, and the runtime rejects metadata it cannot install or
  honor. Sends on untyped receivers are dynamic through `Runtime.read`,
  `write`, and `invoke` rather than chosen by a global property-name
  heuristic, and a block on an untyped receiver is rejected; `Const.new`
  types its result; setter methods for declared properties and `restorable`
  paths are checked at installation; which classes may declare `outlet` and
  `restorable` is Sorbet's rule; registry seeding is declared in source with
  `inheritable_registry :name, seeded_by: :attribute` instead of a module
  name known to the compiler; the `Spike` alias and duplicated checks are
  gone;
- core value types: per-type lowering tables for String, Symbol, Integer,
  Float, Boolean, nil, Array, and Hash receivers and for array and hash
  blocks, with runtime helpers where Ruby's rule differs (integer division,
  `split`, `slice`, `sort`, `index`, `push`, `fetch`, and others), Ruby
  truthiness for filtering blocks, typed results for chains, one fixture
  compared between MRI and JavaScript, and a build error for any method
  outside the tables;
- sortable lists: `Swill::Controller::SortableList` with stored, restorable
  `sort_key` and `sort_direction`, a `sort_by` header action from
  `data-column`, `sort_states` for `aria-sort` bindings, Ruby-shaped value
  comparison, and selection kept by identity through reorders. Key paths
  read a Hash segment by key, as key-value coding does for dictionaries;
- Sorbet runtime operations: `T.must`, `T.cast`, `T.let`, `T.assert_type!`,
  `T.unsafe`, and `T.absurd` compile to runtime checks with sorbet-runtime's
  behavior on both surfaces, and the static typer uses their types, so
  `T.must(person).name` replaces a guarded local copy. Other `T` constructs
  stay rejected; one fixture is compared between MRI and JavaScript;
- typed outlets: an outlet's type names its value (`T::Hash[String, String]`
  for decoded JSON, a framework class for a view or controller), class names
  resolve to installed names, and awakening checks the connected value
  against the type so a mistyped outlet fails by name. `decode_outlet_data`
  materializes models with `Model::Attributes.from_attributes`, so the demo
  controller no longer builds people itself.
- native controls: `Swill::Control` with the delegate resignation query
  (`control_should_resign_first_responder`), `Control::TextField` and
  `Control::Select` as observable wrappers reached with `klass`,
  `Control::CustomSelect` as a stylable listbox control, and the inline
  editor as delegate of its controls, so a refused commit keeps focus in
  the control;
- the static example (16 September 2026, item 7.1): `examples/rb/static` ports
  the Opal static example (`examples/opal/static/app.rb`) in full but for its
  backend search, on top of
  `Swill::NotificationCenter` (post, `add_observer`, a controller's
  `observe_notification`), the application's `first_responder_did_change`
  notification, `bind` on a control's `value`, `Runtime.nameOf`, and `dup`
  of framework objects; the browser check drives all three panes, the
  palette, and the restored workspace pane. Focus reconciled into a nested
  responder during `become` now stays there;
- one application per page (16 September 2026): `Swill::Application.shared`
  is NSApp, `running?` says whether one is up, and a controller's
  `application` is never nil. The DOM-walking lookup and its expando are
  gone with the nil guards it required; launching twice is an error;
- one compilation surface (16 September 2026): the JavaScript-only surface
  is gone. The browser is described once in `knowledge/dom.rb`, which
  generates `sorbet/rbi/dom.rbi` and drives native lowering, so framework
  signatures say `Element`, `Event`, or `Document` where a DOM value is
  meant and the receiver's type decides between Ruby and JavaScript
  semantics; `T.untyped` is always a Ruby object dispatched by name. Lambdas
  and blocks take their parameter types from the callee's signature or the
  DOM table; locals and instance variables merge their assignments' types;
  `initialize` and `def self.` are allowed anywhere. The framework's browser
  code is now Ruby with typed arrays and Ruby core methods;
- editors: `Swill::Controller::Editor` (represented_object as binding root,
  NSEditor's boolean `commit_editing` and `discard_editing` on Enter and
  Escape, also adopted by the TypeScript original), `Controller::InlineEditor` (ends
  the edit through its host and asks it before letting focus leave), and
  `Controller::EditableList` (one editor cloned from `<template for="editor">`
  after the row, a model draft or duplicated plain object as the copy,
  commit through `apply_draft` or replacement, focus-out policy through
  `editor_should_end_editing` and `confirm_edit?`, sorting commits first, a
  new collection discards). The demo's people table edits in place.

- models: `Swill::Model::Base` with `endpoint`/`resource_type`/`codec` set in
  the class body (class settings applied at installation), one identity
  store per class, JSON:API and plain JSON codecs (included resources pooled
  first, relationships hydrated from the pool, ids strings in the pool),
  `find`/`fetch`/`find_all`/`where`/`fetch_all`, `save` (POST or a dirty-only
  PATCH, the answer applied, the record pooled), `delete`, `reload`,
  `validate`, datasets (`records`/`loading`/`error`), `has_many`/`has_one`
  with `:id` URL patterns, loading on first read, `load_<name>`/`reload_<name>`
  for code that must wait, and key-value loading state
  (`<name>_loading`/`_loaded`/`_error`) as observable properties, and `Swill::Wire.default` as the fetch boundary. The compiler
  types class objects (`self.class`, `T.class_of`, class methods'
  `self`), awaited values (an async signature names the value), bare
  browser globals (`fetch`), and rescued errors; JSON:API parsing and dirty
  serialization run identically on MRI;
- value transformers (`transform="number"` on a bound element, custom ones
  registered by name); `positive?`, `negative?`, and `zero?` as value
  readers at the end of a binding path.

Before beginning another feature slice, checkpoint the current verified work.

## Toolchain

Consumers get the framework two ways (decided 16 September 2026): `swill.js`
published to a CDN for plain-JavaScript use, and a gem whose `swill` binary
compiles a Ruby application. The binary comes first; gem packaging later.

- `swill build [ENTRY]` compiles the sources an entry file's
  `require_relative` lines name, in that order, against the framework's
  interface, and bundles them into one script reading the framework from the
  page; `--out`, `--minify`, and `--with-framework` (a copy of `swill.js`
  beside the output). `swill watch [ENTRY]` polls the sources and rebuilds.
  `esbuild` is required, as it already is for formatting.
- Open: the gem must carry a built `swill.js` and, ideally, a precomputed
  framework interface; source maps point at generated JavaScript, not Ruby.

- the bar application (`~/Workspace/bar`) has a Ruby frontend under
  `frontend-ruby/` (models, pages, popups, the recipe form), built with
  `bin/drinks frontend:build --ruby` through `swill build`, served with
  `DRINKS_FRONTEND=ruby`, and checked in headless Chrome against a fake
  JSON:API server. Its `PORT.md` classes every markup change as naming,
  framework, or port. Framework changes it forced: `Application#browser`,
  timer and microtask globals, `false` removing a `data-*` attribute, a
  content-chosen first responder standing after a window load, multi-
  statement blocks yielding their last expression, arithmetic typing, and
  the build validating the framework interface it hands an application.

- the gem (20 September 2026): `swill.gemspec` ships the compiler,
  the framework's Ruby, the JavaScript runtime, a prebuilt `swill.js`, the
  handwritten runtime RBI, and the `swill` command, so an application builds
  and typechecks with no checkout of this repository. `swill types` writes
  the Sorbet artifacts beside an application's entry — the framework's RBI,
  the DOM's, the runtime's, the application's own accessors, its declaration
  checks, and a config if none exists — and the bar port typechecks clean
  through it. The framework interface is compiled on demand rather than
  shipped precomputed: 0.16s against a 0.25s build, so precomputing would buy
  nothing and could go stale.

## Immediate Next Slice: Undecided

The gem is packaged and both application checkpoints are answered, so the
next slice is a choice rather than a queue. Candidates, none started:

- publish: Ruby2JS must release the Pragma filter this compiler extends
  before the gem can depend on a published `ruby2js`, and a CDN needs a
  versioned `swill.js`;
- the three designs the Opal port had and this one does not: a typed command
  boundary, `html_attribute`, and `EditableList::Persistence`;
- the questions the bar port raised: short markup aliases for framework
  controllers (`controller="List"`), and whether `@` in a nested controller's
  region should ever reach the page (the port answered with `@parent.`, and
  the strict rule stands);
- the static example's brewery search, deferred to the dataset step and now
  unblocked.

## Ordered Roadmap

### 1. Managed Elements and Outlets (done)

- `klass`, `controller`, and `outlet` awaken; elements with only `bind`,
  `bind-*`, or `data-action` stay inert.
- Controller root views, plain outlet views, and `klass` plus `controller` on
  the same element are supported.
- Outlets connect to their direct owning controller; `application/json`
  outlets decode through `decode_outlet_data`.
- Awakening order, ownership, duplicate and unresolved outlet failures, and
  unload is tested.

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

### 4. Model Vertical Slice (done)

1. validation and dirty tracking (done);
2. identity stores and model type registration (done: `Runtime.identityStore`
   per class, `resource_type` found through `Runtime.classWithSetting`);
3. plain JSON and JSON:API codecs (done; JSON:API parsing and serialization
   are shared MRI examples);
4. observable datasets and the browser wire boundary (done: `Model::Dataset`,
   `Swill::Wire`);
5. create, update, reload, and delete (done);
6. `has_one` and `has_many`, loading state, reload methods, and included-record
   hydration (done; a read starts the load, and `load_<name>`/`reload_<name>`
   are the macro's own methods for code that must await).

Network behavior stays behind `Swill::Wire`, which calls the page's `fetch`;
server persistence, authorization, and transactions do not move into the
browser.

### 5. Templates, Windows, and Restoration

- Awaken template-backed content without activating inert template DOM (done).
- Add named window containers and replaceable content (done).
- Add keyed URL restoration and Back/Forward behavior after bindings and
  controller ownership are reliable (done).
- Preserve one activation path for server-rendered and code-created views
  (done).

### 6. Higher-Level Controllers and Controls

- Port list selection and row ownership first (done).
- Then add sortable lists, editors, inline editing, and detached drafts
  (done).
- Add native text/select controls before custom wrappers (done, including
  the custom select).
- Prefer application-shaped APIs over broad compiler support added only for a
  single implementation technique.

### 7. Application Proof

Use two increasingly demanding proofs:

1. Port the static example to exercise nested controllers, outlets, bindings,
   actions, focus, templates, controls, and unload (done).
2. Port one backend-backed flow covering dataset loading, selection, detached
   editing, persistence, restoration, and a relationship (done, 20 September
   2026). The bar application (`~/Workspace/bar/frontend-ruby`) is that flow
   rather than Giraffic: `frontend-ruby/spec/browser_check.mjs` drives it in
   headless Chrome against fixtures, and `backend_check.mjs` drives it against
   the live API. Giraffic's Ruby is kept at `examples/opal/giraffic/app.rb` if
   a second flow is ever wanted.

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
9. Update `docs/compiler.md` when the supported boundary changes.

## Decision Checkpoints

### UI Kernel Checkpoint (passed, 20 September 2026)

The checkpoint asked whether avoiding the Ruby runtime produced a materially
smaller and simpler system, or merely moved Ruby's complexity into custom
filters. Measured against the Opal port at its final commit, `c142e4f`:

| | Opal | Ruby2JS |
| --- | --- | --- |
| Framework bundle, gzip | 111,747 bytes | 26,365 bytes |
| Framework bundle, minified | 414,654 bytes | 100,464 bytes |
| Framework Ruby authored | 4,789 lines | 4,280 lines |
| Handwritten runtime | none (shipped Opal's) | 1,403 lines JavaScript, 587 Ruby (MRI host) |
| Compiler | none | 4,005 lines, build-time only |

The shipped artifact is a quarter the size for comparable authoring, and the
compiler's cost is paid once at build rather than by every page load. Against
that, 4,005 lines of compiler is real complexity, and the honest reading is
that some of it is Ruby's complexity relocated. The decision was to continue
with Ruby2JS and retire Opal, on the grounds that the relocated complexity is
inspectable, rejects unsupported forms with a file and line, and never reaches
the browser. Three designs that existed only in the Opal port are to be
re-implemented independently rather than translated: a typed command boundary
(`Sig` and `CommandDispatcher`), `html_attribute` for declarative
attribute-to-property mapping, and `EditableList::Persistence` for
save-on-commit.

### Application Checkpoint

The evidence is in as of 20 September 2026: the model slice is complete and the
bar application runs against its real backend in headless Chrome, through
dataset loading, selection, search, sorting, relationship loading on access,
detached editing, persistence, and URL restoration, with no exceptions, console
errors, or framework warnings. The run found one framework defect, recorded
above: a server nil landing in an attribute declared `String`. It found nothing
requiring application-specific lowering, general reflection, runtime source
interpretation, or a duplicated framework protocol, which are the conditions
this checkpoint says should stop or narrow the experiment.

The choice itself remains open. Decide whether to:

- continue toward broader Swill parity; or
- keep Ruby2JS as a constrained client framework for selected applications.

Retaining Opal is no longer an option: that port was retired at the UI Kernel
Checkpoint.

Stop or narrow the experiment if production features repeatedly require
application-specific lowering, general reflection, runtime source
interpretation, or duplicated framework protocols.

## Known Gaps

Recorded so they are fixed deliberately rather than rediscovered:

- JavaScript classes registered with `Swill.register` cannot use
  `name_did_change` hooks: the runtime dispatches hooks from the installed
  method table, which registration fills only from `static actions`. Fix by
  registering hook methods; compiled members are camelCase, so the names
  already match (September 2026).
- Safe navigation (`&.`) is lowered on a receiver whose member the compiler
  resolves statically (20 September 2026): a declared property reads, a
  collected method is called, and each hop guards the next. A core value type
  and an untyped receiver are still rejected, because both lower through
  helpers that take the receiver as an argument, which `?.` cannot guard.
  Two pipeline facts shaped it. A node comparing equal by value to the source
  node is replaced by that original, whose location then decides whether the
  converter renders a call or a property read, so a lowering that changes only
  the location silently loses; wrapping the result keeps it distinct. And
  `?.` answers `undefined` where Ruby answers `nil`, so the result passes
  through `Runtime.nilable`, which is also a node type autoreturn accepts,
  where `:nullish` is not. A DOM receiver keeps plain `?.`: those are
  JavaScript values, and the compiler already types them as such.
- The core value type tables (`filters/core_types.rb`) cover common methods
  and blocks; a method outside them is a build error. Grow the tables as
  real code needs them, each entry with its MRI comparison.
- Methods take positional arguments only (September 2026): optional ones are
  supported and compile to one JavaScript method per arity, named for the
  optionals they take (`add_observer` / `add_observer_with_object`), so the model API is
  still spelled `find(id)`, `where(params)`, `fetch_all(url, params)` rather
  than options hashes. Keyword and rest arguments remain out; so do optionals
  on a static or `ClassMethods` method, a block with an optional, and a
  hand-registered JavaScript class declaring its own wider variants. A leading
  optional cannot carry a runtime signature, because sorbet-runtime refuses to
  wrap one — `T::Sig::WithoutRuntime.sig` types it for Sorbet alone.
- Relationships load on read (September 2026): a relationship nobody
  prefetched starts its request when it is first read, answers what it has,
  and fills in when the request lands, as the TypeScript original did.
  `property_will_access` is the hook; the guard — the record has an id, the
  relationship is neither loaded nor loading, and its last load did not fail —
  is what keeps a re-render from re-requesting. `will_access: false` opts a
  relationship out, and `load_<name>`/`reload_<name>` are how code that must
  await asks. Explicit loads reject after recording an error; automatic reads
  catch and warn. Concurrent callers share one request. Watch for a computed
  property that reads a relationship and is recomputed by that relationship's
  arrival.
- `await` is a command call: `T.cast(await x, Type)` parses as
  `await(x, Type)` and is rejected for the extra argument. Await into a
  local first (September 2026).
- A document's nil for an attribute whose declaration does not admit nil is
  an absent value, not a value (20 September 2026): `apply_attributes` leaves
  the declared default, so a reader the compiler types `String` really holds a
  String. `T.nilable` and `T.untyped` attributes keep the nil, which is what
  declaring them nilable asks for. Decided when the live Drinks API sent
  `"description": null` for an attribute declared `String` and a computed
  property calling `downcase` on it threw; the alternative, refusing, would
  break a page over one column. Values of the wrong non-nil type are still
  stored as given: there is no runtime type check beyond nil.
- Writing a property costs far more than reading one (22 September 2026):
  217 ns with **no observers at all**, against 11.7 ns for an ordinary getter
  and 45.8 ns for `Runtime.invoke`. Adding an observer is nearly free on top
  (+10 ns), so the cost is in `writeProperty` itself — the coerce hook, the
  equality check, the will-change hook, the state map write, and the empty
  notification loops — not in delivery. Nothing depends on this being slow;
  it simply has not been looked at. Measured with `rake benchmark`, which
  gained binding and path-observation cases the same day. Worth a pass before
  any workload writes properties in bulk.
- A binding resolves its property descriptor on every write, though its target
  never changes (22 September 2026): `Runtime.write` looks the descriptor up by
  Ruby name on each call, because the accessor is installed under the compiled
  name (`represented_object` reads back as `representedObject`), so the name
  has to be translated. A binding is established once, so the lookup could be
  done then and the descriptor kept — `pathWriter` already answers a resolved
  `{owner, descriptor}` pair, and `writeProperty` takes it directly. Deferred
  deliberately; it belongs with the property-write pass above rather than with
  the binding refactor. Note that writing `target[key] = value` to skip the
  translation is not the shortcut it looks like: it lands in an expando beside
  the real accessor, firing no observers and raising nothing.
- A module is not reachable through `Runtime.resolve` (22 September 2026): a
  class registers under `meta.classes` and resolves by name, but a module
  registers under `meta.mixins` and does not, so `Runtime.resolve("Swill::
  Connections::Bindings")` raises `Unknown class`. Nothing but the exported
  identifier (`Swill__Connections__Bindings`) reaches it, which is private
  browser API — so a plain-JavaScript application cannot reach a framework
  module at all, and the specs and benchmark had to use that identifier when
  the connection readers became modules. Modules should resolve like classes;
  the fix is presumably registering mixins in the same table, or falling back
  to the mixin table when a name misses.
- A Hash value type accepts a narrower set than an Array element type
  (22 September 2026): `T::Array[T.proc.void]` is recognised and its `each`
  lowers normally, but `T::Hash[Symbol, T.proc.void]` is not recognised at all —
  the receiver leaves the typed path and is treated as untyped, so `each` is
  rejected with "block call each on an untyped receiver" and `values` lowers to
  `Runtime.read(hash, "values")`, which is the key-value-coding read and answers
  undefined. Found declaring the object-binding registry, which holds procs by
  target; it is declared `T::Hash[Symbol, T.untyped]` because that is the most
  precise type the compiler currently models, which is less than the code knows.
  Likely a one-place widening in the Hash type recognition rather than a
  decision, since Array already allows it.

## Explicitly Deferred

- general Ruby module semantics and arbitrary `included` hooks;
- `prepend`, runtime class mutation, metaprogramming, and mutable declaration
  defaults;
- a browser `sorbet-runtime`; `T` operations beyond the compiled set (unions,
  procs, `T::Struct`, `T::Enum`);
- arbitrary ActiveSupport compatibility;
- server ORM behavior, transactions, and authorization;
- publishing an npm package or introducing a client package toolchain.
