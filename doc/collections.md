# Collections

How lists and tables present a collection: the row template a `List` clones
for each arranged object, sorting and filtering, when to move that arrangement
into a separate `ArrayController`, and how a table, detail pane and toolbar
share one selection. The intermediate controller is optional.

## Lists

A `List` presents one row per arranged object. Each row is cloned from the
list's own `<template for="row">`; a list without that template must
override `make_row_element`, and a list with neither raises when it renders.
Cells in a row bind to the row's object, so a row displaying a member binds to
`name` directly, and a row's actions reach the list first. Rows mount in the
`outlet="rows"` view when the list declares one, and in the list's own
element otherwise. Rows are owned views of the list, and a controller inside
a row belongs to the list. Rows rendered into the markup before awakening are
replaced as the list awakens, so they carry no bindings of their own.

```html
<table controller="Swill::Controller::SortableList" bind="members">
  <tbody outlet="rows">
    <template for="row"><tr><td bind="name"></td></tr></template>
  </tbody>
</table>
```

Selection is by identity: the selected objects are the stored value, and the
selected indexes and leading object derive from them, so a rerender or reorder
keeps the selection. `selected_object_id` names the selection by model id. It
follows the selection, and writing it selects the matching object now or, when
no arranged object carries the id yet, once the collection changes; that is
the path to restore a selection before its record arrives. Clicking a row
selects it. Restoration waits until matched or replaced by another selection;
once matched, it follows ordinary selection rules. Removing or filtering out a
selected object clears its selection and saved id, so returning it later does
not select it again. `allows_multiple_selection` lets shift-click extend the selection
from the last plain click; the default is false, and a `multiple` attribute on
the list's root element turns it on from markup. Taking the keyboard selects
the first row when nothing is selected, and the arrow keys move a single
selection.

Enter and double-click invoke `activate_selection`. The list's owner receives
an `activate_selection` target-action with the list as the sender; when no
responder handles it, nothing happens. An action handler learns which row its
sender sits in from `row_for(element)`, which returns -1 for an element in no
row. See [bindings in list rows](bindings.md#bindings-in-list-rows) for how
key paths resolve inside a row.

## Sorting

`SortableList` orders its arranged objects by one sort key. `sort_key` and
`sort_direction` are writable properties, so they bind and restore;
`sort_direction` is `"ascending"` or `"descending"`, and `sort` raises for any
other value. A header cell with `data-column="name" data-action="sort_by"`
toggles that column: the sender's `data-column` names the key, a column that
is not the current key sorts ascending, and the current key reverses its
direction. Override `sort_key_for` when the column name lives elsewhere than
`data-column`.

The list marks the sorted header cell itself: it carries the
`sorted-ascending` or `sorted-descending` class, which the themes draw as an
arrow, and the others carry neither. Style a header by those classes; the
markup names only the column and the action:

```html
<thead><tr>
  <th data-column="name" data-action="sort_by">Name</th>
</tr></thead>
```

`sort_states` maps the sort key to its direction, `ascending` or
`descending`, for a binding that wants it elsewhere; it is an empty hash when
the list is unsorted.

Selection is by identity, so a reorder keeps it.

## Editing in Place

`EditableList` is a sortable list whose rows can be edited in place. At most
one editor exists at a time. It is cloned from the list's own
`<template for="editor">`, whose root must be an `InlineEditor` controller,
and mounted after the row being edited; that row carries the `being-edited`
class while the editor is open. Beginning an edit raises when the list has no
editor template or when the template's root is not an `InlineEditor`.

Distant rows edit the shared model in place. Bindings elsewhere see those edits
immediately, while the controller holds the displayed arrangement until editing
ends. Escape rolls back that edit's changes; overlapping changes that cannot be
safely rolled back are reported. Local and REST models retain their draft/copy
behavior. `edited_object` is the object bound to the editor, and `editing?`
reports whether an editor is open.

Enter commits and Escape discards. Moving focus out asks
`editor_should_end_editing`; an unchanged edit is discarded, otherwise it
commits when `confirm_edit?` agrees. A commit first asks the editor to push its
pending values, then validates. A refusal keeps the editor open and invokes
`editing_did_fail_validation` for validation errors.

Accepting a distant edit releases the held arrangement before saving the model.
A failed save retains its dirty values and invokes `editing_did_fail_save`,
reopening the editor when its row still exists and no newer editor has started.
A successful save invokes `editing_did_save(object)`, which an application can
override to refresh query membership. These callbacks belong to the live view;
unloading it prevents late callbacks from remounting an editor. Popup editing
uses an isolated child context; see [models](models.md).

Toggling sort first commits the active editor, and a refusal leaves sorting
unchanged. Directly replacing a list's represented object ends its current edit;
for refreshes that preserve an editor, use `ArrayController#fetch` below.

## Filtering a List

`SortableList` provides sorting, header actions, identity-based selection, and
row rendering. `List` includes `CollectionArrangement`, so a list filters by
overriding `includes_object?`:

```ruby
class MembersTable < Swill::Controller::SortableList
  property :filter_text, type: String, default: ""

  def includes_object?(member)
    member.name.downcase.include?(filter_text.downcase)
  end
end
```

The table binds directly to an association:

```html
<table controller="MembersTable" bind="mailing_list.members">
  <thead><tr>
    <th data-column="name" data-action="sort_by">Name</th>
  </tr></thead>
  <tbody outlet="rows">
    <template for="row"><tr><td bind="name"></td></tr></template>
  </tbody>
</table>
```

The surrounding view binds its search control to the table's `filter_text`.
The example filters locally; remote search is a separate operation.

Properties read while arranging become dependencies of the arrangement, so a
change to `filter_text`, a member's name, the sort policy, or membership
rearranges the list and reconciles its selection through one path. The
application calls no rendering or selection-maintenance methods. The list's
`represented_object` binding supplies the arrangement's `content`. Empty
content still rearranges when membership arrives, at which point the filter
and sort dependencies are captured.

## A Separate Controller

The same filter moves into a DOM-independent object when a table, detail
pane, and toolbar share a selection or an arrangement:

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

The table accepts the controller through the same binding:

```html
<table controller="Swill::Controller::SortableList"
       bind="members">
  <!-- The same header and row template as above. -->
</table>
```

The list recognizes an `ArrayController` and delegates arrangement and
selection to it, keeping no selection of its own. Assigning the
`array_controller` property directly has the same effect. Sort-header actions
delegate to the controller, while focus, keyboard events, scrolling, and row
activation stay in the list's responder chain. Binding both `content` and the
controller raises.

The surrounding search field binds to `members.filter_text`; a detail pane
binds to `members.selected_object`. Those bindings do not depend on finding a
table outlet. This costs one owned object and an explicit connection, and is
worth it only when that separation is useful.

## Fetching Query Results

An `ArrayController` can also own a repeatable query. Bind the table to that
controller immediately; its identity stays stable as the query changes:

```ruby
class MoviesController < Swill::ArrayController
  async def search(text)
    fetch do
      await Movie.search(text)
    end
  end
end

movies = MoviesController.new
# Bind the table's represented_object to movies once.
movies.search("star")
movies.search("star trek")
movies.fetch # Refresh or retry the last search.
```

`fetch` remembers its block, which must return an array or collection. A new
block replaces the remembered operation. Old rows remain available during a
request or after failure, and only the latest request can replace membership.
Applications can still await model queries directly and assign `content`.

| Property | Meaning |
| --- | --- |
| `loading` | The current fetch is pending. |
| `loaded` | A fetch has published content at least once, including an empty result. |
| `stale` | A fetch is pending, failed, invalidated, or waiting for editors. |
| `error` | Latest fetch's error message, cleared when another fetch begins. |

A successful fetch returns true, including when its result is waiting for an
editor; a failed or superseded fetch returns false. Calling without a block
before configuring an operation, or after releasing the controller, raises.
While registered editors remain active, the latest successful result waits to
replace content. Publishing it when the last editor ends preserves the existing
selection rules. Shared models still receive field updates through their
contexts; the controller owns membership and presentation, not model merging.

`invalidate` marks stale and retires outstanding work without sending a query.
`show_first` also retires outstanding work before placing/selecting a new row;
a subsequent successful fetch or explicit sort clears temporary placement.
`dealloc` releases the remembered operation and ignores late completion.

An application chooses refresh triggers. Movies repeats its latest query after
successful saves/deletion and a compatible reconnect, and invalidates on
connection loss. Generic controllers have no transport dependency. Completion
promises the query's membership and declared fields, not complete model
hydration or server-wide freshness. There are no inferred query dependencies
or automatic server subscriptions.

Movies' `MovieResults` adds scheduling for its replaceable searches. Its
`search(text, unwatched:)` remembers the latest criteria, and `refresh` repeats
them after mutations or recovery. Up to two reads run at a time; waiting calls
issue a query only if still newest. Superseded waiting calls return false when
a running read next settles. Loading remains true while the newest search waits,
and obsolete
results cannot replace membership or report errors. Invalidation, temporary
first placement, and release also retire waiting searches. This application
policy does not change generic `fetch` blocks or cancel submitted SQL.
Loading ends when the current search settles, even if an obsolete read is still
finishing. Older model envelopes may still merge under the field-generation and
dirty-edit rules; superseded membership cannot replace the displayed result.

## Association Convenience and Independent Views

A distant object's to-many association supplies a shared `ArrayController`
through its `<name>_controller` accessor; see [association
controllers](models.md#association-controllers) for what that controller
caches and how long it lives.

```ruby
shared = mailing_list.members_controller
shared.sort("name", "ascending")

# A second independent presentation of the same membership.
independent = Swill::ArrayController.new
independent.content = mailing_list.members
independent.sort("name", "descending")
```

Custom filtering can use a controller subclass as above, or the shared module
on a view controller; the generated convenience accessor need not grow a
separate filtering DSL.

Two independent tables should bind directly to `members`, or own independent
controllers. Two coordinated presentations can explicitly bind to
`members_controller`. Both paths use the same canonical member objects.

## Including the Module on a View Controller

A view controller can own arrangement without an additional `ArrayController`:

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
`selected_object`, and sort methods work as they do on `ArrayController`.
Rendering remains the view's responsibility; including this module adds no DOM
behavior.

## Selection and Temporary Placement

Sorting preserves selection by object identity. Filtering or replacing content
clears selected objects that leave the arrangement, without choosing replacements.
Returning those objects later does not select them again. Ordinary selection
accepts only currently arranged objects. An immediate replacement with the same
model id can retain the leading selection.

Writing `selected_object_id` explicitly supports restoring a selection before
its record arrives. This pending id survives results that do not contain it,
resolves once, and is cancelled by another selection or explicit deselection.
A fetch preserves selection while loading or failing; results deferred for an
active editor affect selection only when published. Keyboard focus, scrolling,
and row activation remain in `List`.

`show_first(movie)` places the movie first and selects it without changing
query or association membership. New content or explicit sorting clears that
placement. Refreshing the same collection retains it; an application that
needs to remove the temporary row can clear it with an explicit sort or
replace the content. Local filters still apply to temporarily included rows.

Executable Ruby examples live in `examples/rb/collection_controllers.rb`.
`benchmark/collection.mjs` measures its cost; see
[benchmarks](development.md#benchmarks).
