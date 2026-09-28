# Awakening

Swill treats HTML as an object graph waiting to be awakened, as Cocoa treats a
nib. The DOM describes entire views, complete with placeholder content and
styling, and Swill awakens them from the attributes set on their tags.

## Managed Elements

An element becomes managed when it carries `klass`, `controller` or `outlet`.

```html
<section controller="MovieList" outlet="movie_list">
  <header outlet="header_view"></header>
</section>
```

See [Markup](markup.md) for what each attribute declares:
[`controller`](markup.md#controller), [`klass`](markup.md#klass) and
[`outlet`](markup.md#outlet).

## Inert Elements

An element with only `bind`, `bind-*` or `data-action` stays a plain element
and receives no Swill object.

```html
<button data-action="save" bind-disabled="@saving">Save</button>
```

## Regions and Ownership

A controller's region is its root element and everything beneath it, up to
the next element carrying `controller`, which begins a child region. An
`outlet`, `bind` or `data-action` within a region addresses the controller
that owns it, never one outside.

The root `View` of a region holds its controller in `controller`; any view
within the region reaches that controller through `#owner`.

A `bind` on a child controller's root element belongs to the parent, which
establishes that binding; its value becomes the child's `represented_object`.
This is how a parent hands an object to a nested controller.

## Awakening a Region

The application awakens the markup beneath its root element when it launches,
and awakens a window's content each time that content is loaded. For each
controller in the region, innermost first, the awakener:

1. connects the controller's outlets;
2. sends the controller `view_did_load`;
3. establishes the bindings in its region, each resolved against its
   `binding_root`;
4. installs the action handlers in its region;
5. sends the controller `awake_from_dom`.

Restoration, for a window's content, and then the finish-phase hooks
`controller_did_load`, `view_will_appear` and `view_did_appear` follow; see
[activation order](lifecycle.md#activation-order).

Every object awakened or connected in this process belongs to the controller
that owns the region, and is released when that controller unloads. Removing
the region's element from the document unloads it.

See [Lifecycle](lifecycle.md) for the hooks that follow awakening, and
[Bindings](bindings.md) for what an established binding does.

## JSON Outlets

A JSON script element is inert as a DOM object but can be connected to an
outlet; see [`outlet`](markup.md#outlet) for how it is parsed and decoded.

```html
<div controller="MovieList">
  <script type="application/json" outlet="represented_object">
    []
  </script>
</div>
```

This will also allow us to support server-rendered objects that awaken into
Swill Models in the future. Not exactly sure on how yet, but given the wire
format experiments that are happening maybe by embedding MessagePack data here.

## Templates and Windows

A template holds content that is awakened later, when a window loads it by
name. A window content template is declared with `for="window"` anywhere in
the document:

```html
<template for="window" name="members">...</template>
```

or, when it is a direct child of the element carrying `application`, with
`name` alone:

```html
<body>
  <template name="members">...</template>
</body>
```

Templates are inert: they are scanned as named content, not awakened in place.

A window is an element carrying `window`. Its `name` attribute names the
content it shows:

```html
<section window="main" name="lists"></section>
```

At launch, content already inside a window is its pre-rendered content: the
application captures it under the window's `name` and awakens it in place.
Pre-rendered rows can live inside an outlet region:

```html
<div controller="MovieList">
  <script type="application/json" outlet="represented_object">[]</script>
  <section outlet="rows">
    <div class="row">Pre-rendered by the server</div>
  </section>
</div>
```

An empty window is filled from the template its `name` selects. When the URL
fragment requests other content for the window, and a template or captured
content of that name exists, that content is loaded instead and the
pre-rendered content is discarded.

`Application#load_window_content` replaces a window's content with a copy of
the named template or captured content, awakens it, and records the name in
the URL fragment. Loading content that no template or capture provides raises.

Templates suit content that is reused or switched between; live markup suits
content that is visible and awakened at launch.
