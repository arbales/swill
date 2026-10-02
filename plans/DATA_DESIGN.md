# Data layer design rationale

This is the rationale behind the first Swill distant-data slice, not a queue of
implementation steps or a current API reference. The original fifteen-part
sketch is preserved in git history. See [Completed](COMPLETED.md) for the
milestone, [the data plan](DATA_PLAN.md) for open work, and
[server data](../doc/server_data.md) and [collections](../doc/collections.md)
for current usage. [Data exchange design](DATA_EXCHANGE_DESIGN.md) explores
future refresh, delivery, and subscription choices without committing to a
protocol.

## Boundary between server and client

The server's Sequel model owns persistence, validation, association structure,
and privacy policy. Its explicit `DistantInterface` declares the browser
surface; generated client Ruby and RBI files are application artifacts, and
handwritten client code may reopen those generated classes. Server source is
never compiled into the browser. This keeps the server authoritative while
allowing consumers to use familiar Ruby model objects.

The original sketch proposed four fixed directories and separate interface
files. The implementation accepts application layouts through a server entry
and root directory instead. The old `Post` examples were illustrative, not
required layout or declaration syntax.

## Types and operations

Swill translates Sorbet-like field and method declarations into a small
protocol schema. Real Sorbet or the `swill/server` signature facade can supply
them. This leaves browser code with predictable names, optionality, and
generation without making Sorbet a runtime transport dependency. The early
idea that signature-free operations would fall back to dynamic MessagePack
values was not adopted for the exposed return contract: a remote operation
without a return signature declares `returns:` explicitly.

Dataset `query`, class `resolver`, and instance/class `command` keep remote
calls distinct by purpose. Query cardinality follows the declared return type.
The server runs queries on a privacy-aware dataset; commands own application
logic and may manage their own transaction boundary when appropriate. Typed
results can contain models or structured values. The old examples' names and
method forms were proposals; [server data](../doc/server_data.md) owns the
actual API.

## Identity, availability, and privacy

A client has one canonical object per model class and normalized id. Responses
patch only included fields; an omitted field stays unavailable, and a loaded
nil is a valid value. Lazy hydration supplies fields and associations as they
are needed, while explicit load methods let callers await them. Returned
projections and preloads reduce latency but never expand the declared schema
or the viewer's authorization.

Privacy-denied nils intentionally remain indistinguishable from ordinary
nils. This reflects the chosen privacy contract, not a requirement that every
application declare fields nilable: non-nilable client fields are supported.
Connection authentication sets viewer context; it does not give references or
cached values perpetual authority.

## Transport and graph changes

MessagePack WebSocket messages carry schema-checked, typed operations and
canonical object patches. The implemented protocol uses symbolic message
names and request IDs. The original suggestion to replace names with integer
IDs or introduce MessagePack extension types was an optimization idea, not an
implemented guarantee; it belongs with future measured exchange work.

Commands return authoritative values and may name related fields or
associations to refresh or invalidate. They do not silently infer all affected
queries or broadcast cross-client updates. Query membership freshness and an
explicit refresh API remain open in [the data plan](DATA_PLAN.md); connection
delivery caches and subscriptions remain exploratory in
[data exchange design](DATA_EXCHANGE_DESIGN.md).
