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
# TODO: It might be useful to have the client dataset methods in their
# own module that's combined with the main dataset module(s). 
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

The write side mirrors the read side, in the same shape. Just as named queries
live in a Sequel `dataset_module`, named mutators live in a dedicated command
module of ordinary methods:

```ruby
module MailingList::Commands
  def rename(name:)
    self.name = name
    save_changes
  end

  def archive
    update(archived_at: Time.now)
  end
end
```

```ruby
# TODO: What about using...
class MailingList
  module Swill
    module Commands
    end
    module DatasetMethods
    end
  end
end
# then on the server we can include these modules into the appropriate scopes for use there, and the same on the client.
```

There is no `authorize!` call. sequel-privacy enforces permissions during the
write itself: a record loaded under the connection's viewer context carries that
context into its save hooks, which check the record action and every changed
field and raise if the write is not permitted. The command body just expresses
the operation; privacy is enforced underneath it.

The module *is* the allowlist — only its public methods are callable from the
wire, exactly as only `dataset_module` methods are queryable. Each method is a
named, parameterized command by virtue of being a method with arguments; no
per-command DSL is needed. Keyword arguments map cleanly onto the message's
param hash. Creation has no receiver record, so create-style commands are
class-level (mirroring `dataset_module` being class-level); record commands —
update, destroy, state transitions — are instance-level.

```ruby
[:command, 21, :mailing_list, 84, :rename, { name: "Friends of Swill" }, version: 7]
```

The server resolves model and id under the viewer context, checks `:rename`
against the command module's method list, coerces scalar args, runs the method
in a transaction, and returns a re-filtered snapshot or a typed error. Privacy
raises during `save_changes` if the write is not allowed. `version:` keeps the
optimistic-lock check.

This is why change-sets were rejected: a generic `values: {}` mutation is
mass-assignment that bets every field write-policy is present and correct (the
default-exposed trap), and it cannot express intent and invariants
(multi-field, multi-record operations, state machines, side effects) or own a
transaction boundary. The division to hold onto:

- **sequel-privacy is the gate** — may this happen, enforced automatically
  during the write on the real records.
- **The command module is the shape** — what operations exist at all, their
  params, invariants, side effects, and atomicity.

Commands obey the same param-is-a-value rule, and their params are typed by a
small signature decorator (see "Param Typing" below) rather than left as raw
scalars.

### The Generic Update Concession

To avoid a command per trivial edit, a model may expose a single generic
`update` command whose param schema *is* its explicitly permitted writable
fields. Still default-deny (opt-in per field), still privacy-gated — one
well-defined verb, not an open change-set.

### Param Typing: `Swill::Sig`

How params are typed went through several rejected options — raw scalars (too
loose), Roda's `typecast_params` (too imperative), and real Sorbet (too much
ceremony, and `sorbet-runtime` under Opal is an unknown). The resolved design is
a small Swill-owned signature decorator, implemented in `opal/lib/swill/sig.rb`.

```ruby
module MailingList::Commands
  extend Swill::Sig

  sig { params(name: String).void }
  def rename(name)
    self.name = name
    save_changes
  end
end
```

Four decisions define it:

- **Introspectable metadata, not method wrapping.** `sig` records a signature; it
  does not wrap the method. Validation happens once, at the wire dispatch
  boundary, where untrusted input enters. Trusted internal calls pay nothing.
  `Signature#coerce(raw_hash)` is the whole boundary contract: it returns typed
  keyword args or raises `Swill::Sig::Error`.
- **Type = structure guard + coercion, in one.** A scalar type rejects arrays and
  hashes (the scalar-smuggling guard) *and* coerces the value (`"3"` to `3`,
  an ISO string to `Date`, a decimal string to `BigDecimal`, never `Float`).
  There is no type that means "column name" or "operator", so the
  param-is-a-value rule is enforced by construction. Unknown param keys are
  rejected (default-deny); `enum` returns a symbol from its fixed allowlist
  rather than interning the client string.
- **Server authors, client consumes a manifest.** `method_added` binds the block
  to the next `def`, and runs only on the server (MRI), where it is native. The
  client never authors sigs: the server ships a plain-data manifest
  (`Module#sig_manifest`), and the client rebuilds signatures with
  `Signature.from_descriptor`. So Opal's `method_added` support is not
  load-bearing. The type and coercion machinery itself compiles and runs under
  Opal (verified against opal 1.8), so the client can validate optimistically
  with the same code before sending.
- **Tiny vocabulary.** Primitive classes `String`, `Integer`, `Float` used
  directly; `Swill::T.boolean`, `.date`, `.decimal`, `.nilable(t)`, `.array(t)`,
  `.enum(...)` for the rest. More earns its way in later.

A command or query with no sig should be treated as accepting no params
(default-deny), not as accepting anything.

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
