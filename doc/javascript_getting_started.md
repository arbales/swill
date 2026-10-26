# Getting Started in JavaScript

This guide covers building a Swill page in plain JavaScript, with no compiler
and no build step: getting `swill.js`, the page, a controller, a list, keys,
the page's own resources, and which build to load. The reference for what a
registered class may declare is [Plain JavaScript](plain_javascript.md).

## Getting Swill

Swill is two scripts and a folder: `swill.js`, the whole framework;
`swill-ui.js`, the same without models, remote data and the richer controls;
and `resources/swill/`, the framework's themes, images and templates. All
three are in the gem's `rb/dist/`. Serve them together, keeping
`resources/swill/` beside the script, since the framework finds its own
resources beside wherever its script was served from.

| Build | Carries | Leaves out |
| --- | --- | --- |
| `swill.js` | Everything | Nothing |
| `swill-ui.js` | Controllers, views, `Swill.List`, windows, alerts, `Swill.Button`, `Swill.ImageView`, bundles, notifications | Models, Distant Objects, `Swill.SortableList`, the editors, `Swill.TextField`, `Swill.Select`, `Swill.Segmented`, `Swill.CustomSelect` |

Each has a minified `.min.js` beside it.

## The Page

A page links a theme, writes its markup, then loads `swill.js` and its own
script at the end of `body`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hello</title>
  <link rel="stylesheet" data-swill-theme href="/assets/resources/swill/linear.css">
</head>
<body>
  <main controller="Hello">
    <h1 bind="greeting"></h1>
    <label>Name <input bind="name" autofocus></label>
  </main>
  <script src="/assets/swill.js"></script>
  <script src="/assets/hello.js"></script>
</body>
</html>
```

`controller="Hello"` names the class that owns the `main` element and
everything in it. `bind` connects an element to a property of that
controller: the heading shows `greeting`, and the field edits `name`.

## A Controller

```js
class Hello extends Swill.Controller {
  static properties = {name: {default: "world"}};

  get greeting() {
    return `Hello, ${this.name}!`;
  }
}

Swill.register(Hello);
Swill.start();
```

`static properties` declares observable properties with their defaults. A
getter is a computed property: Swill notes what it reads, so `greeting`
changes whenever `name` does, and the heading follows. `Swill.register` makes
the class known to markup by its name, and `Swill.start` awakens the page.

## Actions and Outlets

A button with `data-action` calls the method of that name, on the
controller that owns it or further up the responder chain. `outlet` names an
element or control the controller reaches as a property:

```html
<main controller="Hello">
  <input bind="name" outlet="field">
  <button data-action="clear">Clear</button>
</main>
```

```js
class Hello extends Swill.Controller {
  static properties = {name: {default: ""}};
  static outlets = {field: {}};

  clear() {
    this.name = "";
  }

  nameDidChange(previous) {
    console.log(`${previous} became ${this.name}`);
  }
}
```

A method named for a property and `DidChange` runs when that property
changes.

## A List

`Swill.List` shows an array as rows from a template, and keeps a selection:

```html
<main controller="People">
  <ul controller="Swill.List" outlet="list" bind="people">
    <template for="row"><li bind="name"></li></template>
  </ul>
  <p bind="list.selectedObject.name"></p>
</main>
```

```js
class People extends Swill.Controller {
  static properties = {people: {default: () => [{name: "Ada"}, {name: "Grace"}]}};
  static outlets = {list: {}};
}
```

A binding may run through an outlet: the paragraph shows whichever person is
selected. Markup may name framework classes and properties as JavaScript
does, `Swill.List` and `selectedObject`, or as Ruby does,
`Swill::Controller::List` and `selected_object`. A list's own subclass may
override `makeRowElement`, `configureRow` and `selectedObjectDidChange`; see
[Collections](collections.md).

## Keys

Keys reach the first responder, the controller or view that holds the
keyboard, and pass up the responder chain until one takes them. Enter,
Escape and the arrows arrive as commands: `insertNewline`,
`cancelOperation`, `moveUp`, `moveDown`. A search field keeps the keys that
edit its text and sends Up and Down on, so its controller can move a list:

```js
moveDown(event) { this.list.moveDown(event); }
moveUp(event) { this.list.moveUp(event); }
cancelOperation() { this.query = ""; }
```

See [Responders](responders.md).

## Remembering State in the URL

A property listed in `static restorable` is kept in the URL fragment, so a
reload or a shared link shows the same state. It applies to a window's
content controller, so the page marks its window:

```html
<div window="main">
  <div controller="Search">...</div>
</div>
```

```js
static restorable = {query: "q"};
```

The fragment then reads `#main.q=...`. See
[Restoration](lifecycle.md#restoration).

## The Page's Own Resources

Images and templates of the page's own live in `resources/<name>/` beside
its script, and `Swill.registerBundle` names them:

```js
Swill.registerBundle("app", {manifest: ["Logo.svg"]});
```

```html
<img klass="Swill.ImageView" image="Logo" alt="">
```

`swill manifest resources/app` prints the manifest. See
[Themes and Resources](plain_javascript.md#themes-and-resources).

## A Complete Example

The navigator in Swill's generated documentation is a plain JavaScript
application on `swill-ui.js`: `rakelib/swill_doc/assets/navigator.js`. Three
lists follow a search query; arrows move one selection through all three;
`~` takes the keyboard from anywhere; and a language switch posts a
notification the navigator observes. Run `rake rdoc` and open
`rdoc/index.html` to use it.

## What Is Ruby's Alone

Models with persisted attributes and Distant Objects are declared in Ruby:
a JavaScript class may extend `Swill.Model.Base`, but its `static properties`
are observable properties, not attributes. Sorbet types are Ruby's too; a
JavaScript class's properties take whatever is assigned.
