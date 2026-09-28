# Swill Data Layer Implementation Plan

This file tracks implementation status and the next work in order.
[DATA_DESIGN.md](DATA_DESIGN.md) records the architectural rationale;
[DATA_EXCHANGE_DESIGN.md](DATA_EXCHANGE_DESIGN.md) explores later exchange
optimizations. Neither an exploratory API spelling nor an older design example
is an implemented guarantee. Current usage is documented in
[server data](doc/server_data.md) and the
[collections guide](doc/collections.md).

## Current checkpoint

The first data slice and the association/collection-controller milestone are
implemented and committed. The immediate focus is validating and refining
that behavior in real applications.

| Area | Implemented behavior |
| --- | --- |
| Schema and tooling | Explicit client schemas, Sorbet-compatible types, deterministic generation/checking, generated Ruby and RBI files |
| Remote operations | Dataset queries, class resolvers, instance/class commands, typed value results, explicit `await` |
| Object lifecycle | Canonical partial objects, batched hydration, generic persistence, detached drafts, deletion tombstones |
| Associations | Sequel association names, reflected cardinality, stable read-only association collections, loading/error/freshness state |
| Mutation effects | Explicit refreshes and association invalidations for related objects; generation ordering and demand-driven refresh |
| Presentation | Ruby `CollectionArrangement`, optional `ArrayController`, ordinary List binding, lazy association `_controller` accessors |
| Transport | MessagePack over WebSockets, schema handshake, actor-scope reset; current protocol version **2** |

The generated-client fixture exercises the real Falcon WebSocket boundary.
Compiler, MRI parity, runtime, data-client, and normal/minified bundle checks
have passed for the milestone. Movies has been rebuilt; its schema handshake
and live search have also been verified after the JSON/Sequel compatibility
fix. Those checks do not replace the remaining interaction review below.

## Next steps

### 1. Review and refine the implemented data layer

- Review the [before/after examples](doc/collection_controller_examples.md):
  direct table binding, a shared association controller, independent views,
  and a view controller including the arrangement module.
- Finish live Movies checks for sorting/filtering, selection, keyboard focus,
  inline editing, and creating a movie at the top of the visible list.
  Verify behavior when a selected or edited row leaves the arrangement.
- Review lifecycle behavior: replacing content releases obsolete dependencies;
  unloading a view releases its observations; model-cached controllers survive
  individual views and are released when their model resets or disconnects.
- Retain the measured performance tradeoffs alongside the examples. Cached
  arrangement avoids repeated sorting; selection writes have a small added
  cost. Rerun relevant checks if review requires implementation changes.

Completion criterion: the reviewed API and live example agree, required checks
pass, and any fixes are recorded in focused commits.

Review progress: regression tests exposed stale row indexes and replacement of
newer editors after failed remote saves. Recovery now finds the record in the
current arrangement and checks the editing generation and view lifetime before
changing selection or reopening an editor. The fix also guards completion after
query replacement. Typechecking and all 105 runtime tests pass; Movies assets
have been rebuilt. This is a targeted correction, not completion of the whole
interaction review.

### 2. Define query-result freshness and explicit refresh

This is the next design/implementation milestone. Association invalidation
already names a particular owner and association. An arbitrary query has
arguments, filtering, ordering, limits, and privacy scope; a patch to one of its
objects does not establish its current membership or order.

Work through Movies searches and overlapping mailing lists before selecting
new public method names or changing the protocol:

- Define what completing a query promises about membership and preloaded
  fields. Distinguish loaded data from data known to be current.
- Decide how a consumer explicitly reruns a query: whether a result retains
  its operation/arguments, whether refresh preserves the collection object,
  and how callers replace the active query when its arguments change.
- Specify loading, stale, error, and retry behavior during refresh. Decide
  whether old rows remain visible after failure and while new results load.
- Specify how application-declared mutation effects cause query refresh.
  Do not infer arbitrary dataset dependencies or silently treat local filtering
  as authoritative server membership.
- Define ordering for overlapping refreshes and rapidly changing search text.
  An older result must not replace the active search or clear newer stale state.
  Existing client generations order responses; they are not server revisions
  or proof that a value is globally fresh.
- Define interactions with dirty fields, drafts, deletion, selection, active
  row editing, and temporary `show_first` placement. Server-returned order and
  local arrangement remain separate responsibilities.
- Specify reconnect behavior, including same-actor reconnects, and how visible
  results regain freshness after changes made while disconnected. Preserve the
  existing reset when the authenticated actor scope changes.

Produce concrete Ruby/binding examples and a testable refresh contract first,
then implement the agreed slice. A generic query-refresh API and automatic
query-membership invalidation are **not implemented yet**.

Acceptance scenarios:

- Search for `star`, replace it with `star trek` or `star wars`, and deliver
  responses out of order; only the active search controls visible membership.
- Edit a movie so it enters/leaves a query or changes its server sort position;
  refresh reconciles membership/order while retaining canonical identities.
- Display overlapping mailing lists, change a shared member or move membership,
  and refresh affected views without speculative inverse association edits.
- Fail and retry a refresh, delete a selected record, refresh during editing,
  and reconnect after an out-of-band change. Each has explicit UI/data behavior.

Completion criterion: consumers can intentionally refresh a result with clear
availability, failure, ordering, and selection semantics, without subscription
machinery or extra presentation-controller requirements.

## Current API and contracts to preserve

### Schema, types, and generation

Server models opt in with a `DistantInterface` module; primary keys are implicit and writable
fields are an explicit subset. Real Sorbet or the `swill/server` signature
facade supplies types. Use familiar types such as `T.nilable(Integer)` and
`T::Boolean`; operations without return signatures must declare `returns:`.
Applications may expose non-nilable fields. Sequel::Privacy's nil behavior does
not require every application or field to adopt the same authorization policy.

```text
swill data generate SERVER_ENTRY --root APP_ROOT
swill data check SERVER_ENTRY --root APP_ROOT
```

Generation loads server declarations and writes these deterministic artifacts
under the application root:

```text
client/models/generated/schema.json
client/models/generated/schema.rb
client/models/generated/<model>.rb
sorbet/rbi/shims/generated/<model>.rbi
```

Keep generated artifacts in version control. Compile generated client models
before handwritten client reopenings; server sources and generated RBI files
are not client compiler inputs. Local class reopenings merge in source order;
imported framework constants remain closed to application reopening.

### Operations, persistence, and privacy

`query` invokes a dataset method through the privacy-aware dataset. `resolver`
still exists for class calls; `command` supports instance methods and
`on: :class`. No further operation-naming redesign is scheduled here.
Generated remote calls require `await`; ordinary local field access is
synchronous. Omitted arguments stay omitted so server-side defaults run there.

`preload:` projects return values; instance-command `changes:` refreshes named
receiver fields. Class commands have no receiver and reject `changes:`.
`Swill::Distant::Value` carries structured operation results without attaching
invocation-specific metadata to canonical models.

Commands are transactional by default, including result validation and
serialization. `transaction: false` lets the method own its transaction boundary
and avoid holding a database connection across external work. Later encoding
failure cannot undo a transaction that the application has already committed.
Trust application method bodies; validate exposed operations, arguments,
results, requested projections, and writable fields at the remote boundary.

`save`, `apply_draft`, and `delete` cover routine persistence. Creates and
updates return authoritative scalar patches after commit; deletes produce
observable tombstones that older responses cannot resurrect.

Reuse one viewer context per authenticated connection. Each invocation gets a
fresh `sequel-privacy` cache scope and execution-local Swill context. Requested
privacy-denied nils remain indistinguishable from legitimate nils; there is no
separate client authorization flag. Authentication changes establish a new
connection/context, and changed actor scope resets cached client data.

### Canonical objects, associations, and effects

The client store keys identity by model class and normalized ID. Patches merge
only included members; omitted fields retain their previous availability and
value. Unknown scalar reads can return nil while scheduling hydration. Use
`field_loaded?`, `field_loading?`, `field_stale?`, `field_error`, `load_field`,
and `reload_field` when explicit state or completion matters. Same-turn demands
batch and duplicate requests coalesce. Explicit loads reject on failure;
automatic loads record errors and do not retry endlessly.

Generated associations use `many_to_one`, `one_to_one`, `one_to_many`,
`many_to_many`, or `one_through_one`, with `class:` targets. Cardinality comes
from Sequel reflection. Join configuration, foreign keys, and scopes stay on
the server. Unsupported association kinds fail generation clearly.

To-many associations expose stable `AssociationCollection` instances with
read-only membership and loading, loaded, error, and stale state. Query results
use `Collection`; they do not yet carry a generic refresh contract. Association
setters and backing-array edits cannot masquerade as persisted mutations.
Named server operations perform association changes.

Inside an invocation, record explicit authoritative effects:

```ruby
Swill::Distant.context.refresh(member, :name)
Swill::Distant.context.refresh(list, :members)
Swill::Distant.context.invalidate(previous_list, :members)
```

Refresh projects fresh privacy-scoped values; invalidation retains cached
membership while marking it stale. Observed associations refresh through
batched demand; otherwise they refresh on access. Older hydration cannot clear
a newer invalidation. Effects can name related objects, including old and new
owners, and follow the operation's transaction rules. They reach the calling
client; they are not cross-client subscriptions or automatic mutation capture.

### Arrangement and view ownership

| Component | Responsibility |
| --- | --- |
| Association collection / query result | Returned membership and server order; association loading/freshness state |
| `CollectionArrangement` / `ArrayController` | Local filtering/sorting, cached arrangement, identity-based selection |
| List and its view | Row rendering/lifecycle, focus, keyboard/mouse input, scrolling, header actions |

`CollectionArrangement` can be included on a view controller; `ArrayController`
is the optional DOM-independent owner. `arranged_objects` reads the cached
`arranged_content` property. Override `includes_object?` for local filtering;
observed property reads track relevant dependencies. Preserve existing `sort`,
`toggle_sort`, `sort_key`, and `sort_direction` APIs.

Ordinary List `bind` accepts either content or an ArrayController. Exactly one
owner handles arrangement/selection; focus remains in the responder system.
`list.members_controller` lazily caches a shared controller per owner and
association without fetching just to construct it. Independent views can use
direct collection binding or independent controllers over the same objects.

Sorting preserves object selection. Filtering removes hidden objects from the
visible selection without choosing replacements; clearing the filter can
restore the requested selection. `selected_object_id` supports restoration
before a record arrives. `show_first(movie)` temporarily includes/selects a
movie without changing fetched membership; replacing content or explicitly
sorting clears placement. Refreshing the same collection retains placement.
Local filters still apply. Reordering persisted membership is a server operation.

### Transport and compatibility

Protocol **2** uses binary MessagePack frames with symbolic message names,
request IDs, client generations, canonical patches, and invalidations. Schema
mismatch rejects the handshake before accepting operations. Explicit operations
fail on disconnect; reconnect and field demand coordination belong to the
client lifecycle. No cross-response delivery cache is promised.

Compiled Ruby owns canonical identity, lifecycle policy, patch application,
hydration demand, and stale-response coordination. JavaScript owns the browser
WebSocket, codec, request correlation, and connection notifications.

JSON:API and plain JSON remain supported through `Swill::Model::Resource`,
including their existing `has_one`/`has_many`, codecs, datasets, association
URLs, and persistence APIs. Distant models use `Swill::Model::DistantObject`.
The strategies share observation/editing foundations, but keep stores, loading,
and transport paths separate. New data investment follows the distant path.

## Validation and deferred work

For each milestone, run checks appropriate to changed behavior: deterministic
schema generation, compiler and Sorbet checks, MRI/runtime parity, generated
bundles, real WebSocket integration, and affected browser interactions. Preserve
coverage for privacy/nils, partial hydration, canonical identity, transactions,
invalid results, deletion, out-of-order responses, actor-scope resets, and
observer teardown. Extend benchmarks when a new behavior changes a hot path.

Exchange optimization is deferred beyond the active steps above. Keep
[DATA_EXCHANGE_DESIGN.md](DATA_EXCHANGE_DESIGN.md) as exploratory background;
connection-local delivery tracking, reference-only responses, revision schemes,
and patch-coalescing work are not part of the current milestone. Revisit them
when application experience and measurements show a concrete need, after the
freshness contract is established. Any future evaluation must include server
work, latency, payload size, client cost, and bounded connection memory.

Subscriptions, offline synchronization, arbitrary remote query composition,
HTTP transport, optimistic persistence, automatic cross-model mutation capture,
and distributed change sources remain deferred. Typeahead completion is a
separate control/application discussion and is not part of this execution plan.
