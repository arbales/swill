# Abandoned

These are discarded directions, not a list of work merely deferred.

- **The Opal browser port (20 September 2026).** The Ruby2JS UI-kernel
  checkpoint retired the plan to ship a Ruby runtime to the browser. The Opal
  examples were removed in October 2026; git history keeps them.
- **`arranged_content` as a second public arrangement API (September 2026).**
  It split reads and observation from Cocoa's `arrangedObjects` concept. The
  single `arranged_objects` property replaced it.
- **Separate authorization flags for privacy-denied nils.** The data design
  keeps such nils indistinguishable from ordinary nils; consumers use field
  availability state when they need to know whether a value was loaded.
- **Automatic arbitrary-query dependency inference for the first refresh
  slice.** A query's membership depends on server filtering, ordering,
  limits, and privacy scope. [Explicit refresh](../doc/collections.md#fetching-query-results)
  is implemented instead. This does not rule out later opt-in subscriptions.
- **A required four-directory data-model layout and signature-free remote
  return values.** The server entry and application root determine layout;
  exposed operations without return signatures declare `returns:`. The
  original examples remain historical in git, while
  [server data](../doc/server_data.md) documents the supported forms.
- **Extracting selection and sorting directly from List as the first
  composition step.** `CollectionArrangement` and optional `ArrayController`
  now own those responsibilities. Editing composition remains open in
  [the framework plan](FRAMEWORK_PLAN.md).
- **Running the compiled application on the server to render pages
  (November 2026).** Executing `swill.js` and `app.js` in a server-side
  JavaScript runtime against a DOM, then hydrating, would need the Node-shaped
  toolchain Swill avoids, a browser the framework assumes (history, focus,
  layout), and in-process data, to produce what rendering the client's own
  templates on the server gives at far lower cost. See
  [the URL and server rendering design](URL_AND_SSR_DESIGN.md).
- **Server-driven HTML fragments (November 2026).** Pushing rendered fragments
  into the page over SSE, as Movies' Datastar page does, bypasses the client's
  objects and bindings, where Swill keeps state. Not Swill's model.
- **Hiding `Swill__*` on the global (October 2026).** Compiled applications
  link against the generated identifiers through
  `build/framework.external.mjs`, so they stay; the plan was only to make them
  non-enumerable so autocomplete and `Object.keys(Swill)` show the JavaScript
  names alone. Dropped from [the developer-experience plan](DEVX_PLAN.md) for
  now; nothing that runs depends on it.
