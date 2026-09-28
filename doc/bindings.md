# Bindings

A binding keeps a property of one object equal to a value on another object.
The object whose property is updated is the **receiver**; the object that
provides the value is the **observed object**. A **key path** identifies the
value to read, and the binding's **name** identifies the receiver's property.
Bindings can connect objects in Ruby or connect elements to objects through
markup.

A controller can bind its `menu_recipes` property to the recipes of its
selected menu:

```ruby
bind(:menu_recipes, to: self, key_path: "selected_menu.recipes")
```

The binding assigns the selected menu's recipes to `menu_recipes` immediately
and updates it when the recipes or the selected menu change. Here the
controller is both the receiver and the observed object.

## Establishing and Releasing

`ObjectBindings#bind` establishes a one-way binding to a declared property or
a generated writer. Changes to the observed value update the receiver;
assigning the receiver's property does not write back through the key path.
Each name holds one binding. Establishing another under that name releases
the previous binding.

A binding can supply an empty array while no menu is selected:

```ruby
bind(:menu_recipes, to: self, key_path: "selected_menu.recipes",
     null_placeholder: [])
```

`ObjectBindings#unbind` releases the binding with the given name, and
`ObjectBindings#unbind_all` releases all of the object's bindings. A controller
releases its bindings when it unloads. See [Lifecycle](lifecycle.md#unloading)
for the lifetime of connections owned by a controller.

## Bindings in Markup

A `bind` attribute connects an element's value to a key path in its
controller's region. For example, a text element can display the selected
menu's name:

```html
<span bind="selected_menu.name"></span>
```

Swill establishes the binding when the region awakens. The element receives
the current value before the controller's `awake_from_dom` hook runs and
continues to receive changes until the binding is released.

The element determines which value is bound and whether edits are written
back. A text element displays the value; a form field also writes the user's
edits to the observed object. A named attribute such as `bind-disabled`
establishes a one-way binding to that element property.

Markup bindings use the same key paths and value transformers as bindings
established in Ruby. See the [markup reference](markup.md#bind) for each
element's binding, direction, and attribute syntax.

## Key Paths

A key path is a sequence of property names separated by dots.
`selected_menu.recipes` names the `recipes` property of the object held in
`selected_menu`. Replacing the selected menu makes the binding follow the new
menu's recipes automatically.

Bindings observe declared properties along the path. A path may also read a
Hash key or a plain JavaScript object's property, but changes to those values
are not observed. Replacing a declared property earlier in the path causes
the binding to read the path again, including any unobserved values.

A path can pass through `nil`, for example when no menu is selected. The
binding resumes receiving values when an observed property in the path makes
the value available again. A missing key on a plain object also reads as
`nil`.

A path may end with a value reader applied to the preceding value:

| Purpose | Readers |
| --- | --- |
| Test a value | `blank?`, `present?`, `empty?`, `nil?`, `zero?`, `positive?`, `negative?` |
| Read a collection | `size`, `length`, `first`, `last`, `min`, `max`, `sum` |
| Derive a collection or copy | `compact`, `uniq`, `reverse`, `dup` |
| Format text | `strip`, `upcase`, `downcase`, `capitalize` |
| Convert a value | `to_s`, `to_sym`, `to_i`, `to_f` |

For example, `selected_menu.recipes.empty?` supplies a Boolean value for a
binding such as `bind-disabled`.

Nil values support: `nil?`, `blank?`, `present?`, `to_s`, `to_i`, and `to_f`
because they're special-cased by the runtime. This is kind of magical and could
lead to you being surprised if you try to call something else on `nil` that you
can from Ruby, but I like it so its there.

A key path declared with `Controller.restorable` is not a binding: it connects
a controller property to the URL fragment; see
[restoration](lifecycle.md#restoration).

## Binding Roots

A controller's binding root is the property under which markup key paths in
its region resolve. By default, paths resolve against the controller itself.
An editor can override `Controller#binding_root` to present its represented
object throughout the region:

```ruby
def binding_root
  :represented_object
end
```

With this root, `bind="address"` refers to `represented_object.address`.
Bindings for the edited object's properties share the prefix without
repeating it in markup. A binding that needs a property on the controller can
use a leading `@` to ignore the root. See [path
spellings](markup.md#path-spellings) for the supported forms.

## Writing Back

A two-way binding updates the observed object when the receiver is edited.
For example, an input bound to `address` both displays the current address
and assigns changes made in the field to that property.

The key path must end in a declared property with a writer, or a key already
present in a Hash. A computed property is writable only when it declares a
writer. A path ending in a read-only value raises when the binding is
established. Use a one-way binding to display such a value; a form field can
request one with `readonly`.

A path through `nil` is allowed. While the object needed for the assignment
is absent, edits are ignored. Once the object is available, edits can be
written through the path.

## Value Transformers

A `ValueTransformer` converts between the observed value and the value
presented by the receiver. Its `format` method prepares the value for display;
its `parse` method converts an edit back to the value to store. A number can
therefore remain a number on the observed object while a text field displays
and edits it as text:

```html
<input bind="servings" transform="number">
```

Swill provides three named transformers:

| Name | Behavior |
| --- | --- |
| `string` | Formats the value as text, with `nil` as `""`; parses text unchanged. |
| `number` | Formats the value as text, with `nil` as `""`; parses a float, or `nil` for blank text. |
| `boolean` | Formats the value as `"true"` or `"false"`; parses `"true"`, `"1"`, and `"on"` as true, and other text as false. |

A custom transformer supplies its own formatting and parsing methods.
Register it before establishing bindings that use its name:

```ruby
Swill::ValueTransformer.register("currency", CurrencyTransformer.new)
```

Ruby bindings select a transformer with `transform: "currency"`. Markup uses
`transform="currency"`. An unknown name raises when the binding is
established. See [transform](markup.md#transform) for the element bindings
that apply a transformer.

## Null Placeholders

A null placeholder is the value assigned to the receiver when the key path
has no value. It allows a binding through an optional object to supply a
non-nil value, such as the empty array used for `menu_recipes` above.

Ruby bindings specify this value with `null_placeholder:`. The default is
`nil`. The same placeholder object is reused each time the path has no value;
treat it as immutable.

When a binding applies a transformer, the transformer receives `nil` and
formats it instead of using the placeholder. Markup bindings have defaults
suited to their elements: text fields display an empty string, for example.
See [bind](markup.md#bind) for those defaults.

## Observers

An observer responds to a property change with application code. A binding
assigns the changed value to its receiver; an observer can instead reload a
result or perform another operation.

TODO: It's possible that allowing observers on a chain with an undeclared
property is good, but it also sounds like it could be confusing/bad.

`Observable#observe` observes a property on the calling object or on another
object. These observations reload a result when the query or selection
changes:

```ruby
observe(:query, ->(value) { reload })
observe(document, :selection, ->(value) { reload })
```

The calling object retains the observation until it releases its retained
connections. For a controller, this happens when it unloads. A class can also
define `name_did_change(previous, value)` to respond to changes in one of its
own properties without establishing an observation explicitly.

Assigning an unchanged value does not notify observers. A property's
`name_did_change` hook runs before its observers. Both can read computed
properties that depend on the changed property and receive current values.

## Computed Properties

A computed property derives its value from other properties through the block
in its declaration. Bindings can observe that value just as they observe a
stored property. Changes to observable properties read by the block cause the
computed value to update when it is next needed, including by a binding or an
observer.

Dependencies follow the reads made by the block. A property read only in one
branch affects the computed value only while that branch is in use. The class
does not declare a separate list of dependencies.

Computed properties are read-only unless they declare a writer. A binding to
a read-only computed property must be one-way.

## Bindings in List Rows

A list row's observed object is the item it displays. Key paths resolve on
that item without a controller's binding root. A row displaying a member can
therefore bind to `name` directly.

The list creates new rows when its arranged content changes. It releases the
previous rows' bindings and establishes bindings for the new rows. See
[Collections](collections.md) for row templates, arrangement and selection,
and [collections](collections.md) for a selection
shared between a list and other views.
