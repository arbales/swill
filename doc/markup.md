# Markup

Every attribute Swill reads, in one place. These attributes are a *declarative
spelling* — each one establishes something you could establish in Ruby. `bind`
establishes a binding; `controller` creates a controller; `data-action` connects
an action to the responder chain. The mechanism behind each is described in its
own guide, linked below.

| Attribute | Declares | Mechanism |
| --- | --- | --- |
| `controller` | A controller rooted at this element | [Awakening](awakening.md) |
| `klass` | Awaken this element as a `View` subclass | [Awakening](awakening.md) |
| `outlet` | Connect this element to a named property on its owner | [Awakening](awakening.md) |
| `bind` | A value binding | [Bindings](bindings.md) |
| `bind-*` | A one-way binding to a DOM property or attribute | [Bindings](bindings.md) |
| `transform` | A value transformer on a binding | [Bindings](bindings.md) |
| `data-action` | An action sent into the responder chain | [Responders](responders.md) |
| `window` | A named container whose content can be replaced | [Lifecycle](lifecycle.md) |
| `template name` / `for` | Named, inert content | [Awakening](awakening.md) |

An element carrying only `bind`, `bind-*` or `data-action` stays a plain element.
It does not become a Swill object.

## controller

Creates the named controller and attaches it to this element's `View`.

```html
<section controller="MovieList"></section>
```

The element and everything under it becomes that controller's region — see
[regions and ownership](awakening.md#regions-and-ownership) for where the region
ends.

## klass

Awakens the element as an instance of the named class, which must be a `View`
subclass.

```html
<input klass="Swill::Control::TextField">
```

`klass` and `controller` may appear together: wrap the element in `klass`, create
the controller, and set the controller's `view` to that object.

## outlet

Connects the element to the property of that name on the nearest owning
controller.

```html
<header outlet="header_view"></header>
```

With no `klass` or `controller` present, a plain `View` is created to be the
outlet's value. An outlet property is nilable — it holds nil until awakening
connects it.

A `<script type="application/json">` carrying `outlet` is parsed and assigned
rather than wrapped in a `View`:

```html
<script type="application/json" outlet="represented_object">[]</script>
```

The owning controller may override `decode_outlet_data(name, value)` to turn that
JSON into models before it is assigned.

## bind

A value binding. What "value" means depends on the element:

```html
<input bind="address">
<span bind="name"></span>
<section controller="MailingListDetail" bind="selected_object"></section>
```

| Element | Bound to | Direction |
| --- | --- | --- |
| `input`, `textarea`, `select` | its `value` | two-way, unless it carries `readonly` |
| a checkbox | its `checked` state, as a boolean | two-way, unless it carries `readonly` |
| a `Control` subclass | the control's own `value` property | two-way |
| an element carrying `controller` | the child's `represented_object` | one-way |
| anything else | its text content | one-way |

Write-back happens on `change` for selects and checkboxes, and on `input` for
everything else.

A two-way binding needs a writable path: one ending in a declared, non-computed
property, or in a key already present in a Hash. Anything else raises as the
region awakens rather than failing silently later.

In text and form fields, a nil value renders as the empty string. A checkbox
shows nil as unchecked, and a child controller receives nil as its
`represented_object`.

### Path spellings

Paths are resolved against the controller's `binding_root` unless told otherwise.

| Spelling | Resolves to |
| --- | --- |
| `bind="address"` | `address` under the binding root |
| `bind=""` | the binding root itself |
| `bind="@saving"` | `saving` on the controller, ignoring the root |
| `bind="@"` | the controller itself; in a list row, the row's item |

## bind-*

A one-way binding to the named DOM property or attribute.

```html
<input bind-readonly="id.present?">
<button bind-disabled="member_list.selected_indexes.empty?">Remove</button>
<a bind-href="record.url">Open</a>
```

The suffix names the property. `bind-readonly` writes the `readOnly` property —
the attribute is spelled as in HTML, and normalized on the way through.

How the value is written depends on the property:

| Property | Rule |
| --- | --- |
| `disabled`, `checked`, `hidden`, `readonly`, `required`, `open` | set from the truthiness of the value |
| `data-*` | removed when the value is nil, `""`, or false |
| `aria-*` | removed when nil or `""`, but `"false"` is kept — it is a state of its own |
| `href`, `src` | a nil value removes the attribute |
| anything else | written as-is |

`bind-*` on an element carrying `controller` belongs to *that* controller, not to
its parent — unlike `bind` on the same element, which belongs to the parent and
feeds the child's `represented_object`. (TODO: This is maybe sloppy, will maybe
reconsider)

## transform

Names a registered value transformer on a binding.

```html
<input bind="servings" transform="number">
```

`string`, `number` and `boolean` are built in; see [value
transformers](bindings.md#value-transformers) for what each does and how to
register your own. An unregistered name raises when the region is wired.

## data-action

Sends an action into the responder chain.

```html
<button data-action="save">Save</button>
<input data-action="change:apply_filter">
```

The value is `event:action`, or just `action` — in which case the event is
`click`. The action is sent starting from the controller that owns the region,
and walks `next_responder` until something implements it.

An element already wired for an action is left to its owner, so a region
re-awakened inside another does not double-fire.

## window

Marks a named container whose content can be replaced at runtime.

```html
<section window="main" name="lists"></section>
```

`name` records which content is currently loaded. An empty slot is filled from a
matching template or from captured pre-rendered content.

## template

Templates are inert. They are scanned as named content, not awakened in place.

```html
<template for="window" name="members">...</template>
```

Directly under the application's root element — `<body>` by default — the
shorter form works:

```html
<template name="members">...</template>
```

Use templates for reusable or switchable window content, and live DOM for content
that should be visible and awakened at launch.
