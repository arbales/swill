# Swill Data Layer Implementation Plan

## Summary

Build a server-driven data layer from `DATA_DESIGN.md` around named remote operations, generated client Ruby, canonical partial objects, demand-driven hydration, and MessagePack over WebSockets.

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
- Remaining migration work is the browser-facing fixture and removal of the
  transitional JSON:API, arbitrary persistence, and relationship URL APIs.

## Public Interfaces and Semantics

### Model declarations

Shared model files expose only named operations:

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

Sorbet or `Swill::Sig` signatures supply parameter and return types. Without either, the declaration must specify the result shape:

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

Generated query and resolver methods are async class methods. Generated commands are async instance methods.

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

General JSON:API persistence, arbitrary `where`, `save`, `delete`, and codec APIs are outside the final data API. V1 mutations cross named commands.

## Implementation

### 1. Privacy execution context

Add an operation-scoped cache API to `sequel-privacy`. Policy results and `single_match` state must live in the current thread/fiber execution context and be discarded when the operation block exits.

Reuse one viewer context for the lifetime of a WebSocket connection. Every query, resolver, command, and hydration batch runs inside a fresh policy-cache scope with that VC.

Set an execution-local Swill connection context while dispatching. Resolver implementations such as `User.current_user` read the authenticated actor from that context without exposing a context parameter to the client API.

### 2. Schema and generation

Create an immutable Swill protocol type representation supporting primitives, optional, array, result set, model reference, union, and enum types.

Normalize Sorbet signatures and `Swill::Sig` into this representation. Reject unsupported or contradictory types during generation.

Add:

```text
swill data generate SERVER_ENTRY
swill data check SERVER_ENTRY
```

Generation boots the server entry, loads authoritative models and server
operation declarations, reflects Sequel columns and associations, and writes
deterministic artifacts:

```text
client/models/generated/schema.json
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
- Commands load their receiver through the same privacy-aware dataset and invoke the declared instance method.
- Resolvers invoke the declared class method inside the connection context.
- Hydration GETs resolve requested fields and relationships on privacy-aware records.

Treat `query` read-only behavior as trusted application code rather than attempting to sandbox it.

Validate arguments and return values when a Sorbet or Swill signature supplies types. Return structured remote errors with a stable code, message, and optional validation details.

Evaluate projections through privacy-aware model access. Every requested scalar field is included in the patch; a privacy-denied read therefore becomes a present nil. Record-level privacy may remove entire records.

Execute commands inside a database transaction. After the method succeeds, serialize its typed return value and the receiver fields named by `changes:`. Send the response only after commit. Cross-model mutation capture and arbitrary affected-object projections remain future work.

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

Once the fixture passes end to end, remove the transitional JSON:API codecs, endpoint-based querying, and relationship URL loading. Retain the observation runtime, compiler declaration machinery, canonical-store concepts, and explicit/background error split.

## Test Plan

- Verify Sorbet and `Swill::Sig` normalize to identical schemas.
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
- Verify actor-scope changes clear the Store before new data is exposed.
- Run compiler, MRI parity, Node runtime, generated bundle, and real Chrome integration tests.
- Add non-gating benchmarks for MessagePack encode/decode, patch hydration, Store lookup, demand batching, and WebSocket round trips.

## Assumptions

- `DATA_DESIGN.md` remains the architectural rationale; this file is the execution plan.
- Both documents and all generated artifacts are tracked.
- Authentication is fixed when a WebSocket connects. Changing identity closes and re-establishes the connection with a new VC.
- V1 excludes subscriptions, offline synchronization, arbitrary query composition, HTTP transport, optimistic updates, and automatic cross-model mutation capture.
- Protocol sources are trusted application code; network messages, identifiers, arguments, and schema hashes are validated.
