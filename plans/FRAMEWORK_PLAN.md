# Framework and compiler plan

The Ruby2JS port roadmap and both application checkpoints are complete; see
[Completed](COMPLETED.md). This file tracks remaining framework and compiler
work. Current supported behavior is documented in [`doc/`](../doc/), especially
the [compiler](../doc/compiler.md), [collections](../doc/collections.md), and
[responders](../doc/responders.md) guides.

## Framework work

- **List rendering.** `Controller::List#render_all` still clears and rebuilds
  every row after an arrangement change. The documentation navigator measured
  roughly 110–120 ms to restore about 900 results. Reconcile rows by object
  identity, retaining surviving views and their bindings; verify ordering,
  selection, ownership, and teardown. The same reconciliation is what lets a
  list adopt rows the server rendered; see
  [the URL and server rendering design](URL_AND_SSR_DESIGN.md).
- **Action lookup.** `Responder#action_target` uses `Runtime.respondsTo`, which
  can answer true for a property. Match action lookup to the method table and
  `performAction` arity/visibility rules, so a same-named property does not
  intercept responder-chain search. JavaScript-side private/protected dispatch
  also needs a deliberate rule; see [the data plan](DATA_PLAN.md).
- **Property-write cost.** A September benchmark measured an unobserved write
  near 217 ns versus an ordinary getter near 11.7 ns. Profile the current
  runtime before optimizing. Descriptor resolution on every binding write is
  a candidate to evaluate alongside the write path.

## Controller composition and Cocoa alignment

`CollectionArrangement` and optional `ArrayController` already moved local
arrangement and selection out of List's rendering responsibility. The old
proposal to extract `Selection` and `Sorting` directly from the List class is
superseded by that implementation. The remaining composition question is
whether editing and restoration need reusable modules instead of the current
`Controller` → `List` → `SortableList` → `EditableList` inheritance chain.
Compare real consumers before changing it; in-place editing currently also
inherits sorting.

[The Cocoa API audit](COCOA_API_AUDIT.md) is the source for the proposed
selection, arrangement, sort/filter, and editing contracts. Keep its API
decisions together rather than repeating them here.

Controls currently have a `delegate` property and use
`control_should_resign_first_responder` for focus refusal. A fuller delegate
protocol is still exploratory: typed `abstract!`/`interface!` modules,
module conformance, awakening-time connection, and direct dispatch would
require compiler/runtime work. Do not treat that design as a committed API;
test it with an actual control before changing the existing delegate path.

## Compiler and runtime gaps

- Safe navigation on typed framework receivers works; core-value helpers and
  untyped dynamic receivers still need an approach that preserves nil
  semantics and short-circuiting.
- Expand the finite core-value lowering tables only as application code needs
  methods, with MRI comparison fixtures for each addition.
- `Runtime.resolve` finds classes but not registered modules. Make module
  lookup usable through the public name without relying on private generated
  identifiers.
- `T::Hash[Symbol, T.proc.void]` is not recognized as precisely as the
  corresponding array element type; widen typed Hash recognition with a
  compiler fixture.
- `T.cast(await value, Type)` parses ambiguously; awaiting into a local is the
  current documented workaround. Revisit only if a real call site justifies
  compiler support.

## Later candidates

`html_attribute`, extracting `EditableList` persistence behavior, and the
static example's brewery search were candidate slices in the port plan, not
approved implementation commitments. Reassess them against current APIs and
applications. Gem publication depends on a released Ruby2JS Pragma filter. The CDN
serves tagged releases; see [the developer-experience plan](DEVX_PLAN.md).
npm packaging remains deferred.

General Ruby module hooks, `prepend`, runtime class mutation, broad
metaprogramming, browser `sorbet-runtime`, arbitrary ActiveSupport behavior,
and general Ruby compatibility remain outside the finite compiler target.

## URLs and server rendering

The plan of record is [the URL and server rendering design](URL_AND_SSR_DESIGN.md):
one state grammar in the fragment, the query and the path, the routed
window's content as the path, a shared codec the server parses too, and
server rendering in three steps (route-shaped page, data preload, the
client's templates rendered on the server and adopted).
