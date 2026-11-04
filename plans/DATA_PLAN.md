# Swill data layer plan

Context-managed editing, explicit query refresh, application review, and bounded
concurrent reads are implemented. [Completed](COMPLETED.md#context-editing-query-refresh-and-application-review-october-2026)
owns the milestone record and measurements. Current contracts belong in
[models](../doc/models.md), [collections](../doc/collections.md), and
[server data](../doc/server_data.md); [data design](DATA_DESIGN.md) explains the
original boundaries.

## Next: graph and client compatibility

Review the client/server contracts with independently released iOS and static
clients as a constraint:

1. Object identity, field availability, membership, and freshness: what a client
   knows and what a server response promises.
2. The object-graph contract and its boundary with transport: references, partial
   patches, relationships, typed values, and operations across client languages.
3. Cross-version support: stable public names, supported client contracts,
   compatible schema evolution, and explicit upgrade-required outcomes.

The [exchange design](DATA_EXCHANGE_DESIGN.md#plan-of-record-schema-versions-and-compatibility)
owns the accepted schema-versioning API and its unresolved implementation
questions. Resolve authorization/validation ordering, partial updates, adapter
verification, snapshot immutability checks, and hash negotiation there before
implementation. Include an old/new client/server matrix and language-independent
graph examples.

The runtime still requires an exact schema match. Accepting the versioning
direction does not approve a new wire format or relax that handshake.
Connection recovery and delivery caching follow from the graph/compatibility
contracts; they are not prerequisites for this review.

## Deferred follow-ups

- **Editing and recovery.** Atomic multi-record saves, conflict-resolution UI,
  general undo/redo, and request identity/reconciliation for uncertain writes.
  Preserve today's explicit refusals until those contracts exist; client request
  generations do not detect unseen concurrent server writes.
- **Context-managed creation.** Give New Movie the isolated-context lifecycle
  used by existing-record editors: create locally, discard on cancel, accept
  into the parent before persistence, and preserve identity and retryable edits
  after failure. Revisit later, followed by staged deletion and relationship
  editing; this is not the next milestone.
- **Model convergence.** `Resource` and `Distant::Object` share `Base` and
  `Editable`, but declare loading state and pool identities separately.
  Evaluate a shared declaration on `Editable` and a common identity-pool
  protocol only after reviewing the two strategy boundaries in real apps.
- **Exchange optimization.** Connection-local delivery tracking,
  reference-only responses, revision schemes, and patch coalescing remain
  exploratory. Measure server work, latency, payload size, client cost, and
  bounded connection memory before adopting them. See
  [data exchange design](DATA_EXCHANGE_DESIGN.md).
- **Search scheduling and load.** Share Movies' scheduler only after a second
  concrete consumer establishes the API. Per-connection admission and the
  database pool bound concurrency today; multi-client fairness/load tuning
  remains unreviewed.

Subscriptions, offline synchronization, arbitrary remote query composition,
HTTP transport, automatic cross-model mutation capture, and distributed change
sources remain deferred. Typeahead completion is a separate control/application
topic. JavaScript dispatch visibility belongs in [the framework plan](FRAMEWORK_PLAN.md).

## Validation

For each milestone, run checks appropriate to changed behavior: deterministic
schema generation, compiler and Sorbet checks, MRI/runtime parity, generated
bundles, real WebSocket integration, and affected browser interactions. Keep
coverage for privacy/nils, partial hydration, canonical identity,
transactions, invalid results, deletion, out-of-order responses, actor-scope
resets, and observer teardown. Extend benchmarks when a hot path changes.

Movies' `bundle exec ruby spec/run_movie_browser.rb` builds assets and uses its
own disposable PostgreSQL database, Falcon, and Chrome. It requires database
creation permission and cleans up afterward; it does not use the normal app
server. Benchmark reproduction and instrumentation boundaries belong in
[Movies' benchmark guide](../../movies/benchmark/README.md).
