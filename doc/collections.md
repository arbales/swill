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
selects it. `allows_multiple_selection` lets shift-click extend the selection
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

`sort_states` maps the sorted column to its direction in `aria-sort`
vocabulary, so a header binds `bind-aria-sort="@sort_states.name"` and reads
`ascending` or `descending` while `name` is the sort key and nil otherwise.

```html
<thead><tr>
  <th data-column="name" data-action="sort_by"
      bind-aria-sort="@sort_states.name">Name</th>
</tr></thead>
```

Selection is by identity, so a reorder keeps it.

## Editing in Place

`EditableList` is a sortable list whose rows can be edited in place. At most
one editor exists at a time. It is cloned from the list's own
`<template for="editor">`, whose root must be an `InlineEditor` controller,
and mounted after the row being edited; that row carries the `being-edited`
class while the editor is open. Beginning an edit raises when the list has no
editor template or when the template's root is not an `InlineEditor`.

The edit works on a copy: a model's `draft`, or a `dup` of a plain object. The
copy is the list's `edited_object` property, and the editor's
`represented_object` is bound to it. `editing?` reports whether an edit is in
progress.

Activation edits the selected row instead of sending `activate_selection` to
the owner. Enter commits and Escape discards. When focus leaves the editor,
the list is asked `editor_should_end_editing`: an unchanged copy is discarded,
where a model decides by `dirty?` and a plain copy always counts as changed;
otherwise the edit commits when `confirm_edit?` agrees, and the default
agrees. A commit asks the editor's `commit_editing` first; an editor that
cannot push its pending edit keeps the edit open. Then `validation_error`
asks the copy's own `validate`, when it has one; an error invokes
`editing_did_fail_validation`, which warns by default, and the editor stays
open. Override `editing_did_fail_validation` to show the error.

An accepted commit applies the copy back to the original. A `DistantObject`
awaits `apply_draft` and, when the server rejects it, invokes
`editing_did_fail_save` and mounts the same draft again. Another model takes
its draft back through `apply_draft` and remains the row's object. A plain
object is replaced by the copy in the collection. The final object is
selected, and the list takes the keyboard back. A discard drops the copy and
leaves the selection unchanged.

Toggling the sort commits an edit in progress first, and a refused commit
leaves the sort unchanged. New content or a change to the arranged content
ends the edit without committing, since its row is gone. Unloading the list
closes an open editor without committing.

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
    <th data-column="name" data-action="sort_by"
        bind-aria-sort="@sort_states.name">Name</th>
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

Sorting preserves selection by object identity. Filtering hides selected
objects without choosing replacements; clearing the filter can restore the
requested selection. `selected_object_id` also supports restoring a selection
before its record arrives. Keyboard focus, scrolling, and row activation
remain in `List`.

`show_first(movie)` places the movie first and selects it without changing
query or association membership. New content or explicit sorting clears that
placement. Refreshing the same collection retains it; an application that
needs to remove the temporary row can clear it with an explicit sort or
replace the content. Local filters still apply to temporarily included rows.

Executable Ruby examples live in `examples/rb/collection_controllers.rb`.
`benchmark/collection.mjs` measures its cost; see
[benchmarks](development.md#benchmarks).
