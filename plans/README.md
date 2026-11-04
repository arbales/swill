# Plans and status

Current behavior belongs in [`doc/`](../doc/). These files track remaining
work, design decisions, and milestone history; accepted designs are not
implemented APIs.

## Open work

| Area | Status and source of truth |
| --- | --- |
| Data contracts | [Data plan](DATA_PLAN.md): graph and cross-version compatibility are next. [Schema versioning](DATA_EXCHANGE_DESIGN.md#plan-of-record-schema-versions-and-compatibility) is accepted direction; negotiation, authorization/conversion ordering, and adapter verification still need design. |
| URLs and server rendering | [URL/SSR plan of record](URL_AND_SSR_DESIGN.md): routing, shared client/server codec, and route-shaped page → preload → bound markup. Grouped fragment restoration already works; the routing and rendering extensions are not implemented. |
| Framework and compiler | [Framework plan](FRAMEWORK_PLAN.md): row reconciliation, action/visibility rules, runtime cost, and finite compiler gaps. [Cocoa audit](COCOA_API_AUDIT.md) owns collection API alignment proposals. |
| Developer experience | [Developer-experience plan](DEVX_PLAN.md): Ruby-source maps, first-release verification, editor declarations, and deferred tooling work. |
| Documentation | [Documentation plan](DOCS_PLAN.md): coverage, terminology, guide gaps, and site presentation. |

The data and URL/SSR tracks have their own dependencies; this index does not
choose a global implementation order.

## Implemented and deferred

- Context-managed editing, repeatable collection fetches, selection correction,
  and bounded concurrent reads are implemented. Movies supplies the application
  scheduler, interaction checks, and workload measurements. See
  [completed milestones and evidence](COMPLETED.md).
- [Data design](DATA_DESIGN.md) records the original architectural rationale.
  [Data exchange design](DATA_EXCHANGE_DESIGN.md) separates accepted versioning
  direction from exploratory delivery caching and subscriptions.
- Deferred work stays in its owning plan. [Abandoned](ABANDONED.md) is for
  rejected directions, not a second backlog.

Keep status summaries here, open tasks in their owning plan, API examples in
the guides, and measurements in their reports. Link between them rather than
copying the same contract or result into several files.
