# Models & Data

Swill makes it easy for you (or maybe just me!) to work with data from your
web services.

`Swill::Model` has two concrete subclasses, chosen by how the application
reaches its data. `Swill::Model::Resource` fetches models and relationships
over JSON:API (or plain JSON). It keeps one instance per id, so a record
fetched twice is the same object; saves, deletes and reloads a record against
its endpoint; and loads `has_many` and `has_one` relationships from their own
URLs the first time they are read.

`Swill::Model::DistantObject` is a sort of homeage to Distributed Objects in
Cocoa, or a hand-rolled RPC-like thing that you might not enjoy but I do! The
server generates these models from `Sequel::Model` classes; they support
partial hydration, canonical identity, typed operations and more.

You can use both together in an application if you like.

## Local-Only Models

`Base` gives a model observable attributes, validations through
`validate_<name>`, and identity set by a String `id` field. `Editable` adds
dirty tracking and draft support.

```ruby
class Person < Swill::Model::Editable
  attribute :name, type: String, default: ""
  attribute :role, type: String, default: "editor", key: "job"
end
```

## JSON Resources

`Resource` declares the source and shape of a remote resource.

```ruby
class Menu < Swill::Model::Resource
  endpoint "/api/menus"
  resource_type "menus"

  attribute :name, type: String, default: ""
  has_many :recipes, type: Recipe, key: "menu_recipes",
           url: "/api/menus/:id/recipes"
end
```

JSON:API is the default codec; `codec Swill::Model::PlainJSON` selects plain
JSON. `find`, `fetch`, `find_all`, `where`, `fetch_all`, `save`, `delete`,
`reload`, the dataset, the identity pool, and relationship loading are
available on every `Resource`. An endpoint relationship has observable loading
and error properties and generated `load_<name>` and `reload_<name>` methods.

## Distant Objects

The server declares which fields and relationships of a `Sequel::Model` belong
in the client protocol with `client_model`; see [declaring the client
surface](server_data.md#declaring-the-client-surface) for the declaration and
its rules. `swill data generate` emits a client class like:

```ruby
class Contact < Swill::Model::DistantObject
  model_name "Contact"
  attribute :name, type: String
  attribute :email, type: String
  many_to_one :organization, class: "Organization"
end
```

Generated queries and resolvers are async class methods. Commands are async
instance methods by default; `on: :class` generates a class method.
Applications add browser-only behavior by reopening the generated class in a
later handwritten source file.

### Relationship Controllers

A to-many relationship generates a `<name>_controller` accessor, so
`mailing_list.members_controller` returns an `ArrayController` whose content
is the `members` collection. The accessor lazily caches one default
`ArrayController` per owner and relationship. Repeated access shares sort and
selection state, not only the data. Constructing it creates no DOM objects and
fetches nothing.

A view-owned controller should be retained by its owner and released with it.
A model-cached relationship controller lives until the model disconnects or
resets; it can outlive individual views. Reading `members_controller` does not
fetch membership. Reading or observing its arrangement accesses the
relationship and participates in normal loading. Invalidation releases
obsolete computation dependencies, and release ends the remaining
observations. See [collections](collections.md) for sharing that controller
between a table and other views.

### Collection State

Invalidation from the server keeps a relationship collection and its rows:

```ruby
posts = author.posts
posts.loaded?   # Has authoritative membership ever been received?
posts.stale?    # Does that membership need refreshing?
posts.loading?  # Is a load queued or in flight?
posts.error     # Last load error, if any
author.field_stale?(:posts) # Also available for to-one relationships
```

A relationship observed directly or through an actively observed computed
property refreshes through the normal batched demand path. An unobserved
relationship waits until it is accessed; reading a retained collection's
records also counts as access. Releasing the observers ends that automatic
demand. Loading and freshness are separate from availability: a refresh or a
failure keeps `loaded?` true and keeps the previous contents. `load_field`
refreshes stale fields; `reload_field` forces a refresh. An older response or
load failure cannot clear a newer invalidation or replace newer state. See
[effects on related objects](server_data.md#effects-on-related-objects) for
how a server operation marks a relationship stale.

## Identity, Partial Fields, and Collections

The compiled Ruby `DistantClient` keeps one canonical distant object for each
`(model, id)`. Queries, relationships, resolvers, commands, hydration, and
persistence patches all update that object. Per-field generations prevent
older responses from replacing newer values, and a background patch leaves a
locally dirty field alone.

Unknown and known-nil fields both read as nil. Presence is available through
`field_loaded?`, `field_loading?`, and `field_error`; explicit code can call
`load_field` or `reload_field`. Reading an unknown field queues a batched
hydration request. `await post.load_field(:body)` rejects when the load
fails, where a read of the field would remain nil.

This loading behavior does not force all declared types to be nilable; see
[types, loading, and authorization](server_data.md#types-and-authorization).

A to-many relationship is a stable, read-only `RelationshipCollection`;
hydration replaces its records without replacing the collection. Many-valued
queries return a loaded `ResultSet`. Both expose observable collection state
and array-like reads.

Generated relationship declarations preserve Sequel's association names and
use `class:` for the destination. Relationships cannot be assigned or edited
locally: use an exposed server operation to change them. Their `records` arrays
are frozen snapshots of membership, not frozen model objects. Query result
collections are editable. Collection loading and error state follow the
owner's field state, including failures, retries, and resets.

## Distant Editing and Lifecycle

Distant objects support authoritative create, update, and delete. `save` sends
only dirty fields declared writable by `client_model`. An id-less object is
created and becomes the canonical instance when the server assigns its ID.
An existing object is updated. The server validates the message and runs
Sequel setters, validation, and hooks; when sequel-privacy is loaded, its
policies run as well. It then returns an authoritative patch. See
[persistence](server_data.md#persistence).

Use a draft when rejected values must not appear through the shared canonical
object:

```ruby
draft = contact.draft
draft.name = "Grace"

await contact.apply_draft(draft)
```

A distant draft requires a saved original and copies only scalar fields already
present on it. It does not enter the canonical store or hydrate missing fields.
`apply_draft` sends only its dirty values and changes the canonical object only
after the server accepts them. `draft?` distinguishes the detached copy from a
canonical object. Discarding the draft abandons the edit.

After an accepted `delete`, `deleted?` becomes true, the object leaves the
canonical store, cached values remain readable by existing bindings, and
future persistence or hydration is rejected. Older in-flight responses cannot
resurrect it.

Named commands are the interface for domain mutations and relationships.
Generic lifecycle persistence is limited to the declared writable scalar
fields.
