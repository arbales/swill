# Server data

The data layer exposes a declared client model surface, lifecycle persistence,
named Sequel queries, contextual resolvers, and instance or class commands over binary
MessagePack WebSockets. `DATA_DESIGN.md`
describes the model and `DATA_PLAN.md` records the implemented decisions.

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

The server entrypoint uses Sorbet's type spelling without requiring an
application to load Sorbet. When `sorbet-runtime` was required first, Swill
uses its `T`; otherwise it supplies the protocol subset: `T::Sig`,
`T.nilable`, `T::Boolean`, `T::Array`, `T.any`, and `T.untyped`.

Applications using sequel-privacy add `gem "sequel-privacy", ">= 0.7.2"`
to their Gemfile and require it before `swill/server`. It is an optional
integration, not a Swill gem dependency. Plain
Sequel applications do not load privacy code; dispatch uses privacy-aware
datasets and cache scopes only when sequel-privacy is present.

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
local class reopenings in source order and emits one JavaScript class; later
handwritten method definitions replace generated definitions with the same name.
`client/models/generated/schema.rb` supplies the Ruby `DataSchema::HASH`
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

Only models declaring `client_model` enter the protocol. Its `fields` and
`relationships` lists define what may appear in generated code or hydration;
`writable` is the scalar subset accepted by `save` and `apply_draft`. Database
columns omitted from the declaration remain server-only even when a viewer's
privacy policy would permit reading them.

Create and update use Sequel persistence under the connection's viewer
context. Sequel validation and hooks run normally. When sequel-privacy is
loaded, its `:create`, `:edit`, protected-field, and `:delete` policies also
apply. Named commands remain appropriate for domain mutations and relationship
changes.

## Operations and projections

| Declaration | Server receiver | Client call | Transaction |
| --- | --- | --- | --- |
| `query :search` | Privacy-aware dataset when privacy is installed; otherwise the model dataset | `await Post.search(...)` | Application-owned |
| `resolver :current_user` | Model class | `await User.current_user` | Application-owned |
| `command :publish!` | Persisted model instance | `await post.publish!` | Swill wraps by default |
| `command :import, on: :class` | Model class | `await Post.import(...)` | Swill wraps by default |

`transaction: false` lets a command own transaction boundaries in its body,
for example keeping an external HTTP request outside the database transaction.
These declarations export trusted application methods; they do not sandbox
query or resolver implementations.

### Effects on related objects

Server method bodies can describe affected objects explicitly:

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
:posts)` to avoid a subsequent fetch. Refresh wins if the same relationship is
both refreshed and invalidated in one response.

Effects are collected per invocation, including effects declared by persistence
hooks. They cannot leak between operations sharing a connection or between
fibers. The dispatcher re-fetches effect targets under the current viewer
context, avoiding stale association caches and privileged source objects.
Refresh uses ordinary Sequel relationship access, preserving conditions,
ordering, limits, and privacy. Effects do not infer inverse membership.

Validation and serialization run within the command's default transaction.
A failed command or invalid effect returns no effects; the default transaction
rolls back. With `transaction: false`, the application still owns rollback and
may already have committed before effect serialization fails. Effects update
the calling client, not other connected clients; subscriptions remain separate
work. Arbitrary database changes outside Swill operations are not captured.

On the client, invalidation keeps the collection and its rows:

```ruby
posts = author.posts
posts.loaded?   # Has authoritative membership ever been received?
posts.stale?    # Does that membership need refreshing?
posts.loading?  # Is a load queued or in flight?
posts.error     # Last load error, if any
author.field_stale?(:posts) # Also available for to-one relationships
```

A relationship observed directly or through an actively observed computed
property refreshes through the normal batched demand path. An unused
relationship waits until accessed; reading a retained collection's records
also counts as access. Disposing observers ends that automatic demand. Loading
and freshness are separate from availability: refresh and failure retain
`loaded?` and the previous contents. `load_field` refreshes stale fields;
`reload_field` forces a refresh. An older response or load failure cannot clear
a newer invalidation or replace newer state.

Invalidation messages use protocol version 2. Regenerate schema/client files
and deploy matching server and browser runtimes; old clients fail the handshake
instead of silently ignoring membership invalidations.

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

Migration: `changes:` previously doubled as a return projection, and
`preload:` replaced it when both were supplied. Declare both explicitly when
both effects are intended, then regenerate clients and restart the server.
The schema hash changes and rejects stale generated clients.

## Types, loading, and authorization

Field nullability belongs to the application. A non-null database column is
inferred as non-nilable; explicit types such as `title: String` or
`title: T.nilable(String)` control the exported declaration. Swill does not
make every field nilable merely because a privacy integration is available.

Sequel::Privacy can return nil for a denied field read. Applications using
that behavior should choose declarations and UI handling appropriate to it.
An application without that behavior can retain non-nilable fields. Unknown
fields may still read as nil before hydration: availability is distinct from
the declared type of a loaded value. `field_loaded?` and `load_field` let
explicit code establish availability. There is no separate public nil value
for a denied read.

Generated operations are asynchronous; callers write `await Post.search(...)`
and `await post.publish!`. Local fields and relationships remain synchronous.
Unknown members return nil and queue one batched hydration request. Call
`await post.load_field(:body)` when failure must reject explicitly.

## Connecting

Add `async-websocket` and a compatible Rack server such as Falcon to the
application's Gemfile. Mount `Swill::Data::WebSocket` in a Rack application and provide one
authenticated viewer context, actor, and opaque scope token per connection.
The browser configures the endpoint before its first operation:

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
top level when there is none. Configuration is currently application-wide.
Plain JavaScript can use `Swill.Runtime.configureData(url, schemaHash)`.

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

The application authentication method returns
`{viewer_context:, actor:, scope_token:}`. Plain Sequel may use a nil viewer
context; the scope token identifies the authenticated data scope. Change it
when the actor/scope changes. Start the Rack server manually, for example
`bundle exec falcon serve`. The build/watch commands do not manage it.

See [a bound data form](data_form.md) for the complete model-to-form path.

Protocol v1 generated methods preserve required and optional positional
parameters, positional rest, required and optional keywords, and keyword rest.
Defaults run only on the server, and explicit `nil` remains distinct from an
omitted argument. Schema generation rejects block parameters because executable
callbacks do not cross the data connection.

Compiled Ruby methods also support named `*rest`, required and optional
keywords, named `**options`, `&block`, block passing, `yield`, and
`block_given?`. Anonymous forwarding (`*`, `**`, `&`, and `...`) and `**nil`
remain outside the compiler subset and fail during compilation.

`build/` is disposable. `rb/dist/` contains checked-in browser output.
Regenerate it with `rake build`; do not edit generated files.
