# Controls

Controls present buttons, text fields, and choices as views that applications
can bind to properties and connect through outlets.

This guide covers declaring controls in markup, supplying values and options,
handling keyboard input, and extending a control with a template or delegate.

See [Bindings](bindings.md) for value propagation, [Responders](responders.md)
for actions and first responder, and the `Control` class references for method
details.

## Declaring a Control

A `klass` attribute names the control to create when the element awakens. An
`outlet` connects that control to its owner's declared property. A value
control can also carry `bind` to connect its value to a property in the
surrounding region:

```html
<input klass="Swill::Control::TextField" outlet="name_field" bind="name">
```

The framework provides these controls:

| Control | Presentation | Value |
| --- | --- | --- |
| `Control::Button` | A native button | Sends actions through `data-action` |
| `Control::TextField` | An input, or an element containing an input | Text |
| `Control::Select` | A native select element | The selected option's string value |
| `Control::Segmented` | Adjacent buttons | The chosen option's string value |
| `Control::CustomSelect` | A button with a popup list | The chosen option's string value |

The `Control` base class provides template loading and a focus delegate.
Subclasses define the value they present. Button uses actions and has no
`value` property to bind.

## Values and Events

A binding on a value control keeps its `value` property and the bound property
up to date in both directions. Assigning either property updates the control's
presentation. A transformer can convert between the property's type and the
control's text value; see [Value Transformers](bindings.md#value-transformers).

TextField reads input events, and Select reads change events, to update their
values. Segmented and CustomSelect assign their value when an option is
chosen, then dispatch bubbling `input` and `change` events from their root
elements. Choosing the current value produces no change events.

Assigning `value` updates observers and bindings without dispatching DOM input
or change events. An application can observe the property to respond to both
assignments and user edits, or handle a DOM event to respond to an interaction.

## Buttons and Text Fields

A Button uses the native element's click behavior. The following button sends
`save` through the responder chain:

```html
<button type="button" klass="Swill::Control::Button" data-action="save">
  Save
</button>
```

The control adds `tabindex="0"` when the element has no tabindex. It preserves
an existing value, including `-1`. Enter and Space activate the native button;
other keys follow the responder chain.

A TextField can wrap an input together with its surrounding label:

```html
<label klass="Swill::Control::TextField" bind="name">
  Name
  <input type="text">
</label>
```

It uses the wrapped element when that element is an input, otherwise the first
input descendant. Construction reads the input's current value. If it is empty
and a `value` attribute is present, that attribute supplies the initial value.
A binding established afterward supplies the bound value. If no input is
present at construction, the control retains an empty value and installs no
input listener.

## Supplying Choices

A Select takes an array of strings. Each string becomes an option with that
label and value. Options in the original markup remain before the generated
options, so markup can provide a prompt:

```html
<select klass="Swill::Control::Select" outlet="standalone_select">
  <option value="">Choose a name</option>
</select>
```

After the outlet is connected, its owner can assign options and a selection:

```ruby
select = T.must(standalone_select)
select.options = ["Ada", "Grace", "Katherine"]
select.value = "Grace"
```

Replacing the array replaces generated options and reapplies `value`. The
property retains its value even if the new options do not contain a match;
the native select determines the displayed selection. Unloading removes
generated options and releases the control's event listener.

Segmented and CustomSelect take arrays of hashes. Each hash supplies `"value"`
and `"label"`; CustomSelect also displays `"description"` and `"icon"` when
provided. Option values are converted to strings for selection.

The controls example supplies a segmented choice through its outlet:

```ruby
T.must(segmented).options = [
  {"value" => "ada", "label" => "Ada"},
  {"value" => "grace", "label" => "Grace"},
  {"value" => "katherine", "label" => "Katherine"}
]
```

Its markup binds the selected value and supplies an accessible name:

```html
<div klass="Swill::Control::Segmented" outlet="segmented"
     bind="selected_person" aria-label="Person"></div>
```

CustomSelect uses the same option fields and value binding. An icon name adds
an `icon-<name>` CSS class to its icon element; the application's icon styles
provide the image. A nil icon or description hides that element.

Both controls preserve `value` when their options are replaced. An unmatched
value leaves Segmented's buttons unchecked and CustomSelect's button label
empty. The initial options array is empty, and the initial value is `""`.

## Keyboard and Focus

Segmented presents its buttons as a radio group. The chosen button has a tab
stop; when no option matches, the first button has the tab stop. Arrow keys
choose and focus an adjacent option, wrapping at either end. Home and End
choose the first and last options. Enter and Space activate the focused native
button.

Setting Segmented's `disabled` property to true disables its buttons, removes
their tab stops, and prevents choices through clicks or keys. The default is
false. Set this property on the control through its outlet; `bind-disabled`
assigns a DOM property on the element.

CustomSelect starts with its popup closed. Enter and Space toggle it. While
open, Up and Down choose the adjacent option, wrapping at either end, and the
choice closes the popup. With no matching value, either arrow chooses the
first option. Clicking an option also chooses it and closes the popup. Escape,
focus leaving the control, and a pointer press outside the control close it.

A control's `delegate` can decide whether it may resign first responder. The
delegate implements `control_should_resign_first_responder(control,
next_responder)` and returns false to keep the current first responder. With
no delegate, or no such method, the control follows its superclass behavior.
The default delegate is nil. See [Responders](responders.md) for focus changes
through the application.

## Templates and Lifetime

Segmented and CustomSelect load the framework's `segmented` and `custom_select`
templates during construction. These templates replace the root's contents
and supply the controls' internal outlets. The distribution includes the
templates in the framework bundle and provides their styles in `swill.css`.
Load that stylesheet alongside the application's styles.

A control subclass can call `Control#load_template` with a name from the
installed template catalog. The control owns the resulting outlets, bindings,
and action handlers. Bindings inside the template resolve against the control;
actions begin at the control. Loading another template on the same control
raises `Control template already loaded`. An absent template name raises
`Unknown control template: ...`.

When the control unloads, it releases its retained listeners and the
connections in its owned content. A subclass that installs additional
listeners retains their release callables. See
[Swell](swell.md#listening-for-events) for an example and
[Lifecycle](lifecycle.md#unloading) for unloading behavior.
