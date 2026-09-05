# Swill, Again

This directory contains the active Opal version of Swill. It is an early alpha:
the framework kernel and Ruby-native model layer work, build, and have
automated coverage. It is not a gem and does not need to become one.

The TypeScript implementation remains at the repository root. Documentation in
the root `docs/` directory describes that implementation unless it explicitly
says otherwise.

## Build

```sh
cd opal
bundle install
bundle exec rake
```

The directory has a `.ruby-version`; with rbenv active, these commands select
the project's Ruby and Bundler versions.

This writes:

- `dist/swill.js`: the framework and Opal runtime.
- `examples/static/dist/app.js`: only the example application.
- `examples/giraffic/dist/app.js`: the backend-backed Giraffic example.

Open `examples/static/index.html` through the repository development server.

The root development server also serves the Opal Giraffic example and reuses
the same backend proxy as the TypeScript version:

```sh
# Defaults to an upstream at http://localhost:5001
PORT=3000 ./dev.sh

# Or point at another backend, optionally with bearer authentication
GIRAFFIC_API_BASE=https://example.test TOKEN=secret PORT=3000 ./dev.sh
```

Then open `http://localhost:3000/opal/examples/giraffic/index.html`. The Opal
application sets `Swill::Wire.base_url = "/giraffic-api"`; model datasets keep
their backend-relative paths such as `/api/lists`.

## Check

```sh
cd opal
bundle exec rake test
bundle exec rake build
```

`rake test` runs the DOM-free specs under MRI, then compiles Swill with Opal and
runs the integration harness under Node. The integration harness uses a small
DOM shim; important UI changes should also be exercised in a real browser.

## Source Layout

`lib/swill.rb` loads six subsystem entrypoints. Implementation and specs mirror
the same boundaries:

- `core`: DOM-free observation, key paths, responder behavior, signatures, and
  Ruby extensions;
- `view`: DOM views, focus, bindings, actions, outlets, awakening, and the
  application lifecycle. Presented windows and URL-fragment state are objects
  (`Swill::Window`, `Swill::FragmentRouter`) rather than the TypeScript side's
  entry records inside `application.ts` — intended structural divergence; the
  per-window first-responder TODO lands on `Window` when it arrives;
- `controller`: the base controller plus list, sortable-list, and editor
  specializations;
- `control`: the base control plus text and select components;
- `model`: the standard base composition, optional concerns, identity, codecs,
  datasets, and persistence; and
- `transport`: the browser wire boundary.

Applications normally use `require "swill"`. The subsystem entrypoints are
available for MRI specs and focused tooling.

## Shape

Markup names ordinary Ruby constants:

```html
<main controller="HelloController">
```

`Swill::Awakening` resolves that with `Object.const_get`; there is no class registry. Controllers own their markup subtree, `data-action` walks the responder chain, and `bind` connects elements to observable controller properties.

Bindings use Ruby reader chains for derived display values. Form controls are
two-way only when their path resolves to a writer; derived form values must be
declared `readonly`, otherwise wiring raises `Swill::BindingError`:

```html
<input bind="user.email">
<input readonly bind="user.email.strip.upcase">
<output bind="user.email.blank?"></output>
```

```ruby
class HelloController < Swill::Controller
  property :message, default: "Hello."
end
```

Client-only models use ordinary Ruby declarations and default to plain JSON:

```ruby
class Member < Swill::Model::Base
  attribute :name, key: :display_name, default: "Anonymous"
  attr :email

  def validate_email(value, _previous)
    value.to_s.strip.downcase
  end
end

member = Member.parse_one("id" => "42", "display_name" => "Ada")
member.name = "Grace"
member.dirty? # => true
member.serialize(dirty_only: true) # => { display_name: "Grace" }
```

Select JSON:API with `codec Swill::Model::JSONAPI` and declare its resource type
with `json_api_type "members"`. Object bindings use
`bind :target, to: source, key_path: "address.city"`; standalone models must
unbind explicitly, while controllers release bindings during teardown.

Relationships name their Ruby class directly; `json_api_type` remains only the
wire label used by the JSON:API codec:

```ruby
has_many :members,
  type: -> { Member },
  url: ->(list) { "/api/lists/#{list.id}/members" }
```

Named window controllers can preserve keyed state in the URL without knowing
that the active coder uses the browser fragment:

```ruby
restorable_state :query, key: :q
restorable_state "people.selected_object_id", key: :selected

def restore_state(coder)
  super
  reload
end
```

The base class is only the standard composition. Generated or shared classes
can select the model behavior they need:

```ruby
class ClientRecord
  include Swill::Observable
  include Swill::Model::Attributes
  include Swill::Model::DirtyTracking
  include Swill::Model::Identity

  attribute :name
end
```

## Current Surface

The Opal implementation currently includes:

- observable properties and automatically tracked derived properties;
- nested key paths, controller binding roots, two-way value bindings, and
  property bindings;
- controller awakening, nesting, ownership, lifecycle hooks, and teardown;
- responder-chain actions, keyboard routing, and first-responder focus;
- element, controller, template, and JSON-payload outlets;
- template-backed dialogs and named window containers with replaceable content;
- Cocoa-style keyed controller restoration, typed restoration codecs, and
  Back/Forward-aware named window content;
- inherited Ruby-native HTML attribute declarations and a Cocoa-shaped
  `Swill::NotificationCenter`;
- ISO-8601 dates on MRI and Opal (an opt-in on the client: require
  `corelib/time` before `swill`, then `swill/core/iso8601` — the default
  bundle ships without Opal's date/time/bigdecimal stdlib);
- observable models with inherited declarations, validation hooks, dirty
  tracking, identity stores, and plain JSON and JSON:API codecs;
- independently composable `Swill::Model::Attributes`, `DirtyTracking`, and
  `Identity` concerns, assembled by `Swill::Model::Base`;
- detached editing through the independently composable `Swill::Model::Drafts`
  concern, included by `Swill::Model::Base` by default;
- observable read datasets with injectable wire adapters and browser `fetch`;
- composable model persistence with create, update, reload, delete, validation,
  dirty serialization, and canonical identity refresh;
- template-backed `Swill::Controller::List` collection controllers with direct
  row binding,
  owned row views, row actions, observable selection, multiple-selection
  ranges, keyboard/double-click activation, and deterministic teardown;
- identity-based list selection: the selected objects are the stored
  primitive, indexes and the leading id derive from them, and selection
  survives reordering and data refreshes. (Intended divergence from the
  TypeScript `List`, which stores indexes and clears selection when
  `representedObject` changes; a TS backport is the eventual reconciliation.)
- `Swill::Controller::SortableList` header actions, observable sort state,
  Ruby-native comparisons, and selection preservation across reordering;
- `Swill::Controller::Editor` represented-object binding roots with
  responder-driven commit and discard hooks;
- `Swill::Controller::InlineEditor` and `EditableList` with detached drafts,
  validation refusal, canonical application, and optional persistence policy;
- `klass`-awakened view components plus `Swill::Control`, observable
  `Swill::Control::TextField`, native `Swill::Control::Select`, and stylable
  `Swill::Control::CustomSelect` wrappers;
- object-to-object bindings over observable nested key paths; and
- explicit-class `has_one` and `has_many` relationships with lazy loading,
  loading state, reload methods, and JSON:API included hydration;
- `Swill::Sig` plus `Swill::CommandDispatcher`, which validates a trusted
  signature manifest before issuing promise-returning wire commands.

The static example exercises bindings, derived properties, nested controllers,
binding roots, actions, outlets, focus, dialogs, replaceable window content,
detached model drafts, native and custom select controls, an inline-editable
sortable table, URL-restored window content, notifications, and a
backend-backed Open Brewery DB dataset search. The Giraffic example now
exercises restored list selection, detached detail editing, persistence, and a
lazy-loaded member relationship against the shared TypeScript backend.

The TypeScript and Opal Giraffic markup intentionally uses each language's
native naming: registered PascalCase classes, camelCase actions and outlets,
and transformed bindings in TypeScript; Ruby constants, snake-case methods,
and reader chains in Opal. The Opal screen composes the framework's generic
`List` and `Editor` controllers with explicit object bindings, while TypeScript
keeps small application-specific subclasses and declarative root bindings. Opal currently
also exposes dataset reload/status and detached mailing-list reset controls;
TypeScript alone exposes the diagnostic Object Browser. The remaining fields,
member management, profile drafts, persistence, restoration, and navigation
exercise equivalent framework features.

## Project Status

The major TypeScript framework surfaces now have Ruby-native counterparts. The
remaining work is depth rather than a missing foundation: broaden real-browser
automation for dynamic DOM observation, native dialogs, focus transitions,
history traversal, and editable rows; expand the Giraffic screens; and connect
the generic command dispatcher to a concrete server command endpoint and
manifest delivery flow.

## Server Alignment

Roda and the browser may share plain Ruby definitions for names, validations, serialization, and route conventions. Sequel datasets, persistence, transactions, and authorization stay on the server. Sharing language is useful; pretending the browser has a database is not.
