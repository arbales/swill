# DOM boundaries

`Swill::View`, `Swill::Controller`, `Swill::Ownership`, `Swill::Bindings`,
`Swill::Actions`, `Swill::Awakening`, and `Swill::Controller::List` are
Ruby-authored framework classes compiled from Ruby that names DOM types. DOM traversal, control rendering,
event selection, action parsing, and listener ownership stay in those classes.
The handwritten runtime only resolves metadata-aware key paths and dispatches
generated method names.

Ownership follows a sparse view tree. An element becomes a `View` only when it
carries `klass`, `controller`, or `outlet`; elements with only `bind` or
`data-action` stay raw DOM, and templates and JSON scripts are inert content.
`klass` names a `View` subclass and may share an element with `controller`. A
controller's `parent` and `child_controllers` are derived from that tree.

Controllers declare `outlet :name, type: ...` and markup names the element with
`outlet="name"`. Outlets connect between `view_did_load` and bindings, only from
the controller's owned region including child-controller roots. The value is
the child controller, the element's view, an inert `<template>`, or JSON from a
`<script type="application/json">` passed through `decode_outlet_data`. The
declared type names the value, `T::Hash[String, String]` for a JSON object or
`Swill::View` for an input, and a typed outlet's value is checked against it
at awakening. Undeclared, duplicate, unresolved required, and mistyped outlets
raise; `optional: true` outlets may be absent. Binding and action
scans stop at nested `[controller]` boundaries, so each element is wired by its
direct owner only. Awakening runs `view_did_load`, wiring, and `awake_from_dom`
for each controller children first, then `controller_did_load`, then the
appearance hooks. `unload` runs `view_will_disappear`, the controller's
bindings, everything it retained, its own observation state, its descendants,
and `view_did_disappear`, exactly once.

`Swill::Application` is the top of the responder chain for one launched region.
It records itself on its root element, so a root controller finds it by walking
up from its own element; `application_did_launch` and
`application_will_terminate` bracket its life. Actions resolve through the
responder chain: a controller handles an action when it has a matching
generated method, otherwise its parent tries, then the application, and an
action nobody handles raises. Actions default to `click`; `event:action`
selects another DOM event.

Bindings are Ruby key paths. `bind="path"` is two-way for form controls and
one-way for text; `bind-prop="path"` writes the DOM property named by the
HTML attribute one way, so `bind-disabled`, `bind-hidden`, and `bind-readonly`
set the matching properties with Ruby truthiness, and `bind-data-*` names go
through attributes because they are not properties. Paths resolve under the
controller's `binding_root`, a Symbol naming a property or nil for the
controller itself, and a leading `@` binds against the controller regardless
of the root. Reader chains may end in `strip`, `upcase`,
`downcase`, `blank?`, `present?`, `empty?`, or `nil?`; the first three
predicates answer for a nil intermediate, and any other reader on nil yields
nil. A segment that reaches a Hash reads its key, nil when absent, as
key-value coding does for a dictionary, and a writable control sets an
existing key; hash entries are not observable, so replace the hash to notify.
A write through a missing owner is dropped; a read-only leaf on a writable
control fails at wiring.

A `bind` on a child controller's root belongs to the parent and assigns the
child's `represented_object`, nil included; it is wired when the parent loads,
so a fragment awakened later must be present under its parent before the
parent awakens or be bound by the parent explicitly. `bind-*` on that root
belongs to the child. `bind(:target, to: source, key_path: "a.b")` keeps a declared
property equal to a path on another object until `unbind`, `unbind_all`, or
`unload`; `null_placeholder:` is what the target receives when the path has no
value, so a path through a nilable object can feed a property that is not one.
`observe(name, callback)` observes the receiver's own property and
`observe(object, name, callback)` another object's; either way the receiver is
the observer, so either way it retains the observation and lets it go at
`unload`. For one of its own properties a `name_did_change` hook needs no
observation at all. `retain(disposer)` claims any other disposer the same way,
as Cocoa's retain claims an object, `release(disposer)` gives one up before
then, and `observe_notification` is a retain over
`NotificationCenter.default.add_observer`. An object ends by itself with
`dealloc`, which releases everything it retained and then leaves the
observation graph; `disconnect` leaves the graph without ending, keeping stored
values so computed properties resubscribe on the next read.

The application owns the first responder. `make_first_responder` follows
Cocoa: a responder must accept, the current one may refuse to resign, and a
refusal to become leaves the application holding it. Views accept and focus
their first focusable element; controllers accept when their view has one. A
`focusin` on the root reconciles the first responder after the browser moves
focus, restoring focus when the holder refuses. Focus leaving for the
browser's own chrome or dead space keeps the first responder, as Cocoa does,
so keys still reach it when focus returns; focus moving to another part of
the page outside the application releases it. `keydown` and `keyup` go to the
first responder: Escape, Enter, and Tab become `cancel_operation`,
`insert_newline`, and `complete`, and unhandled keys and those methods continue
up the responder chain to the application. Tearing down a region releases a
first responder inside it.

Windows are template-backed. `<template for="window" name="x">` anywhere, or
`<template name="x">` directly under the application root, is inert content.
A `[window="main"]` container is filled at launch from the template its
`name` attribute selects, or keeps and captures its pre-rendered content.
`load_window_content("main", "x")` tears down the old content, clones and
awakens the new, and hands the first responder to its top controller.
`show_window("x")` clones a template into the root as a window, or into a
chosen element with `show_window("x", into: element)`, showing a `<dialog>`
root, and returns a
`Swill::Window` whose `closed` promise resolves
when `dismiss(controller)` tears it down and restores the saved first
responder. Code-created content awakens through a `MutationObserver` on the
root, and removed content is torn down, so markup and code share one
activation path; `Awakening#detach` does the same explicitly.

Restoration reuses the binding machinery. A window controller declares
`restorable :query, key: :q` or `restorable "people.selected_id",
key: :selected`; the path is a bindable path whose first segment must be a
declared property, and the compiler records the leaf's declared type so
integers and booleans decode from the fragment while everything else stays a
string. The URL fragment holds `main=content` for a container's content and
`main.q=value` for its controller's state. At launch the fragment chooses a
container's content and its values are written through the same path writer
bindings use, then `controller_did_restore(restored)` runs before
`controller_did_load`. Changes to restorable paths replace their fragment
values; `load_window_content` pushes a history entry; Back/Forward reloads
the content the fragment names without writing history. Unknown content and
values of the wrong type are reported and ignored, since the URL is untrusted.

`Swill::Controller::List` is the NSTableView analog. It clones one row per
arranged object from its own `<template for="row">` into its `rows` outlet, or
its root without one, and wires each row's `bind` and `bind-*` attributes
against that object and its `data-action` attributes against the list, so a
row's button reaches the list first and then the responder chain, and
`row_for(sender)` tells a handler which row the sender sits in. Rows are views
owned by the list; a `controller` inside a row awakens under the list, and
`bind="@"` on its root hands it the row's object. The collection is
`represented_object`, usually fed by the parent's `bind` on the list root; a
new collection re-renders, and pre-rendered rows are replaced at awakening.
Selection is by identity: `selected_objects` is stored, `selected_indexes` and
`selected_object` derive from it, and `selected_object_id` follows the leading
object's model id and can be written to select by id now or once the object
arrives, which is what `restorable :selected_object_id` keeps in the fragment.
A click selects, shift-click extends when `allows_multiple_selection` or the
`multiple` attribute is on, arrow keys move the selection of a first-responder
list, and Enter or a double-click sends `activate_selection` up the responder
chain with the list as sender, quietly when nobody handles it.
`selected_object_did_change(previous, object)` runs when the leading object
changes.

`Swill::Controller::SortableList` orders the rows by one column. `sort_key`
and `sort_direction` (`ascending` or `descending`) are stored properties, so
they bind and can be `restorable`; a header cell with `data-column="name"
data-action="sort_by"` toggles that column, and `sort_states` maps the sorted
column to its direction for `bind-aria-sort="sort_states.name"`. Values
compare with nil last, numbers and booleans by value, and everything else as
text, and the selection follows its objects through a reorder.

`Swill::Controller::EditableList` edits rows in place. Enter or a double-click
on a row, or `begin_editing(index)`, clones the list's own
`<template for="editor">`, whose root is a `controller="Swill::Controller::InlineEditor"`,
after the row and gives it the keyboard. The edit works on a copy, a model's
`draft` or a duplicate of a plain object, held as the list's `edited_object`
and the editor's `represented_object`, so the editor's bindings write into
the copy. Enter commits: a model takes the draft back with `apply_draft` and
stays the row's object, a plain object is replaced in the collection; Escape
discards. Focus leaving the editor asks `editor_should_end_editing`, which
discards an unchanged copy and otherwise commits when `confirm_edit?` agrees,
or refuses and keeps focus. `validation_error`, `editing_did_fail_validation`,
and `edited_object_has_changes?` are the other hooks; sorting commits an edit
in progress first, and a new collection discards it.
`Swill::Control` is the NSControl analog: a view over a form element whose
`delegate` may refuse `control_should_resign_first_responder(control, next)`,
so an inline editor holds focus in a control until the edit is accepted; the
editable list makes its editor the delegate of every control inside it.
`Swill::Control::TextField` (`klass="Swill::Control::TextField"` on an input
or an element containing one) keeps a `value` property equal to the input
both ways, and `Swill::Control::Select` keeps `options` and `value` for a
native select, leaving markup options in place as a prefix.
`Swill::Control::CustomSelect` is a stylable select built inside a plain
element: a button showing the chosen option and a listbox of hashes with
`"value"`, `"label"`, and optional `"description"` and `"icon"`. Enter and
Space toggle it, arrows move, Escape and outside pointers close it, and a
choice dispatches `input` and `change` on the element as a native select
would.

A `bind` on an element whose `klass` is a control keeps the control's `value`
property equal to the path both ways, so `<div klass="Swill::Control::CustomSelect"
bind="choice">` edits `choice` and follows it.

`Swill::NotificationCenter.default` is the NSNotificationCenter analog:
`post(name, object, user_info)` and `add_observer(name, callback)`, which
returns the callable that ends the observation, named as Cocoa names it because
observing a notification is not observing a property; a controller's
`observe_notification` retains that callable, so the observation ends at
`unload`. The application posts `first_responder_did_change`
with the new responder as user info. `Swill::Runtime.nameOf(object)` gives an
object's installed class name.

`Swill::Controller::Editor` is the base: `binding_root` is `represented_object`,
with NSEditor's `commit_editing`, which returns whether pending edits could be
pushed into the object, and `discard_editing`, on Enter and Escape. The host
holds the object already, so nothing is returned; an editor that answers
false keeps the edit open.

