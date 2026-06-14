# Opal And API Discussion

Edited excerpts from the recent design conversation. These are not a final specification.

## Starting The Opal Version

**User**

> I'd like to try a rebuild of Swill using Opal, with an eye towards creating more alignment between the servers (running Roda/Sequel) and the clients running Swill. Let's consider how we'd add an Opal version in `./opal`.

**Assistant**

The proposed first slice was:

1. `Responder`
2. `View`
3. `Controller`
4. awakening
5. actions
6. simple bindings
7. `Application.start`

Models, windows, restoration, editable lists, and other large surfaces should wait. Use Opal's native browser interop behind a small Swill-owned adapter. Share plain Ruby contracts with the server, but do not run Sequel persistence in the browser.

## Class Lookup

**User**

> We wouldn't need a registry, would we? Ruby has a global class registry.

**Assistant**

Correct. Resolve `controller="BreweriesController"` through Ruby constants:

```ruby
klass = Object.const_get(element.get_attribute("controller"))
controller = klass.new
```

Resolve namespaces such as `Admin::BreweriesController` segment by segment. A separate registry would only become useful for aliases, lazy loading, or restricting which constants markup may instantiate.

## AppKit And Sequel Flavor

**User**

> What kind of API/flavor changes might we make if we were to be inspired by Ruby/Sequel? `application_did_finish_launching` for example?

**Assistant**

The first thought was to use Sequel-shaped hooks such as `before_launch` and `after_launch`, plus Ruby declarations:

```ruby
class MailingListController < Swill::Controller
  property :name
  property :members, default: -> { [] }

  outlet :search_field
  action :save
end
```

Sequel traits worth borrowing include plugins, inherited class configuration, lazy datasets, explicit persistence methods, symbol-heavy declarations, and ordinary methods as the primary extension mechanism.

**User**

> We do want to keep app-kit metaphors for this environment, but we want to use ruby/sequel concepts and sugar.

**Assistant**

Keep `Application`, controllers, views, responder chain, target/action, windows, first responder, and AppKit lifecycle concepts. Ruby and Sequel should remove ceremony rather than replace that model.

**User**

> `application_did_finish_launching` could become `finished_launching` `after_launching` -- keeping the hooks structure of Sequel but the naming from Cocoa?

**Assistant**

Yes. The suggested family became:

```ruby
before_launch
after_launch

before_appear
after_appear

before_close
after_close
```

The exact spelling is unresolved. `after_launch` follows Sequel's event-name convention; `after_launching` retains more Cocoa phrasing. The important decision is Sequel's hook structure with Cocoa lifecycle concepts.
