# Swill, Again

This directory contains the active Opal version of Swill. It is an early alpha:
the framework kernel and first Ruby-native model layer work, build, and have
automated coverage. Model relationships and typed command dispatch are not
implemented yet. It is not a gem and does not need to become one.

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
  application lifecycle;
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
- ISO-8601 dates on MRI and Opal;
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
- `Swill::Controller::SortableList` header actions, observable sort state,
  Ruby-native comparisons, and selection preservation across reordering;
- `Swill::Controller::Editor` represented-object binding roots with
  responder-driven commit and discard hooks;
- `klass`-awakened view components plus `Swill::Control`, observable
  `Swill::Control::TextField`, native `Swill::Control::Select`, and stylable
  `Swill::Control::CustomSelect` wrappers;
- object-to-object bindings over observable nested key paths; and
- `Swill::Sig`, a small typed signature and coercion layer for the future
  command boundary.

The static example exercises bindings, derived properties, nested controllers,
binding roots, actions, outlets, focus, dialogs, replaceable window content,
detached model drafts, native and custom select controls, a template-backed
selectable list, and a backend-backed Open Brewery DB dataset search.

## Project Status

The framework kernel is coherent enough to build applications against, but the
Opal port is not at feature parity with the TypeScript framework. The main
missing pieces are:

- a typed command dispatcher connecting `Swill::Sig` declarations to server
  operations;
- model relationships and relationship hydration;
- URL/window restoration;
- inline and editable collection controllers; and
- broader real-browser coverage, especially for dynamic DOM observation,
  native dialogs, and focus transitions.

`Swill::Sig` defines and validates the proposed command surface, but it does not
send or dispatch commands yet. Datasets and instance persistence use the wire
adapter directly; models do not yet hydrate relationships.

## Server Alignment

Roda and the browser may share plain Ruby definitions for names, validations, serialization, and route conventions. Sequel datasets, persistence, transactions, and authorization stay on the server. Sharing language is useful; pretending the browser has a database is not.
