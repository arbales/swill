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
controller takes that key for its region, and calling `super` declines it.
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

## First Responder

The application holds the first responder, and is itself the first responder
when nothing more specific is. `Application#make_first_responder` sets it.

A change can be refused from either side:

- A responder returning false from `accepts_first_responder?` is refused up
  front; `make_first_responder` returns false and nothing changes.
- The current first responder may refuse to give it up by returning false from
  `resign_first_responder`.
- A responder that refuses to become first responder leaves the application
  holding it.

A controller accepts the first responder only when its element contains a
focusable one — an `input`, `select`, `textarea`, `button` or `[tabindex]`,
nested controllers' regions included. Becoming first responder focuses the first
of them; resigning blurs it.

## Focus

Browser focus and the first responder are kept in agreement. Focus moving within
the application reassigns the first responder without re-running
`become_first_responder`. A responder whose `accepts_first_responder?` is false
is refused, as `make_first_responder` refuses it: focus goes back to the current
first responder, or is let go when the application holds it. The current first
responder is still asked to resign, and one that refuses gets focus back. Focus leaving the application's root
returns the first responder to the application; focus moving into the browser's
own chrome, or into dead space in the page, leaves it alone.

Loading window content offers the first responder to the new controller unless
that content already claimed it — a field focused in `controller_did_load`
stands. A controller with nothing focusable refuses, and the first responder
stays where it was. Content with no controller restores the previous responder
if it is still inside the application's root.

A presented window remembers the first responder it displaced and offers it back
on dismissal, if that responder is still inside the application's root. The
application itself, having no element, is not restored this way.
