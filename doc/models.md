# Models

Swill keeps common model behavior separate from its two server data strategies:

| Class | Purpose |
| --- | --- |
| `Swill::Model::Base` | Observable validated attributes, `id`, and attribute collection/application |
| `Swill::Model::Editable` | Adds dirty tracking and detached drafts |
| `Swill::Model::Resource` | JSON:API or plain JSON endpoints, URL relationships, and the resource identity pool |
| `Swill::Model::DistantObject` | Generated server-backed objects, partial hydration, canonical identity, and data operations |

Both strategies ship in `swill.js` and may coexist in one application. New
data-layer development is focused on distant objects; resources remain a
supported and tested compatibility strategy.

## Local attributes and editing

Use `Base` for attribute-only objects and `Editable` when the object needs
dirty tracking or drafts:

```ruby
class Person < Swill::Model::Editable
  attribute :name, type: String, default: ""
  attribute :role, type: String, default: "editor", key: "job"
end
```

Attributes are observable. `validate_<name>(value, previous)` may coerce or
reject a write. `collect_attributes` and `apply_attributes` use each
attribute's external `key`; `from_attributes` constructs and applies a hash.
Every model has a nilable string `id`.

`Editable` adds `dirty`, `dirty?`, `dirty_attributes`,
`collect_dirty_attributes`, `mark_clean!`, `draft`, and `apply_draft`.

## Endpoint resources

Existing endpoint-backed applications inherit `Resource`:

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
JSON. The existing `find`, `fetch`, `find_all`, `where`, `fetch_all`, `save`,
`delete`, `reload`, dataset, identity-pool, and relationship-loading APIs remain
available. Endpoint relationships retain their observable loading and error
properties and generated `load_<name>` and `reload_<name>` methods.

Applications migrating from the former combined base should change endpoint
models from `Swill::Model::Base` to `Swill::Model::Resource`. The compiler
reports this migration when endpoint declarations remain under `Base`.

## Distant objects

The server declares the exact model surface that belongs in the client
protocol:

```ruby
class Contact < Sequel::Model
  client_model(
    fields: %i[name email phone],
    relationships: %i[organization],
    writable: %i[name email phone]
  )
end
```

Only models with `client_model` enter schema discovery. The primary key is
included automatically. `fields` and `relationships` are closed allowlists;
`writable` must be a scalar, non-primary-key subset of `fields`. A server-only
column remains usable by server code and policies while staying absent from
the schema, generated code, hydration requests, and client writes.

`swill data generate` emits a client class like:

```ruby
class Contact < Swill::Model::DistantObject
  model_name "Contact"
  attribute :name, type: String
  attribute :email, type: String
  has_one :organization, model: "Organization"
end
```

Generated queries and resolvers are async class methods. Commands are async
instance methods by default; `on: :class` generates a class method. Applications add browser-only behavior by reopening the
generated class in a later handwritten source file.

## Identity, partial fields, and collections

The compiled Ruby `DistantClient` keeps one canonical distant object for each
`(model, id)`. Queries, relationships, resolvers, commands, hydration, and
persistence patches all update that object. Per-field generations prevent
older responses from replacing newer values, while a background patch leaves
a locally dirty field alone.

Unknown and known-nil fields both read as nil. Presence remains available
through `field_loaded?`, `field_loading?`, and `field_error`; explicit code can
call `load_field` or `reload_field`. Reading an unknown field queues a batched
hydration request.

This loading behavior does not force all declared types to be nilable.
Applications choose their loaded-value types; Sequel::Privacy's denied-read
nils are an integration-specific consideration. See
[types, loading, and authorization](server_data.md#types-loading-and-authorization).

A to-many relationship is a stable `Collection`; hydration replaces its
records without replacing the collection. Many-valued queries return a loaded
`ResultSet`. Both expose observable collection state and array-like reads.

## Distant editing and lifecycle

Distant objects support authoritative create, update, and delete. `save` sends
only dirty fields declared writable by `client_model`. An id-less object is
created and becomes the canonical instance when the server assigns its ID.
An existing object is updated. The server validates the message, runs Sequel
setters, validation, hooks, and sequel-privacy policies, then returns an
authoritative patch.

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

Named commands remain the interface for domain mutations and relationships.
Generic lifecycle persistence is limited to the declared writable scalar
fields.
