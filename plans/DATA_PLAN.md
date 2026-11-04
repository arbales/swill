# Swill data layer plan

The first data slice and association/collection-controller milestone are
implemented; see [Completed](COMPLETED.md). Context-managed editing and explicit
query refresh, application review, and replaceable-search scheduling are complete.
Bounded concurrent reads are also implemented below. This file tracks their
results and follow-ups. [Data design](DATA_DESIGN.md)
records architectural rationale; [data exchange design](DATA_EXCHANGE_DESIGN.md)
explores later optimizations. Current APIs are documented in
[server data](../doc/server_data.md), [models](../doc/models.md), and
[collections](../doc/collections.md).

## Completed prerequisite: context-managed editing

Implemented a default shared context and isolated child contexts in place of
distant drafts.
Child save accepts changes into its parent before parent save persists them.
Inline editing uses the shared model; popup editing uses a child. Baselines,
submitted versions, and scoped cancellation preserve edits after failed saves.
Keep this machinery in Ruby and use the existing problem reporter.

First-slice limits are deliberate and reported, not silently resolved:

- Reject context saves with multiple changed records before applying anything.
  Atomic multi-record persistence needs a later server protocol operation.
- Refuse overlapping child/parent edits and preserve both states. Retain incoming
  server values beneath dirty local values; report conflicts and block saving.
  Client generations do not detect unseen concurrent server writes.
- Refuse scoped cancellation that would overwrite subsequent changes.
- A lost write response is uncertain. Preserve edits and block blind replay or
  rollback; request identity/reconciliation and durable offline recovery are later work.
- Isolated contexts currently edit saved records and scalar fields. Stage creates,
  deletes, relationship mutations, and general undo/redo in a later milestone.

Verified Movies inline cancellation and popup isolation/failed-save acceptance
in headless Chrome with database writes blocked. Framework checks include MRI,
Sorbet, compiler, runtime, real WebSocket integration, and browser fixtures;
Movies form tests cover acceptance, persistence, failure and retry.

Measured medians on this machine (non-gating; timings vary):

| Operation | Before | Contexts |
| --- | ---: | ---: |
| Canonical lookup | 75 ns | 74 ns |
| Three-field patch | 1.48 µs | 1.48 µs |
| Decode 50 overlapping references | 23.4 µs | 21.2 µs |
| Edit and restore one field | 4.47 µs | 7.24 µs |
| Open/discard isolated editor, three fields | 35.6 µs (draft) | 50.4 µs |
| Replace/arrange 1,000 sorted rows | 170 µs | 166 µs |
| Fresh bundle evaluation | 1.49 ms | 1.68 ms |

Change tracking and context lifecycle add measurable editing cost; steady-state
lookup, patching and arrangement remain similar. `benchmark/editing.mjs` accepts
a saved bundle path to compare implementations. Relationships materialize on
access, avoiding an eager copy of the loaded graph when a form opens.

Keep the reported limits as follow-up work. Query freshness is implemented below.

## Completed: bounded concurrent reads

Each WebSocket now runs up to two `QUERY` operations concurrently after its
handshake. The existing `query` declaration is the read contract; methods and
their projected field/association readers must be safe to overlap. Commands,
writes, resolvers, and hydration remain barriers: earlier queries finish before
the operation starts, and later queries wait for it to complete. One connection
identity is retained; reply writes are serialized and invocation effects/privacy
caches stay separate. Sequel fiber ownership prevents concurrent operations from
sharing a pool checkout. There is no database lease for the life of the socket.

Movies' compiled results controller uses two active search slots and only the
newest waiting criteria. Generic `fetch` is unchanged. New input does not cancel
submitted SQL. Earlier replies cannot replace newer membership or field values;
dirty fields retain their context protections. Generations remain client ordering,
not database revisions or cross-client consistency.

The final same-run production comparison measured 152/185 ms median/p95 trailing
latency with nine queries, versus the one-slot client's 202/252 ms with eight
queries and REST's 168/188 ms with nine. All 120 measured sequences succeeded,
with no connection-sharing violations. Production stayed within two outstanding
requests and two executing queries. See [the production measurements](../../movies/benchmark/RESULTS_TWO_READS.md).
The [earlier experiment](../../movies/benchmark/RESULTS_CONCURRENT.md) also showed
that admitting every keystroke can accumulate a server backlog when reads slow
down, and changing only the server does not help a single-slot client.

The experimental server override has been removed. Tests now cover admission,
out-of-order completion, mutation barriers, effects/privacy cache isolation,
serialized writes, failed socket writes, handshake rejection, and disconnect
cleanup. Real WebSocket/SQL integration verifies a later query observes a committed
update. PostgreSQL checks verify distinct transaction connections and reuse of
all pool checkouts after stopping a SQL read. Movies retains its editing,
reconnect, invalidation, and disposal coverage, and its persistence browser check
passes. Per-connection admission and the database pool bound concurrency; broader
multi-client fairness/load tuning remains follow-up work.

## Completed: save and refresh round-trip review

Statement tracing confirms no redundant read in the measured scalar-update path.
Ruby save plus refresh executes BEGIN, SELECT, UPDATE, COMMIT, SELECT; REST save
executes SELECT, UPDATE, SELECT. Both have two reads and one write. The difference
in total statement count is transaction control, not extra data queries. Ruby's
acknowledgement reads the post-save model without SQL, and its final SELECT
refreshes query membership. REST instead reloads the saved row. Child-context
acceptance is local and does not duplicate persistence.

Thirty measured samples per save path, after five warm-ups, yielded 634/717 ms
median/p95 for Ruby inline save plus refresh, 633/866 ms for popup save plus
refresh, and 400/650 ms for REST save. Median combined BEGIN/COMMIT time was
217 ms for inline saves. All 481 measured scenarios completed without failures,
browser errors, or shared connection use. See [the save review](../../movies/benchmark/RESULTS_SAVE_REVIEW.md).

Keep persistence unchanged: the initial read supports model authorization and
hooks, the transaction preserves rollback, and membership refresh establishes
the query's new result. There is no demonstrated redundant read worth removing.
The profiler now separates reads, writes, and transaction statements without
logging SQL text or values. These are review results, not a claimed speedup.

## Next: identity, availability, graph, and client compatibility

The measured performance review is complete. Review the client/server contracts
in this order, treating independently released iOS and static clients as a
constraint from the start:

1. Object identity, field availability, membership, and freshness: what a client
   knows and what a server response promises.
2. The object-graph contract and its boundary with transport: references, partial
   patches, relationships, typed values, and operations across client languages.
3. Cross-version support: stable public names, supported client contracts,
   compatible schema evolution, and explicit upgrade-required outcomes.

The [schema versioning plan of record](DATA_EXCHANGE_DESIGN.md#plan-of-record-schema-versions-and-compatibility)
is accepted direction, not yet implemented: singular `field` declarations add
optional units, ranges, and enumerated values; immutable named snapshots in
`schema/versions/` declare supported versions alongside the current interface.
`version` blocks adapt each snapshot directly to current models using
`to_version` / `to_current`, with types derived from both interfaces.
Deterministic checks compare input acceptance and output guarantees, including
constraints; adapter tests cover behavior the checker cannot prove.

The exchange design also records the graph proposal and an older-client example.
Authorization/validation ordering, partial updates, adapter verification, and
handshake negotiation remain unresolved. No wire format or runtime implementation
is approved by this documentation milestone.
Connection state, recovery, and delivery caching follow from these contracts;
they do not need separate implementation milestones first. Context-managed
creation remains deferred.

Keep exchange caching and subscriptions deferred. Consider sharing the search
scheduler only when a second concrete consumer establishes the needed API.

## Completed: replaceable-search scheduling

Movies' Ruby `MovieResults` now owns up to two running searches and only the newest
pending criteria. `search(text, unwatched:)` supplies criteria; `refresh` repeats
the latest criteria after a save, deletion, retry, or compatible reconnect.

- Replaced waiting calls resolve false when a running read settles. New input retires
  obsolete membership immediately; loading remains true across queued inputs.
  Superseded failures stay quiet; current failures remain observable and retryable.
- Invalidation, temporary first placement, and disposal retire queued work.
  Disconnect pauses it; reconnect uses the latest remembered criteria. Actor
  reset forgets prior criteria, and schema incompatibility prevents replay.
- Successful membership still waits for active editors. Contexts continue to
  merge model fields independently of the displayed membership.
- An internal ArrayController helper retires membership without ending loading.
  Generic `fetch` still runs every call. The scheduler does not replay writes or
  cancel SQL already submitted; row views contain no scheduling machinery.

The compiled implementation has focused checks for lifecycle, reentrant
observers, retry/reconnect, refresh criteria, editing, and selection. All 21
Movies unit tests pass, as do framework, Sorbet, optimized-bundle, and browser
checks. Movies' isolated persistence browser check also passes creation, popup
and inline saves, deferred refresh, deletion, filtering, and keyboard navigation.

In the original single-read run against a disposable copy of 135 movies, median rapid-search
requests fell from nine to seven. Final-input-to-settled latency fell from
618/1,153 ms median/p95 for unscheduled Ruby to 285/350 ms; same-run REST measured
168/204 ms with nine queries. All 90 measured sequences completed with the
expected result and no browser errors. See [the scheduling measurements](../../movies/benchmark/RESULTS_SCHEDULED.md)
for methodology and limits. REST remains faster in this workload.

## Completed: real search workload measurements

Movies' first benchmark run copied the then-current 134-movie collection into a
disposable database. It measures overlapping searches, popup hydration, saves
and membership refresh, and rapid input against the REST frontend. Five warm-up
rounds precede 30 measured rounds; no original movie records are changed.
See [the full measurements](../../movies/benchmark/RESULTS_CURRENT.md) for
instrumentation boundaries, reproduction, and distributions.

- Ordinary warm searches use one query and have broadly similar settled latency.
  For 50 rows, Ruby's model merge/render medians are 5.4/6.6 ms; REST's are
  1.3/3.3 ms, with different field coverage and UI/model behavior.
- Repeated 50-row results resend 550 unchanged fields, but the payload is only
  about 11 KB. Delivery tracking could reduce bandwidth and merge work; it does
  not eliminate the SQL query or resolve freshness/authorization semantics.
- PostgreSQL execution medians are 0.6–1.3 ms, versus application round trips of
  106–123 ms in this environment. Database locality materially affects results.
- A profiler-only newest-pending experiment reduced rapid-search trailing
  latency from 386/819 ms median/p95 to 187/304 ms, and median SQL operations
  from nine to seven. The same-run REST result was 167/284 ms with nine queries.
  No failures or browser errors were recorded. This experiment informed the
  compiled implementation and same-run comparison recorded above.
- Ruby saves plus refresh use five SQL operations versus REST's three without
  refresh. Any later optimization must preserve transaction and freshness semantics.

Connection-local delivery tracking and reference-only responses remain
exploratory; subscriptions, server revisions, and offline synchronization are
not prerequisites for the next step.

## Completed: application interaction and ownership review

The current API keeps query membership in a stable ArrayController, model edits
in contexts, and focus/keyboard behavior in the list's responder chain. Direct
list binding and including CollectionArrangement on a view controller remain
supported; the standalone controller is optional.

Movies now has a repeatable persistence check:
`bundle exec ruby spec/run_movie_browser.rb` in the Movies checkout builds the
assets, creates/migrates/seeds a disposable PostgreSQL database, starts its own
Falcon and Chrome, and cleans them up afterward. It uses the configured server
and requires database-creation permission; the normal app server is not used.
The browser check verifies new-form bindings and first placement, popup isolation
and persistence, inline Enter/Escape, deferred results during edits, selection
when a row disappears/returns, Tab/arrows, segmented filtering, notes display,
and cancellation/confirmation of deletion. It checks the seed records remain
unchanged and the created record is gone.

The review fixed programmatic bindings surviving ArrayController release,
late child-context hydration reporting a spurious released-scope warning after
a popup closed, and Movies' invalid status-message expression when a toolbar
action is refused during inline editing. Tests cover successful and failed late
hydration, observation teardown, context reset, and retired fetch completion.
Temporary transport loss preserves shared association controllers; context reset
releases them. Full framework, Sorbet, optimized-bundle, browser, and Movies
checks pass. See [Completed](COMPLETED.md).

## 2. Implemented: query-result freshness and explicit refresh

A stable ArrayController now owns fetching and displayed
membership. Bind it immediately; direct awaited model queries remain supported.

```ruby
movies.fetch do
  await Movie.search(search_text, unwatched: unwatched)
end
movies.fetch # Retry or refresh with the last block.
```

- `fetch` remembers its block, exposes `loading`, `loaded`, `stale`, and `error`,
  and keeps prior content during loading/failure. It returns true for a current
  successful result, false for failure or supersession; missing blocks and use
  after disposal are programming errors. Errors remain observable as messages.
- A successful result supplies membership/order and the fields its query
  promises. Partial model hydration remains independent; completion is not a
  global freshness guarantee. Contexts merge fields and preserve dirty values.
- Only the latest request may publish membership or alter fetch state. New
  requests discard deferred older results. Generations are client ordering,
  not server revisions.
- While editors are registered, keep the arranged rows and defer replacing
  content. Publish the latest successful result when the last editor finishes;
  `loading` is false but `stale` remains true until publication. Fetch success
  therefore need not mean the display has changed yet.
- `invalidate` marks stale and retires pending requests/results without fetching.
  `show_first` retires an in-flight fetch before placing/selecting the new row;
  later fetching or sorting clears the temporary placement as before.
- Preserve selection by shared object identity using existing arrangement rules.
  Publishing membership that excludes an object clears its selection and saved
  id; returning it later does not reselect it. Explicit `selected_object_id`
  restoration waits for its record, then becomes ordinary selection. Loading,
  failure, and deferred publication retain the currently displayed selection.
- Movies owns one results controller. Search changes schedule the latest criteria;
  successful inline/popup saves and deletion call `refresh`. Disconnect
  invalidates results; compatible reconnect repeats the latest query. Reload-required
  connections invalidate without replay. Observations end with the controller.
- Keep the generic ArrayController independent of Distant transport. REST or
  local callers can supply arrays or collections. No inferred query dependencies,
  automatic subscriptions, or protocol changes in this slice.

Validation:

- Framework suite and Sorbet pass, including 154 runtime tests, compiler/MRI
  checks, data transport/client tests, and real WebSocket integration.
- Both browser fixtures and the 16 optimized-bundle checks pass. Movies builds
  successfully and its ten form/results tests cover retry/reconnect ownership,
  filters, temporary placement, and disposal.
- Live Movies browser checks cover overlapping `star`/`star trek`/`star wars`
  searches, stable controller identity, selection across sorting, deferred
  membership during inline editing, cancellation, refresh after acceptance,
  temporary first placement, and responder focus. Persistence was stubbed in
  this check; no database records were created, edited, or deleted.
- Independent collection tests share model identities while retaining separate
  membership/selection; late success/failure, invalidation, deferred results,
  reentrant observers, and teardown are covered. The Ruby async-block example
  compiles and executes; ordinary callbacks still reject `await`.

Local medians, excluding network/model decoding: `benchmark/fetch.mjs` measured
50-row assignment plus arrangement at 10.12 µs and repeat fetch plus arrangement
at 10.83 µs (about 0.71 µs bookkeeping). The 1,000-row replacement/arrangement
benchmark measured 159 µs, versus the prior 166 µs; these are non-gating local
measurements, not an end-to-end latency claim.

Actual persistence and keyboard interaction are now verified in the isolated
Movies review above. Server subscriptions, dependency tracking, revisions, and
automatic freshness inference remain deferred.

## Deferred follow-ups

- **Context-managed creation.** Give New Movie the isolated-context lifecycle
  used by existing-record editors: create locally, discard on cancel, accept
  into the parent before persistence, and preserve identity and retryable edits
  after failure. Revisit later, followed by staged deletion and relationship
  editing; this is not the next milestone.
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
HTTP transport, automatic cross-model mutation
capture, and distributed change sources remain deferred. Typeahead completion
is a separate control/application topic.

For each milestone, run checks appropriate to changed behavior: deterministic
schema generation, compiler and Sorbet checks, MRI/runtime parity, generated
bundles, real WebSocket integration, and affected browser interactions. Keep
coverage for privacy/nils, partial hydration, canonical identity,
transactions, invalid results, deletion, out-of-order responses, actor-scope
resets, and observer teardown. Extend benchmarks when a hot path changes.
