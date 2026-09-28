# Swell

`Swell` reads and changes an element's classes, attributes, properties, and
content through calls that can be chained together.

This guide covers wrapping an element, choosing how to write a value, finding
descendants, and managing event listeners.

See [Bindings](bindings.md) for values kept up to date from object properties,
and [Awakening](awakening.md) for managed views and controller ownership. The
`Swell` class reference documents each method.

## Wrapping an Element

`Swell[element]` creates a wrapper around an existing DOM element. A control
can use it to update a CSS class and an accessibility attribute together:

```ruby
Swell[element].toggle_class("open", open).aria("expanded", open)
```

Editing methods return the wrapper, so subsequent calls apply to the same
element. Query methods return the value they read. The wrapper's `element`
reader provides the DOM element for operations outside Swell's methods.

The block form groups edits around one wrapper. For example, a segmented
control can set a button's label and option value:

```ruby
Swell[button] do |dom|
  dom.text(option["label"])
  dom.data("value", option["value"])
end
```

The call returns the wrapper after the block runs. Each call to `Swell.[]`
creates a wrapper for the supplied element, preserving any existing `View`
and its owner.

## Writing Values

HTML attributes hold strings, while DOM properties have values determined by
the element's API. `Swell#attr` writes an attribute; `Swell#prop` assigns a DOM
property. ARIA and data attributes use `Swell#aria` and `Swell#data`, with the
prefix supplied by the method.

The attribute methods treat Boolean and nil values as follows:

| Value | `attr` | `aria` and `data` |
| --- | --- | --- |
| `nil` | Removes the attribute | Removes the attribute |
| `false` | Removes the attribute | Writes `"false"` |
| `true` | Writes an empty string | Writes `"true"` |
| Other values | Writes the string form | Writes the string form |

For example, a closed popup has `aria-expanded="false"`, and a disabled field
has its `disabled` property set to true:

```ruby
Swell[button].aria("expanded", false)
Swell[field].prop("disabled", true)
```

Property names use their JavaScript spelling, such as `"readOnly"`.
Assignments follow the DOM property's setter. Attribute readers return
strings, or `nil` when an attribute is absent. A stored `"false"` is a string;
code that needs a Boolean must interpret it as one.

## Content and Descendants

`Swell#text` replaces an element's contents with text. A string containing HTML
characters is displayed as text; a nil value clears the contents. Templates
provide markup for elements that the application creates.

`Swell#find` searches descendants with a CSS selector and returns a wrapper
for the first match, or `nil` when none matches. `Swell#find!` raises when the
expected element is absent. A custom select uses this form to fill its option
label:

```ruby
Swell[row].find!(".custom-select-option-label").text(option["label"])
```

`Swell#append` adds a node as the last child, moving it from its existing
parent when necessary. `Swell#empty` removes the child nodes, and
`Swell#remove` removes the wrapped element from its parent. `Swell#hide` and
`Swell#show` set its `hidden` property.

Changes to managed elements follow the application's ownership and unloading
rules. See [Direct Ownership](lifecycle.md#direct-ownership) when replacing a
controller's content, and [Unloading](lifecycle.md#unloading) for the effect of
removing managed elements from the document.

## Listening for Events

`Swell#listen` registers an event handler on the element. It returns a
callable that removes the listener. A controller or view retains that callable
to release the listener when it unloads.

For example, a segmented control listens for clicks on its element:

```ruby
handler = ->(event) { segment_clicked(event) }
retain(Swell[element].listen("click", handler))
```

The handler receives the DOM event. `capture: true` registers it for the
capture phase; the default is false. An application can call the returned
callable to stop listening earlier.

See [Responders](responders.md) for actions declared in markup and dispatched
through the responder chain.
