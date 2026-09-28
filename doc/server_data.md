# Server data

How a browser application works with records the server owns: which models
and operations the server exposes, how that surface becomes client code, what
happens on the wire, and how the endpoint is connected. The client side of the
same records — `DistantObject`, partial fields and collections — is in
[Models](models.md#distant-objects).

## The Data Layer

An application that keeps its records on a server needs to read them, change
them, run behavior that only the server can perform, and keep what the browser
holds consistent with what the server did. The data layer provides this
through a few parts with distinct responsibilities:

- **The server model** is an ordinary `Sequel::Model`. It holds persistence,
  associations, validations, hooks, dataset methods, and any privacy policy.
  Nothing about it changes for Swill.
- **The declaration** is what the model reopens to expose: `client_model`
  names the fields and relationships the browser may see and the fields it
  may write, and `query`, `resolver` and `command` export methods. The
  declaration is schema input only; it is never compiled into the browser.
- **The schema** is reflected from the declared models: their fields with
  types, their relationships, and each operation's signature. It is
  deterministic and hashed, and both ends hold the hash.
- **The generated client** is one Ruby class per declared model, with a
  property per field, a relationship per association, and an `async` method
  per operation, plus an RBI for Sorbet. The compiler merges each generated
  class with the application's own reopening of it into one JavaScript class.
- **The endpoint** is a Rack application that accepts a binary MessagePack
  WebSocket connection, authenticates it once, and runs every message on that
  connection under one viewer context.
- **The context** is what a server method sees while it runs: the viewer
  context, the actor, and a place to declare which other records the method
  affected, so the response carries those effects back.

A connection opens with a handshake: the browser sends the protocol version
and its schema hash, and the server answers with its own or refuses with
`schema_mismatch`. From then on the browser sends operations, writes and
field demands, and every response carries the records it touched as patches.

The running example is a `Post` with an author and comments.

## Declaring the Client Surface

The server entry installs the declarations on the application's Sequel base,
then loads the models and their declarations:

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

A model enters the schema when it declares `client_model`; a model without
the declaration is invisible to the browser, even when another model's
relationship points at it, and the schema rejects such a relationship.

- `fields:` are the columns the browser may read. A field's type is
  reflected from its column; `fields: {title: String, body: T.nilable(String)}`
  states types instead. The primary key is included without being named,
  and a model must have exactly one.
- `relationships:` are the associations the browser may follow: `many_to_one`,
  `one_to_one`, `one_to_many`, `many_to_many` and `one_through_one`, each
  pointing at a declared model. A to-many relationship also gives the client
  a `<name>_controller`, so no field or operation may have that name.
- `writable:` are the fields `save` and `apply_draft` may send: a subset of
  `fields`, scalar, and not the primary key. Every field needs a reader on
  the model and every writable field a writer; the schema raises otherwise.

A column left out of the declaration is still available to server code and
policies. It is absent from the schema, the generated class, field demands
and writes, whatever a privacy policy would allow.

## Operations

An operation exports a method the model already has. There are three kinds:

| Declaration | Receiver on the server | Call in the browser | Transaction |
| --- | --- | --- | --- |
| `query :search` | The model's dataset — the privacy-scoped dataset when sequel-privacy is loaded | `await Post.search(...)` | The application's |
| `resolver :current_user` | The model class | `await User.current_user` | The application's |
| `command :publish!` | The saved instance | `await post.publish!` | Opened by Swill |
| `command :import, on: :class` | The model class | `await Post.import(...)` | Opened by Swill |

A query is a read, usually a dataset method; its dataset result is loaded as
an array. A resolver answers contextual state that is not a dataset
operation. A command performs a mutation. `transaction: false` leaves a
command to manage its own transaction, for a command that must keep an
external request outside the database transaction. An operation exports a
trusted application method; it does not sandbox the method's implementation.

Generated methods keep the method's parameters: required and optional
positional, positional rest, required and optional keywords, and keyword
rest. Defaults are evaluated on the server, and an explicit `nil` is
distinct from an omitted argument. A block parameter is rejected at schema
generation, because a callable cannot cross the connection. The compiler's
own parameter support is described in [keywords, rest arguments, and
blocks](compiler.md#keywords-rest-arguments-and-blocks). A model argument is
sent as a reference and resolved on the server under the viewer context.

Every operation is asynchronous in the browser: `await Post.search(...)`,
`await post.publish!`. Reading a local field or relationship is synchronous.

### Results and Projections

An operation's return value is checked against `returns:` and encoded: a
model becomes a reference to a patch carrying its projected fields, a
dataset or array becomes an array of them, a `Swill::Data::Value` carries its
fields, and anything else is sent as it is.

`preload:` projects fields onto the returned value; `changes:` refreshes
fields on an instance command's receiver. They are independent:

```ruby
command :publish_and_return_author, returns: User,
        changes: [:published], preload: [:name]
```

This returns the canonical `User` with its name, and refreshes `published`
on the post that received the command. A class command has no receiver and
rejects `changes:`. A command that returns its receiver may use both; the
patches merge into the same object.

For a `Swill::Data::Value`, an array projection applies to every model inside
the value, and a hash projects each value field on its own:

```ruby
command :lookup, on: :class, returns: PostLookup,
        preload: {post: [:title, {author: [:name]}]}
```

Projections are checked against the return type when the schema is
generated. A command with a transaction validates and encodes its response
inside it, so a response that fails to encode rolls the command back.

### Effects on Related Objects

A method that changes records other than its receiver names them, through
the context:

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

`context.refresh(record, *fields)` sends the fields' current values, or a
relationship's complete membership, with the response. `context.invalidate(
record, *relationships)` marks the browser's cached membership stale without
sending it; the browser refreshes a stale relationship it is observing or
next reads, as [collection state](models.md#collection-state) describes. A
small relationship is cheaper to refresh than to invalidate and fetch again.
Both require a saved model and declared names, and a relationship both
refreshed and invalidated in one response is refreshed.

Effects belong to the invocation that declared them, including effects
declared from persistence hooks; they cannot reach another operation on the
same connection or another fiber. Before encoding, the dispatcher fetches
each affected record again under the viewer context, so a cached association
or a privileged object cannot become a patch, and reads relationships through
Sequel, keeping their conditions, order, limits and privacy. Effects reach
the client that sent the operation; other clients are not notified. A change
made to the database outside an operation is not reported.

## Persistence

The browser's `save`, `apply_draft` and `delete` on a distant object are
writes, not operations: `CREATE`, `UPDATE` and `DELETE` messages that the
server applies through Sequel. The attributes of a write are checked against
`writable:` and their declared types, the record is created or found under
the viewer context, and Sequel's validations and hooks run as they do for
any save. sequel-privacy's `:create`, `:edit`, protected-field and `:delete`
policies apply when that gem is loaded. The write runs in a transaction and
answers with every declared field of the record. A failed validation answers
`validation_failed` with the model's errors.

A change beyond assigning writable fields — a state transition, a
relationship change — is a command.

## Types and Authorization

Operation signatures and explicit field types are written in Sorbet's
spelling. When the application required `sorbet-runtime` before
`swill/server`, they are Sorbet's own; otherwise `swill/server` supplies the
subset the protocol understands — `T::Sig`, `sig`, `T.nilable`, `T::Boolean`,
`T::Array`, `T.any` and `T.untyped` — and records the same schema. Sorbet is
not required on the server.

A field's nullability is the application's. A `NOT NULL` column is reflected
as non-nilable; an explicit `title: T.nilable(String)` overrides the
reflection. A field the browser has not loaded reads as nil whatever its
type, and so does a field a privacy policy denies; how the client reads,
demands and loads a field is described in [identity, partial fields, and
collections](models.md#identity-partial-fields-and-collections). An
application whose policies deny fields declares those fields nilable.

sequel-privacy is an optional integration, not a dependency. An application
using it adds `gem "sequel-privacy", ">= 0.7.2"` to its Gemfile and requires
it before `swill/server`. When it is loaded, queries and writes go through
the viewer's privacy-scoped dataset, each operation runs inside a privacy
cache scope, and a privacy error answers `unauthorized`. Without it, queries
use the model's dataset and the viewer context may be nil.

## Generating

```sh
bundle exec swill data generate server.rb
bundle exec swill data check server.rb
```

`generate` loads the server entry, reflects the schema, and writes:

| Path | Contents | Loaded by |
| --- | --- | --- |
| `client/models/generated/schema.json` | The schema, for inspection | Nothing |
| `client/models/generated/schema.rb` | `DataSchema::HASH`, for the handshake | The client entry |
| `client/models/generated/<model>.rb` | One class per declared model and value | The client compiler |
| `sorbet/rbi/shims/generated/<model>.rbi` | Their type declarations | Sorbet |

A generated file that no longer corresponds to a declaration is deleted.
`check` fails when a generated file is missing, stale or obsolete, which is
how a build verifies that the checked-in client matches the server.

The root for these paths is the current directory, or `--root DIR`. A
complete application keeps the boundary visible in its layout:

| Path | Loaded by | Purpose |
| --- | --- | --- |
| `server.rb` and `server/models/` | Server and generator | Models, policies, query implementations, and commands |
| `server/operations/` | Server and generator | The `client_model`, `query`, `resolver` and `command` declarations |
| `client/models/generated/` | Client compiler | Generated classes |
| `client/models/` | Client compiler | Handwritten browser-only behavior |
| `sorbet/rbi/shims/generated/` | Sorbet | Generated type declarations |

The server never loads the client directories, and the browser never loads
the server's. The client entry loads the generated classes and then the
handwritten ones; each handwritten file reopens a generated class, and the
compiler merges the two bodies into one JavaScript class, a handwritten
method replacing a generated one of the same name.

Generation runs the server entry as ordinary Ruby, so it may need the
database: Sequel reflects column types and associations from the connection
when a model is defined, whether or not the declaration states explicit
types. An application that generates without a database supplies a schema
loader — `Sequel.mock`, explicit types, `def_column_accessor` — that makes
the same declarations as the running server. Swill does not start the
application and defines no schema-only mode. The
[project workflow](getting_started.md#project-workflow) runs generation
before each build.

## Connecting

The endpoint needs `async-websocket` and a Rack server that supports it,
such as Falcon. `Swill::Data::WebSocket` is mounted in the Rack application
with the schema and an authenticator:

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

`Schema.discover` collects every loaded model that declares `client_model`;
`Schema.new([Post, User])` names them instead. The authenticator runs once
per connection and returns `{viewer_context:, actor:, scope_token:}`: the
viewer context every operation on the connection runs under (nil for plain
Sequel), the actor, and an opaque token that identifies the authenticated
scope. A new actor or scope is a new token. A request that is not a
WebSocket upgrade is answered `426`.

Start the Rack server with `bundle exec falcon serve`; the
[project workflow](getting_started.md#project-workflow) does not manage it.

The browser configures its endpoint before its first operation, with the
hash the generator wrote:

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

`DataSchema` lives under the namespace the declared models share, or at the
top level when they share none. The configuration is application-wide.
Plain JavaScript calls `Swill.Runtime.configureData(url, schemaHash)`.

### Errors

A message that fails answers an `ERROR` with a code and a message:

| Code | Cause |
| --- | --- |
| `handshake_required` | A message before the handshake |
| `schema_mismatch` | The browser's protocol version or schema hash differs from the server's; the connection closes. Regenerate and deploy matching client and server |
| `unknown_model`, `unknown_operation`, `unknown_field` | A name the schema does not declare |
| `wrong_operation_kind` | A query called as a command, or the reverse |
| `invalid_attributes` | A write naming a field that is not writable, with the fields in `details` |
| `validation_failed` | Sequel validation, with the model's errors in `details` |
| `unauthorized` | A privacy policy denied the operation or write |
| `operation_failed` | Any other exception in the method |

The protocol version is 2.

See [a bound data form](data_form.md) for the complete model-to-form path.
