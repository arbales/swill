# Swill Data Layer Implementation Plan

## Summary

Build a server-driven data layer from `DATA_DESIGN.md` around declared client
schemas, named operations, generated client Ruby, canonical partial objects,
demand-driven hydration, generic persistence, and MessagePack over WebSockets.

Locked decisions:

- Queries, resolvers, and commands require explicit `await`.
- Local model fields and relationships remain synchronous.
- The transport has an adapter boundary; v1 implements WebSockets only.
- The fixture server uses Roda, Falcon, and `async-websocket`.
- One `ActorVC` or `APIVC` belongs to each authenticated connection.
- `sequel-privacy` policy caches are execution-local and reset per operation.
- Unauthorized values remain indistinguishable from legitimate nils.
- Client generations prevent stale responses from overwriting newer fields.
- Operations without a signature must declare `returns:`.
- Server models opt into a closed client schema with `client_model`; primary
  keys are implicit and writable fields are an explicit subset.
- Generated models inherit from `Swill::Model::DistantObject`; endpoint-backed
  JSON:API/plain JSON models inherit from `Swill::Model::Resource`.
- Generic `save`, `apply_draft`, and `delete` cover routine persistence. Named
  commands remain domain mutations.
- Schema, generated Ruby, and generated RBI files are checked in.
- A User/Post fixture application proves the first vertical slice.

Current implementation status:

- Schema discovery, deterministic generation/checking, protocol types,
  MessagePack, generated client proxies, canonical identity, partial fields,
  demand batching, stale-generation rejection, and WebSocket dispatch are in
  place.
- The self-contained fixture under `spec/fixtures/data` now crosses the real
  Falcon WebSocket boundary
  with generated client code. It covers resolvers, queries, nested canonical
  references, privacy-denied fields as present nil, stable relationship
  collections, explicit hydration, and command patches.
- Command validation and projection serialization run inside the transaction;
  invalid results roll back the mutation.
- Commands may target the model class and may explicitly opt out of Swill's
  transaction. An unwrapped command owns its transaction boundary, including
  the consequence that a later result-encoding failure cannot roll back work
  it already committed.
- Typed value objects carry operation metadata and other structured results
  without attaching invocation-specific state to canonical models.
- Generated distant objects now create, update, apply detached drafts, and
  delete through authoritative transactional patches. Deleted objects are
  observable tombstones and stale responses cannot resurrect them.
- The browser-facing fixture now proves that ordinary bindings update from
  query projections, automatic field and relationship hydration, and command
  patches across the real Falcon WebSocket boundary. It also exercises create,
  draft application, and deletion from compiled Ruby in Chrome.
- Generated operations and partial-field hydration are the data plan's active
  development path. The existing JSON:API and plain JSON codecs, endpoint
  persistence, identity pool, datasets, and relationship URL APIs remain
  available as compatibility strategies.

## Public Interfaces and Semantics

### Model declarations

Server operation files expose named operations:

```ruby
class Post
  query :search,
    preload: [:title, :excerpt, {author: [:name, :avatar]}]

  command :publish!,
    changes: [:published, :published_at]
end

class User
  resolver :current_user
  query :first_by_email
end
```

Real Sorbet or the `swill/server` `T::Sig` facade supplies parameter and return types. Without a signature, the declaration must specify the result shape:

```ruby
query :search,
  returns: ResultSet[Post],
  preload: [:title, :excerpt]
```

Ruby reflection supplies positional and keyword shape, requiredness, and parameter names, but not default expressions. Generated clients preserve omission so defaults execute only in the authoritative server method. Untyped parameters and values use dynamic MessagePack encoding.

### Client calls

Remote boundaries remain visible:

```ruby
user = await User.current_user
posts = await Post.search("distributed objects")
post = posts.first
await post.publish!
```

Generated query and resolver methods are async class methods. Commands are
instance methods by default and may be declared with `on: :class` for actions
such as a remote lookup and upsert.

The query/resolver/command names currently preserve the distinction between
dataset, class, and instance dispatch. Reconsider a single operation macro
with an explicit target after application ports show whether that distinction
helps consumers or merely exposes server mechanics.

A query returning many produces a loaded `ResultSet[T]`. One and optional-one results return canonical model instances or nil.

### Partial fields

A generated field has internal presence, loading, error, and last-generation state.

```ruby
post.body                    # returns nil and schedules hydration when unknown
post.field_loaded?(:body)
post.field_loading?(:body)
post.field_error(:body)
await post.load_field(:body)
await post.reload_field(:body)
```

Unknown and known nil are distinct internally. Both read as nil through the ordinary accessor. Explicit loads reject on failure; access-triggered loads record the error and warn.

There is no client authorization or suppression state. A requested field denied by `sequel-privacy` is encoded as a present nil, exactly like an authorized nil. Privacy-filtered records and relationships appear absent, nil, or empty according to the server model’s existing privacy behavior.

### Canonical models and collections

The client Store keys models by installed model class and normalized ID. Decoding a reference immediately returns or creates that canonical instance.

Partial patches merge only included fields. Each included field becomes present even when its value is nil. Omitted fields retain their previous value and presence state.

`has_many` relationships and query results use a stable `Swill::Model::Collection`. It exposes Array-like reads plus `loaded?`, `loading?`, and `error`. Hydration replaces its internal records and emits KVO without replacing the collection object.

Generated distant objects use `save`, `apply_draft`, and `delete` for ordinary
record persistence. The server accepts only fields listed in the model's
`client_model writable:` declaration and returns authoritative patches after
commit. Named commands remain the API for domain actions such as `publish!`.

The compiled Ruby model and `DistantClient` own lifecycle policy, canonical
identity, private partial-field state, patch application, demand batching, and
stale-response coordination. The JavaScript data client is a browser transport
adapter: it owns the WebSocket, MessagePack frames, request correlation, and
connection lifecycle notifications.

Existing JSON:API and plain JSON consumers continue to use
`Swill::Model::Resource`, including `where`, `save`, `delete`, codecs, datasets,
and relationship URLs. The two strategies share attributes, observation, and
editing behavior through `Base` and `Editable`, but their stores, loading, and
transport APIs remain separate.

## Implementation

### 1. Privacy execution context

Use `sequel-privacy`'s `with_cache_scope` API. Policy results and `single_match`
state live in the current thread/fiber execution context and are discarded when
the operation block exits.

Reuse one viewer context for the lifetime of a WebSocket connection. Every query, resolver, command, and hydration batch runs inside a fresh policy-cache scope with that VC.

Set an execution-local Swill connection context while dispatching. Resolver implementations such as `User.current_user` read the authenticated actor from that context without exposing a context parameter to the client API.

### 2. Schema and generation

Create an immutable Swill protocol type representation supporting primitives, optional, array, result set, model reference, union, and enum types.

Normalize real Sorbet signatures and facade `T::Sig` signatures into this representation. Reject unsupported or contradictory types during generation.

Add:

```text
swill data generate SERVER_ENTRY
swill data check SERVER_ENTRY
```

Generation boots the server entry, loads authoritative models and server
operation declarations, reads each explicit `client_model` schema, and writes
deterministic artifacts:

```text
client/models/generated/schema.json
client/models/generated/schema.rb
client/models/generated/<model>.rb
sorbet/rbi/shims/generated/<model>.rbi
```

Canonical JSON determines the schema SHA-256 hash. `check` generates into a temporary directory and fails if checked-in artifacts differ.

Client build order is generated models followed by handwritten client model
files. Generated RBI files are outputs only; server models and operation
declarations are never client compiler inputs.

The compiler supports the resulting local class reopenings directly: it folds
the bodies in load order into one JavaScript class and keeps later method
definitions. Imported framework constants remain closed to application code.

Generated classes use the ordinary declarations `model_name`, `attribute`,
`has_one`, and `has_many`; their superclass gives those declarations distant
data semantics. A class using endpoint APIs must inherit from `Resource`, and
the compiler reports that migration when old code still subclasses `Base`.

### 3. MessagePack protocol and transport

Define a client transport interface for connect, request, queued demand, and close. Implement it with the browser WebSocket API. Implement the server endpoint through Roda and `Async::WebSocket::Adapters::Rack`, hosted by Falcon.

Use binary MessagePack frames with readable symbolic field and operation names in v1.

Protocol messages:

```text
HELLO    protocol version, schema hash
WELCOME  protocol version, schema hash, opaque actor-scope token

QUERY
RESOLVE
COMMAND
GET
CREATE
UPDATE
DELETE

RESULT
RETURN
ERROR
```

Every operation carries a request ID and client generation. Responses contain the typed return value plus canonical object patches. Reserve `CHANGE` and integer schema IDs for later subscription/protocol work.

Use dedicated MessagePack representations for model references and schema types that cannot round-trip as ordinary primitives. Unknown fields are omitted rather than encoded as a value.

A schema mismatch rejects the handshake and closes the connection before accepting operations.

The transport maintains one read loop and one ordered write queue. A disconnect rejects outstanding explicit operations. Automatic field demands remain queued for the next successful connection. On reconnect, a changed actor-scope token clears canonical objects, pending demands, and applied-generation state.

### 4. Dispatch, privacy, and projections

Dispatch only operations declared in the generated schema.

- Queries invoke the named method on `Model.for_vc(vc)`.
- Instance commands load their receiver through the same privacy-aware dataset.
  Class commands invoke the declared class method inside the connection context.
- Resolvers invoke the declared class method inside the connection context.
- Hydration GETs resolve requested fields and relationships on privacy-aware records.
- Creates, updates, and deletes construct or load records through the same
  privacy-aware path and accept only schema-declared writable fields.

Treat `query` read-only behavior as trusted application code rather than attempting to sandbox it.

Commands use a database transaction by default. `transaction: false` leaves
the complete consistency boundary to the command body, allowing it to perform
slow network work before opening a short application-owned transaction. Swill
still validates and encodes the result afterward; failures in that phase do
not undo an application transaction that has already committed.

Validate arguments and return values when a Sorbet or Swill signature supplies types. Return structured remote errors with a stable code, message, and optional validation details.

Evaluate projections through privacy-aware model access. Every requested scalar field is included in the patch; a privacy-denied read therefore becomes a present nil. Record-level privacy may remove entire records.

After the method succeeds, serialize its typed return value using `preload:`
and independently refresh receiver fields named by `changes:`. Class commands
reject `changes:`. Validate projections against the return type and receiver
type respectively. With the default transaction wrapper, send the response
only after commit. `transaction: false` leaves transaction boundaries to the
method body. Cross-model mutation capture remains future work.

Execute generic persistence inside a database transaction as well. Create and
update responses project all exposed scalar fields so server defaults,
validation transformations, and callbacks replace speculative client values.
Delete returns only after commit.

### 5. Demand collection and stale responses

A missing field or relationship adds a demand to a per-connection client coordinator. Flush demands once at the end of the current event-loop turn, grouped into one GET message.

Coalesce identical queued and in-flight demands. A failed automatic demand remains failed until an explicit reload or another authoritative response supplies the member.

Assign a monotonically increasing generation when creating any operation or demand. Store the last applied generation per canonical field and relationship. Apply a patch member only when its generation is at least the stored generation; unrelated members merge independently.

### 6. Vertical fixture and migration

Add a deterministic Sequel/SQLite fixture with User, Post, Comment, privacy policies, Roda routes, Falcon, and a WebSocket endpoint.

Cover:

- `User.current_user`
- `User.first_by_email(email)`
- `Post.search(query)`
- `post.publish!`
- `post.author.name`
- `post.comments`
- `comment.author.avatar`

Build a browser example whose bindings update through ordinary KVO as partial fields and stable relationship collections hydrate.

Keep the JSON:API, plain JSON, endpoint-based querying, and relationship URL
APIs as supported compatibility strategies. New data-layer investment goes to
named operations and partial hydration. Both strategies retain the observation
runtime, compiler declaration machinery, canonical-store concepts, and
explicit/background error split.

## Test Plan

- Verify real Sorbet and facade `T::Sig` normalize to identical schemas.
- Reject missing untyped `returns:`, invalid declarations, schema mismatches, and undeclared operations.
- Verify generation is deterministic and `swill data check` detects drift.
- Round-trip every protocol type, model reference, nil, error, and partial patch through MessagePack.
- Prove identity across queries, relationships, resolvers, commands, and reconnects.
- Verify omitted fields remain unknown while included nil fields become present.
- Verify authorized nil and privacy-denied non-nil fields produce indistinguishable client state.
- Verify one VC is reused for a connection while policy caches remain isolated across concurrent operations.
- Verify same-turn demands batch, duplicates coalesce, and automatic failures do not reject globally.
- Deliver responses out of order and prove per-member generations reject stale values.
- Verify relationship collections retain identity while membership and bindings update.
- Verify declared command changes apply after commit and failed commands apply no patches.
- Verify generic create/update/delete, rejected undeclared writes, validation
  rollback, detached drafts, canonical identity after create, and deletion
  tombstones.
- Verify actor-scope changes clear the Store before new data is exposed.
- Run compiler, MRI parity, Node runtime, generated bundle, and real Chrome integration tests.
- Add non-gating benchmarks for MessagePack encode/decode, patch hydration, Store lookup, demand batching, and WebSocket round trips.

## Assumptions

- `DATA_DESIGN.md` remains the architectural rationale; this file is the execution plan.
- Both documents and all generated artifacts are tracked.
- Authentication is fixed when a WebSocket connects. Changing identity closes and re-establishes the connection with a new VC.
- V1 excludes subscriptions, offline synchronization, arbitrary query composition, HTTP transport, optimistic updates, and automatic cross-model mutation capture.
- Protocol sources are trusted application code; network messages, identifiers, arguments, and schema hashes are validated.
