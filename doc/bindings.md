# Bindings

## View Bindings

Bindings provide a means of keeping a Swill object and a View or HTML Element
synchronized without having to write a lot of glue code, re-render a whole tree
of stuff, or think very much about state. Data flows, often in two ways, through
your application and even to the server. 


### Binding to Elements

The most common type of binding is a "value binding", where the semantic "value" 
of an HTML Element is bound to a variable or property you provide. 

For form elements, this usually means literally its `value`, but for paragraphs it 
means its content. HTML elements have special cases to generally try and do what 
you (or rather I!) expect. 

```html
<input bind="address">
<span bind="name"></span>
<section controller="MailingListDetail" bind="selected_object"></section>
```

Direction depends on the endpoint:

- A form control (`input`, `textarea`, `select`) is
  two-way, unless it carries `readonly`. A checkbox binds to a Boolean value. 
- Selects binding mutation happens on `change`, all the others happen on `input`. 
- A `Control` subclass binds its own `value` property, two-way.
- Any other element receives the value as text, one-way.
- An element carrying `controller` is a child controller root: the
  value becomes that child's `represented_object`, one-way.

A two-way binding requires a writable target: a (non-computed) declared property, or a key present in a Hash. 

`bind-*` creates a one-way binding for an HTML attribute/property. 

```html
<input bind-readonly="id.present?">
<button bind-disabled="member_list.selected_indexes.empty?">Remove</button>
```

* `disabled`, `checked`, `hidden`, `readonly`, `required`, and `open` are bound to the truthiness of the target.
* `data-*` attributes are removed for nil, `""`, and false;
* `aria-*` attributes are removed for nil and `""` but keep `"false"`.
* A nil `href` or `src` removes the attribute.
* `bind-*` on a controller root belongs to that controller, not its
parent. (TODO: This is maybe sloppy, will maybe reconsider)

### Key Paths

A path is dot-separated property names, read through the property system.
Path segments may name a plain object's key, which reads nil when absent, and may end in a value reader applied to whatever the preceding segment produced: `blank?`, `present?`, `empty?`, `nil?`,
`zero?`, `positive?`, `negative?`, `size`,
`length`, `first`, `last`, `strip`,
`upcase`, `downcase`, and other value methods.

Nil values support: `nil?`, `blank?`, `present?`, `to_s`,
`to_i`, and `to_f` because they're special-cased by the compiler. 
This is kind of magical and could lead to you being surprised if you try to 
call something else on `nil` that you can from Ruby, but I like it so its there.

### Binding Roots

A controller declares a default prefix by overriding `binding_root`,
which answers a property name or nil.

```ruby
def binding_root
  :represented_object
end
```

With that root, `bind="address"` resolves to
`represented_object.address` and `bind=""` resolves to the root
itself.

A leading `@` ignores the root and resolves against the controller.

```html
<button bind-disabled="@saving">Save</button>
```

### Value Transformers

`transform="name"` on a bound element formats the value for display and
parses the control's text back into the model. Registered names:

- `string` — The value's string form; nil formats as `""`. Parses text unchanged.
- `number` — Parses to a float; blank text parses to nil, so an emptied field clears the value.
- `boolean` — Formats as `"true"` or `"false"`; parses `"true"`, `"1"`, and `"on"` as true.

Register others by name before views awaken:

```ruby
Swill::ValueTransformer.register("currency", CurrencyTransformer.new)
```

## Observers

Bindings observe every declared property along the path and rewire when an
intermediate value changes. A path segment that is not a declared property is 
read but not observed, so changes to it do not propagate.

TODO: It's possible that allowing observers on a chain with an undeclared
property is good, but it also sounds like it could be confusing/bad. 

Observe a property directly with `observe`, on self or another object:

```ruby
observe(:query, ->(value) { reload })
observe(document, :selection, ->(value) { reload })
```

The receiver of `observe` is the observer, and retains a connection to the observed
object (or itself). It's responsible for destroying those connections 
when it's unloaded.

A property notifies only when its new value differs from the previous one,
after `coerce_property_value` has run. A class may also define
`name_did_change(previous, value)` to be called on each change.

Computed properties — `property` declared with a block — track the
properties read while computing and invalidate when any of them changes. They
are read-only: a binding to one must be one-way.

## Object Bindings

`bind` keeps one of the receiver's properties equal to a path on
another object.

```ruby
bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
     null_placeholder: [])
```

The target must be a declared property or a generated writer. One binding per
target; rebinding disposes the previous one. `null_placeholder:` is the
value the target receives when the path has no value, so a path running
through a nilable object can feed a property that is not nilable; the single
placeholder value is reused for every fall-back and must be treated as
immutable. Omitting it means nil.

`unbind(:target)` releases one binding; `unbind_all` releases
all of them, as a controller does when it unloads.

## Restoration Bindings

`restorable` declares a path whose value the application keeps in the
window's URL fragment.

```ruby
restorable :query, key: :q
restorable "source_list.selected_object_id"
```

The path must be dotted property names and must begin with a property declared
on the class. `key:` defaults to the path, and is scoped by window.

On launch, fragment values are written through the path before
`controller_did_load`; `controller_did_restore(restored)` then
runs on the window controller, with `restored` true when at least one
value was applied. A fragment key that is absent, or whose text does not
decode to the path's leaf type, leaves the property at its declared value.
Thereafter the path is observed and each change rewrites the fragment,
replacing history rather than pushing it.
