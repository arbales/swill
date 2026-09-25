# Swill data layer plan

For exploratory work on overlapping collections, cached objects, and live
updates, see [Data exchange design](DATA_EXCHANGE_DESIGN.md). That companion
records open API and protocol choices rather than an implementation commitment.

## 1. Define the model split

Use four model locations with distinct responsibilities:

```text
server/models/post.rb
server/operations/post.rb
client/models/generated/post.rb
client/models/post.rb
```

`server/models/post.rb` is the authoritative server model. It remains a normal `Sequel::Model` and contains persistence, associations, validations, dataset methods, command implementations, and `sequel-privacy` rules.

`server/operations/post.rb` reopens the server model and declares the remote
Swill surface. It is schema input and is never compiled into the browser.

```ruby
class Post
  query :search
  command :publish!
end
```

`client/models/generated/post.rb` is generated Ruby representing the client proxy/model shape. It is an intermediate artifact consumed by Ruby2JS.

`client/models/post.rb` contains handwritten client-only behavior.

```ruby
class Post
  def open
    Router.navigate("/posts/#{id}")
  end
end
```

The server loads `server/models/` and `server/operations/`; it never loads
either client directory. The client compiler loads
`client/models/generated/` and then `client/models/`. Generated RBI files are
loaded only by Sorbet. The generated client class contains the methods that
perform remote calls; server declarations are not executable client input.
Generated and handwritten definitions reopen the same local Ruby class. The
compiler combines their bodies in load order and emits one JavaScript class,
with normal Ruby last-definition-wins method semantics.

## 2. Make Swill own a small protocol type system

Do not make Sorbet mandatory.

Swill should normalize all signatures into its own internal type representation:

```text
String
Integer
Float
Boolean
Time
Date

optional[T]
array[T]
ResultSet[T]
ModelRef[T]

union[...]
Enum[...]
```

Support two sources of type information behind the same declaration syntax:

```text
Sorbet's T::Sig
    ↓
Swill protocol types

Swill's T::Sig facade
    ↓
Swill protocol types

No signature
    ↓
dynamic MessagePack values + Ruby method-shape introspection
```

A non-Sorbet application writes the same surface through `swill/server`:

```ruby
extend T::Sig

sig { params(email: String).returns(T.nilable(User)) }
query :first_by_email
```

If Sorbet was loaded first, these are its real types and signatures. Otherwise
Swill supplies only the protocol subset and records the same schema metadata.

Swill should use Ruby reflection to infer argument names, positional/keyword structure, and requiredness regardless of typing. Reflection does not expose default expressions; generated clients preserve omission and let the server method evaluate its defaults.

## 3. Define three remote operation types

Keep the bridge vocabulary small:

```text
query
command
resolver
```

A **query** is read-only server behavior, usually backed by a Sequel dataset method:

```ruby
Post.search(query)
User.first_by_email(email)
```

A **command** performs an action or mutation:

```ruby
post.publish!
post.add_comment!("hello")
```

A **resolver** resolves contextual or symbolic state that is not naturally a dataset operation:

```ruby
User.current_user
Organization.current
```

The client syntax should remain ordinary Ruby:

```ruby
user = await User.current_user
posts = await Post.search("distributed objects")
found = await User.first_by_email("foo@example.com")
await post.publish!
```

## 4. Integrate queries directly with Sequel dataset methods

Treat Sequel dataset methods as the natural server implementation of most queries.

For example:

```ruby
class Post < Sequel::Model
  dataset_module do
    def search(query)
      where(Sequel.ilike(:title, "%#{query}%"))
    end
  end
end
```

and:

```ruby
class User < Sequel::Model
  dataset_module do
    def first_by_email(email)
      first(email: email)
    end
  end
end
```

The server operation files merely expose them:

```ruby
class Post
  query :search
end

class User
  query :first_by_email
end
```

Do not expose arbitrary remote Sequel operations such as:

```ruby
Post.where(...)
Post.order(...)
Post.limit(...)
```

Keep query semantics server-owned through named dataset methods.

## 5. Infer query cardinality from return types

The protocol should distinguish:

```ruby
ResultSet[Post]
Post
T.nilable(Post)
```

rather than adding unnecessary query categories.

Examples:

```ruby
sig { params(query: String).returns(ResultSet[Post]) }
query :search

sig { params(email: String).returns(T.nilable(User)) }
query :first_by_email
```

Swill should know from this whether the result is:

```text
many
exactly one
zero-or-one
```

Without Sorbet, the Swill-native signature syntax provides the same information.

## 6. Introduce canonical model identity on the client

Every distant model instance has stable identity:

```text
(Post, 123)
(User, 42)
```

The client maintains an identity map:

```ruby
Post[123].equal?(Post[123])
# => true
```

All incoming results hydrate these canonical instances rather than creating response-specific copies.

Relationships are references:

```text
Post:123.author → User:42
```

not nested serialized objects.

That gives the client a persistent object graph.

## 7. Add partial-object support

Every client model should track field presence separately from field value.

Distinguish:

```text
present
unknown / not fetched
```

A known `nil` must differ from a field that has never been loaded.
An authorization-denied value is present nil, deliberately indistinguishable
from an authorized nil. Authorization remains entirely server-side; the client
does not expose policy state.

Internally this should probably use a field-presence bitmap generated from the schema.

A search might hydrate only:

```text
Post
  id
  title
  excerpt
  author
```

while later access fills in:

```text
body
created_at
comments
```

Both hydrate the same canonical `Post:123`.

Partials should merge into existing objects.

## 8. Keep the client schema, privacy, and projections separate

Declare the fields and relationships that belong to the client protocol on
each server model. Server columns are private by default:

```ruby
client_model fields: [:title, :body],
             relationships: [:author, :comments],
             writable: [:title, :body]
```

The declaration controls protocol exposure and write capability. It does not
grant authorization. `sequel-privacy` still decides what the current actor may
read or change at runtime.

The responsibilities should be:

```text
Sequel schema
    fields and associations that exist

Swill client schema
    fields and associations the protocol may expose
    fields generic persistence may write

sequel-privacy
    fields/records the current actor may access

Swill projection
    fields useful for this particular fetch/query

Swill Store
    fields currently known by the client
```

The actual returned fields are approximately:

```text
client schema ∩ requested projection ∩ privacy policy
```

plus identity/version metadata.

## 9. Add projections to queries

Queries should be able to specify useful default partials.

Conceptually:

```ruby
query :search,
  preload: [
    :title,
    :excerpt,
    { author: [:name, :avatar] }
  ]
```

This is performance metadata, not access control.

The server evaluates policy before encoding the result.

Projections should be treated as prefetch hints rather than correctness requirements: omitted data can still be loaded later when client access demands it.

## 10. Design the MessagePack object protocol

Do not treat MessagePack as JSON-but-binary.

Define a Swill wire protocol with messages such as:

```text
HELLO
WELCOME

GET
QUERY
RESOLVE
COMMAND

RESULT
RETURN
CHANGE
ERROR
```

Use integer message and schema IDs on the wire eventually, while retaining readable symbolic forms during early development and debugging.

Model references should have a dedicated representation:

```text
Ref(Post, 123)
```

MessagePack extension types are good candidates for a small set of protocol primitives such as:

```text
Ref
UUID
Timestamp
Undefined
```

Do not overuse extensions.

## 11. Make missing fields and relationships demand-driven

Model access should operate synchronously against the local object graph, but accessing missing data may automatically schedule background hydration.

For example:

```ruby
post.comments
```

should return a stable collection object immediately, even if the relationship has not been loaded yet.

```ruby
comments = post.comments
comments.loaded? # => false
```

Accessing or binding to that relationship can schedule:

```text
GET Post:123.comments
```

When the result arrives, Swill mutates the same collection object and emits the appropriate KVO notifications so bound views update.

A view should be able to bind directly to:

```ruby
post.comments
```

without explicitly issuing a separate load operation.

The same model applies to partial related objects.

If:

```text
Post:123.author = Ref(User:42)
```

but `User:42.name` is not yet known, then:

```ruby
post.author
```

returns the canonical `User[42]` immediately.

Accessing or binding to:

```ruby
post.author.name
```

marks `User:42.name` as demanded and schedules background hydration.

When `name` arrives, Swill updates the existing `User[42]` object and emits KVO for `name`. Existing bindings then update normally.

Swill should distinguish:

```text
relationship identity unknown
relationship identity known, target partial
relationship collection unknown
relationship collection known, members partial
```

For example:

```text
Post:123.comments = UNKNOWN
```

differs from:

```text
Post:123.comments = [Comment:1, Comment:2]
```

where the `Comment` objects themselves may still be partial.

The client should coalesce demands within the same run-loop/event-loop window. Rendering or binding twenty posts to:

```ruby
post.author.name
```

should result in one batched fetch for the missing author names rather than twenty individual network requests.

Likewise, accessing several unloaded relationships should allow Swill to batch those relationship loads.

This establishes an important rule:

> Correctness comes from demand-driven hydration. Projections and preloading exist to reduce latency and avoid fetch waterfalls.

KVO and normal Swill data-binding remain the mechanism through which hydrated values propagate into the UI; no rerender-oriented reactive model is required.

## 12. Generate client Ruby, not just JavaScript

The build pipeline should be:

```text
Sequel model metadata
+ server Swill operation declarations
+ Sorbet / Swill signatures
        ↓
Swill schema
        ↓
client/models/generated/*.rb
        ↓
Ruby2JS
        ↓
JavaScript
```

Also generate RBI files from the same schema:

```text
Swill schema
    ├── client/models/generated/post.rb
    └── sorbet/rbi/shims/generated/post.rbi
```

Do not make generated RBI files inputs into the protocol compiler.

The intermediate Ruby is useful for inspection, testing, Sorbet checking, and keeping Ruby2JS as the only Ruby-to-JavaScript compiler.

## 13. Make commands return typed objects plus graph changes

Commands should preserve normal method return semantics.

For example:

```ruby
sig { params(text: String).returns(Comment) }
command :add_comment!
```

may return:

```text
Comment:991
```

while the same response also carries authoritative changes:

```text
Comment:991.body = "..."
Post:123.comment_count = 17
```

The client Store applies those changes to canonical objects and emits KVO notifications for changed fields and relationships.

This provides a foundation for optimistic updates later without requiring them in v1.

Generated distant objects also support ordinary persistence for routine CRUD:

```ruby
comment = Comment.new
comment.post_id = post.id
comment.body = "Hello"
await comment.save

draft = comment.draft
draft.body = "Revised"
await comment.apply_draft(draft)

await comment.delete
```

Create and update accept only the model's declared `writable:` fields. The
server returns authoritative patches after a successful transaction, so
validation, coercion, defaults, and callbacks remain server-owned. Drafts are
detached editing copies: they do not enter the canonical Store or hydrate on
access. Deletion removes the canonical entry and leaves existing references as
observable tombstones through `deleted?`.

Named commands remain the API for domain actions such as `publish!` whose
meaning is richer than generic field persistence. Their typed return values and
declared graph changes use the same canonical patch path.

## 14. Treat authentication as connection context

Resolvers such as:

```ruby
User.current_user
```

should resolve using the authenticated Swill connection/session context.

The returned value is a normal canonical reference:

```ruby
User.current_user.equal?(User[42])
# => true
```

Possessing a reference grants no authority. Every server query, hydration request, and command still runs under the current actor and `sequel-privacy`.

## 15. Build the first vertical slice narrowly

Implement the first working path around:

```ruby
User.current_user

User.first_by_email(email)

Post.search(query)
```

and one instance command:

```ruby
post.publish!
```

Then exercise demand-driven hydration through:

```ruby
post.author.name
post.comments
comment.author.avatar
```

Together these cover:

```text
resolver
dataset query returning one
dataset query returning many
instance command
typed parameters
typed returns
canonical refs
partial objects
lazy relationship hydration
lazy field hydration
batched background GETs
KVO notifications
privacy
MessagePack encoding
generated client Ruby
```

Avoid implementing subscriptions, offline synchronization, arbitrary query composition, or sophisticated optimistic updates until this path is solid.

## Initial milestone

Browser-side Ruby should be able to write:

```ruby
user = await User.current_user

posts = await Post.search("distributed objects")

post = posts.first

bind :text, to: post.author, key: :name
bind :content, to: post, key: :comments

await post.publish!
```

with these guarantees:

```text
User/Post instances have canonical identity

search uses a server Sequel dataset method

arguments and return values are type-checked when signatures are available

sequel-privacy controls returned rows and fields

query results and related objects may be partial

missing bound fields and relationships schedule background hydration

background requests are coalesced and batched

hydration updates existing canonical objects

KVO notifications propagate those changes through Swill data-binding

publish! explicitly crosses the bridge as a command

MessagePack is the protocol representation

all client model glue is generated as Ruby before Ruby2JS
```

The central client-side model is therefore:

```text
canonical identity
    +
partial fields
    +
lazy relationships
    +
KVO observation
    +
demand collection
    ↓
batched background hydration
```

This preserves the appealing part of Distributed Objects: application code navigates a coherent object graph, while Swill manages the remote boundary and asynchronous loading underneath it.
