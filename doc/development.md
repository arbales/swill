# Development

This guide covers working on Swill itself: the rake tasks, the browser
checks, typechecking the framework, dependency updates, benchmarks, the
checked-in build output, and the maintainer's notes on application ports and
the static example.

## Setup and Tasks

Working on Swill requires Ruby 3.2+, Bundler, the standalone `esbuild` binary,
and Deno 2.9+ for the JavaScript tests. Browser checks also require Chrome.

```sh
bundle install
bundle exec rake
```

The default task builds, type-checks, tests on MRI and Deno, minifies, and
reports artifact sizes.

| Task | Purpose |
| --- | --- |
| `build` | Compile the framework and example browser bundles |
| `typecheck` | Build and check the Ruby with Sorbet |
| `test` | Type-check, then run the compiler, MRI, runtime, and integration tests |
| `optimize` | Build minified bundles and execute the bundle tests against them |
| `browser` | Build and exercise the examples in headless Chrome |
| `benchmark` | Report non-gating runtime and warm compiler medians |

Ruby2JS selects its Prism walker on Ruby 3.4+ and the parser gem otherwise.
`RUBY2JS_PARSER=parser` or `RUBY2JS_PARSER=prism` forces one.

## Documentation Site

The documentation viewer is built into `rdoc/` with
`STRICT=1 bundle exec rake rdoc`. Its `index.html` is the README, with guide,
class, and method indexes alongside it. Pages and assets use relative URLs,
so the viewer works from disk and under the GitHub Pages project path.

The publishing target is https://arbales.github.io/swill/. The Documentation
workflow checks every push and pull request, including the viewer over HTTP
at `/swill/`. Successful builds on the repository's default branch upload
`rdoc/` and deploy it with GitHub Pages; pull requests and other branches do
not deploy. The workflow also supports a manual run on the default branch.

API documentation coverage is advisory: exceeding its saved baseline produces
a warning, not a failed build or blocked deployment. The strict documentation
build and viewer browser check must pass before publishing.

Before the first deployment, enable GitHub Pages in the repository's
Settings → Pages and select **GitHub Actions** as the source. The workflow
does not enable Pages automatically. The URL is not live until that setup and
the first deployment complete.

```sh
STRICT=1 bundle exec rake rdoc
deno run -A spec/docs_browser_test.mjs --http
```

The HTTP check serves the generated viewer on loopback under `/swill/`,
checks navigation and assets, and verifies the landing page and installation
anchor. It does not contact or publish to the hosted site. README links use
the generated HTML paths; links between guide sources remain relative
Markdown links, which RDoc resolves when building the site.

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

## Ruby Source Maps

`swill build`, `swill watch`, and the framework's `rake build` compose
Ruby2JS's maps through file-based esbuild formatting and bundling. The final
`.js.map` contains original `.rb` locations, not just generated JavaScript.
Normal builds embed the full Ruby source for devtools; minified builds retain
locations but omit `sourcesContent`. Inspecting optimized sources therefore
requires making the original files available separately.

Class extracts keep file-relative positions through a row-origin table.
Reopened classes retain each fragment's own file, line, and column; mixin
wrappers, module functions, and class-method layers use the same composition
rule. Columns use UTF-16, as browser source maps require. Generated wrappers
and argument shims have no invented Ruby location. Generated metadata,
including computed-property functions in `.meta.mjs`, stays JavaScript-mapped;
not every compiler-generated expression has a Ruby token.

**`Error.stack` is still generated JavaScript.** Devtools consumes the maps
for display; reading the stack string does not. Swill's development problem
reporter separately maps the first displayed frame to Ruby. It shows the
original error immediately, then updates the location if lookup succeeds;
it never changes the Error object or its stack.

The reporter fetches the same-origin script and its linked external map
(`sourceMappingURL` or `SourceMap` header), with a total 1.5-second limit and
a bounded, per-window cache. It does not follow redirects or fetch cross-origin
scripts/maps. Missing, malformed, unsupported, non-Ruby, or unmapped locations
retain the original JavaScript frame. Dismissal and teardown prevent a late
lookup from changing another alert. This work runs inside `in_development`;
optimized bundles omit the map resolver and decoder.

### Checks and Manual Inspection

`bundle exec ruby spec/source_map_test.rb` checks file/line/column positions
using an independent source-map consumer, including normal and minified CLI
builds. It also covers map composition, reopened classes, generated wrappers,
one-line classes, and non-ASCII columns.

`bundle exec rake browser` builds a two-class fixture, loads it in Chrome,
verifies Chrome discovers its map, pauses a real call through the debugger
protocol, and resolves that frame to the second class's Ruby literal at
`spec/fixtures/source_maps/app.rb:14:15` (one-based). This automated check has
passed; it is not a manual check of the DevTools Sources interface.
The same browser check raises an actual compiled Ruby error and verifies its
alert resolves to `spec/fixtures/source_maps/app.rb:19`, while `Error.stack`
still refers to the JavaScript bundle. `deno test -A spec/source_maps_test.mjs`
covers map formats, cache behavior, failed requests, invalid maps, and timeouts;
the runtime tests cover alert ordering, dismissal, and teardown.

To check that interface by hand after `rake browser`:

1. Serve the checkout with `python3 -m http.server 3000 --bind 127.0.0.1`.
2. Open `http://127.0.0.1:3000/spec/fixtures/source_maps/index.html`.
3. In DevTools, enable JavaScript source maps. In Sources, open the original
   `spec/fixtures/source_maps/app.rb` and set a breakpoint on line 14.
4. In the console, run
   `new (Swill.Runtime.resolve("SourceMapFixture::Second"))().marker()`.
5. Confirm Sources pauses in the second Ruby class with the full original file
   visible, then resume and confirm the result is `"second_token"`.

The manual Sources-interface check remains to be recorded; the automated
protocol check above does not substitute for it.

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
of the UI surface: a toolbar that switches the main window
between a bindings pane (key-path bindings, computed model predicates, a draft
editor, a nested card with a binding root, a nested counter posting
notifications, and a first-responder readout), a controls pane (text field,
select, custom select), and a data pane (an editable, sortable list of plain
observable objects); a palette dialog; and a workspace window whose panes
keep their fields in the URL fragment. The brewery search from the original
waits for the backend model slice.
