# Swill data exchange design

## Status and intent

This is an exploratory companion to [DATA_DESIGN.md](DATA_DESIGN.md). It
reopens the proposed connection-aware delivery cache before implementation.
The examples describe intended behavior; API spellings and wire sketches are
illustrative, not approved interfaces or implemented guarantees.

The aim is a fluid exchange of current data with little repeated serialization,
network traffic, or application bookkeeping. Ruby applications should work
with canonical objects, collections, and Swill observation. Transport and cache
mechanics should remain understandable Ruby framework code wherever possible.

Our provisional direction is to reuse available values, investigate per-field
delivery coverage, and introduce explicit refresh before subscriptions. These
choices do not yet settle how freshness will be established or maintained.

## Motivating examples

### Overlapping mailing lists

```ruby
customers.members  # Alice, Bob
newsletter.members # Bob, Carol
```

Both collections refer to the same canonical Bob object. Updating Bob's name
should update both displays through normal observation. Removing him from
`customers.members` changes that relationship only; it neither deletes Bob
nor removes him from `newsletter.members`.

Adding Bob to another list should usually send a membership reference and only
the object fields the client still needs. Attributes such as subscription
status, delivery preferences, and joined date belong on a membership model,
such as `Subscription`, linking the person and list. They are not attributes
of the shared person.

### Overlapping movie searches

```text
"star"      → [Movie/1, Movie/2, Movie/3, Movie/4]
"star trek" → [Movie/1, Movie/3]
"star wars" → [Movie/2, Movie/4]
```

Each search executes on the server and returns its current membership and
order. The client reuses movie objects across results. Once the displayed
fields are available and acceptable under the freshness policy, subsequent
responses can consist mostly of references.

Only the latest search may replace the displayed results. An older response
can contribute object patches only if those patches independently pass the
freshness rules. Request order is not proof of database freshness.

A movie may leave the visible results, change elsewhere, and reappear later.
Remembering that its title was sent earlier does not establish that the title
is still current. This is a central test of any proposed cache design.

## Separate identity, membership, availability, and freshness

| Concern | Meaning |
| --- | --- |
| Object identity | One client representative for a model and ID within its actor scope. |
| Collection membership | The references belonging to a particular query or relationship, including their order. |
| Field availability | The client has a value for a field, including a present nil. |
| Field freshness | There is a reason to regard that value as current under a stated policy. |
| Active interest | A consumer currently needs updates to particular objects, fields, or membership. |

An object may survive many short-lived query results. Retaining it in the
identity map must not imply an active subscription or current data. Likewise,
a loaded relationship describes known membership, not necessarily live
membership. Nils remain intentionally ambiguous about authorization state;
freshness metadata should not introduce a new public distinction for them.

The existing protocol already separates returned references from object
patches. This work concerns when patches can be omitted, refreshed, or pushed,
and how collection changes are represented.

## Consumer behavior and possible APIs

An ordinary query should obtain current membership and order. Reusing cached
field values is a separate policy. The earlier proposal treated a declared
preload as an availability guarantee and delayed query completion until
missing projected fields were hydrated. We should confirm that promise before
adding it: the original design describes projections as prefetch hints.

Explicit refresh provides an escape from cached values. `reload_field` already
exists. A possible `await results.reload` would retain the query descriptor,
rerun membership, refresh its declared fields, and update the same collection.
We still need a consistent refresh story for single-object and plain-array
returns, and a clear rule for preserving unsaved edits.

Observation could later maintain objects, collection membership, or both.
These capabilities should be distinguishable without exposing socket details:

- A membership snapshot can contain canonical objects that receive later field
  updates while its membership remains unchanged.
- Object observation keeps requested fields current while a consumer needs them.
- Collection observation also maintains membership and ordering.

Names such as `observe` or `subscribe` are placeholders. Decide whether data
bindings establish remote interests automatically or application code does so
explicitly. Either approach needs predictable teardown when a view closes or
changes its query; merely retaining an object should not subscribe forever.

Live membership is also a UX choice. Updating a visible movie's title may be
welcome while immediately removing or moving the row being edited is not.
Do not implicitly couple those behaviors.

## Efficient delivery options

The following approaches may be combined, but none is selected as the final
protocol:

| Approach | Benefit | Cost or unresolved issue |
| --- | --- | --- |
| Connection-local field coverage | Omit fields previously emitted; send new projection fields immediately. | Server memory and lifecycle bookkeeping; sent does not mean received, retained, or fresh. |
| References followed by client demands | Client checks its actual identity map and requests missing fields. | Extra round trips for cold data; nested relationships can cause waterfalls. |
| References with revisions | Client can distinguish a reusable value from a stale one. | Requires meaningful revisions for projected data, plus hydration when revisions differ. |
| Server comparison with delivered revisions | Include changed fields immediately while omitting unchanged data. | More server state and a reliable change/version source. |

For example, a reference could conceptually include `Movie/1, revision 12`.
An object-level revision alone does not describe which fields the client has.
Receiving one field at revision 12 must not make all older fields current.
Computed values, relationships, and authorization-dependent projections may
also change without the model row's timestamp changing.

Within a response, repeated identities can share patch data. Coalescing needs
an explicit rule if two occurrences contain different values for the same
field. Across responses, missing-field checks provide recovery when server
delivery coverage and actual client state differ.

Graph-shaped hydration could fetch an unknown relationship and its required
target fields together. It should avoid one request per object or relationship
level, while validating requested paths through the normal schema and privacy
rules. It must not require holding a database connection while waiting for the
client to decide what it needs.

## Freshness, invalidation, and live exchange

Explicit refresh is the initial direction. Future changes could travel over
the existing WebSocket using the reserved `CHANGE` concept:

- A patch supplies authoritative replacement values.
- An invalidation says selected fields or relationships need reloading.
- A membership change adds, removes, or reorders references in a collection.

Cache invalidation must affect both client availability and any server delivery
coverage that might otherwise suppress the replacement data. A field marked
unknown should use the normal hydration machinery. Whether an invalidated
value remains visible during reload is an open API and binding question.

Overlapping observed collections should share field interests. Five lists
needing Bob's name require one effective interest in that field per connection.
Closing one list releases its contribution; updates continue while another
consumer still needs them. Membership interests remain separate for each list.

Change discovery is distinct from delivery. Swill-mediated writes can provide
an integration point after successful commit. Writes from other processes or
direct SQL require an application publication API or a database/message-bus
adapter. Model callbacks alone do not establish that every committed change
has been observed. Publication must also respect application-managed outer
transactions.

Authorization still governs new reads and pushed values. A subscription or a
delivered reference grants no authority. Changes to permissions may require
invalidating previously available fields or removing membership, even when the
authenticated actor is unchanged. How those changes are discovered is part of
the freshness contract.

## Relationships and arbitrary queries

A known membership change can directly update a mailing-list relationship.
An arbitrary Ruby query may depend on joins, computed predicates, ordering,
and limits. A change to one record may alter which other record enters a
50-item result window.

Support two possible server strategies behind an observed collection:

1. Apply membership changes directly when their effects can be determined.
2. Invalidate and rerun the query, then reconcile references and order into the
   existing collection.

The second strategy is a legitimate starting point. It avoids requiring an
incremental query engine for arbitrary Ruby code. Bursts should be coalesced,
and performance must include query reruns as well as network savings.

## Ordering, reconnects, and resource limits

A live stream needs a defined handoff from its initial snapshot to subsequent
changes. An update must not fall into a gap between fetching and subscribing.
Possible mechanisms include a server change position or buffering during
snapshot creation; the mechanism is still open.

Client request generations currently help order response application. They
are not database revisions, a durable change log, or a sufficient ordering
scheme for unsolicited server updates. Delayed hydration, pushes, local edits,
and deletes need coherent precedence rules.

On reconnect, either resume from an acknowledged server position or refresh
active interests. A changed actor scope must invalidate the prior scope's
state. The design must also handle changes missed during a same-actor outage.
Do not retain a database transaction or connection across a disconnection.

Server coverage and subscriptions need bounded memory and cleanup. Evicting
delivery coverage can safely cost redundant patches; evicting an active
subscription requires an explicit recovery path. Slow consumers need a
backpressure strategy, potentially coalescing changes into an invalidation
and refresh rather than retaining an unlimited queue.

## Questions and evaluation before implementation

Resolve these questions through the two examples before fixing the API:

- Does ordinary preload promise availability at query completion or remain a
  best-effort prefetch hint? When is an available value too old to reuse?
- What versions computed fields, relationships, and authorization-dependent
  values? How does field coverage relate to those versions?
- Who establishes and releases remote interests: application code, bindings,
  or an explicit observable collection lifecycle?
- How do refresh and incoming changes interact with dirty fields, failed
  hydration, deleted objects, and editing a row whose membership changes?
- What is the initial reconnect policy, and how are snapshot and stream made
  continuous if subscriptions are introduced?
- Which change sources are supported, including multiple server processes,
  and what guarantee does each source provide?

Measure cold, fully warm, partially overlapping, and changed-data searches;
overlapping mailing lists; nested relationships; and reconnect recovery.
Include server query/accessor work, serialization and client patch time,
payload bytes, round trips under realistic latency, memory per connection,
and compiled runtime size. Network savings alone are not enough if they add
latency or substantial machinery.

Behavioral checks should include editing a shared member, moving a membership,
revisiting a movie changed while absent, rapidly replacing searches, closing
one of several overlapping views, permission changes, and out-of-band writes.

The next implementation milestone should follow those decisions. The earlier
per-field coverage and refresh proposal remains a candidate, not a commitment
to a protocol bump, subscription API, or specific wire format.
