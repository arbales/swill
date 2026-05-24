# Awakening, Hydration, and Templates

Swill treats server HTML as an object graph waiting to be awakened. The DOM gives placement, nesting, and initial content. Attributes say which elements become framework objects.

## Managed Elements

A live element is managed when it has `klass`, `controller`, or `outlet`.

```html
<section controller="MovieList" outlet="movieList">
  <header outlet="headerView"></header>
</section>
```

`controller="MovieList"` creates a `MovieList` controller and attaches it to the element's `View`.

`klass="List"` means "awaken this HTMLElement as an object of class `List`." Today the class must be a `View` subclass, because `View` is the framework's DOM boundary. This is intentionally broader language than "view class" so the markup model can evolve without changing the attribute.

`outlet="headerView"` creates a plain `View` when no `klass` or `controller` is present. That view is then connected to the nearest owning controller outlet with the same name.

`klass` and `controller` can appear together. That means "wrap this element in `klass`, create this controller, and set the controller's `view` to that object."

## Inert Elements

Elements with only `bind`, `bind-*`, or `data-action` stay raw DOM. Bindings and actions attach behavior to them, but they do not become `View` or `Controller` objects.

```html
<button data-action="save" bind-disabled="@saving">Save</button>
```

This keeps the object graph sparse: only elements that need identity become objects.

## Ownership

DOM nesting is a signal, but ownership follows the sparse `View` tree.

Each `View` has an optional `controller` only when it is that controller's root view. Outlet views usually have `controller === null`; their region owner is found with `view.owner()`.

Target/actions start from `firstResponderFor(sender)` and then walk the responder chain. This means actions resolve through the focused or sender-owned region, then through parent controllers, then the application.

## JSON Outlets

JSON script outlets are inert as DOM objects but are available to outlet connection:

```html
<div controller="MovieList">
  <script type="application/json" outlet="representedObject">
    []
  </script>
</div>
```

The owning controller may override `decodeOutletData(name, value)` to turn that JSON into models before assignment. This is the forward-compatible path for server-provided represented objects.

## Pre-rendered Content

Pre-rendered rows can live inside an outlet region:

```html
<div controller="MovieList">
  <script type="application/json" outlet="representedObject">[]</script>
  <section outlet="rows">
    <div class="row">Pre-rendered by the server</div>
  </section>
</div>
```

The `rows` section becomes the owned view. The row DOM remains plain DOM unless a row itself carries `klass`, `controller`, or `outlet`.

## Templates

Templates are inert. They are scanned as named content, not awakened in place.

Window content templates use either:

```html
<template for="window" name="members">...</template>
```

or the shorter top-level form:

```html
<body>
  <template name="members">...</template>
</body>
```

Window slots use `[window]`:

```html
<section window="main" name="lists"></section>
```

If the window slot is empty, Swill loads content from a matching template or captured pre-rendered content. If the URL fragment asks for different content than the pre-rendered default, Swill skips adopting the stale content when it can load the requested content instead.

Use templates for reusable or switchable window content. Use live DOM for content that should be visible and awakened at launch.
