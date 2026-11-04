# Lifecycle

A region is awakened once: the walk creates a `View` for every managed
element, attaches a `Controller` to every `[controller]` root, and then runs
the hooks. Markup awakened at launch, content loaded into a window, a presented
window, and any subtree inserted into the document after launch all take this
same path.

## Activation Order

Awakening a region has two phases with an optional restoration step between
them.

The load phase runs on each new controller, innermost first, so a parent's
children have already loaded when its own hooks run; its five steps, from
connecting outlets to `awake_from_dom`, are listed under
[awakening a region](awakening.md#awakening-a-region).

Restoration then runs, for a window only.

The finish phase runs three passes over the same controllers, each innermost
first:

1. `controller_did_load`
2. `view_will_appear`
3. `view_did_appear`

Each pass completes for every controller before the next begins:
`controller_did_load` has run on the whole region before any
`view_will_appear`.

- `view_did_load` — Outlets are connected, decoded JSON outlet data included,
  and no binding has pushed a value yet: state set here is what bindings push
  first.
- `awake_from_dom` — Bindings have pushed their initial values, action
  handlers are installed, and child controllers have loaded.
- `controller_did_load` — The whole region, including any restored values, is in
  place. Runs once per controller instance.
- `view_will_appear`, `view_did_appear` — The view is about to appear, and has.
  Swill shows a controller's view by awakening it and hides it by unloading it,
  so these run once, at load, and `view_will_disappear` and
  `view_did_disappear` once, at [unloading](#unloading). A view hidden by other
  means, such as `bind-hidden`, runs none of them.

Outlets are nilable until the load phase connects them. Children load first,
so a child that reaches its parent from its own hooks finds the parent's
outlets still nil.

## Restoration

A restorable key path connects a controller property to the window's URL
fragment. The application restores the value when it loads the window's
content and keeps the fragment up to date as the value changes. Declare a
restorable path with the `restorable` macro:

```ruby
class SearchController < Swill::Controller
  property :query, type: String, default: ""
  restorable :query, key: :q
  restorable "source_list.selected_object_id"
end
```

The path is a dotted property path resolved against the controller and begins
with a property declared on the class; the key names the fragment parameter and
defaults to the path. The application scopes it under the window name, so
`restorable :query, key: :q` in the `main` window reads and writes `main.q`.

The fragment groups properties by window, using semicolons between windows
and commas between properties:

```text
#main.q=star,selection=44;toolbar.mode=owner,theme=linear
```

The first dot identifies the window; later dots can be part of a property path.
Window content has a bare window key: `#main=welcome,n=3` selects the `welcome`
content and restores its `n` property. Windows with inline content need no
content name. Output orders windows and keys consistently. Only the grouped
format is supported; ampersand-separated query-style fragments are not restored.

Arrays use parentheses and their declared element type:

```ruby
property :selected_ids, type: T::Array[Integer], default: []
restorable :selected_ids, key: :ids
```

This writes `#main.ids=(1,2,9)`. String, Integer, Float, and Boolean elements are
supported; arrays are flat, with no nil elements. `ids=()` is an empty array,
`q=` is an empty string, and `labels=('')` is an array containing one empty
string. A nil property is omitted. An array containing an invalid element is
ignored as a whole when restoring, rather than partially applied.

Names and values are percent-encoded individually. Literal commas, semicolons,
equals signs, parentheses, apostrophes and percent signs in values are escaped;
spaces are written as `%20`, and `+` means a literal plus sign. For example, the single string `Alien (1979)` is
`q=Alien%20%281979%29`, not an array. Syntax is parsed before values are decoded.
Malformed groups or values are ignored without preventing other groups from
restoring. Unknown keys survive unrelated state writes.

Restoration applies only to the controller a window holds as its content — the
topmost controller in the container. Nested controllers may declare
`restorable`, but nothing restores them, and the application warns once per
class when one awakens, unless that class is also serving as some window's
content, which is what its declarations are for. Declare a nested controller's state on the window's
controller as a path through it: `restorable "movie_list.selected_object_id"`.

The step runs after the load phase and before `controller_did_load`:

1. Every declared path whose key is present in the fragment and decodes to a
  value is written. A key that is absent, or whose text does not decode,
  leaves the property at its current value.
2. `controller_did_restore(restored)` runs, with `restored` true
  when at least one value was applied. It is skipped entirely when the
  controller declares no restorable paths.
3. Each declared path is observed. From then on, a change to the property
  writes the fragment, replacing the current history entry.

Fragment writes are suspended while values are being applied, so restoring does
not write back what it just read.

A restorable path must end at a property that can be written: a stored
property, or a computed one declared with `writer:`. The compiler rejects a
path that ends at a read-only property, naming the `_id` property to restore
instead when there is one, so `movie_list.selected_object` is refused in favour
of `movie_list.selected_object_id`. The fragment holds strings, finite numbers,
booleans, and flat arrays of those values; a path whose value is anything else, or one the compiler could not
check that turns out to be read-only, is left out of the fragment and the rest
of the window's state still restores. The application warns once for each.

A window's restoration observations are released when its content is replaced
or the window is dismissed. Keys the next content does not own are removed from
the fragment.

## Unloading

`Controller#unload` unloads a controller. Loading is once per controller
instance: an unloaded controller is finished, and re-awakening the region
builds a new one. The element keeps its `View`.

`unload` returns immediately unless its view still holds it, so a second call
does nothing. Otherwise, in order:

1. `view_will_disappear`
2. the [first responder](responders.md#first-responder) is released if it
  lies within this region
3. object bindings are unbound
4. everything the controller retained is released — property and path
  observations, notification observers registered through
  `observe_notification`, DOM listeners, and the release callables of its
  bindings and action handlers
5. each child controller is unloaded, recursively
6. subviews are released and the view is removed from its superview
7. the view's controller is cleared
8. `view_did_disappear`

A parent's `view_will_disappear` therefore runs before its children's,
and its `view_did_disappear` after theirs.

Anything with the controller's lifetime must go through `retain`, or
through `observe` and `observe_notification`, which retain on the caller's
behalf. A listener added by hand and not retained outlives the controller.

`unload` does not remove the element from the document. Removing the
element is the caller's business; a subtree removed from the document is
detached, and so unloaded, without any call from the application.

`Application#terminate` posts `application_will_terminate`, stops
observing the fragment and the document, releases every window, unloads every
launch-time controller, and drops the first responder. It is idempotent.

## Direct Ownership

Manage only what you own.

- A controller owns its root view, its outlets, and its region — see
  [Awakening](awakening.md#regions-and-ownership) for where that region ends.
- A view owns the subviews adopted into it.
- The application owns windows, the first responder, and the URL fragment.

`Controller#parent` and `Controller#child_controllers` are derived
from the view tree; `parent` is nil for a root controller. Reach a child
through its public API, a binding, an outlet, or an action — not by walking its
DOM.

To replace a region, ask its owner. Do not remove a controller's element and
leave the controller behind.
