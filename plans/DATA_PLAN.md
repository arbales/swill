# Swill data layer plan

The first data slice and association/collection-controller milestone are
implemented; see [Completed](COMPLETED.md). This file tracks the remaining
application review and the next refresh milestone. [Data design](DATA_DESIGN.md)
records architectural rationale; [data exchange design](DATA_EXCHANGE_DESIGN.md)
explores later optimizations. Current APIs are documented in
[server data](../doc/server_data.md), [models](../doc/models.md), and
[collections](../doc/collections.md).

## 1. Review the implemented behavior in applications

- Compare the [collection examples](../doc/collections.md):
  direct table binding, a shared association controller, independent views,
  and a view controller including the arrangement module.
- Finish live Movies checks for sorting/filtering, selection, keyboard focus,
  inline editing, and creating a movie at the top of the visible list. Verify
  what happens when a selected or edited row leaves the arrangement.
- Review lifecycle behavior: replacing content releases obsolete dependencies;
  unloading a view releases observations; model-cached controllers survive
  individual views and are released when their model resets or disconnects.
- Retain measured performance tradeoffs beside the examples. Cached
  arrangement avoids repeated sorting; selection writes add a small cost.
  Rerun relevant checks if the review changes implementation.

The targeted failed-save/editor-generation regression is complete and recorded
in [Completed](COMPLETED.md). It does not complete this wider interaction
review. Finish when the reviewed API and live example agree and required checks
pass.

## 2. Define query-result freshness and explicit refresh

Association invalidation already names an owner and association. An arbitrary
query has arguments, filtering, ordering, limits, and privacy scope; patching
one object does not establish current membership or order. Work through Movies
searches and overlapping mailing lists before choosing a public API or changing
the protocol.

- Define what a completed query promises about membership, preloaded fields,
  availability, and freshness.
- Decide how consumers rerun a query: whether a result retains its operation
  and arguments, refresh preserves the collection object, and changing
  arguments replaces the active query.
- Specify loading, stale, error, and retry behavior. Decide whether old rows
  remain visible during refresh and after failure.
- Specify how application-declared mutation effects cause query refresh.
  Do not infer arbitrary dataset dependencies or treat local filtering as
  authoritative server membership.
- Define ordering for overlapping refreshes and rapidly changing search
  text. An older result must not replace the active search or clear newer
  stale state. Client generations order responses; they are not server
  revisions or proof of global freshness.
- Define interactions with dirty fields, drafts, deletion, selection, active
  row editing, and temporary `show_first` placement. Server-returned order
  and local arrangement have separate owners.
- Specify same-actor reconnect behavior so visible results regain freshness
  after changes made while disconnected. Preserve the reset when actor scope
  changes.

Produce concrete Ruby/binding examples and a testable contract first, then
implement the agreed slice. A generic query-refresh API and automatic query
membership invalidation are not implemented yet.

Acceptance scenarios: search for `star`, then `star trek` or `star wars` with
responses arriving out of order; edit a movie into or out of a query or its
server order; refresh overlapping mailing lists after a shared-member or
membership change; fail and retry refresh; delete a selected record; refresh
while editing; reconnect after an out-of-band change. Only the active search
controls visible membership, and canonical object identity survives refresh.

Complete when consumers can intentionally refresh a result with clear
availability, failure, ordering, and selection semantics, without requiring
subscriptions or a presentation controller.

## Deferred follow-ups

- **JavaScript-side visibility.** MRI enforces `private` and `protected`, but
  emitted methods remain reachable through browser dispatch. Choose between
  native private methods where dynamic access is unnecessary and runtime
  dispatch that refuses private names. Coordinate with action targeting in
  [the framework plan](FRAMEWORK_PLAN.md).
- **Model convergence.** `Resource` and `Distant::Object` share `Base` and
  `Editable`, but declare loading state and pool identities separately.
  Evaluate a shared declaration on `Editable` and a common identity-pool
  protocol only after reviewing the two strategy boundaries in real apps.
- **Exchange optimization.** Connection-local delivery tracking,
  reference-only responses, revision schemes, and patch coalescing remain
  exploratory. Measure server work, latency, payload size, client cost, and
  bounded connection memory before adopting them. See
  [data exchange design](DATA_EXCHANGE_DESIGN.md).

Subscriptions, offline synchronization, arbitrary remote query composition,
HTTP transport, optimistic persistence, automatic cross-model mutation
capture, and distributed change sources remain deferred. Typeahead completion
is a separate control/application topic.

For each milestone, run checks appropriate to changed behavior: deterministic
schema generation, compiler and Sorbet checks, MRI/runtime parity, generated
bundles, real WebSocket integration, and affected browser interactions. Keep
coverage for privacy/nils, partial hydration, canonical identity,
transactions, invalid results, deletion, out-of-order responses, actor-scope
resets, and observer teardown. Extend benchmarks when a hot path changes.
