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

## Resolved Direction

A later pass settled the open architectural question. These are the decisions
that supersede the open-AST sketch above; the earlier notes remain for context.

### Named And Parameterized, Not An Open AST

The client does not author query structure. It invokes server-defined, named,
parameterized datasets and supplies values. The win is default-deny: a query
that does not exist cannot be run, and a new column is not one missing policy
away from leaking. The earlier open-AST shape is rejected as default-exposed and
hard to walk back once clients depend on it.

The reframe that drives this: the client is the attacker. A query AST is an API
surface you did not hand-design — every model becomes queryable whether or not
you intended it. Sharing the *vocabulary* (model metadata, validations, codecs)
is safe; trusting the caller to author execution is not.

### The Shared Module Mechanism

Named scopes live in a Sequel `dataset_module` on the model:

```ruby
class Brewery < Sequel::Model
  dataset_module do
    def in_state(state) = where(state: state)
    def open           = exclude(closed: true)
    def alphabetical   = order(:name)
  end
end
```

On the server these are ordinary chainable Sequel scopes, reused by jobs, other
endpoints, and server-rendered pages. On the client the same names exist as a
thin facade that emits a wire message naming the method and its scalar
arguments rather than building SQL:

```ruby
Brewery.in_state("OR").open.alphabetical.limit(20).all
# => [:query, 14, :brewery, [
#      [:in_state, ["OR"]], [:open, []], [:alphabetical, []], [:limit, 20]
#    ]]
```

The server replays those names against a privacy-scoped dataset and rejects any
name not in the model's `dataset_module`. One definition, two callers, one
executor — DRY without sharing trust.

Share the declaration (names, param schemas, validations) as the contract. The
method bodies execute only on the server. Opal makes it easy to accidentally
compile the SQL-building and authorization logic into the browser; ship the
signatures, run the bodies server-side.

### The Param-Is-A-Value Rule

The single rule that keeps named methods safe: **parameters are values, never
structure.** A parameter may be a scalar bound into SQL. It must never be a
column name, table name, operator, or operation selector. `def ordered_by(col)
= order(col)` re-opens the entire open-AST hole through a parameter. To offer
"sort by one of N columns," map a symbolic parameter to a fixed column through
an internal allowlist inside the method. The same holds for `LIKE` patterns and
anything that becomes an identifier rather than a bind value.

### Mutations: Named Commands, Not Change-Sets

sequel-privacy is the *gate*, not the *shape*. It answers "may this viewer
perform this action and write this field?" It does not express intent and
invariants (multi-field, multi-record operations, state machines, side
effects), atomicity (the command is the transaction boundary), or default-deny
on the write surface (a generic `values: {}` change-set is mass-assignment that
bets every field write-policy is present and correct — the default-exposed trap
again).

So the write side mirrors the read side with named, parameterized commands:

```ruby
class MailingList < Sequel::Model
  command :rename, params: { name: :string } do |vc|
    authorize!(vc, :update)   # sequel-privacy: the gate
    self.name = name          # only declared params are in scope
    save_changes              # validations + transaction
  end
end
```

```ruby
[:command, 21, :mailing_list, 84, :rename, { name: "Friends of Swill" }, version: 7]
```

The server resolves model and id under the viewer context, resolves `:rename`
against the command allowlist, coerces params via shared codecs, runs in a
transaction, lets privacy enforce the action and any field writes the body
performs, and returns a re-filtered snapshot or a typed error. `version:` keeps
the optimistic-lock check.

The division to hold onto:

- **sequel-privacy is the gate** — may this happen, enforced inside the command
  on the real records.
- **The named command is the shape** — what operations exist at all, their
  params, invariants, side effects, and atomicity.

Commands obey the same param-is-a-value rule.

### The Generic Update Concession

To avoid a command per trivial edit, a model may expose a single generic
`update` command whose param schema *is* its explicitly permitted writable
fields. Still default-deny (opt-in per field), still privacy-gated — one
well-defined verb, not an open change-set.

### Guards Carried Forward

Named operations narrow the surface; they do not remove these:

- **Filterable is a third permission**, separate from read and write. Filtering
  on a field leaks it even when the value is never serialized
  (`where(salary: 100000..).count` is a binary oracle). Default: not filterable.
- **Operators are attack surface.** Allow operators per field, not just columns.
  Watch regex (ReDoS) and `LIKE '%x%'` (full scans).
- **Resource limits.** Mandatory `limit` ceiling; sortable/filterable only on
  indexed columns; per-query `statement_timeout`; cursor pagination over
  `OFFSET` for large sets; per-connection complexity and rate budgets.
- **Aggregates only over fully SQL-compiled scopes.** A `count` that depends on
  a row-level Ruby policy either lies or leaks.
- **No joins in v1.** Association traversal multiplies privacy boundaries and
  cost; fetch associations as separate, separately-authorized queries.
- **Decode safety.** Reject unknown opcodes, bound message size and nesting
  depth. Never `String#to_sym` untrusted input; never `const_get`/`send` a
  client-supplied model or column name. Resolve opcodes, models, and columns
  through fixed allowlist hashes.
- **Subscription limits.** Cap subscription count and breadth per connection;
  debounce; keep per-event policy-cache scoping.
