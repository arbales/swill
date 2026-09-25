# Lifecycle

A region is awakened once: the walk creates a View for every managed element,
attaches a Controller to every `[controller]` root, and then runs the
hooks. Markup awakened at launch, content loaded into a window, a presented
window, and any subtree inserted into the document after launch all take this
same path.

## Activation order

Awakening a region has two phases with an optional restoration step between
them.

The load phase runs on each new controller, innermost first, so a parent sees
its children already wired:

1. outlets connected
2. `view_did_load`
3. bindings wired
4. actions wired
5. `awake_from_dom`

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
  and no binding has fired yet: state set here is what bindings push first.
- `awake_from_dom` — Bindings have pushed their initial values, actions are
  live, and child controllers are wired.
- `controller_did_load` — The whole region, including any restored values, is in
  place. Runs once per controller instance.
- `view_will_appear`, `view_did_appear` — The view is about to appear, and has.
  Swill shows a controller's view by awakening it and hides it by unloading it,
  so these run once, at load, and `view_will_disappear` and
  `view_did_disappear` once, at [teardown](#teardown). A view hidden by other
  means, such as `bind-hidden`, runs none of them.

Outlets are nilable until the load phase connects them. Children load first,
so a child that reaches its parent from its own hooks finds the parent's
outlets still nil.

## Restoration

Declare a restorable path with the `restorable` macro:

```ruby
class SearchController < Swill::Controller
  property :query, type: String, default: ""
  restorable :query, key: :q
end
```

The path is a dotted property path resolved against the controller; the key
names the fragment parameter and defaults to the path. The application scopes
it under the window name, so `restorable :query, key: :q` in the
`main` window reads and writes `main.q`.

Restoration applies only to the controller a window holds as its content — the
topmost controller in the container. Nested controllers may declare
`restorable`, but nothing restores them.

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

A window's restoration observations are disposed when its content is replaced
or the window is dismissed. Keys the next content does not own are removed from
the fragment.

## Teardown

`Controller#unload` tears a controller down. Loading is once per
controller instance: an unloaded controller is finished, and re-awakening the
region builds a new one. The element keeps its View.

`unload` returns immediately unless its view still holds it, so calling
it twice is harmless. Otherwise, in order:

1. `view_will_disappear`
2. the first responder is released if it lies within this region
3. object bindings are unbound
4. everything the controller retained is released — property and path
  observations, notification observers registered through
  `observe_notification`, DOM listeners, and the disposers installed for
  its bindings and actions
5. each child controller is unloaded, recursively
6. subviews are released and the view is removed from its superview
7. the view's controller is cleared
8. `view_did_disappear`

A parent's `view_will_disappear` therefore runs before its children's,
and its `view_did_disappear` after theirs.

Anything with the controller's lifetime must go through `retain`, or
through `observe` and `observe_notification`, which retain for
you. A listener added by hand and not retained outlives the controller.

`unload` does not remove the element from the document. Removing the
element is the caller's business; a subtree removed from the document is
detached — and so unloaded — automatically.

`Application#terminate` posts `application_will_terminate`, stops
observing the fragment and the document, releases every window, unloads every
launch-time controller, and drops the first responder. It is idempotent.

## Direct ownership

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

## Focus and first responder

Focus and first-responder policy are part of the responder chain rather than the
lifecycle; see [Responders](responders.md#first-responder). The one lifecycle
detail: loading window content hands the first responder to the new controller
unless that content already claimed it, so a field focused in
`controller_did_load` stands.
