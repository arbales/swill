# Plain JavaScript

This guide covers using Swill without the compiler: loading `swill.js`,
registering ordinary JavaScript classes, and starting the application
explicitly. Put these scripts at the end of `body` so the default root,
`document.body`, is ready.

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
      this.status.element.textContent = "Ready";
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
not share mutable state. Every method a class defines is reachable from markup
and the responder chain; `static actions` only checks, at registration, that
the names it lists exist. An action accepts zero, one, or two arguments; the
framework supplies the sender and DOM event when requested. Outlets are
required unless their descriptor has `optional: true`.

A method named for a property and `DidChange`, such as `nameDidChange(previous)`,
is called when that property changes, as a Ruby class's `name_did_change` is.

`static restorable` lists the properties a controller restores, by path, as
`["query", "page"]`, or with their keys, as `{query: "q"}`. A property's type
comes from its default: a number restores as an integer, a boolean as a
boolean, and anything else as a string.

Controller subclasses may override `bindingRoot`, `decodeOutletData`,
`viewDidLoad`, `awakeFromDOM`, `controllerDidRestore`, `controllerDidLoad`,
`viewWillAppear`, `viewDidAppear`, `viewWillDisappear`, and
`viewDidDisappear`. Outlets are connected before `viewDidLoad`; bindings push
after it and before `awakeFromDOM`. Application subclasses may override
`applicationDidLaunch` and `applicationWillTerminate`. `Swill.List` subclasses
may override `makeRowElement`, `configureRow`, `rowsAreViews`, `isRowElement`,
`selectedObjectDidChange`, and `activateSelection`.

Once a page registers a JavaScript class, markup and `observe` may spell the
framework's names as JavaScript does: `bind="roster.selectedObject.name"` and
`bind="roster.selected_object.name"` reach the same property.

A registered class extends one of the framework's public classes:
`Swill.Object`, for an observable object of the application's own;
`Swill.Controller`, `Swill.Application`, `Swill.View`, and the lists and
editors; `Swill.Control` and its subclasses; `Swill.ValueTransformer`, whose
instances `Swill.ValueTransformer.register` makes available to markup by name;
and `Swill.Model.Base`, `Swill.Model.Resource`, and `Swill.Distant.Object`.
A model's `static properties` are observable properties, not persisted
attributes; `static attributes` declares persisted attributes, as below.
The other public classes, such as `Swill.NotificationCenter` and
`Swill.Distant.Client`, are used as they are.

`Swill.register("Admin::Editor", Editor)` supplies a markup name explicitly;
`"Admin.Editor"` names the same class.
Register a JavaScript parent before its subclasses. For another root or a
custom registered application class, use
`Swill.start({root: element, application: MyApplication})`. One application
runs per page: `start` returns it, `Swill.Application.shared()` returns it
from anywhere, `Swill.Application.isRunning()` says whether one is up, and a
second `start` while it runs throws.

## Model Attributes

```js
class Note extends Swill.Model.Resource {
  static attributes = {
    title: {default: "", type: "String", key: "name"},
    tags: {default: () => [], type: "T::Array[String]"},
    memo: {default: null}
  };

  validateTitle(value, previous) {
    return value.trim();
  }
}
Swill.register(Note);
const note = Note.fromAttributes({id: "1", name: " First "});
note.title = "Second";
// note.collectDirtyAttributes() => {name: "Second"}
```

An attribute is an observable property in the model's inherited attribute
registry, so the existing model validators, codecs, dirty tracking, and drafts
use it. `key` defaults to its property name; `type` is a Ruby/Sorbet type-name
string, defaulting to `"T.untyped"`. As in Ruby models, incoming null is
replaced with the default for a non-nilable type; `T.untyped`, `NilClass`, and
`T.nilable(...)` retain null. This type metadata controls null normalization,
not JavaScript assignment typechecking.

`default` is required and follows the same scalar-or-zero-argument-factory
rule as `properties`. Factories run on demand, not at registration, including
when null normalization needs a fresh default. `validateTitle(value, previous)`
is the JavaScript spelling of `validate_title`; it may coerce or throw to reject
the value. Subclasses inherit the registry without changing their parents.
Attributes require a model subclass and cannot share a name with another
declaration on the same class. Distant models still need their server schema;
attributes alone do not declare remote fields or operations.

## Themes and Resources

A page links a theme beside `swill.js`, first among its stylesheets:

```html
<link rel="stylesheet" data-swill-theme href="/assets/resources/swill/linear.css">
<script src="/assets/swill.js"></script>
```

The framework's images, templates and themes are found beside `swill.js`
wherever it is served from, and `application.theme = "bioplastic"` switches
theme. See [Themes](resources.md#themes).

An application's own resources live in `resources/<name>/` beside its
script, as a built application's do, and `Swill.registerBundle` names them:

```js
Swill.registerBundle("app", {manifest: ["Poster.png", "icons/Star.svg", "rows.html"]});
```

`base`, the folder `resources/` is in, defaults to the current script's
folder, or the page's for an inline script. The manifest lists the files
under the folder; `swill manifest resources/app` prints it. The bundle is then
the application's: `Swill.Image.named("Poster")` and `image="Poster"` find its
files before the framework's. Without a build, nothing is embedded, so
`Swill.start` loads the bundle's HTML catalogs first and launches once they
arrive; `applicationDidLaunch` runs then.

JavaScript methods use JavaScript semantics. Markup bindings follow Swill's
one truthiness rule: only `false`, `null`, and `undefined` are false for
checkboxes and boolean `bind-*` properties.

See `examples/rb/javascript.html` for a complete page.

## Browser Checks

`rake browser` exercises compiled Ruby and plain JavaScript applications in
headless Chrome; see [browser checks](development.md#browser-checks). The
framework's own launch on `DOMContentLoaded` is described under [building an
application](getting_started.md#building-an-application).
