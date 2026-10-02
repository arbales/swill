# Abandoned

These are discarded directions, not a list of work merely deferred.

- **The Opal browser port (20 September 2026).** The Ruby2JS UI-kernel
  checkpoint retired the plan to ship a Ruby runtime to the browser. The Opal
  examples remain as historical references under `examples/opal/`.
- **`arranged_content` as a second public arrangement API (September 2026).**
  It split reads and observation from Cocoa's `arrangedObjects` concept. The
  single `arranged_objects` property replaced it.
- **Separate authorization flags for privacy-denied nils.** The data design
  keeps such nils indistinguishable from ordinary nils; consumers use field
  availability state when they need to know whether a value was loaded.
- **Automatic arbitrary-query dependency inference for the first refresh
  slice.** A query's membership depends on server filtering, ordering,
  limits, and privacy scope. [The data plan](DATA_PLAN.md) instead calls for an
  explicit, testable refresh contract. This does not rule out later opt-in
  subscriptions.
- **A required four-directory data-model layout and signature-free remote
  return values.** The server entry and application root determine layout;
  exposed operations without return signatures declare `returns:`. The
  original examples remain historical in git, while
  [server data](../doc/server_data.md) documents the supported forms.
- **Extracting selection and sorting directly from List as the first
  composition step.** `CollectionArrangement` and optional `ArrayController`
  now own those responsibilities. Editing composition remains open in
  [the framework plan](FRAMEWORK_PLAN.md).
