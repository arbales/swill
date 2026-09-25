# Responders

A responder is a link in a chain. Actions and key events start at one responder
and walk the chain until something handles them, so a button does not need to
know which object implements the action it sends.

Controllers and the application are responders. Views are too. The application is
the last link.

## The chain

`next_responder` answers the next link, or nil at the end of it.

- A nested controller answers to its parent controller.
- A root controller answers to the application.
- A view answers to the controller rooted at it, or to its superview.

The chain is derived from the view tree rather than stored, so it stays correct
as regions are awakened and torn down.

## Actions

`perform_action(name, sender, event)` sends an action. It asks `action_target`
for the first responder in the chain that implements `name`, and raises if none
does — a misspelled action is a loud failure, not a silent one.

```ruby
def save
  model.save
end
```

Any method taking at most two arguments — the sender and the event — can be an
action. There is no separate registration: being implemented is what makes a
responder a candidate.

In markup, `data-action="save"` connects an element to the chain. See the
[markup reference](markup.md#data-action) for the attribute's syntax.

## Key events

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

## First responder

The application holds the first responder, and is itself the first responder when
nothing more specific is. `Application#make_first_responder` is the only way to
set it deliberately.

A change can be refused from either side:

- A responder answering false to `accepts_first_responder?` is refused up front;
  `make_first_responder` returns false and nothing changes.
- The current first responder may refuse to give it up by returning false from
  `resign_first_responder`.
- A responder that refuses to *become* first responder leaves the application
  holding it.

A controller accepts the first responder only when its region contains a
focusable element. Becoming first responder focuses the first one; resigning
blurs it.

## Focus

Browser focus and the first responder are kept in agreement. Focus moving within
the application reassigns the first responder without re-running
`become_first_responder`. The current first responder is still asked to resign,
and one that refuses gets focus back. Focus leaving the application's root
returns the first responder to the application; focus moving into the browser's
own chrome, or into dead space in the page, leaves it alone.

Loading window content hands the first responder to the new controller unless
that content already claimed it — a field focused in `controller_did_load`
stands. A presented window remembers the first responder it displaced and
restores it on dismissal, if that responder is still in the document.
