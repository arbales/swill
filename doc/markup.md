# Markup

Swill applications start with an HTML document laying out not only the
elements that make up the UI, but also their connections to Swill objects,
namely controllers and views.

| Attribute | Declares | Mechanism |
| --- | --- | --- |
| `application` | The application's root element, and its `Application` subclass | [Getting started](getting_started.md) |
| `controller` | Instantiates a `Controller` whose root element or `View` is this tag | [Awakening](awakening.md) |
| `klass` | Awaken this element as a `View` subclass | [Awakening](awakening.md) |
| `outlet` | Connect this element to a named property on its owner | [Awakening](awakening.md) |
| `bind` | A value binding | [Bindings](bindings.md) |
| `bind-*` | A one-way binding to a DOM property, or a `data-*` or `aria-*` attribute | [Bindings](bindings.md) |
| `transform` | A value transformer on a binding | [Bindings](bindings.md) |
| `data-action` | An action sent into the responder chain | [Responders](responders.md) |
| `window` / `name` | A named container whose content can be replaced, and the content loaded in it | [Awakening](awakening.md#templates-and-windows) |
| `template name` / `for` | Named, inert window content | [Awakening](awakening.md#templates-and-windows) |
| `template for="row"` | The row a list awakens for each arranged object | [Collections](collections.md#lists) |
| `template for="editor"` | The editor a list awakens for a row being edited in place | [Collections](collections.md#editing-in-place) |
| `data-column` | The sort key a header sends with `sort_by` | [Collections](collections.md#sorting) |

An element carrying only `bind`, `bind-*` or `data-action` stays a plain
element.

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

`klass` and `controller` may appear together: the element is wrapped in `klass`,
the controller is created, and the controller's `view` is set to that object.

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

A script of any other type stays inert. An `outlet` on a `<template>` assigns
the template element itself.

The owning controller may override `decode_outlet_data(name, value)` to turn
that JSON into models before it is assigned.

## bind

A value binding. Which value is bound depends on the element:

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
other form fields. A `Control` is observed through its `value` property, which
the control updates on whichever event suits it.

A `bind` on a top-level controller's own root element is not established;
only a parent controller or a list row supplies one.

A two-way binding needs a writable path, and one that cannot be written raises
as the region awakens; see [writing back](bindings.md#writing-back) for the
rule.

In text and form fields, a nil value renders as the empty string, and a
`Control` receives `""`. A checkbox shows nil as unchecked, and a child
controller receives nil as its `represented_object`. When the binding carries a
transformer, nil passes through the transformer's `format` instead.

### Path Spellings

Paths are resolved against the controller's `binding_root` unless told
otherwise.

| Spelling | Resolves to |
| --- | --- |
| `bind="address"` | `address` under the binding root |
| `bind=""` | the binding root itself |
| `bind="@saving"` | `saving` on the controller, ignoring the root; in a list row, `saving` on the row's item |
| `bind="@"` | the controller itself; in a list row, the row's item |

`bind=""` on a form field is two-way, so it raises unless the binding root
itself is writable there.

## bind-*

A one-way binding to the named DOM property, or to a `data-*` or `aria-*`
attribute.

```html
<input bind-readonly="id.present?">
<button bind-disabled="member_list.selected_indexes.empty?">Remove</button>
<a bind-href="record.url">Open</a>
```

The suffix names the property. `bind-readonly` writes the `readOnly` property —
the attribute is spelled as in HTML, and normalized on the way through.
`readonly` is the only suffix normalized; any other is used as written, so
`bind-class` sets a `class` property rather than `className`.

How the value is written depends on the property:

| Property | Rule |
| --- | --- |
| `disabled`, `checked`, `hidden`, `readonly`, `required`, `open` | set from the truthiness of the value |
| `data-*` | removed when the value is nil, `""`, or false; the string `"false"` is kept |
| `aria-*` | removed when nil or `""`; false is written as `"false"` — it is a state of its own |
| `href`, `src` | a nil value removes the attribute |
| anything else | assigned to the property as-is, nil included |

`bind-*` on an element carrying `controller` belongs to that controller, not
to its parent — unlike `bind` on the same element, which belongs to the parent
and feeds the child's `represented_object`. (TODO: This is maybe sloppy, will
maybe reconsider)

`data-action` on an element carrying `controller` likewise belongs to the child.

## transform

Names a registered value transformer on a binding.

```html
<input bind="servings" transform="number">
```

`string`, `number` and `boolean` are built in; see [value
transformers](bindings.md#value-transformers) for what each does and how to
register your own. An unregistered name raises as the region awakens.

`transform` applies to `bind` only, never to `bind-*`. A checkbox ignores it, as
does a child controller's `represented_object` binding, though the name is still
checked.

## data-action

Sends an action into the responder chain.

```html
<button data-action="save">Save</button>
<input data-action="change:apply_filter">
```

The value is `event:action`, or `action` alone, in which case the event is
`click`. The action is sent starting from the controller that owns the region,
and walks `next_responder` until something implements it. An action nothing in
the chain implements raises when the element sends it; see
[actions](responders.md#actions).

An element that already carries an action handler is left to its owner, so a
region re-awakened inside another does not send the action twice.

`data-action="sort_by"` on a list header, with `data-column` naming the key,
sorts the list's arranged content; see [sorting](collections.md#sorting).

## window

Marks a named container whose content can be replaced; `name` records which
content is loaded in it.

```html
<section window="main" name="lists"></section>
```

See [templates and windows](awakening.md#templates-and-windows) for how a
window is filled at launch and by `Application#load_window_content`.

## template

Declares named, inert content for a window: `for="window"` anywhere in the
document, or `name` alone directly under the element carrying `application`.

```html
<template for="window" name="members">...</template>
<template name="members">...</template>
```

See [templates and windows](awakening.md#templates-and-windows) for when a
template is awakened.
