# Development

This guide covers working on Swill itself: the rake tasks, the browser
checks, typechecking the framework, dependency updates, benchmarks, the
checked-in build output, and the maintainer's notes on application ports and
the static example.

## Browser Checks

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

Open `http://127.0.0.1:3000/examples/rb/javascript.html` for the no-build
JavaScript example. `examples/rb/index.html` demonstrates compiled Ruby: it
declares its application and loads the two scripts.

```html
<body application="Demo::Application">
  <main controller="Demo::Controller">...</main>
  <script src="../../rb/dist/swill.js"></script>
  <script src="../../rb/dist/app.js"></script>
</body>
```

Load `swill.js` before `app.js`.

## Typechecking the Framework

`rake typecheck` builds the framework, which writes its Sorbet artifacts, and
runs `srb tc` over `rb/framework/` and the examples in `examples/rb/`:

| File | What it carries |
| --- | --- |
| `sorbet/rbi/generated.rbi` | The readers and writers every declaration creates |
| `sorbet/rbi/dom.rbi` | The DOM and the browser globals, from `rb/compiler/knowledge/dom.rb`, the table the compiler lowers DOM calls from |
| `sorbet/rbi/runtime.rbi` | The runtime and the declaration macros, handwritten |
| `sorbet/checks/declarations.rb` | The typed probe for each declaration |

The compiler and the JavaScript runtime are outside the check: they are the
build, not the framework.

## Dependency Updates

Ruby2JS tracks a lockfile-pinned upstream commit because the latest published
gem does not include the Pragma filter.

```sh
BUNDLE_PATH=vendor/bundle bundle update
BUNDLE_PATH=vendor/bundle bundle exec rake
BUNDLE_PATH=vendor/bundle bundle exec rake browser
```

Commit `Gemfile.lock` after verification.

## Benchmarks

`benchmark/collection.mjs` measures cached reads, selection changes, and
replacing a sorted collection; run it with
`deno run -A benchmark/collection.mjs ../build/framework.mjs --observable`
after building, or without `--observable` to measure plain objects.

## Build Output

`build/` is scratch output and may be deleted. `rb/dist/` contains checked-in
browser output. Regenerate it with `rake build`; do not edit generated files.

## Application Ports

The bar application (`~/Workspace/bar`, a Roda API with a TypeScript
Swill frontend) has a second frontend in Ruby under `frontend-ruby/`,
compiled by `bin/drinks frontend:build --ruby` through the `swill` command
and checked in headless Chrome against a fake JSON:API server
(`deno run -A frontend-ruby/spec/browser_check.mjs`). Its `PORT.md` lists every
markup change against the TypeScript markup and whether it is a naming
difference, a framework difference, or a choice of the port. Two framework
rules came out of it: a `false` value removes a `data-*` attribute (ARIA
attributes keep `"false"`), and a first responder that new window content
chooses while loading (a field focused in `controller_did_load`) stands.

## The Static Example

`examples/rb/static/index.html` with `examples/rb/static.rb` is the full proof
of the UI surface, ported from the retired Opal port's static example
(`examples/opal/static/app.rb`): a toolbar that switches the main window
between a bindings pane (key-path bindings, computed model predicates, a draft
editor, a nested card with a binding root, a nested counter posting
notifications, and a first-responder readout), a controls pane (text field,
select, custom select), and a data pane (an editable, sortable list of plain
observable objects); a palette dialog; and a workspace window whose panes
keep their fields in the URL fragment. The brewery search from the original
waits for the backend model slice.
