# Wire And Privacy Discussion

Edited excerpts from the recent design conversation. These are architectural notes, not a protocol specification.

## Custom Wire Protocol

**User**

> Re: HTTP — I want to move away from HTTP and towards a more custom-fitted wire and data protocol given the alignment of client and server semantics.

**Assistant**

Use a persistent connection, probably WebSocket, carrying a small versioned Swill protocol. A client dataset builds a lazy, restricted query AST:

```ruby
Brewery
  .where(state: "OR")
  .exclude(closed: true)
  .order(:name)
  .limit(20)
  .all
```

Only terminal operations cross the wire. One possible message shape:

```ruby
[:query, 14, :breweries, [
  [:where, { state: "OR" }],
  [:order, [:name]],
  [:limit, 20]
]]
```

Mutations should send change sets rather than arbitrary method calls:

```ruby
[:change, 21, :member, 84, {
  version: 7,
  values: { email: "new@example.com" }
}]
```

Never transmit arbitrary Ruby, SQL, or `Marshal`. Share model metadata, codecs, validations, value objects, and the permitted operation vocabulary.

## Privacy Boundary

**User**

> How would we think about permissions/privacy? (I was thinking of using sequel-privacy)

**Assistant**

`sequel-privacy` should remain the server authority. Authenticate the connection once and create a server-owned viewer context:

```ruby
connection.viewer_context =
  Sequel::Privacy::ViewerContext.for_actor(current_member)
```

The client must never choose its actor ID or request `anonymous`, `omniscient`, or `all_powerful`.

Every query AST is untrusted input. The server should:

1. Resolve allowlisted models and operations.
2. Start from a privacy-scoped dataset.
3. Apply permitted client predicates.
4. Enforce record privacy.
5. Serialize only permitted fields.

The existing `for_vc` filtering is a useful final guard, but post-materialization filtering cannot produce correct counts, pagination, ordering, or subscriptions. Coarse visibility rules should therefore compile into SQL:

```ruby
privacy do
  dataset :view do |vc, dataset|
    dataset.where(organization_id: vc.actor.organization_id)
  end

  can :view, P::AllowMembers
end
```

Dataset scope is the coarse boundary; policies remain the precise boundary.

## Fields And Mutations

Denied fields should be omitted, not serialized as ordinary `nil`. Read and write policies should be separate:

```ruby
field :email,
  read: P::AllowMembers,
  write: P::AllowSelf
```

For mutations, reload the record under the connection's viewer context, check the record action, check every changed field, execute inside a transaction, and return a newly privacy-filtered snapshot. Association changes should flow through `sequel-privacy` association policies.

## Subscriptions And Revocation

Subscriptions require privacy checks:

- when initially subscribed;
- for every inserted or updated record;
- when relationships used by policies change;
- whenever the viewer context changes.

If a visible record becomes private, send an explicit revocation:

```ruby
[:revoke, :member, 84]
```

Policy caches should be scoped to an operation or event, not the lifetime of a persistent connection. Hidden and nonexistent records should generally produce indistinguishable responses.
