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

Key events enter at the first responder and walk the same chain. `key_down`
routes three keys to named hooks before falling through:

| Key | Hook |
| --- | --- |
| Escape | `cancel_operation` |
| Enter | `insert_newline` |
| Tab | `complete` |

Each hook passes to the next responder by default, so overriding one in a
controller intercepts that key for its region and leaves the rest alone.
`key_up` passes straight along.

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
`become_first_responder`. The current first responder is still asked to resign,
and one that refuses gets focus back. Focus leaving the application's root
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
