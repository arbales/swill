# Swill data exchange design

## Status and intent

This is an exploratory companion to [DATA_DESIGN.md](DATA_DESIGN.md). It
reopens the proposed connection-aware delivery cache before implementation.
The schema versioning API below is the accepted direction, not yet implemented.
Other exchange examples and wire sketches remain exploratory.

The aim is a fluid exchange of current data with little repeated serialization,
network traffic, or application bookkeeping. Ruby applications should work
with canonical objects, collections, and Swill observation. Transport and cache
mechanics should remain understandable Ruby framework code wherever possible.

Explicit query refresh is now implemented. Before adding delivery coverage or
subscriptions, review identity, availability, and the graph contract with
independently released iOS/static clients in mind. The following section records
the graph proposal and accepted schema compatibility direction; their new
compatibility mechanisms are not implemented.

## Client graph and compatibility contracts

The design question is what a client knows about an object, what the server
promises to deliver, and how those promises survive a server upgrade. Connection
recovery and caching must respect those promises rather than define them.

### Separate the contracts

| Concern | Current implementation | Proposed architectural boundary |
| --- | --- | --- |
| Identity | Model class name and string id, held in context-owned stores; actor reset retires the graph | A stable public model identity and opaque record id within the application's identity domain; local representatives remain context/actor scoped |
| Availability | Per-field loaded state; partial patches; lazy hydration | A reference establishes identity, not loaded fields; omission preserves existing knowledge, including an unavailable field staying unavailable |
| Freshness | Explicit refresh, request generations, invalidations, dirty-field protection | A separate promise from availability; request order is not a database revision |
| Membership | Query/relationship references with order, independent of shared record fields | State whether a collection payload is a complete snapshot, a page, or a change; do not infer one from another |
| Client contract | One generated schema; both peers require an exact schema hash | The server explicitly supports the contract a released client was built against, even when its current schema has grown |
| Transport | MessagePack over WebSocket, with Ruby-authored graph merging | Framing and request correlation carry graph operations; decoding/merging semantics should be implementable by a native client without Ruby runtime behavior |

A record's domain identity does not change because a socket reconnects or an
application version changes. This does not authorize reuse across actors or
servers, nor imply an offline persistence feature. Child editing contexts may
hold distinct local representatives of that same identity.

Keep three questions separate for each field:

- Does this client's supported contract define the field?
- Has this graph received its value, including a valid nil?
- What reason is there to consider that value current?

A field absent from a client's contract is not a field waiting for hydration.
Nilability describes values, not feature support. Privacy-denied nils remain
intentionally indistinguishable from ordinary nils; this design does not add
authorization-state metadata. A loaded value also grants no future authority.

### Example: an older Movies client after a server upgrade

Suppose an installed client understands Movie id, title, and year. The server
adds plot and a new search operation. The older client should be able to keep
using its established fields and operations if the server still supports that
contract. It does not need to learn plot or download a new generated model.

Currently, the changed schema hash rejects that client before any operation.
Allowing the handshake alone would not fix it: saves return every field in the
current server schema, nested projections can introduce unfamiliar models, and
structured values are decoded using generated class names and properties.

Under the proposed boundary, every response is expressed in the supported
client contract: queries, save acknowledgements, hydration, nested records,
effects, and eventual pushes. A new client can receive plot; the old client's
projection remains meaningful. Unsupported required types cannot silently become
nil or partially decoded objects. Unknown fields could be ignored only under an
explicit extension rule, before decoding their possibly unknown value types.

### Version the public contract, not record identity

Distinguish wire-protocol compatibility, the model/operation contract, and the
application build. Record revisions, if introduced later, answer a fourth and
different question. A new application build need not imply a new wire protocol;
a matching wire protocol does not imply compatible model behavior.

The current interface is always supported. Every committed snapshot in
`schema/versions/` adds a supported client contract; no separate registration
list is needed. Snapshots describe public interfaces, not database schemas or
copies of past server implementations. Several client releases may share one
snapshot. Clients identify contracts by schema hash; Ruby adapters refer to
unique human-readable version names.

The server should adapt its current model implementation at the public boundary
where needed. Aliases, defaults, and conversions must be explicit when behavior
changes; shape comparison alone cannot establish semantic compatibility. Do not
let an untrusted client-supplied schema redefine writable fields or bypass the
current authorization policy. Old contracts remain subject to current policy.

Ruby class names currently double as public wire names. Treat published names
as API: a Ruby namespace refactor must either preserve them through mapping or
be an intentional contract change. Stable wire names need not be numeric ids.

| Server change | Proposed treatment for an older client |
| --- | --- |
| Add an unrelated field/model/operation | Potentially compatible; preserve old projections and operation behavior |
| Rename a field or Ruby model class | Preserve the old public name or provide an explicit supported-contract mapping |
| Remove a field or operation | Continue serving its old meaning, or stop supporting the affected contract |
| Add a required argument | Supply a valid compatibility default/adapter or reject the affected contract |
| Widen a returned type, add an enum case, or make a result nilable | Potentially breaking for a compiled client; validate against its accepted output types |
| Narrow accepted input values | Potentially breaking even if response types are unchanged |
| Change authorization | Enforce current policy while respecting the supported representation contract; prior delivery is not permission |

Browser deployment refresh remains an application/development policy. A native
or static client that cannot satisfy the supported contract needs an explicit
upgrade-required outcome, not a reload loop. Exact-schema matching can remain
a useful strict mode; relaxing it requires implementing the supported-contract
rules on both ends of the handshake and throughout dispatch/encoding.

### Plan of record: schema versions and compatibility

**Accepted direction; not yet implemented.** Keep existing plural `fields`
semantics. Add singular `field` for declarations with optional metadata:

```ruby
module DistantInterface
  extend Swill::Distant::Interface

  fields :title, :director
  fields year: T.nilable(Integer)

  field :duration, Integer, unit: :seconds
  field :rating, Integer, range: 0..5
  field :status, String, values: %w[unwatched watched]

  version "ios-v1" do
    field :duration,
      to_version: ->(seconds) { seconds / 60 },
      to_current: ->(minutes) { minutes * 60 }
  end
end
```

`to_version` produces the snapshot's representation; `to_current` converts a
submitted value to the current model's representation. Derive the old type and
constraints from the snapshot and the current ones from the field declaration;
there is no repeated `current:` assertion. Compatible fields carry through
without adapters, and compatible versions need no `version` block.

Derive types and constraints where reliable, including database column types,
nullability and available length constraints, and Sorbet method signatures.
Allow explicit units, ranges, and enumerated values. Declared constraints must
be enforced at the data boundary and available to generated clients, rather
than being documentation the checker merely assumes is true. Database defaults
must not automatically become compatibility fallbacks.

#### Snapshot workflow

```text
schema/versions/
  20251103.ios-v1.json
  20251203.ios-v2.json
```

Store the version name inside the artifact as well as in its filename. Names
must be unique across the directory; dates organize snapshots but do not define
a conversion chain. Build on the existing deterministic generated schema.

Proposed commands (not currently implemented; server-entry/project arguments
will follow the existing tooling):

```sh
swill data snapshot --name ios-v1
# Creates schema/versions/20251103.ios-v1.json; commit it with the release.

swill data check
# Checks the current interface against every supported snapshot.
```

- Create snapshots explicitly when publishing a client contract, not on every
  application build. Normal generation never overwrites a released snapshot.
- Commit immutable snapshots; CI must detect edits to published baselines.
- Directory membership declares support. Removing a snapshot explicitly retires
  that contract; remove its adapters too. Historical versions remain in Git.
- Reject duplicate names, unknown adapter version references, orphaned adapters,
  and unresolved structural incompatibilities.
- The current interface is supported without a snapshot or compatibility adapter.

#### Repeated changes: adapt directly to current

Suppose V1 used integer minutes, V2 used integer seconds, and the current model
now uses a structured `Duration`. Update the V1 adapter and add the V2 adapter:

```ruby
field :duration, Duration

version "ios-v1" do
  field :duration,
    to_version: ->(duration) { duration.total_minutes },
    to_current: ->(minutes) { Duration.from_minutes(minutes) }
end

version "ios-v2" do
  field :duration,
    to_version: ->(duration) { duration.total_seconds },
    to_current: ->(seconds) { Duration.from_seconds(seconds) }
end
```

`Duration` and its conversion methods illustrate an application value type.
Each adapter connects its snapshot directly to the current model. Do not
compose V1-to-V2-to-current conversions automatically. Ordinary Ruby helpers
can share conversion logic without retaining intermediate representations.

#### Deterministic compatibility checks

Check each snapshot against the current interface, recursively including
relationships, value types, method arguments, results, and declared constraints:

- Inputs must continue accepting every value the supported client may send.
- Outputs must remain within the values that client understands.
- Writable fields require both checks. Expanding a range can be compatible for
  inputs while breaking outputs; changing units requires conversion even when
  the Ruby types match.
- Derive expected adapter signatures. Validate them where static analysis
  permits; the exact verification mechanism remains to be designed.
- Structural checks cannot prove arbitrary Ruby conversions or unchanged
  behavior. Adapter tests must cover reads and writes for every supported
  version, including rounding or other lossy conversions. Undeclared semantic
  changes remain a review responsibility.

Example build diagnostics:

```text
Movie.duration — ios-v1
  Snapshot: Integer, unit: minutes
  Current:  Integer, unit: seconds
  Conversion required.

Movie.year — ios-v2
  Snapshot output: Integer
  Current output:  Integer | nil
  Preserve the guarantee, supply an adapter, or retire the version.
```

### Questions to resolve next

The versioning API above is the plan of record, not approval of a wire format
or a completed implementation design. Resolve these details before implementation:

- Authorization and validation ordering around conversions, including partial
  updates, omitted fields, and read-only fields. Old clients remain subject to
  current policy; privacy-denied nils stay intentionally ambiguous.
- How adapters are checked and tested, how published snapshot immutability is
  verified, and how the runtime validates converted values and constraints.
- Negotiation by schema hash, unsupported-version outcomes, and consistent
  adaptation across queries, saves, hydration, nested values, and future pushes.
  Build-time checking alone does not relax today's exact-schema handshake.

Build a compatibility matrix for old/new clients and servers, including additive
fields, renamed names, changed types and units, nested relationships, and writes.
Then map graph operations into language-independent examples: identity-only
references, partial patches, loaded nils, complete/partial membership, deletion,
and errors. Multi-backend identity and persistent native caches need explicit
scope rules if introduced; the current singleton client does not provide them.

Connection ownership, uncertain writes, reconnect resynchronization, and delivery
coverage follow this review. Exchange caching, subscriptions, and context-managed
creation remain deferred. No new transport or server revision scheme is selected.

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
| Object identity | One canonical representative for a model and ID within each context and actor scope. |
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

An ordinary query obtains membership/order and its declared projected fields.
The current server supplies those patches in the response. Reusing cached field
values is a separate policy: any future patch omission must preserve promised
availability when client coverage differs from what the server remembers. This
does not promise unprojected fields or server-wide freshness.

Explicit refresh is implemented: `reload_field` reloads an individual field,
and `ArrayController#fetch` can repeat its remembered operation while retaining
the controller. Movies' `refresh` repeats the latest search criteria. Contexts
preserve dirty local values and retain incoming server values underneath them;
collection controllers defer membership publication while editors are active.
Future delivery/observation work must preserve these distinctions.

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

- How will projected-field availability be preserved if responses begin omitting
  previously delivered patches? When is an available value too old to reuse?
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
