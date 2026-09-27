# Sortable and filterable tables

These examples compare the previous API with the implemented collection
arrangement API. The intermediate controller is optional.

## Before: the list owns everything

`SortableList` already provides sorting, header actions, identity-based
selection, and row rendering. Filtering currently requires an arrangement
override and explicit reconciliation/rendering when the filter changes:

```ruby
class MembersTable < Swill::Controller::SortableList
  property :filter_text, type: String, default: ""

  def arranged_objects
    query = filter_text.downcase
    super.select { |member| member.name.downcase.include?(query) }
  end

  def filter_text_did_change(previous, value)
    reconcile_selection
    render_all if @awakened
  end
end
```

An existing table can bind directly to a relationship:

```html
<table controller="MembersTable" bind="mailing_list.members">
  <thead><tr>
    <th data-column="name" data-action="sort_by"
        bind-aria-sort="@sort_states.name">Name</th>
  </tr></thead>
  <tbody outlet="rows">
    <template for="row"><tr><td bind="name"></td></tr></template>
  </tbody>
</table>
```

The surrounding view binds its search control to the table's `filter_text`.
The example filters locally; remote search remains a separate operation.

## After: keep the direct table

The same markup and sort-header action continue to work. List includes the
shared arrangement behavior; SortableList remains a compatible entry point.

```ruby
class MembersTable < Swill::Controller::SortableList
  property :filter_text, type: String, default: ""

  def includes_object?(member)
    member.name.downcase.include?(filter_text.downcase)
  end
end
```

The module tracks reads while arranging, invalidates on relevant changes,
and exposes cached `arranged_objects` (backed by the observable
`arranged_content` property). Changes to `filter_text`, member
names, sort policy, or membership cause reconciliation through one path.
The application no longer calls rendering or selection-maintenance methods.
The list maps its existing `represented_object` binding to arrangement
`content`. A custom view controller can include `CollectionArrangement`
directly; it gets the same behavior without requiring a separate object.

The hook participates in ordinary computed-property dependency tracking. Empty
content still rearranges when membership arrives, at which point filter and
sort dependencies are captured.

## Optional: a separate controller

Move exactly the same filter behavior into a DOM-independent object when a
table, detail pane, and toolbar need to share selection or arrangement:

```ruby
class MembersController < Swill::ArrayController
  property :filter_text, type: String, default: ""

  def includes_object?(member)
    member.name.downcase.include?(filter_text.downcase)
  end
end

# Owned by the surrounding view controller; released with that owner.
members = MembersController.new
members.content = mailing_list.members
```

The table accepts the controller through the same ordinary binding:

```html
<table controller="Swill::Controller::SortableList"
       bind="members">
  <!-- The same header and row template as above. -->
</table>
```

The list recognizes an ArrayController and delegates arrangement and selection
to it. It does not maintain a second selection. Direct property assignment to
`array_controller` is also supported.
Sort-header actions delegate to it, while focus, keyboard events, scrolling,
and row activation stay in the list's responder chain. Conflicting content
and controller bindings raise an error.

The surrounding search field binds to `members.filter_text`; a detail pane
binds to `members.selected_object`. Those bindings no longer depend on finding
a table outlet. This costs one owned object and an explicit connection, but
only when that separation is useful.

## Relationship convenience and independent views

```ruby
shared = mailing_list.members_controller
shared.sort("name", "ascending")

# A second independent presentation of the same membership.
independent = Swill::ArrayController.new
independent.content = mailing_list.members
independent.sort("name", "descending")
```

`members_controller` lazily caches a default ArrayController per owner and
relationship. Repeated access shares sort and selection state, not just data.
It does not create DOM objects or fetch merely because it was constructed.
Custom filtering can use a controller subclass as above, or the shared
module on a view controller; the generated convenience accessor need not
grow a separate filtering DSL.

Two independent tables should bind directly to `members`, or own independent
controllers. Two coordinated presentations can explicitly bind to
`members_controller`. Both paths use the same canonical member objects.

## Including the module on a view controller

A view controller can own arrangement without an additional ArrayController:

```ruby
class MembersPane < Swill::Controller
  include Swill::CollectionArrangement
  property :filter_text, type: String, default: ""

  def includes_object?(member)
    member.name.downcase.include?(filter_text.downcase)
  end
end
```

Assign `pane.content = mailing_list.members`. Its `arranged_objects`,
`selected_object`, and sort methods work just as on ArrayController. Rendering
remains the view's responsibility; including this module adds no DOM behavior.

## Selection, temporary placement, and lifetime

Sorting preserves selection by object identity. Filtering hides selected objects
without choosing replacements; clearing the filter can restore the requested
selection. `selected_object_id` also supports restoring a selection before its
record arrives. Keyboard focus, scrolling, and row activation remain in List.

`show_first(movie)` temporarily includes the movie first and selects it without
changing query or relationship membership. New content or explicit sorting
clears that placement. Refreshing the same collection retains it; an application
that needs to remove the temporary row can clear it with an explicit sort or
replace the content. Local filters still apply to temporarily included rows.

View-owned controllers should be retained by their owner and disposed with it.
Model-cached relationship controllers live until the model disconnects or resets;
they can outlive individual views. Merely reading `members_controller` does not
fetch membership. Reading/observing its arrangement accesses the relationship
and participates in normal loading. Invalidation releases obsolete computation
dependencies, and disposal releases the remaining observations.

Executable Ruby examples live in `examples/rb/collection_controllers.rb`.
Tests cover automatic filtering, sort changes, one render per sort, delegated
selection, lazy relationship access, and disposal. `benchmark/collection.mjs`
measures cached reads, selection changes, and replacing a sorted collection.

## Performance check

Local Deno microbenchmark, 1,000 observable rows, median of nine samples.
The baseline uses the pre-extraction List, SortableList, and EditableList
implementations with the same current runtime. These measurements exclude DOM
rendering and network latency.

| Operation | Before | After |
| --- | ---: | ---: |
| Read sorted arrangement | 294 µs | 0.036 µs |
| Read selected indexes | 0.042 µs | 0.034 µs |
| Change selection | 2.01 µs | 3.41 µs |
| Replace content and arrange | 651 µs | 505 µs |

Caching avoids repeated sorts. Each sort key is read once per arrangement,
including observation tracking. Selection writes pay for the computed selection
path (about 1.4 µs more here). The general runtime benchmark showed no material
regression; these microbenchmarks are not a claim about end-to-end frame rate.

Run `deno run -A benchmark/collection.mjs ../build/framework.mjs --observable`
after building. Omit `--observable` to measure plain objects.
