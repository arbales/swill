# Bindings

A binding keeps something equal to a value somewhere else, without glue code,
without re-rendering a tree, and without you thinking very much about state. Data
flows — often in two directions — through your application and even to the
server.

A binding connects a **receiver** to a **key path** on an **observed object**.
The receiver is kept up to date, and the binding's **name** says which of its
properties.

```ruby
bind(:menu_recipes, to: self, key_path: "selected_menu.recipes")
```

That reads: keep my `menu_recipes` equal to `selected_menu.recipes`, and keep it
equal as things change.

## Markup is a spelling of the same thing

`bind="selected_menu.recipes"` in markup is not a separate feature. It establishes
the same binding, with the element as the receiver. `bind` is the element's
value binding, and `bind-disabled` its `disabled` binding:

```html
<span bind="selected_menu.recipes"></span>
```

This is the arrangement Cocoa uses, where wiring a binding in Interface Builder is
exactly equivalent to sending `bind:toObject:withKeyPath:options:` yourself. The
attribute is a spelling; the binding is the thing.

Everything below describes the binding. For the exact attribute syntax — which
element binds to what, and the DOM rules — see the [markup
reference](markup.md#bind).

## Establishing and releasing

```ruby
bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
     null_placeholder: [])

unbind(:menu_recipes)
unbind_all
```

One binding per name: binding a name that is already bound replaces the previous
one. `unbind_all` releases every binding on the object, which is what a
controller does when it unloads.

The name must be a declared property or a generated writer.

## Key paths

A path is dot-separated property names, read through the property system.

Path segments may name a plain object's key, which reads nil when absent, and may
end in a value reader applied to whatever the preceding segment produced:
`blank?`, `present?`, `empty?`, `nil?`, `zero?`, `positive?`, `negative?`,
`size`, `length`, `first`, `last`, `min`, `max`, `sum`, `compact`, `uniq`,
`reverse`, `dup`, `strip`, `upcase`, `downcase`, `capitalize`, `to_s`, `to_sym`,
`to_i`, and `to_f`.

Nil values support: `nil?`, `blank?`, `present?`, `to_s`, `to_i`, and `to_f`
because they're special-cased by the runtime. This is kind of magical and could
lead to you being surprised if you try to call something else on `nil` that you
can from Ruby, but I like it so its there.

## Binding roots

A controller can declare a default prefix for the paths in its region by
overriding `binding_root`, which answers a property name or nil.

```ruby
def binding_root
  :represented_object
end
```

With that root, a path of `address` resolves to `represented_object.address`.
It is how an editor controller points its whole region at one object without
repeating the prefix everywhere. Markup can opt out of the root per binding; see
[path spellings](markup.md#path-spellings).

## Value transformers

A transformer formats a value on the way out and parses it on the way back, so
the model can hold a number while a text field holds text.

| Name | Behaviour |
| --- | --- |
| `string` | the value's string form; nil formats as `""`; parses text unchanged |
| `number` | parses to a float; blank text parses to nil, so clearing a field clears the value |
| `boolean` | formats as `"true"`/`"false"`; parses `"true"`, `"1"` and `"on"` as true |

Register your own before views awaken:

```ruby
Swill::ValueTransformer.register("currency", CurrencyTransformer.new)
```

## Null placeholders

`null_placeholder:` is what the receiver is given when the path has no value.
It lets a path that runs through a nilable object feed a property that is not
nilable:

```ruby
bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
     null_placeholder: [])
```

One placeholder serves every fall-back, so treat it as immutable. Omitting it
means nil.

## How bindings work

Two parts: watching the path, and reacting to a change. Nothing re-renders, and
nothing polls.

### Watching walks the path and re-subscribes

A path like `selected_menu.recipes` is not a single subscription. The runtime
walks it segment by segment from the observed object and subscribes to each segment
that is **a declared property on the object it was read from**. The walk stops at
the first nil.

When a subscription in the chain fires, everything *below* it is rebuilt before
your code runs, and only then is the full path read again and handed to the
binding. Only below it: the segments above were read from the same objects as
before, so their subscriptions are still correct, and a change in the last
segment — a leaf binding, the common case — rebinds nothing at all. Three things
fall out of that:

- Replacing an intermediate object re-points the rest of the chain automatically.
  Assign a new `selected_menu` and the binding starts watching the new menu's
  `recipes` without being told.
- A segment that is not a declared property — a Hash key, a plain JavaScript
  object — is read but never subscribed. The value shows up, and later changes to
  it do not.
- A nil in the middle is not an error. The walk simply stops there, and the
  subscription on the segment that produced the nil is what wakes the binding when
  it becomes something.

### Writing a property notifies in a fixed order

A write always runs: coerce, compare, will-change, store, notify. The compare is
why an assignment that doesn't change the value is free — observers never hear
about it.

Notification then runs in one order: computed properties that depend on it are
invalidated first, then `<name>_did_change`, then observers and the bindings built
on them. Dependents go first so that a `_did_change` hook or an observer reading a
computed property gets the new value rather than a stale one.

Computed properties work out their own dependencies. The first read runs the block
and records every property read while it ran; those become its dependencies, and
any of them changing invalidates it. The value is recomputed on the next read, not
eagerly. That's why a computed property never declares what it depends on — and
why a dependency read conditionally is only tracked on the passes where it's
actually read.

### Writing back

A two-way binding does the reverse trip: read the receiver, run it through the
transform if there is one, and write down the path. If an owner along the way has
gone nil, the write is dropped rather than raising.

A two-way binding needs a writable path — a declared, non-computed property, or a
key already present in a Hash. That is checked when the binding is established,
so a binding pointed at a computed property raises then rather than silently
failing the first time someone types.

## Observers

TODO: It's possible that allowing observers on a chain with an undeclared
property is good, but it also sounds like it could be confusing/bad.

Observe a property directly with `observe`, on self or another object:

```ruby
observe(:query, ->(value) { reload })
observe(document, :selection, ->(value) { reload })
```

The receiver of `observe` is the observer, and retains a connection to the
observed object (or itself). It's responsible for destroying those connections
when it's unloaded.

A class may also define `name_did_change(previous, value)` to hear about one of
its own properties without registering an observer.

Computed properties — `property` declared with a block — are read-only, so a
binding to one must be one-way.

## Restoration bindings

`restorable` declares a path whose value the application keeps in the window's URL
fragment — a binding whose other end is the address bar.

```ruby
restorable :query, key: :q
restorable "source_list.selected_object_id"
```

The path must be dotted property names and must begin with a property declared on
the class. `key:` defaults to the path, and is scoped by window.

On launch, fragment values are written through the path before
`controller_did_load`; `controller_did_restore(restored)` then runs on the window
controller, with `restored` true when at least one value was applied. A fragment
key that is absent, or whose text does not decode to the path's leaf type, leaves
the property at its declared value. Thereafter the path is observed and each
change rewrites the fragment, replacing history rather than pushing it.

## Bindings in list rows

A list row is bound against its item rather than against a controller. Paths in a
row resolve directly on the item, with no binding root in play — so a row's
bindings read the object they display rather than the list that owns them.

Rows are re-created wholesale when the list's arranged objects change, so a row's
bindings are established and released on every render rather than being updated
in place.
