# Server data

The data layer exposes a declared client model surface, lifecycle persistence,
named Sequel queries, contextual resolvers, and instance or class commands over
binary MessagePack WebSockets. `DATA_DESIGN.md` describes the model and
`DATA_PLAN.md` records the implemented decisions.

## Declaring the Client Surface

Install declarations on the application's Sequel base in the server entry,
load authoritative models and their exported operations, then generate the
checked-in client schema, Ruby models, and RBIs:

```ruby
# server.rb
require "sequel"
require "swill/server"

Swill::Data.install(Sequel::Model)
require_relative "server/models/post"
require_relative "server/operations/post"
```

```ruby
# server/operations/post.rb
class Post
  client_model fields: %i[title body published published_at], relationships: %i[author comments],
               writable: %i[title body]
  query :search, returns: Swill::Data::ResultSet[Post], preload: [:title]
  command :publish!, returns: T::Boolean, changes: %i[published published_at]
end
```

Only models declaring `client_model` enter schema discovery and the protocol.
The primary key is included automatically. `fields` and `relationships` are
closed allowlists: they define what may appear in generated code or hydration.
`writable` must be a scalar, non-primary-key subset of `fields`; it is the
subset accepted by `save` and `apply_draft`. A database column omitted from
the declaration remains usable by server code and policies while staying
absent from the schema, generated code, hydration requests, and client writes,
even when a viewer's privacy policy would permit reading it.

The server entrypoint uses Sorbet's type spelling without requiring an
application to load Sorbet. When `sorbet-runtime` was required first, Swill
uses its `T`; otherwise it supplies the protocol subset: `T::Sig`,
`T.nilable`, `T::Boolean`, `T::Array`, `T.any`, and `T.untyped`.

Applications using sequel-privacy add `gem "sequel-privacy", ">= 0.7.2"` to
their Gemfile and require it before `swill/server`. It is an optional
integration, not a Swill gem dependency. Plain Sequel applications do not load
privacy code; dispatch uses privacy-aware datasets and cache scopes only when
sequel-privacy is present.

## Generating

```sh
bundle exec swill data generate server.rb
bundle exec swill data check server.rb
```

The generation root is the current directory, or `--root DIR`. A complete
application can keep the boundary visible with this layout:

| Path | Loaded by | Purpose |
| --- | --- | --- |
| `server.rb` and `server/models/` | Server and generator | Database models, policies, query implementations, and commands |
| `server/operations/` | Server and generator | The explicitly exported query, resolver, command, and projection declarations |
| `client/models/generated/` | Client compiler | Generated proxy fields and async operation methods |
| `client/models/` | Client compiler | Handwritten browser-only model behavior |
| `sorbet/rbi/shims/generated/` | Sorbet only | Generated type declarations; never executable input |

The server derives its schema from the loaded server models. It does not load
the generated client Ruby or RBI files. The client entry loads generated
models first and handwritten client files second. The compiler merges those
local class reopenings in source order and emits one JavaScript class; a
handwritten method definition replaces a generated definition with the same
name. `client/models/generated/schema.rb` supplies the Ruby `DataSchema::HASH`
constant for the client handshake; `schema.json` is the inspectable schema.
The repository fixture follows this layout under `spec/fixtures/data` so its
artifacts do not leak into the repository-level `client/` or `sorbet/` trees.

For a coordinated build and watch loop, use the
[project workflow](getting_started.md#project-workflow). Generation requires
the server entry as ordinary Ruby: it may need database access when Sequel
reflects column types and associations. Explicit field types do not prevent
Sequel itself from connecting while defining a model. A dedicated schema
loader can use `Sequel.mock`, explicit types, and `def_column_accessor`, but
must reproduce the same declarations as the running server. Swill does not
start the application or supply a universal schema-only environment switch.

## Persistence

Create and update use Sequel persistence under the connection's viewer
context. Sequel validation and hooks run normally. When sequel-privacy is
loaded, its `:create`, `:edit`, protected-field, and `:delete` policies also
apply. Named commands are the interface for domain mutations and relationship
changes.

## Operations and Projections

| Declaration | Server receiver | Client call | Transaction |
| --- | --- | --- | --- |
| `query :search` | Privacy-aware dataset when privacy is installed; otherwise the model dataset | `await Post.search(...)` | Application-owned |
| `resolver :current_user` | Model class | `await User.current_user` | Application-owned |
| `command :publish!` | Persisted model instance | `await post.publish!` | Swill wraps by default |
| `command :import, on: :class` | Model class | `await Post.import(...)` | Swill wraps by default |

`transaction: false` gives a command ownership of its transaction boundaries,
for example to keep an external HTTP request outside the database transaction.
These declarations export trusted application methods; they do not sandbox
query or resolver implementations.

Generated methods preserve required and optional positional
parameters, positional rest, required and optional keywords, and keyword rest.
Defaults run only on the server, and an explicit `nil` is distinct from an
omitted argument. Schema generation rejects block parameters because
executable callbacks do not cross the data connection. The compiler's own
parameter support is described in [keywords, rest arguments, and
blocks](compiler.md#keywords-rest-arguments-and-blocks).

### Effects on Related Objects

A server method body can name the objects it affects:

```ruby
command :change_author, returns: T::Boolean

def change_author(new_author)
  previous_author = author
  update(author_id: new_author.id)

  context = Swill::Data.context
  context.refresh(self, :author_id, :author)
  context.invalidate(previous_author, :posts)
  context.invalidate(new_author, :posts)
  true
end
```

`context.refresh(record, *fields)` includes authoritative scalar fields or
complete relationship membership in the response. `context.invalidate(record,
*relationships)` marks cached relationships stale without sending membership.
Both require a saved model and schema-exposed member names. For a small
relationship, replace the last invalidation with `context.refresh(new_author,
:posts)` to avoid a subsequent fetch. When one response both refreshes and
invalidates the same relationship, the refresh wins.

Effects are collected per invocation, including effects declared by
persistence hooks. They cannot leak between operations sharing a connection or
between fibers. The dispatcher re-fetches effect targets under the current
viewer context, avoiding stale association caches and privileged source
objects. Refresh uses ordinary Sequel relationship access, preserving
conditions, ordering, limits, and privacy. Effects do not infer inverse
membership.

Validation and serialization run within the command's default transaction. A
failed command or invalid effect returns no effects, and the default
transaction rolls back. With `transaction: false`, the application owns
rollback and may already have committed before effect serialization fails.
Effects update the calling client, not other connected clients; subscriptions
are separate work. Database changes made outside Swill operations are not
captured.

On the client, an invalidation keeps the collection and its rows and marks
them stale; see [collection state](models.md#collection-state) for the
observable state and how a stale relationship refreshes.

Invalidation messages use protocol version 2. Regenerate schema and client
files and deploy matching server and browser runtimes; an old client fails the
handshake.

`changes:` refreshes fields on an instance command's receiver. `preload:`
projects fields on the returned value. They are independent:

```ruby
command :publish_and_return_author, returns: User,
        changes: [:published], preload: [:name]
```

This returns a canonical `User` with its name and refreshes `published` on
the receiving post. Neither projection is applied to the other object.
Class commands reject `changes:` because they have no instance receiver.
Returning the receiver itself can use both projections; its patches merge
into the same canonical object.

For `Swill::Data::Value` returns, an array projection applies to model members
inside the value; a hash selects value fields individually:

```ruby
command :lookup, on: :class, returns: PostLookup,
        preload: {post: [:title, {author: [:name]}]}
```

Projection paths are checked against the return type during schema generation.
Queries and resolvers also project their return type, which need not be the
declaring model. Commands with transactions validate and serialize their
response before the transaction completes; failures roll it back.

## Types, Loading, and Authorization

Field nullability belongs to the application. A non-null database column is
inferred as non-nilable; explicit types such as `title: String` or
`title: T.nilable(String)` control the exported declaration. Swill does not
make every field nilable because a privacy integration is available.

Sequel::Privacy can return nil for a denied field read. Applications using
that behavior should choose declarations and UI handling appropriate to it.
An application without that behavior can keep non-nilable fields. Unknown
fields may still read as nil before hydration: availability is distinct from
the declared type of a loaded value, and a denied read is nil as well. How the
client reads, hydrates and explicitly loads a field is described in
[identity, partial fields, and
collections](models.md#identity-partial-fields-and-collections).

Generated operations are asynchronous; callers write `await Post.search(...)`
and `await post.publish!`. Local fields and relationships are synchronous.

## Connecting

Add `async-websocket` and a compatible Rack server such as Falcon to the
application's Gemfile. Mount `Swill::Data::WebSocket` in a Rack application
and provide one authenticated viewer context, actor, and opaque scope token
per connection. The browser configures the endpoint before its first
operation:

```ruby
require_relative "models/generated/schema"

module MyApp
  class Application < Swill::Application
    def initialize
      super
      Swill::Model::DistantClient.configure(url: "/data", schema_hash: MyApp::DataSchema::HASH)
    end
  end
end
```

`DataSchema` lives under the common namespace of exported models, or at the
top level when there is none. Configuration is application-wide. Plain
JavaScript can use `Swill.Runtime.configureData(url, schemaHash)`.

The endpoint can be mounted with Rack's `map`:

```ruby
# config.ru — server.rb loads declarations, not listeners.
require_relative "server"

map "/data" do
  run Swill::Data::WebSocket.new(
    schema: Swill::Data::Schema.discover,
    authenticate: ->(env) { MyApp.authenticate_data_connection(env) }
  )
end
```

The application's authentication method returns
`{viewer_context:, actor:, scope_token:}`. Plain Sequel may use a nil viewer
context; the scope token identifies the authenticated data scope. Change it
when the actor or scope changes. Start the Rack server with
`bundle exec falcon serve`; the
[project workflow](getting_started.md#project-workflow) does not manage it.

See [a bound data form](data_form.md) for the complete model-to-form path.
