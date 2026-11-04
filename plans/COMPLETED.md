# Completed

This is a concise record of finished plan milestones. Current behavior belongs
in the guides under [`doc/`](../doc/); the original plans remain in git history.

## Ruby2JS port (September 2026)

- The Ruby-authored framework, finite Ruby2JS compiler, JavaScript runtime,
  generated types, and separate framework/application bundles reached the
  planned UI-kernel checkpoint. The compiler rejects unsupported syntax at
  build time. See the [compiler guide](../doc/compiler.md).
- Managed elements and outlets, bindings, responder/focus behavior, models,
  templates, windows, restoration, lists, editors, and controls completed the
  seven-step port roadmap. The static example and Bar's backend-backed Ruby
  frontend supplied application proofs. See the [awakening](../doc/awakening.md),
  [responders](../doc/responders.md), and [collections](../doc/collections.md)
  guides.
- Gem packaging, `swill build`, `swill watch`, `swill types`, Ruby/JavaScript
  bundles, source maps, and the first Sorbet/DOM interfaces were delivered.
  Keyword, rest, and block parameters were subsequently added to the compiler;
  the port plan's positional-only limitation is obsolete.

## Data layer (September 2026)

- The first distant-data slice delivered explicit client schemas, Sorbet-like
  declarations, generated Ruby and RBI files, privacy-aware remote operations,
  canonical partial objects, batched hydration, persistence, and MessagePack
  WebSocket transport with a schema handshake. See [server data](../doc/server_data.md).
- Associations gained reflected cardinality, stable read-only collections,
  loading/error/stale state, and explicit effects that refresh or invalidate
  related objects. `CollectionArrangement` and optional `ArrayController`
  separate local arrangement and selection from server-owned membership. See
  [collections](../doc/collections.md).
- `arranged_objects` replaced the accidental `arranged_content` public split;
  Ruby reads, bindings, observations, and List hooks now use one observable
  property. The remaining Cocoa alignment work stays in
  [the audit](COCOA_API_AUDIT.md).
- A targeted Movies regression fix now locates a row in the current arrangement
  after a failed save and checks the editing generation and view lifetime
  before restoring selection or the editor. The wider interaction review is
  now complete, as recorded below.

## Context editing, query refresh, and application review (October 2026)

- Default/shared and isolated child contexts replace distant drafts. Inline
  edits use the shared model; popups accept into the parent before persisting.
  Dirty baselines, scoped cancellation, and failed-save recovery retain edits.
  Multi-record transactions, broader undo, and uncertain-write reconciliation
  remain explicitly deferred in [the data plan](DATA_PLAN.md).
- A stable ArrayController owns repeatable `fetch` operations and observable
  loading/error/stale state. Latest-request ordering and editor registration
  protect displayed membership; Movies explicitly refreshes after mutations
  and compatible reconnects. Awaiting blocks compile without runtime additions.
- Movies' isolated PostgreSQL/Falcon/Chrome test verifies actual create, inline
  and popup saves, cancellation, deletion, filtering, identity selection, and
  keyboard navigation. The runner builds assets and cleans up its database.
- Ownership review fixed ArrayController binding cleanup and late popup
  hydration after context release. Shared association controllers survive
  individual views and temporary transport loss, and retire on context reset.
  Framework, Sorbet, optimized bundles, browser fixtures, and Movies checks pass.
- Selection now clears when filtering or published results remove its object;
  reappearance does not revive it. Explicit id/URL restoration waits until
  matched or cancelled, then becomes ordinary selection. Loading and deferred
  editor results preserve selection until publication.
- Local arrangement and fetch-bookkeeping measurements are recorded in the
  data plan. Representative Movies profiling now covers ordinary/overlapping
  search, hydration, saves/refresh, and rapid typing using a disposable copy of
  the real collection. Movies now schedules one running search and the newest
  pending criteria in its Ruby results controller, preserving generic `fetch`.
  Same-run profiling reduced median trailing latency from 618 to 285 ms and
  median requests from nine to seven; REST remained faster at 168 ms. Lifecycle,
  retry/reconnect, deferred editing, and reentrant observers have focused checks.
  Exchange optimizations and subscriptions remain deferred.
- The server now admits two concurrent queries per connection, with commands,
  writes, resolvers, and hydration as barriers. Query declarations promise safe
  read overlap, including projected readers. Sequel uses fiber-owned checkouts;
  response writes are serialized and invocation effects/privacy caches stay
  separate. Movies' compiled scheduler uses two slots and newest-pending input.
  Real WebSocket/SQL tests cover out-of-order completion and read-after-write;
  failure/teardown tests cover socket writes and PostgreSQL checkout reuse.
- Save/refresh tracing found no redundant scalar-update read: Ruby executes two
  SELECTs and one UPDATE plus BEGIN/COMMIT; REST executes two SELECTs and one
  UPDATE. Keep transaction, model, and membership-refresh semantics. The profiler
  now reports statement sequences and separate read/write/transaction counts;
  the data plan records measurements and the decision to retain the save path.

## Developer experience (October 2026)

- `swill dev` builds, serves and rebuilds a project by watch category
  (client, resources, schema, server, `assets` entries), restarts the server
  when it must, and publishes revisions the page's development monitor
  offers to reload. `swill new NAME [--data]` writes a runnable application
  with a `config.ru` on `Swill::Server`. Movies replaced its own watcher,
  supervisor and build scripts with a `swill.yml`. See
  [getting started](../doc/getting_started.md).
- The gem no longer requires Sequel. `Swill::Server` composes the bundles,
  pages, data endpoint and development middleware, or mounts them as parts;
  page helpers write the head. `Swill::Distant.database` lets `swill data`
  generate without a database from the last `schema.json`, so no model lists
  its columns, and generated proxies carry enum members as `<FIELD>_VALUES`.
  See [serving](../doc/serving.md) and [server data](../doc/server_data.md).
- Plain JavaScript reaches every method of a registered class, runs
  `xDidChange` hooks, restores `static restorable` properties, and spells
  framework classes and properties as JavaScript does, all at registration so
  compiled Ruby pays nothing. `Swill.registerBundle` and `swill manifest` give
  a page without a build its own resources; `start` loads its templates
  first. The docs navigator was rewritten as the complete example. See
  [getting started in JavaScript](../doc/javascript_getting_started.md).
- `rake release` writes the release zip and `.github/workflows/release.yml`
  publishes it on a `v*` tag; jsDelivr serves `rb/dist` at the tag. The legacy
  TypeScript tooling moved under `ts/`.
- Along the way: focus given before launch makes its responder first; a taken
  key command prevents the browser's default; a key that moves the keyboard
  reveals an element out of sight; `SortableList` marks its sorted header for
  the themes, so markup carries neither `tabindex` nor ARIA;
  backwards-compatibility shims and the Opal examples were removed.

## Documentation site (September 2026)

- The custom RDoc generator, class pages, Ruby/JavaScript spellings, navigator,
  runtime JSDoc pages, guides, strict build, browser checks, and coverage
  ratchet were delivered. Ongoing coverage and editorial work stays in
  [the documentation plan](DOCS_PLAN.md).
