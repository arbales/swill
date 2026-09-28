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
not share mutable state. Actions are explicit and accept zero, one, or two
arguments; the framework supplies the sender and DOM event when requested.
Outlets are required unless their descriptor has `optional: true`.

Controller subclasses may override `bindingRoot`, `decodeOutletData`,
`viewDidLoad`, `awakeFromDOM`, `controllerDidRestore`, `controllerDidLoad`,
`viewWillAppear`, `viewDidAppear`, `viewWillDisappear`, and
`viewDidDisappear`. Outlets are connected before `viewDidLoad`; bindings push
after it and before `awakeFromDOM`. Application subclasses may override
`applicationDidLaunch` and `applicationWillTerminate`. `Swill.List` subclasses
may override `makeRowElement`, `configureRow`, `rowsAreViews`, `isRowElement`,
`selectedObjectDidChange`, and `activateSelection`.

Known gap: property change hooks are not available to JavaScript classes. The
runtime dispatches `name_did_change` from a class's installed method table,
and `Swill.register` fills that table only from `static actions`, so a
`nameDidChange` method on a registered class is never called. Observe the
property instead: `this.observe("name", (value, previous) => ...)` in
`viewDidLoad`, or `this.observeWithObject(other, "name", ...)` for another
object's property; both observations are released at `unload`. Closing the
gap means registering hook methods in the table; their names already match,
since compiled members are camelCase.

A registered class extends one of the framework's public classes:
`Swill.Object`, for an observable object of the application's own;
`Swill.Controller`, `Swill.Application`, `Swill.View`, and the lists and
editors; `Swill.Control` and its subclasses; `Swill.ValueTransformer`, whose
instances `Swill.ValueTransformer.register` makes available to markup by name;
and `Swill.Model.Base`, `Swill.Model.Resource`, and `Swill.Distant.Object`.
A model's `static properties` are observable properties, not persisted
attributes; attributes are declared in Ruby. The other public classes, such as
`Swill.NotificationCenter` and `Swill.Distant.Client`, are used as they
are.

`Swill.register("Admin::Editor", Editor)` supplies a markup name explicitly.
Register a JavaScript parent before its subclasses. For another root or a
custom registered application class, use
`Swill.start({root: element, application: MyApplication})`. One application
runs per page: `start` returns it, `Swill.Application.shared()` returns it
from anywhere, `Swill.Application.isRunning()` says whether one is up, and a
second `start` while it runs throws.

JavaScript methods use JavaScript semantics. Markup bindings follow Swill's
one truthiness rule: only `false`, `null`, and `undefined` are false for
checkboxes and boolean `bind-*` properties.

See `examples/rb/javascript.html` for a complete page.

## Browser Checks

`rake browser` exercises compiled Ruby and plain JavaScript applications in
headless Chrome; see [browser checks](development.md#browser-checks). The
framework's own launch on `DOMContentLoaded` is described under [building an
application](getting_started.md#building-an-application).
