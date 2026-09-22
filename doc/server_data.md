# Server data

The data layer exposes a declared client model surface, lifecycle persistence,
named Sequel queries, contextual resolvers, and instance commands over binary
MessagePack WebSockets. `DATA_DESIGN.md`
describes the model and `DATA_PLAN.md` records the implemented decisions.

Install declarations on the application's Sequel base in the server entry,
load authoritative models and their exported operations, then generate the
checked-in client schema, Ruby models, and RBIs:

```ruby
# server.rb
Swill::Data.install(Sequel::Model)
require_relative "server/models/post"
require_relative "server/operations/post"
```

```ruby
# server/operations/post.rb
class Post
  client_model fields: %i[title body published], relationships: %i[author comments],
               writable: %i[title body]
  query :search, returns: Swill::Data::ResultSet[Post], preload: [:title]
  command :publish!, returns: T::Boolean, changes: %i[published published_at]
end
```

```sh
bundle exec swill data generate config/server.rb
bundle exec swill data check config/server.rb
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
`client/models/generated/schema.json` supplies the client handshake hash.
The repository fixture follows this layout under `spec/fixtures/data` so its
artifacts do not leak into the repository-level `client/` or `sorbet/` trees.

Only models declaring `client_model` enter the protocol. Its `fields` and
`relationships` lists define what may appear in generated code or hydration;
`writable` is the scalar subset accepted by `save` and `apply_draft`. Database
columns omitted from the declaration remain server-only even when a viewer's
privacy policy would permit reading them.

Create and update use Sequel persistence under the connection's viewer
context. Sequel validation, hooks, `:create` or `:edit`, and protected-field
policies run normally. Delete explicitly checks the sequel-privacy `:delete`
action before destruction. Named commands remain appropriate for domain
mutations and relationship changes.

Generated operations are asynchronous; callers write `await Post.search(...)`
and `await post.publish!`. Local fields and relationships remain synchronous.
Unknown members return nil and queue one batched hydration request. Call
`await post.load_field(:body)` when failure must reject explicitly.

Mount `Swill::Data::WebSocket` in a Rack application and provide one
authenticated viewer context, actor, and opaque scope token per connection.
The browser configures the endpoint before its first operation:

```js
Swill.Runtime.configureData("wss://example.test/data", schemaHash);
```

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
