# Completed

This is a concise record of finished plan milestones. Current behavior belongs
in the guides under [`doc/`](../doc/); the original plans remain in git history.

## Ruby2JS port (September 2026)

- The Ruby-authored framework, finite Ruby2JS compiler, JavaScript runtime,
  generated types, and separate framework/application bundles reached the
  planned UI-kernel checkpoint. The compiler rejects unsupported syntax at
  build time. See the [compiler guide](../doc/compiler.md).
- Managed elements and outlets, bindings, responder/focus behavior, models,
  templates, windows, restoration, lists, editors, and controls completed the
  seven-step port roadmap. The static example and Bar's backend-backed Ruby
  frontend supplied application proofs. See the [awakening](../doc/awakening.md),
  [responders](../doc/responders.md), and [collections](../doc/collections.md)
  guides.
- Gem packaging, `swill build`, `swill watch`, `swill types`, Ruby/JavaScript
  bundles, source maps, and the first Sorbet/DOM interfaces were delivered.
  Keyword, rest, and block parameters were subsequently added to the compiler;
  the port plan's positional-only limitation is obsolete.

## Data layer (September 2026)

- The first distant-data slice delivered explicit client schemas, Sorbet-like
  declarations, generated Ruby and RBI files, privacy-aware remote operations,
  canonical partial objects, batched hydration, persistence, and MessagePack
  WebSocket transport with a schema handshake. See [server data](../doc/server_data.md).
- Associations gained reflected cardinality, stable read-only collections,
  loading/error/stale state, and explicit effects that refresh or invalidate
  related objects. `CollectionArrangement` and optional `ArrayController`
  separate local arrangement and selection from server-owned membership. See
  [collections](../doc/collections.md).
- `arranged_objects` replaced the accidental `arranged_content` public split;
  Ruby reads, bindings, observations, and List hooks now use one observable
  property. The remaining Cocoa alignment work stays in
  [the audit](COCOA_API_AUDIT.md).
- A targeted Movies regression fix now locates a row in the current arrangement
  after a failed save and checks the editing generation and view lifetime
  before restoring selection or the editor. The wider interaction review is
  still open in [the data plan](DATA_PLAN.md).

## Documentation site (September 2026)

- The custom RDoc generator, class pages, Ruby/JavaScript spellings, navigator,
  runtime JSDoc pages, guides, strict build, browser checks, and coverage
  ratchet were delivered. Ongoing coverage and editorial work stays in
  [the documentation plan](DOCS_PLAN.md).
