# Awakening, Hydration, and Templates

Swill treats HTML as an object graph waiting to be awakened, similar to
NIB/XIB in Cocoa. The DOM can organize entire views complete with placeholder content and styling, which Swill will "awaken" given 
attributes set on tags. This also means that it's easy to "server side render" your initial page. 

## Managed Elements

A live element becomes "managed" when it has `klass`, `controller`, or `outlet`.

```html
<section controller="MovieList" outlet="movieList">
  <header outlet="headerView"></header>
</section>
```

`controller="MovieList"` creates a `MovieList` controller and attaches it to the element's `View`.

`klass="List"` means "awaken this HTMLElement as an object of class `List`." The class must be a `View` subclass. 

`outlet="headerView"` creates a plain `View` when no `klass` or `controller` is present. That view is then connected to the nearest owning controller outlet with the same name.

`klass` and `controller` can appear together. That means "wrap this element in `klass`, create this controller, and set the controller's `view` to that object."

## Inert Elements

For performance reasons, Elements with only `bind`, `bind-*` or `data-action` just stay Elements, and don't receive an attached Swill objects. 

```html
<button data-action="save" bind-disabled="@saving">Save</button>
```

## Ownership

A `Controller`'s root `View` will have its `controller` property set to that "owning" controller. The further children in that controller's hierarchy can reach the controller through their `#owner` method.

## Actions

An action walks the responder chain from the responder that received it. The first responder implementing the action handles it; otherwise the search continues through `next_responder` — parent controllers, then the application. An action no responder implements raises.

## JSON Outlets

JSON script outlets are inert as DOM objects but are available to outlet connection:

```html
<div controller="MovieList">
  <script type="application/json" outlet="represented_object">
    []
  </script>
</div>
```

The owning controller may override `decode_outlet_data(name, value)` to turn that JSON into models, or do something else to it. This will also 
allow us to support server-rendered objects that awaken into Swill Models
in the future. Not exactly sure on how yet, but given the wire format experiments that are happening maybe by embedding MessagePack data here.

## Pre-rendered Content

Pre-rendered rows can live inside an outlet region:

```html
<div controller="MovieList">
  <script type="application/json" outlet="represented_object">[]</script>
  <section outlet="rows">
    <div class="row">Pre-rendered by the server</div>
  </section>
</div>
```

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
