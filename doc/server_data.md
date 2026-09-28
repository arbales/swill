# Server Data

Swill supports working with model objects across the network, bridging your
server-side objects to your browser client without individual endpoints,
serializers or other ceremony.

This guide describes how a model exposes itself to clients, client code
generation, the wire format, and how client and server connect.

The client side of the same objects — `Swill::Distant::Object`, partial
fields and collections — is in the [Models guide](models.md#distant-objects).

## Distant Objects

An application that keeps its records on a server needs to read them, change
them, run behavior that only the server can perform, and keep what the browser
holds consistent with what the server did. Distant Objects provides this
through a few parts with distinct responsibilities:

- A **server model** is an ordinary `Sequel::Model`. It communicates with your
  database and is responsible for persistence, associations, validations and
  hooks. An existing data model needs no change to adopt Distant Objects.
- A model's **distant interface** declares what it provides to clients:
  `fields`, `associations` and `writable` expose the corresponding portions
  of the server model, and `query`, `resolver` and `command` export methods.
- The **schema** is generated from the server models and their distant
  interfaces. It holds the types, the associations and the signature of
  every exported method, carries the protocol version, and is hashed; client
  and server each hold the hash.
- A **generated client model** is a Ruby class with a property per field, an
  association per association, and an `async` method per remote method, with
  type information for Sorbet and the compiler.
- An **extension** is also generated for each client model: a file that
  reopens the generated class, where you add client-side behavior. The
  compiler merges the generated and authored parts into a single JavaScript
  class.
- A **connection** is a Rack application that accepts a binary MessagePack
  WebSocket connection, authenticates it, and runs the messages it receives.
  Where the application uses `Sequel::Privacy` or another authorization
  layer, the connection also carries a viewer context into every remote
  method.
- A server method runs in a **context** holding the actor and viewer context,
  and methods for noting an operation's side effects — refreshing objects and
  invalidating associations the client will need to reload.

A connection opens with a handshake: the browser sends the protocol version
and its schema hash, and the server answers with its own or refuses with
`schema_mismatch`. From then on the browser sends remote methods, writes and
field demands, and the server answers each with the objects it touched.

The running example is a `Post` with an author and comments.

## Creating a Distant Interface

The server entry loads the models, then their distant interfaces:

```ruby
# server.rb
require "sequel"
require "swill/server"

require_relative "server/models/post"
require_relative "server/interfaces/post"
```

```ruby
# server/interfaces/post.rb
class Post
  module DistantInterface
    extend Swill::Distant::Interface

    fields :title, :body, :published, :published_at
    associations :author, :comments
    writable :title, :body

    query :search, returns: Swill::Distant::ResultSet[Post], preload: [:title]
    command :publish!, returns: T::Boolean, changes: %i[published published_at]
  end
end
```

A model with a `DistantInterface` module is in the schema; a model without
one is invisible to the browser, even when another model's association
points at it, and the schema rejects such an association. Models are
required before their interfaces.

- `fields` are the columns the browser may read. A field's type is
  reflected from its column; `fields :title, body: T.nilable(String)` states
  a type instead. The primary key is included without being named, and a
  model must have exactly one.
- `associations` are the associations the browser may follow: `many_to_one`,
  `one_to_one`, `one_to_many`, `many_to_many` and `one_through_one`, each
  pointing at a model with an interface. A to-many association also gives the
  client a `<name>_controller`, so no field or remote method may have that
  name.
- `writable` are the fields `save` and `apply_draft` may send: a subset of
  `fields`, scalar, and not the primary key. Every field needs a reader on
  the model and every writable field a writer; the schema raises otherwise.

Each of the three may be called more than once; naming a field twice raises.

A column left out of the interface is still available to server code and
policies. It is absent from the schema, the generated class, field demands
and writes, whatever a privacy policy would allow.

## Remote Methods

A remote method exports a method the model already has. There are three
kinds:

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
external request outside the database transaction. A remote method exports a
trusted application method; it does not sandbox the method's implementation.

Generated methods keep the method's parameters: required and optional
positional, positional rest, required and optional keywords, and keyword
rest. Defaults are evaluated on the server, and an explicit `nil` is
distinct from an omitted argument. A block parameter is rejected at schema
generation, because a callable cannot cross the connection. The compiler's
own parameter support is described in [keywords, rest arguments, and
blocks](compiler.md#keywords-rest-arguments-and-blocks). A model argument is
sent as a reference and resolved on the server under the viewer context.

Every remote method is asynchronous in the browser: `await Post.search(...)`,
`await post.publish!`. Reading a local field or association is synchronous.

### Results and Projections

A remote method's return value is checked against `returns:` and encoded: a
model becomes a reference to a patch carrying its projected fields, a
dataset or array becomes an array of them, a `Swill::Distant::Value` carries
its fields, and anything else is sent as it is.

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

For a `Swill::Distant::Value`, an array projection applies to every model
inside the value, and a hash projects each value field on its own:

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

  context = Swill::Distant.context
  context.refresh(self, :author_id, :author)
  context.invalidate(previous_author, :posts)
  context.invalidate(new_author, :posts)
  true
end
```

`context.refresh(record, *fields)` sends the fields' current values, or an
association's complete membership, with the response. `context.invalidate(
record, *associations)` marks the browser's cached membership stale without
sending it; the browser refreshes a stale association it is observing or
next reads, as [collection state](models.md#collection-state) describes. A
small association is cheaper to refresh than to invalidate and fetch again.
Both require a saved model and declared names, and an association both
refreshed and invalidated in one response is refreshed.

Effects belong to the invocation that declared them, including effects
declared from persistence hooks; they cannot reach another remote method on
the same connection or another fiber. Before encoding, the dispatcher fetches
each affected record again under the viewer context, so a cached association
or a privileged object cannot become a patch, and reads associations through
Sequel, keeping their conditions, order, limits and privacy. Effects reach
the client that sent the remote method; other clients are not notified. A
change made to the database outside a remote method is not reported.

## Persistence

The browser's `save`, `apply_draft` and `delete` on a distant object are
writes, not remote methods: `CREATE`, `UPDATE` and `DELETE` messages that the
server applies through Sequel. The attributes of a write are checked against
`writable` and their declared types, the record is created or found under
the viewer context, and Sequel's validations and hooks run as they do for
any save. sequel-privacy's `:create`, `:edit`, protected-field and `:delete`
policies apply when that gem is loaded. The write runs in a transaction and
answers with every declared field of the record. A failed validation answers
`validation_failed` with the model's errors.

A change beyond assigning writable fields — a state transition, an
association change — is a command.

## Types and Authorization

Method signatures and explicit field types are written in Sorbet's spelling.
When the application required `sorbet-runtime` before `swill/server`, they
are Sorbet's own; otherwise `swill/server` supplies the subset the protocol
understands — `T::Sig`, `sig`, `T.nilable`, `T::Boolean`, `T::Array`, `T.any`
and `T.untyped` — and records the same schema. Sorbet is not required on the
server.

A field's nullability is the application's. A `NOT NULL` column is reflected
as non-nilable; an explicit `body: T.nilable(String)` overrides the
reflection. A field the browser has not loaded reads as nil whatever its
type, and so does a field a privacy policy denies; how the client reads,
demands and loads a field is described in [identity, partial fields, and
collections](models.md#identity-partial-fields-and-collections). An
application whose policies deny fields declares those fields nilable.

sequel-privacy is an optional integration, not a dependency. An application
using it adds `gem "sequel-privacy", ">= 0.7.2"` to its Gemfile and requires
it before `swill/server`. When it is loaded, queries and writes go through
the viewer's privacy-scoped dataset, each remote method runs inside a privacy
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
| `client/models/generated/<model>.rb` | One class per model and value | The client compiler |
| `client/models/<model>.rb` | The extension: written once, when absent | The client compiler |
| `sorbet/rbi/shims/generated/<model>.rbi` | Their type declarations | Sorbet |

A generated file under `generated/` that no longer corresponds to a
declaration is deleted; an extension is never checked, overwritten or
deleted. `check` fails when a generated file is missing, stale or obsolete,
which is how a build verifies that the checked-in client matches the server.

The root for these paths is the current directory, or `--root DIR`. A
complete application keeps the boundary visible in its layout:

| Path | Loaded by | Purpose |
| --- | --- | --- |
| `server.rb` and `server/models/` | Server and generator | Models, policies, query implementations, and commands |
| `server/interfaces/` | Server and generator | The distant interfaces |
| `client/models/generated/` | Client compiler | Generated classes |
| `client/models/` | Client compiler | Extensions |
| `sorbet/rbi/shims/generated/` | Sorbet | Generated type declarations |

The server never loads the client directories, and the browser never loads
the server's. The client entry loads the generated classes and then the
extensions; the compiler merges the two bodies into one JavaScript class, a
method in the extension replacing a generated one of the same name.

Generation runs the server entry as ordinary Ruby, so it may need the
database: Sequel reflects column types and associations from the connection
when a model is defined, whether or not the interface states explicit types.
An application that generates without a database supplies a schema loader —
`Sequel.mock`, explicit types, `def_column_accessor` — that makes the same
declarations as the running server. Swill does not start the application and
defines no schema-only mode. The [project
workflow](getting_started.md#project-workflow) runs generation before each
build.

## Connecting

The connection needs `async-websocket` and a Rack server that supports it,
such as Falcon. `Swill::Distant::Connection` is mounted in the Rack
application with the schema and an authenticator:

```ruby
# config.ru — server.rb loads declarations, not listeners.
require_relative "server"

map "/data" do
  run Swill::Distant::Connection.new(
    schema: Swill::Distant::Schema.discover,
    authenticate: ->(env) { MyApp.authenticate_data_connection(env) }
  )
end
```

`Schema.discover` collects the models that have a distant interface;
`Schema.new([Post, User])` names them instead. The authenticator runs once
per connection and returns `{viewer_context:, actor:, scope_token:}`: the
viewer context every remote method on the connection runs under (nil for
plain Sequel), the actor, and an opaque token that identifies the
authenticated scope. A new actor or scope is a new token. A request that is
not a WebSocket upgrade is answered `426`.

Start the Rack server with `bundle exec falcon serve`; the
[project workflow](getting_started.md#project-workflow) does not manage it.

The browser configures its connection before its first remote method, with
the hash the generator wrote:

```ruby
require_relative "models/generated/schema"

module MyApp
  class Application < Swill::Application
    def initialize
      super
      Swill::Distant::Client.configure(url: "/data", schema_hash: MyApp::DataSchema::HASH)
    end
  end
end
```

`DataSchema` lives under the namespace the models share, or at the top level
when they share none. The configuration is application-wide. Plain
JavaScript calls `Swill.Runtime.configureData(url, schemaHash)`.

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
| `unauthorized` | A privacy policy denied the remote method or write |
| `operation_failed` | Any other exception in the method |

The protocol version is 2.

See [a bound data form](data_form.md) for the complete model-to-form path.
