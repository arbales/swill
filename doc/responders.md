# Responders

A responder is a link in a chain. Actions and key events start at one responder
and walk the chain until something handles them, so a button does not need to
know which object implements the action it sends.

Controllers and the application are responders. Views are too, and a view always
accepts first responder. The application is the last link.

## The Chain

`next_responder` returns the next link, or nil at the end of it.

- A nested controller's next responder is its parent controller.
- A root controller's next responder is the application.
- A view's next responder is the controller rooted at it, or its superview.

## Actions

`perform_action(name, sender, event)` sends an action. It asks `action_target`
for the first responder in the chain that implements `name`, and raises if none
does, so a misspelled action raises at the call rather than being ignored.

```ruby
def save
  model.save
end
```

Any method taking at most two arguments — the sender and the event — can be an
action. A responder that implements the method is a candidate.

In markup, `data-action="save"` installs an action handler on an element that
sends into the chain. See the [markup reference](markup.md#data-action) for the
attribute's syntax.

## Key Events

Key events enter at the first responder. `key_down` translates a key into a
command and calls it, as Cocoa's `interpretKeyEvents:` does:

| Key | Command |
| --- | --- |
| Escape | `cancel_operation` |
| Enter | `insert_newline` |
| Tab | `insert_tab` |
| Shift-Tab | `insert_backtab` |
| Up, Down, Left, Right | `move_up`, `move_down`, `move_left`, `move_right` |
| Home, End | `move_to_beginning_of_document`, `move_to_end_of_document` |

Each command passes to the next responder by default, so implementing one in a
controller takes that key for its region, and calling `super` declines it. A
command something takes is the key's whole effect: the framework prevents the
browser's own handling, so a method that takes Down need not call
`preventDefault`. A command that reaches the end of the chain untaken leaves
the key to the browser.
Commands start at the first responder, so a control can take one before its
controller does.

The focused element keeps the keys it handles itself, as Cocoa's field editor
does, and those go nowhere:

| Element | Keeps |
| --- | --- |
| A single-line text input | Everything but Up, Down, Enter, Escape and Tab |
| A number or date input | Everything but Enter, Escape and Tab |
| `textarea` and `contenteditable` | Everything but Escape and Tab |
| `select` | Everything but Enter, Escape and Tab |
| `button`, and button inputs | Enter and Space |
| Checkbox and radio inputs | Space, and a radio's arrows |

A key typed during an input method composition stays with the input method. A
key held with Control, Command or Option is never a command: it passes up the
chain as a `key_down`, where an application shortcut can find it. So does any
other key no command names. Overriding `key_down` sees the raw key before any of
this; call `super` for keys it leaves alone. `key_up` passes straight along.

## Windows and the First Responder

The page and each window presented over it hold a first responder of their own,
as an NSWindow does. The application tracks the **key window**, the one with the
keyboard: the most recently presented window still open, or the window focus
last moved into. `Application#main_window` is the page; `key_window` is the key
window; `first_responder` is the key window's first responder, or the
application itself when nothing more specific holds it. Keys go to it.

Presenting a window with `show_window` or `present_window` makes it key and
leaves the page's first responder as it was. Dismissing it makes the window
before it key again, and that window's first responder takes the keyboard back,
at the element within it that last had focus. Nothing is saved or restored;
each window simply keeps its own. Window content containers (`[window]`
elements) are part of the page, not windows of their own.

`Application#make_first_responder` sets the first responder of the window the
responder belongs to. A change can be refused from either side:

- A responder returning false from `accepts_first_responder?` is refused up
  front; `make_first_responder` returns false and nothing changes.
- The window's current first responder may refuse to give it up by returning
  false from `resign_first_responder`.
- A responder that refuses to become first responder leaves the window with
  none, and the application holds the keyboard.

Making a responder first in a window that is not key keeps it for when that
window is, without making the window key.

The first responder changes in four places only: `make_first_responder`; the
browser moving focus within the page; focus leaving the page's root for
another part of the document; and the responder's region being torn down.

## Focus

Each responder has a **key element**, the element its focus goes to: a view's
element when it is focusable, otherwise its first focusable descendant — an
`input`, `select`, `textarea`, `button` or `[tabindex]`; a controller's is its
view's, nested controllers' regions included. A controller with no key element
refuses first responder. Becoming first responder focuses the key element
without scrolling; resigning blurs the focused element when it lies within the
responder, unless focus has already moved into the responder that follows.

Browser focus and the first responder are kept in agreement. Focus is followed
in the capture phase, so content that stops a focus event cannot hide it. Focus
moving within the page reassigns the first responder of the window it moved
into, without re-running `become_first_responder`, and makes that window key.
A responder whose `accepts_first_responder?` is false is refused, as
`make_first_responder` refuses it: focus goes back to the current first
responder, or is let go when the application holds it. The current first
responder is still asked to resign, and one that refuses gets focus back. Focus
leaving the application's root returns the first responder to the application;
focus moving into the browser's own chrome, or into dead space in the page,
leaves it alone.

Loading window content offers the first responder to the new controller unless
that content already claimed it — a field focused in `controller_did_load`
stands. A controller with nothing focusable refuses, and the first responder
stays where it was. Content with no controller restores the previous responder
if it is still inside the application's root.

## The Key View Loop

A window's **key views** are the elements Tab stops at: its focusable
elements in document order, skipping disabled ones, ones taken out of the order
with `tabindex="-1"`, hidden or inert ones, and ones inside other windows. Tab
and Shift-Tab, as `insert_tab` and `insert_backtab`, climb to the application,
which moves to the next or previous key view of the key window and wraps at
either end, as an NSWindow's key view loop does. The browser's own Tab is
prevented, so focus never leaves the window for the page behind it, the dialog
element itself, or the browser's chrome. A responder that implements
`insert_tab` without calling `super` keeps Tab for itself.

As a window opens, the keyboard goes to its **initial first responder**: an
element marked `autofocus`, else its default button, else its first key view.
Content that took the keyboard while loading keeps it. A dialog that takes focus
itself, from a click on its background, hands it back to the control it came
from. The window lays out before anything in it is focused, since Safari
ignores focus in a dialog it has not laid out.

The **default button** is a window's button with the `default` class. Enter
that no responder takes presses it, from anywhere in the window. `Swill::Alert`
makes its first button the default.

## Key Views and Tab Stops

Markup does not carry `tabindex`. As Cocoa's controls answer
`canBecomeKeyView`, a control that takes the keyboard declares its own tab stop
as it awakens, with `View#ensure_focusable`, which writes `tabindex="0"` unless
the element already has one: `Control::Button`, a list's root, a custom select's
root. Safari's Tab skips a plain `<button>` unless it has an explicit tab stop,
so this is what puts controls in the loop there. `Control::Segmented` keeps one
stop among its segments, on the chosen one. The application never writes
`tabindex`.

## Development Checks

In development (see [Getting Started](getting_started.md#development)) the
application checks, after each change of first responder and window and before
each key, that the keyboard is where the first responder says: focus inside the
page must be in the key window and within its first responder, which must still
be in the page and accept. A mismatch is reported as a warning, which the
development problem reporter shows as an alert. These checks are written in an
`in_development` block, which an optimized build leaves out; see
[the compiler](compiler.md#development-blocks).
