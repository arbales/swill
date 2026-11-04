# Cocoa API alignment audit

Reference baseline: the local Cocoa OS X 10.8 documentation supplied by Austin,
not modern Swift API spellings. Reviewed September 27, 2026.

Sources:

- [NSArrayController](http://127.0.0.1:57616/Dash/cjtsbneo/documentation/Cocoa/Reference/ApplicationKit/Classes/NSArrayController_Class/Reference/Reference.html)
- [NSObjectController](http://127.0.0.1:57616/Dash/cjtsbneo/documentation/Cocoa/Reference/ApplicationKit/Classes/NSObjectController_Class/Reference/Reference.html)

These links require the local Dash server. This first pass covers
CollectionArrangement, ArrayController, and their List/EditableList integration.
It is not a completed audit of the entire framework.

The `arranged_objects` correction, selection-restoration distinction, and editor
registration are implemented; see [Completed](COMPLETED.md). The remaining API
changes in the proposed-decision column are open proposals, not approved APIs.

## Findings and proposed decisions

| Area | Cocoa 10.8 | Current Swill | Proposed decision |
| --- | --- | --- | --- |
| Selection indexes | Observable `selectionIndexes`, with selection setters | Read-only `selected_indexes` plus `select_indexes` | Rename to `selection_indexes` and design the writer/selection-change result together. This is another naming mismatch. |
| Arrangement override | `arrangeObjects:` accepts the objects to arrange | `arrange_content` reads content, delegates, handles temporary placement, and sorts/filters | Introduce `arrange_objects(objects)` as the customization hook. Keep collection unwrapping and delegation outside it. The previous proposal to retain `arrange_content` did not sufficiently check Cocoa. |
| Explicit rearrangement | `rearrangeObjects` and `didChangeArrangementCriteria` | Only observed dependencies trigger recomputation | Add an explicit rearrangement path for external/unobservable criteria; preserve cached reads and dependency cleanup. |
| Sort criteria | `sortDescriptors` supports multiple descriptors | One `sort_key` and `sort_direction`; `sort_states` supplies header presentation | Make ordered `sort_descriptors` authoritative. Retain single-column header behavior as a convenience over that state, without competing sort state. |
| Filtering | `filterPredicate`, with `arrangeObjects:` for custom arrangement | Only the `includes_object?` override | Design `filter_predicate` using a Ruby-callable contract. Keep it distinct from remote query criteria. Decide whether the per-object override remains a convenience. |
| Selection policy | `preservesSelection`, `avoidsEmptySelection`, and `selectsInsertedObjects`; documented defaults are YES | Hardcoded identity preservation, empty selection allowed, first selection requested by list focus, temporary insertion always selects | Expose and test deliberate policies. Do not infer that preserving selection authorizes remembering every filtered-out request indefinitely. |
| Requested versus actual selection | Selection setters may fail because editing cannot commit | Ordinary selection now drops absent objects. Explicit `selected_object_id` restoration waits until matched or cancelled, then becomes ordinary selection | Restoration is separated; selection setters' editing refusal/result contract remains open. |
| Editing and selection | Selection setters can attempt `commitEditing` and report failure | Editor registration holds arrangement and fetch publication until editing ends. EditableList guards some UI operations; direct shared-controller selection writes have no common editing gate | Finish the coordination contract for direct selection writes, shared controllers, sort/filter changes, and asynchronous saves. Registration is implemented; setter refusal/results remain open. |
| Insertion | Insertion adds to content and arranged objects; selection and filter-clearing policies are configurable | `show_first` temporarily includes an object outside query membership and selects it; source membership is unchanged | Preserve the remote-data distinction. Document temporary presentation as a Swill extension, not an implementation of Cocoa insertion. Design actual mutable-content insertion separately. |
| Selection bindings | Inherited `selection` is a KVC proxy with no-selection/multiple-values markers | `selected_object` returns the first selected object; no selection proxy | Keep the singular convenience clearly named. It is not equivalent to Cocoa `selection`; multi-object inspectors need a separately designed proxy/marker contract. |
| Controller structure | NSArrayController inherits NSObjectController | ArrayController includes arrangement and bindings on Swill::Object; views can include the same module | The reusable module was an explicit design choice. Review which object-controller contracts are missing rather than assuming the class name establishes compatibility. |

## Adaptations to preserve deliberately

- Shared arrangement can live on a standalone ArrayController or a view
  controller, as explicitly requested in the original design.
- A List delegates to one arrangement/selection owner. Focus remains in the
  responder system; it must not become a second selection owner.
- Observable Ruby property reads discover arrangement dependencies. Cocoa's
  explicit automatic-rearrangement configuration is a comparison point, not
  a reason to lose this mechanism.
- Remote result and relationship membership is server-owned. Local sorting,
  filtering, and temporary presentation do not claim to persist membership.
- Ruby arrays may represent index sets, but their uniqueness/order and writer
  behavior must be explicit. A different storage type does not justify a
  different public name.

## Next steps

October 2026 selection correction: filtering or published content removal now
clears the missing selection and its saved id. Reappearance does not restore it.
Explicit id restoration still waits through missing results and resolves once.
This matches the disappearance/reappearance behavior observed with native
NSArrayController on current AppKit; it is not a claim of testing OS X 10.8.
Swill still permits empty selection and retains its immediate same-id replacement
behavior. Broader selection policy and editing coordination remain below.

1. Settle `selection_indexes`, `arrange_objects(objects)`, and explicit
   `rearrange_objects`, including observable writers and selection results.
2. Compare before/after Movies table code for sort descriptors and a callable
   filter predicate before implementing them.
3. Specify selection preservation, empty selection, restoration intent, and
   edit refusal together; test both direct List use and a shared controller.
4. Audit the remaining Cocoa-facing surface against the same local 10.8 docs:
   responder/window focus ownership, action routing, view-controller lifecycle,
   bindings, and control selection/value APIs (including Segmented).

For each Cocoa-inspired public API, record the original selector/property,
Ruby spelling, observable/writable status, defaults, and intentional semantic
differences before implementation. Similar names alone are not alignment.
