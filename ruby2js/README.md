# Swill for Ruby2JS

This directory contains the Ruby2JS implementation of Swill. It supports a
deliberate Ruby subset rather than general Ruby execution.

The build produces two browser scripts:

- `swill.js` contains the runtime, framework definitions, and the plain
  JavaScript authoring API. It can be used by itself with no build step.
- `app.js` contains application definitions and reuses the installed framework.

Shared model fixtures produce the same results on MRI and JavaScript, including
after bundling and minification.

## Requirements and commands

Use Ruby 3.3+, Bundler, Node 22+, and `esbuild`. No npm install is required.
Ruby2JS selects its Prism walker on Ruby 3.4+ and the parser gem otherwise;
the compiler supports both, and the suite passes with identical bundles under
either. `RUBY2JS_PARSER=parser` or `RUBY2JS_PARSER=prism` forces one.

```sh
cd ruby2js
BUNDLE_PATH=vendor/bundle bundle install
BUNDLE_PATH=vendor/bundle bundle exec rake
```

The default task builds, type-checks, tests on MRI and Node, minifies, and reports
artifact sizes. Individual tasks are `build`, `typecheck`, `test`, and `optimize`.
`benchmark` reports non-gating runtime and warm compiler medians.

`build/` is disposable. `dist/` contains checked-in browser output. Regenerate it
with `rake build`; do not edit generated files.

## Plain JavaScript, without a build step

Load `swill.js`, register ordinary JavaScript classes, then start the
application explicitly. Put these scripts at the end of `body` so the default
root, `document.body`, is ready.

```html
<main controller="Hello">
  <h1 bind="greeting"></h1>
  <input bind="name">
  <button data-action="clearName">Clear</button>
  <p outlet="status"></p>
</main>
<script src="swill.js"></script>
<script>
  class Hello extends Swill.Controller {
    static properties = {
      name: {default: "Ada"},
      items: {default: () => []}
    };

    static outlets = {
      status: {},
      optionalPanel: {optional: true}
    };

    static actions = ["clearName"];

    get greeting() {
      return `Hello ${this.name}`;
    }

    awakeFromDOM() {
      this.status.element().textContent = "Ready";
    }

    clearName() {
      this.name = "";
    }
  }

  Swill.register(Hello);
  const application = Swill.start();
</script>
```

Every native getter on a registered class is an observable computed property.
Dependencies are collected while the getter runs. Scalar properties may use a
literal default; arrays and objects use a zero-argument factory so instances do
not share mutable state. Actions are explicit and accept zero, one, or two
arguments; the framework supplies the sender and DOM event when requested.
Outlets are required unless their descriptor has `optional: true`.

Controller subclasses may override `bindingRoot`, `decodeOutletData`,
`viewDidLoad`, `awakeFromDOM`, `controllerDidRestore`, `controllerDidLoad`,
`viewWillAppear`, `viewDidAppear`, `viewWillDisappear`, and
`viewDidDisappear`. Outlets are connected after `viewDidLoad` and before
`awakeFromDOM`. Application subclasses may override `applicationDidLaunch`
and `applicationWillTerminate`. `Swill.List` subclasses may override
`makeRowElement`, `configureRow`, `rowsAreViews`, `isRowElement`,
`selectedObjectDidChange`, and `activateSelection`.

Known gap: property change hooks are not yet available to JavaScript
classes. The runtime dispatches `name_did_change` from a class's installed
method table, and `Swill.register` fills that table only from `static
actions`, so a `nameDidChange` method on a registered class is never called.
Observe the property instead: `this.observe("name", (value, previous) => ...)`
in `viewDidLoad`, or `this.observeWithObject(other, "name", ...)` for another
object's; both are released at `unload`. Closing the gap means registering hook methods in the
table; their names already match, since compiled members are camelCase.

`Swill.register("Admin::Editor", Editor)` supplies a markup name explicitly.
Register a JavaScript parent before its subclasses. For another root or a
custom registered application class, use
`Swill.start({root: element, application: MyApplication})`. One application
runs per page, as one `NSApp` runs per process: `start` returns it,
`Swill.Application.shared()` is it from anywhere, `Swill.Application.isRunning()`
says whether one is up, and a second `start` while it runs is an error.

JavaScript methods use JavaScript semantics. Markup bindings retain Swill's one
shared value rule: only `false`, `null`, and `undefined` are false for checkboxes
and boolean `bind-*` properties.

See `examples/javascript.html` for a complete page.

### Browser checks

```sh
# macOS default Chrome path
BUNDLE_PATH=vendor/bundle bundle exec rake browser

# Explicit browser
CHROME_BIN=/path/to/chrome BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

The check uses Chrome's DevTools protocol with a temporary profile. It exercises
both compiled Ruby and plain JavaScript applications, including class lookup,
manual startup, input events, computed rendering, nested controller ownership,
actions through the responder chain, and listener release.

For manual inspection:

```sh
BUNDLE_PATH=vendor/bundle bundle exec rake build
python3 -m http.server 3000 --bind 127.0.0.1
```

Open `http://127.0.0.1:3000/examples/javascript.html` for the no-build
JavaScript example. `examples/index.html` demonstrates compiled Ruby: it
declares its application and loads the two scripts.

```html
<body application="Demo::Application">
  <main controller="Demo::Controller">...</main>
  <script src="../dist/swill.js"></script>
  <script src="../dist/app.js"></script>
</body>
```

Load `swill.js` before `app.js`. The framework launches the named application
on `DOMContentLoaded` and terminates it on a real `pagehide`.

### Dependency updates

Ruby2JS tracks a lockfile-pinned upstream commit because the latest published gem
does not include the Pragma filter.

```sh
BUNDLE_PATH=vendor/bundle bundle update
BUNDLE_PATH=vendor/bundle bundle exec rake
BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

Commit `Gemfile.lock` after verification.

## Layout

| Path | Responsibility |
| --- | --- |
| `lib/swill/` | Ruby-authored framework code: `core/` for the kernel and `controller/` for higher-level controllers such as `List` |
| `lib/swill/runtime.mjs`, `lib/swill/runtime/` | The runtime surface and its modules: metadata, properties, values, paths, installation, attributes |
| `lib/swill/browser_api.mjs` | Plain JavaScript declarations, friendly class aliases, and manual startup |
| `lib/swill-ruby2js/` | Compiler: knowledge collection, filters, emission, and Sorbet artifacts |
| `spec/mri_host.rb` | The MRI host: declarations and the model subset, for the shared examples |
| `spec/` | Compiler, MRI, runtime, bundle, and browser checks |
| `examples/` | Browser example and application source |
| `sorbet/rbi/runtime.rbi` | Types for runtime and DSL boundaries |
| `docs/compiler.md` | Compiler, lowering rules, runtime API, and rejected forms |
| `build/` | Disposable intermediate modules and test files |
| `dist/` | Browser scripts and source maps |

## Architecture

The compiler collects static facts from Ruby source without executing class
bodies, then emits readable JavaScript classes, mixin factories, and one
`meta` object per bundle. A small handwritten runtime installs that metadata,
implements the property protocol, and provides the only dynamic dispatch. The
framework and application compile into separate bundles that share one
runtime; only `Swill` is global. `Swill.register` translates JavaScript static
declarations and native getters into the same metadata rather than maintaining
a second framework implementation. Generated identifiers remain on `Swill` so
compiled application bundles can import them, but they are private browser API.

[`docs/compiler.md`](docs/compiler.md) is the reference for the pipeline, the
accepted Ruby subset, every lowering rule, the runtime API, and the rejected
forms. Update it whenever the supported boundary changes.

### DOM boundaries

`Swill::View`, `Swill::Controller`, `Swill::Ownership`, `Swill::Bindings`,
`Swill::Actions`, `Swill::Awakening`, and `Swill::Controller::List` are
Ruby-authored framework classes compiled from Ruby that names DOM types. DOM traversal, control rendering,
event selection, action parsing, and listener ownership stay in those classes.
The handwritten runtime only resolves metadata-aware key paths and dispatches
generated method names.

Ownership follows a sparse view tree. An element becomes a `View` only when it
carries `klass`, `controller`, or `outlet`; elements with only `bind` or
`data-action` stay raw DOM, and templates and JSON scripts are inert content.
`klass` names a `View` subclass and may share an element with `controller`. A
controller's `parent` and `child_controllers` are derived from that tree.

Controllers declare `outlet :name, type: ...` and markup names the element with
`outlet="name"`. Outlets connect between `view_did_load` and bindings, only from
the controller's owned region including child-controller roots. The value is
the child controller, the element's view, an inert `<template>`, or JSON from a
`<script type="application/json">` passed through `decode_outlet_data`. The
declared type names the value, `T::Hash[String, String]` for a JSON object or
`Swill::View` for an input, and a typed outlet's value is checked against it
at awakening. Undeclared, duplicate, unresolved required, and mistyped outlets
raise; `optional: true` outlets may be absent. Binding and action
scans stop at nested `[controller]` boundaries, so each element is wired by its
direct owner only. Awakening runs `view_did_load`, wiring, and `awake_from_dom`
for each controller children first, then `controller_did_load`, then the
appearance hooks. `unload` runs `view_will_disappear`, the controller's
bindings, everything it retained, its own observation state, its descendants,
and `view_did_disappear`, exactly once.

`Swill::Application` is the top of the responder chain for one launched region.
It records itself on its root element, so a root controller finds it by walking
up from its own element; `application_did_launch` and
`application_will_terminate` bracket its life. Actions resolve through the
responder chain: a controller handles an action when it has a matching
generated method, otherwise its parent tries, then the application, and an
action nobody handles raises. Actions default to `click`; `event:action`
selects another DOM event.

Bindings are Ruby key paths. `bind="path"` is two-way for form controls and
one-way for text; `bind-prop="path"` writes the DOM property named by the
HTML attribute one way, so `bind-disabled`, `bind-hidden`, and `bind-readonly`
set the matching properties with Ruby truthiness, and `bind-data-*` names go
through attributes because they are not properties. Paths resolve under the
controller's `binding_root`, a Symbol naming a property or nil for the
controller itself, and a leading `@` binds against the controller regardless
of the root. Reader chains may end in `strip`, `upcase`,
`downcase`, `blank?`, `present?`, `empty?`, or `nil?`; the first three
predicates answer for a nil intermediate, and any other reader on nil yields
nil. A segment that reaches a Hash reads its key, nil when absent, as
key-value coding does for a dictionary, and a writable control sets an
existing key; hash entries are not observable, so replace the hash to notify.
A write through a missing owner is dropped; a read-only leaf on a writable
control fails at wiring.

A `bind` on a child controller's root belongs to the parent and assigns the
child's `represented_object`, nil included; it is wired when the parent loads,
so a fragment awakened later must be present under its parent before the
parent awakens or be bound by the parent explicitly. `bind-*` on that root
belongs to the child. `bind(:target, to: source, key_path: "a.b")` keeps a declared
property equal to a path on another object until `unbind`, `unbind_all`, or
`unload`; `null_placeholder:` is what the target receives when the path has no
value, so a path through a nilable object can feed a property that is not one.
`observe(name, callback)` observes the receiver's own property and
`observe(object, name, callback)` another object's; either way the receiver is
the observer, so either way it retains the observation and lets it go at
`unload`. For one of its own properties a `name_did_change` hook needs no
observation at all. `retain(disposer)` claims any other disposer the same way,
as Cocoa's retain claims an object, `release(disposer)` gives one up before
then, and `observe_notification` is a retain over
`NotificationCenter.default.add_observer`. An object ends by itself with
`dealloc`, which releases everything it retained and then leaves the
observation graph; `disconnect` leaves the graph without ending, keeping stored
values so computed properties resubscribe on the next read.

The application owns the first responder. `make_first_responder` follows
Cocoa: a responder must accept, the current one may refuse to resign, and a
refusal to become leaves the application holding it. Views accept and focus
their first focusable element; controllers accept when their view has one. A
`focusin` on the root reconciles the first responder after the browser moves
focus, restoring focus when the holder refuses. Focus leaving for the
browser's own chrome or dead space keeps the first responder, as Cocoa does,
so keys still reach it when focus returns; focus moving to another part of
the page outside the application releases it. `keydown` and `keyup` go to the
first responder: Escape, Enter, and Tab become `cancel_operation`,
`insert_newline`, and `complete`, and unhandled keys and those methods continue
up the responder chain to the application. Tearing down a region releases a
first responder inside it.

Windows are template-backed. `<template for="window" name="x">` anywhere, or
`<template name="x">` directly under the application root, is inert content.
A `[window="main"]` container is filled at launch from the template its
`name` attribute selects, or keeps and captures its pre-rendered content.
`load_window_content("main", "x")` tears down the old content, clones and
awakens the new, and hands the first responder to its top controller.
`show_window("x")` clones a template into the root as a window, or into a
chosen element with `show_window_in`, showing a `<dialog>` root, and returns a
`Swill::Window` whose `closed` promise resolves
when `dismiss(controller)` tears it down and restores the saved first
responder. Code-created content awakens through a `MutationObserver` on the
root, and removed content is torn down, so markup and code share one
activation path; `Awakening#detach` does the same explicitly.

Restoration reuses the binding machinery. A window controller declares
`restorable :query, key: :q` or `restorable "people.selected_id",
key: :selected`; the path is a bindable path whose first segment must be a
declared property, and the compiler records the leaf's declared type so
integers and booleans decode from the fragment while everything else stays a
string. The URL fragment holds `main=content` for a container's content and
`main.q=value` for its controller's state. At launch the fragment chooses a
container's content and its values are written through the same path writer
bindings use, then `controller_did_restore(restored)` runs before
`controller_did_load`. Changes to restorable paths replace their fragment
values; `load_window_content` pushes a history entry; Back/Forward reloads
the content the fragment names without writing history. Unknown content and
values of the wrong type are reported and ignored, since the URL is untrusted.

`Swill::Controller::List` is the NSTableView analog. It clones one row per
arranged object from its own `<template for="row">` into its `rows` outlet, or
its root without one, and wires each row's `bind` and `bind-*` attributes
against that object and its `data-action` attributes against the list, so a
row's button reaches the list first and then the responder chain, and
`row_for(sender)` tells a handler which row the sender sits in. Rows are views
owned by the list; a `controller` inside a row awakens under the list, and
`bind="@"` on its root hands it the row's object. The collection is
`represented_object`, usually fed by the parent's `bind` on the list root; a
new collection re-renders, and pre-rendered rows are replaced at awakening.
Selection is by identity: `selected_objects` is stored, `selected_indexes` and
`selected_object` derive from it, and `selected_object_id` follows the leading
object's model id and can be written to select by id now or once the object
arrives, which is what `restorable :selected_object_id` keeps in the fragment.
A click selects, shift-click extends when `allows_multiple_selection` or the
`multiple` attribute is on, arrow keys move the selection of a first-responder
list, and Enter or a double-click sends `activate_selection` up the responder
chain with the list as sender, quietly when nobody handles it.
`selected_object_did_change(previous, object)` runs when the leading object
changes.

`Swill::Controller::SortableList` orders the rows by one column. `sort_key`
and `sort_direction` (`ascending` or `descending`) are stored properties, so
they bind and can be `restorable`; a header cell with `data-column="name"
data-action="sort_by"` toggles that column, and `sort_states` maps the sorted
column to its direction for `bind-aria-sort="sort_states.name"`. Values
compare with nil last, numbers and booleans by value, and everything else as
text, and the selection follows its objects through a reorder.

`Swill::Controller::EditableList` edits rows in place. Enter or a double-click
on a row, or `begin_editing(index)`, clones the list's own
`<template for="editor">`, whose root is a `controller="Swill::Controller::InlineEditor"`,
after the row and gives it the keyboard. The edit works on a copy, a model's
`draft` or a duplicate of a plain object, held as the list's `edited_object`
and the editor's `represented_object`, so the editor's bindings write into
the copy. Enter commits: a model takes the draft back with `apply_draft` and
stays the row's object, a plain object is replaced in the collection; Escape
discards. Focus leaving the editor asks `editor_should_end_editing`, which
discards an unchanged copy and otherwise commits when `confirm_edit?` agrees,
or refuses and keeps focus. `validation_error`, `editing_did_fail_validation`,
and `edited_object_has_changes?` are the other hooks; sorting commits an edit
in progress first, and a new collection discards it.
`Swill::Control` is the NSControl analog: a view over a form element whose
`delegate` may refuse `control_should_resign_first_responder(control, next)`,
so an inline editor holds focus in a control until the edit is accepted; the
editable list makes its editor the delegate of every control inside it.
`Swill::Control::TextField` (`klass="Swill::Control::TextField"` on an input
or an element containing one) keeps a `value` property equal to the input
both ways, and `Swill::Control::Select` keeps `options` and `value` for a
native select, leaving markup options in place as a prefix.
`Swill::Control::CustomSelect` is a stylable select built inside a plain
element: a button showing the chosen option and a listbox of hashes with
`"value"`, `"label"`, and optional `"description"` and `"icon"`. Enter and
Space toggle it, arrows move, Escape and outside pointers close it, and a
choice dispatches `input` and `change` on the element as a native select
would.

A `bind` on an element whose `klass` is a control keeps the control's `value`
property equal to the path both ways, so `<div klass="Swill::Control::CustomSelect"
bind="choice">` edits `choice` and follows it.

`Swill::NotificationCenter.default` is the NSNotificationCenter analog:
`post(name, object, user_info)` and `add_observer(name, callback)`, which
returns the callable that ends the observation, named as Cocoa names it because
observing a notification is not observing a property; a controller's
`observe_notification` retains that callable, so the observation ends at
`unload`. The application posts `first_responder_did_change`
with the new responder as user info. `Swill::Runtime.nameOf(object)` gives an
object's installed class name.

`Swill::Controller::Editor` is the base: `binding_root` is `represented_object`,
with NSEditor's `commit_editing`, which returns whether pending edits could be
pushed into the object, and `discard_editing`, on Enter and Escape. The host
holds the object already, so nothing is returned; an editor that answers
false keeps the edit open.

### Models

`Swill::Model::Base` is the client model: declared attributes with validation
and dirty tracking, one identity pool per class, persistence over the wire,
and relationships. A class names its endpoint and JSON:API type in its body:

```ruby
class Menu < Swill::Model::Base
  endpoint "/api/menus"
  resource_type "menus"
  attribute :name, type: String, default: ""
  attribute :event_date, type: String, default: ""
  has_many :menu_recipes, type: MenuRecipe, key: "menu_recipes", url: "/api/menus/:id/recipes"
end

menus = await Menu.find_all                 # GET /api/menus, pooled by id
menu = await Menu.find(id)                  # the pooled instance, or a fetch
menu.name = "Brunch"                        # dirty; observers of name run
await menu.save                             # PATCH with the dirty attributes
menu.menu_recipes                           # GET /api/menus/:id/recipes once,
                                            # and the binding fills in
await menu.load_menu_recipes                # the same, for code that must wait
await menu.delete
```

Class methods: `find`, `fetch` (always the server's), `find_all`,
`where(params)`, `fetch_all(url, params)`, `dataset(url, params)` (an
observable `records`/`loading`/`error` triple), `get`/`put`/`remove`/`clear`
on the pool, `parse_one`/`parse_many`. Instance methods: `save`, `delete`,
`reload`, `validate` (a message refuses the save), `serialize(dirty_only)`,
`draft`/`apply_draft`, and, per relationship, its key-value loading state as
observable properties (`<name>_loading`, `<name>_loaded`, `<name>_error`) plus
`load_<name>`/`reload_<name>` for code that must wait on what a read would have
started anyway. Concurrent calls share the in-flight request. Explicit loads
reject on failure after updating `<name>_error`; the automatic load started by
a read catches and warns, since no caller is waiting for it. A spinner, an
empty state, and a failure are bindings on those properties.
Persistence is `async`; awaiting it yields the record.

JSON:API is the default codec: a document's `included` resources are pooled
first and `relationships` linkage is resolved from the pool, so a book's
`author` is the same instance as the authors list's. `codec
Swill::Model::PlainJSON` reads `{id, ...attributes}` objects instead. Every
request goes through `Swill::Wire.default` (`base_url`, JSON and form
bodies, a 204 is `nil`, a failed status raises), which calls the page's
`fetch`; tests replace that.

Markup bindings format and parse through value transformers:
`<input bind="servings" transform="number">` shows a number and writes a
number or `nil` back, and `transform="amount"` names one an application
registered with `Swill::ValueTransformer.register("amount", AmountTransformer.new)`.
A `bind-*` path may end in a value reader, `bind-disabled="@query.blank?"`
or `bind-data-need="live_delta.positive?"`; `positive?`, `negative?`, and
`zero?` join `blank?`, `present?`, and `empty?`.

### Sorbet

Declarations carry explicit types, and method signatures feed the compiler's
static lowering as well as Sorbet:

```ruby
attribute :name, type: String, default: ""

property :label, type: String do
  loud ? name.upcase : name
end
```

`extend T::Sig` and `sig` are erased from output. `T.must`, `T.cast`, `T.let`,
`T.assert_type!`, `T.unsafe`, and `T.absurd` compile to runtime checks with
sorbet-runtime's behavior, and the compiler uses their types: `T.must(person)`
on a nilable property lowers to a direct call on the class, and `T.unsafe`
makes the sends on its result dynamic. No other `T` construct is allowed in a
body, and no browser `sorbet-runtime` is bundled. The build generates RBIs for
declared accessors and type-check-only probes for declaration expressions.

### Building an application

The `swill` command compiles an application against the framework and
bundles it into one script that reads the framework from the page:

```sh
exe/swill build frontend            # frontend/app.rb, output frontend/dist/app.js
exe/swill build frontend/app.rb --out public/assets/app.js --with-framework
exe/swill watch frontend            # rebuild as the sources change
```

The entry file's `require_relative` lines name the sources in order, as they
would on MRI; the compiler treats those lines as inert. The page loads
`swill.js` (from a CDN, or the copy `--with-framework` places beside the
output) before `app.js`, and names its application with
`<body application="...">`. `esbuild` must be on the path; a source map is
written beside the output.

### Installing as a gem

The gem carries the compiler, the framework's Ruby, the JavaScript runtime,
a prebuilt `swill.js`, and the `swill` command, so an application needs no
checkout of this repository. Install it from the repository with Bundler:

```ruby
# Gemfile
gem "swill-ruby2js", github: "arbales/swill", glob: "ruby2js/*.gemspec"
gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
```

The `glob` is needed only while the gemspec sits in `ruby2js/` rather than at
the repository root, which it will eventually move to.

Both lines are required. This compiler extends Ruby2JS's Pragma filter, which
no released `ruby2js` carries: 5.1.2 on rubygems does not have it, and the
version on master reports that same number. The gem declares the dependency,
but only the consumer's Gemfile can point it at the git source, so a Gemfile
with the first line alone resolves to a `ruby2js` that cannot work. Loading
the compiler without the filter raises a `LoadError` saying so. For the same
reason the gem cannot go to rubygems.org, and its `allowed_push_host` is set
to refuse a push until that changes.

To build and install it by hand instead:

```sh
gem build swill-ruby2js.gemspec
gem install ./swill-ruby2js-0.0.1.gem
```

The framework's interface is compiled from its sources on demand rather than
shipped prebuilt: it costs about 0.16s per process, against a whole
application build of roughly 0.25s, so precomputing it would buy nothing and
could go stale.

### Typing an application

`swill types` writes the Sorbet artifacts an application needs to check
itself:

```sh
swill types frontend        # writes frontend/sorbet/, then run srb tc there
```

| File | What it carries |
| --- | --- |
| `sorbet/rbi/application.rbi` | The accessors the application's own declarations create |
| `sorbet/rbi/swill.rbi` | The same for the framework's classes |
| `sorbet/rbi/swill-dom.rbi` | The DOM and the browser globals, from `knowledge/dom.rb` |
| `sorbet/rbi/swill-runtime.rbi` | The runtime and declaration-macro boundary, handwritten |
| `sorbet/checks/declarations.rb` | Each declaration expression as a typed method, so defaults and computed blocks are checked |
| `sorbet/config` | Written only if absent; an existing one is the application's own |

The config lists the application's sources, the framework's Ruby (where its
methods and macros are declared), and the generated RBIs. The framework's MRI
host is described by `swill-runtime.rbi` rather than checked as source, since
checking both would declare the declaration macros twice. Because the config
names absolute paths into the installed gem, it is regenerated rather than
committed.

### Application ports

The "bar" application (`~/Workspace/bar`, a Roda API with a TypeScript
Swill frontend) has a second frontend in Ruby under `frontend-ruby/`,
compiled by `bin/drinks frontend:build --ruby` through the `swill` command
and checked in headless Chrome against a fake JSON:API server
(`node frontend-ruby/spec/browser_check.mjs`). Its `PORT.md` lists every
markup change against the TypeScript markup and whether it is a naming
difference, a framework difference, or a choice of the port. Two framework
rules came out of it: a `false` value removes a `data-*` attribute (ARIA
attributes keep `"false"`), and a first responder that new window content
chooses while loading (a field focused in `controller_did_load`) stands.
`Swill::Application#browser` is the window, for `prompt` and `print`.

### The static example

`examples/static/index.html` with `examples/static.rb` is the full proof of
the UI surface, ported from the retired Opal port's static example
(`../examples/opal/static/app.rb`): a toolbar that switches
the main window between a bindings pane (key-path bindings, computed model
predicates, a draft editor, a nested card with a binding root, a nested
counter posting notifications, and a first-responder readout), a controls
pane (text field, select, custom select), and a data pane (an editable,
sortable list of plain observable objects); a palette dialog; and a
workspace window whose panes keep their fields in the URL fragment. The
brewery search from the original waits for the backend model slice.

## Current scope

The implementation covers:

- separate framework and application bundles with one runtime;
- static classes, inheritance, method-only mixins, and native `super`;
- typed properties, attributes, computed values, and inherited defaults;
- class settings and inheritable registries;
- an open declaration vocabulary: the compiler loads the Ruby, so a macro is
  an ordinary class method marked `macro`, and `attribute`, `outlet`,
  `restorable`, and `has_many` are written in it rather than in the compiler.
  A plugin's own macro needs no compiler change;
- mutation hooks, observation, value bindings, actions, drafts, and disposal;
- compiled object, responder, view, controller, ownership, bindings, actions,
  and awakening framework slices;
- nested controllers with a sparse view tree, direct-owner wiring, responder
  chain actions, children-first lifecycle, and recursive unload;
- a markup-declared application that launches on `DOMContentLoaded`, tops the
  responder chain, and terminates on unload;
- managed elements: `klass` views, plain outlet views, declared outlets
  connected to their direct owner, and JSON outlets decoded through a hook;
- binding roots, `@` paths, `bind-*` property bindings, predicate readers,
  represented objects for child controllers, and object-to-object bindings;
- application-owned first responder with focus reconciliation and key routing
  through the responder chain;
- model attributes with `validate_<name>(value, previous)` validation,
  `from_attributes` materialization from a wire hash, and observable,
  baseline-aware dirty tracking, shared with MRI;
- window templates, named containers with replaceable content, dialogs, and
  observed awakening of code-created content;
- list controllers: template rows bound to their objects, row views and row
  controllers owned by the list, identity-based selection with a restorable
  pending id, mouse and keyboard selection, and activation through the
  responder chain;
- common methods and blocks on typed String, Symbol, Integer, Float, Boolean,
  nil, Array, and Hash receivers, with Ruby semantics checked against MRI and
  a build error for anything outside the tables; sends on untyped receivers
  resolve through installed metadata at run time;
- keyed URL restoration of window content and controller state with
  Back/Forward, declared per path and typed from declarations;
- generated RBIs and expression probes;
- readable and minified script bundles with source maps.

It does not claim general Ruby modules, runtime reflection, mutable declaration defaults,
Sorbet constructs beyond the compiled `T` operations, dynamic class mutation,
editor controllers, controls, or a complete model-layer port. Unsupported forms
fail compilation.

Extend this scope through additional controller, awakening, binding, and model
slices tested against existing behavior.
