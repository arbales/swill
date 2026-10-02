# Developer Experience Plan

## Goal

`swill new myapp && cd myapp && bundle && swill dev` opens a working, live
reloading page, in Ruby or plain JavaScript, with errors that point at the Ruby
that caused them. An application owns its application; Swill owns the loop.

Two ways in:

- **A new project.** `swill new` writes a self-contained application: the
  client, a page, a `swill.yml`, and nothing else by default. `swill dev`
  builds it and serves the page and the bundles itself, so there is no server
  to write until the application needs one. `--rack` adds a `config.ru` whose
  app is `Swill::Server`, and `--data` adds a server entry for Distant.
- **An existing application** (a Roda, Rails, Sinatra or plain Rack app that
  already serves pages). `swill init` writes only `swill.yml` and a `client/`
  skeleton beside what is there, and prints what to add to the page: the
  helpers, or the three tags. Swill never takes over the server: the author
  mounts the parts of `Swill::Server` they want (`assets_app` for the bundles,
  `data_app` for `/data`, the development middleware) where their router
  puts things, and `swill dev` starts and restarts *their* server with the
  command `dev.server` names, publishing revisions as it goes. Movies is this
  case.

## Baseline

What movies, the reference application, maintains to use Swill today. Paths
under `movies/` are in that repository; the rest are here.

| Concern | What the app carries | Evidence |
| --- | --- | --- |
| Dev loop | A 255-line watcher, rebuilder and server supervisor, plus 208 lines of specs for it | `movies/lib/development.rb`, `movies/spec/development*_test.rb` |
| Project file | None; `swill.yml` mode reruns every step on any change and never serves | `rb/compiler/project.rb:51-63`, `doc/getting_started.md:54` |
| Reload | The in-page monitor polls `/__swill/development`, but nothing in Swill publishes a revision | `rb/framework/core/development_monitor.rb:25-66`; `Revision#publish!` is called only by specs |
| Framework assets | Copied by hand into `public/assets/ruby` | `movies/lib/development.rb:137-147` against `rb/compiler/cli.rb:206-213` |
| Page wiring | Asset URLs hard-coded; two development switches; `/data` and the schema hash repeated on the client | `movies/views/ruby.erb:5-14`, `movies/ruby/client/application.rb:11` |
| Schema-only codegen | `Sequel.mock` and 14 columns listed by hand, as the docs recommend | `movies/ruby/server/movie.rb:6-18`; `doc/server_data.md:288` |
| Types | `# typed: true` everywhere and nothing checks it; `sorbet/config` written once, with absolute gem paths | `rb/compiler/build.rb:155-171`, `doc/sorbet.md:165` |
| Onboarding | No `swill new`; no runnable hello world in `getting_started.md` | `rb/compiler/cli.rb:13-40` |
| Source maps | Point at the generated `.mjs`, not the `.rb` | `sources` in `rb/dist/app.js.map` |
| Gem | Sequel required by client-only apps; Falcon, async-websocket and Rack undeclared; esbuild a post-install note | `swill.gemspec:61-66` |
| Plain JavaScript | One 100-line guide and a one-controller example; framework names must be snake_case in markup while the author's are camelCase; `nameDidChange` ignored; only actions callable; no theme, bundle, `restorable`, types or `.d.ts`; no release artifact | `rb/runtime/browser_api.mjs`, `rb/runtime/paths.mjs:66-90`, `rb/runtime/properties.mjs:166`, `doc/plain_javascript.md` |
| Legacy | `dev.sh`, `dev_server.py` and `Procfile` served the retired TypeScript framework from the repository root; moved under `ts/` | done |

Three things found while designing. Sequel is only a gemspec dependency; three
code sites need a guard (`rb/distant/dispatcher.rb:103,272`,
`rb/distant/context.rb:133`). jsDelivr serves repository files at a tag, not
release assets, so `rb/dist` stays committed. The compiler converts each class
from an extract and formats through esbuild's stdin, so Ruby source maps need
line padding and file-based formatting.

## Workstream 1: `swill new` and `swill dev`

**Goal.** The scaffold and the loop. Movies deletes `lib/development.rb`,
`bin/dev`, `bin/build_ruby_assets` and both development specs, and gains a
`swill.yml`.

### `swill new NAME [--rack] [--data]` and `swill init`

```
myapp/
  Gemfile                 swill (git or path), the ruby2js git line;
                          group :data => sequel, falcon, async-websocket; group :types => sorbet
  swill.yml
  config.ru               (--rack) run Swill::Server.new(...); rackup joins the Gemfile
  pages/index.html.erb    <%== swill.head(theme: "linear") %>, <body application="MyApp::Application">
  client/app.rb           require_relative "application"; require_relative "controllers/hello"
  client/application.rb
  client/controllers/hello.rb
  client/resources/app.css
  server/server.rb        (--data) Swill::Distant.database { Sequel.connect(ENV.fetch("DATABASE_URL")) }
  README.md               running, the layout, srb tc
  .gitignore              public/assets/ tmp/ sorbet/rbi sorbet/checks sorbet/swill.config
```

`rb/compiler/scaffold.rb` renders ERB templates from
`rb/compiler/templates/new/`; the CLI gains `new`; a non-empty directory is
refused; the module name comes from the directory name. `swill init`, run
inside an existing application, writes only `swill.yml` and the `client/`
skeleton, refuses to overwrite either, and prints the page tags and the
`Swill::Server` parts to mount.

### `swill dev [--port N] [--no-server] [--once] [--interval S] [--project FILE]`

`rb/compiler/dev.rb` replaces `run_project(watch: true)`; `swill watch
--project` becomes `swill dev --no-server`.

- **Categories decide the steps.** `client` and `resources` run `swill build
  --show-errors`, then `types` unless it is off (a types failure warns).
  `schema` runs `data generate`, then a client build when the generated
  models changed, then a server restart. `server` restarts the server.
  `assets` runs that entry's command. `framework`, watched only when the gem
  is a `path:` source, copies the framework. The first run does everything.
- **Watching** polls, with no native dependency: an mtime and size snapshot
  per category, every 0.3 s, coalescing for 0.15 s; it skips `out`, the
  generated models, `sorbet/`, `tmp/`, `node_modules` and `.git`. A flat
  `watch:` array still means `client:`.
- **Serving.** With no `server:` command and no `config.ru`, `swill dev`
  serves the project directory itself (`Bundles::Server` for the bundles, a
  static file handler for the page, the development middleware), which is
  what a fresh `swill new` runs on. Otherwise it spawns a child process:
  `auto` is `falcon serve --threaded --count 1 --no-restart` when Falcon
  loads, else `rackup`; with
  `SWILL_DEVELOPMENT_STATE` and `RACK_ENV=development` set, and the process
  group killed on stop. The port is probed before spawning; `--port` beats
  `dev.port`, and `PORT` beats both.
- **Revision.** `Revision#building!` as a cycle starts, `publish!` after the
  build and a readiness poll of `/__swill/development` (30 s). This is what
  makes the shipped DevelopmentMonitor fire.
- **Plain `swill watch ENTRY`** also stamps `resources/**`, and rediscovers
  the sources each tick after a failed build.

`swill.yml` grows without breaking its existing keys:

```yaml
client: client/app.rb
server: server/server.rb
out: public/assets/app.js
framework: true
types: {into: client, check: false}
watch:
  client:    ["client/**/*.rb"]
  resources: ["client/resources/**/*"]
  schema:    ["server/**/*.rb"]
  server:    ["config.ru", "lib/**/*.rb", ".env", "Gemfile.lock"]
assets:
  - {watch: ["assets/css/**/*.css"], run: ["esbuild", "assets/css/app.css", "--bundle", "--outdir=public/assets"]}
dev: {port: 9292, server: auto, state: tmp/swill-development.json}
```

### Sorbet

Sorbet's language server accepts one input directory, so the generated
configuration is `--dir=.` and nothing else: `swill types` copies the gem's
`rb/framework` into `sorbet/swill/framework` (gitignored, refreshed on every
run) so the framework's sources are under the project's own tree, writes the
RBIs beside them, and lists what to skip with `--ignore` lines (`/public`,
`/tmp`, `/node_modules`, the output directory, and the data generator's
`sorbet/rbi/shims/generated`, which the client typecheck must not load). It
rewrites `sorbet/swill.config` on every run and creates `sorbet/config` once,
holding `@sorbet/swill.config` so an author can add lines. `types: {check:
true}` runs `srb tc`: a warning in `dev`, fatal in `build --project`.

### Movies' `swill.yml`

`client: ruby/client/app.rb`, `server: ruby/server.rb`, `root: ruby`, `out:
public/assets/ruby/app.js`; the categories above with `ruby/` prefixes; two
`assets` entries, esbuild for the TypeScript page and for the CSS, lifted from
`lib/development.rb:164-167`; `dev: {server: falcon}`. `bin/start` and
`bin/stop` stay, being production pidfiles.

### Tests

`spec/cli_test.rb`: `swill new` writes the files and the result builds;
`--data` writes a server entry `data generate` accepts. A new
`spec/dev_test.rb`: a fixture project with a tiny Rack server; `swill dev
--once` leaves `ready: true` with a revision; an edit under `--interval 0.1`
yields a new revision; a broken file yields `ready: false` and the failure
script. `swill types` run twice keeps a line the author added to
`sorbet/config`.

**Size: L.** Can ship before Workstream 2 with a plain `Bundles::Server`
`config.ru`.

## Workstream 2: Server flexibility

**Goal.** `require "swill/server"` without Sequel; one composable Rack object;
page helpers; data configuration read from the page; schema-only codegen the
framework owns.

- **Gemspec.** Drop `sequel` and guard the three sites. Add `rack >= 3`.
  Falcon and async-websocket stay optional: `Connection#call` rescues the
  `LoadError` with a message naming them. The README gains an install table
  (core; with Sequel for data; with Falcon and async-websocket for the
  WebSocket endpoint; with Sorbet for `srb tc`). One gem, not a split: the
  ruby2js git line already forces git or path installs.
- **`Swill::Server`** (`rb/swill/server/app.rb`):
  `Swill::Server.new(assets: {url:, directory:, bundles:}, data: {schema:,
  authenticate:, path:} | Connection | nil, development:
  ENV["SWILL_DEVELOPMENT_STATE"], pages: {"/" => "pages/index.html.erb"})`,
  answering `#call`, and its parts for mounting separately: `assets_app`,
  `data_app`, `middleware`, `catalog`, `helpers`, `to_app`.
- **Helpers** (`Swill::Bundles::Helpers`): `script_tags`, `stylesheet_tag`,
  `image_tag`, `theme_link(name)` (with `data-swill-theme`),
  `development_metadata`, `data_metadata`, and `head(theme:)` for all of them;
  `Swill::Rails::Helper` with `swill_` prefixes. A new `doc/serving.md` covers
  rackup, Roda, Sinatra and Rails `mount`.
- **Data from the page.** `<meta name="swill-data" content="/data"
  data-schema="…">`, written by `data_metadata`. `Application#launch`
  configures `Distant::Client` from it when that class is present; an explicit
  `configure` in app code wins; development warns when the page's hash and
  the built client's differ. Movies deletes `application.rb:11`.
- **Codegen without a column listing.** Nobody lists columns by hand. `swill
  data generate` loads the server entry against the real database whenever it
  can reach one, and Sequel reflects the columns as it does in production.
  When it cannot (CI, a checkout with no database), the framework supplies the
  mock itself, with each model's columns read from the last generated
  `client/models/generated/schema.json`, which is already committed. The one
  line an author writes is `DB = Swill::Distant.database { Sequel.connect(…) }`
  in place of `DB = Sequel.connect(…)`, so the framework can skip the
  connection under `SWILL_SCHEMA_ONLY`; `Swill::Distant.schema_only?` serves
  the app's own conditionals (movies' `operations.rb:4`). Movies deletes
  `movie.rb:6-18`; `doc/server_data.md:288` and `doc/getting_started.md:88`
  change to match.
- **Enums.** The generator emits `String` plus a `*_VALUES` constant and its
  RBI from the enum's members (`rb/distant/generator.rb:259`). A client-side
  enum type is a follow-up.
- **Tests.** The helpers and `Swill::Server#call` in `spec/bundles_test.rb`;
  generation from a dump equal to generation from the live database in
  `spec/data_test.rb`; `require "swill/server"` with Sequel absent; the meta
  tag configuring the client in `spec/data_browser_test.mjs`.

**Size: M.** Independent; the scaffold page wants its helpers.

## Workstream 3: Plain JavaScript parity

**Goal.** camelCase everywhere, ordinary classes, a theme, a bundle, types, a
real example and a guide.

- **Names.** `canonicalName` in `rb/runtime/names.mjs` (`selectedObject` to
  `selected_object`, `A.B.C` to `A::B::C`), applied at the lookup edges only:
  `read`, `write`, `resolveMethod`, `invoke`, markup `controller=` and
  `klass=`, actions, `bind-*`; a per-class alias cache; keys stay Ruby names.
  A class declaring both spellings raises at install.
- **`register()`.** Every own prototype method enters the methods table, and
  `static actions` becomes a check; `xDidChange` registers as
  `x_did_change`; `static restorable = [...]`; `static properties = {name:
  {default, type}}` for coercion; `static settings`; `static swillName`, with
  a one-time development warning when a class is registered by `klass.name`,
  which minifiers rename.
- **Bundles.** `Swill.registerBundle(name, {base, manifest, embedded, main})`
  over `Bundle.register`, which becomes documented; a zero-code `<script
  data-swill-bundle="app" data-swill-manifest="…">`; `swill manifest DIR`.
- **Theme, example, guide.** `examples/rb/javascript.html` links a theme. The
  docs navigator (`rakelib/swill_doc/assets/navigator.js`, 301 lines) becomes
  the full example at `examples/js/navigator/`, rewritten for reading: one
  class per concern (the search, each list, the panes), named constants for
  the keys, and comments that say what a Swill application does at each
  step. The example is the source; the docs generator copies it in, so the
  two cannot drift. `rake browser` runs it.
  `doc/javascript_getting_started.md` covers obtaining `swill.js` (the CDN,
  the zip), the page skeleton, controllers, lists, alerts, windows,
  notifications, `swill.js` against `swill-ui.js`, bundles, the name rules,
  and what stays Ruby-only (models and Distant, noting the future `static
  attributes` path into the registries).

- **`swill.d.ts`, for editors.** TypeScript is not a target: Swill neither
  compiles to it nor builds TypeScript applications, and an author who wants
  TypeScript brings their own toolchain and consumes `swill.js` like any
  library. What a declaration file gives is editor support for plain
  JavaScript authors: completion, hover documentation and type errors in VS
  Code and Zed, which read `.d.ts` files for JavaScript too. The data exists:
  `javascript_spelling.rb` already renders every class's signatures in
  TypeScript notation for the docs. `rakelib/swill_doc/typescript.rb` reuses
  it (a text-only `ts_type` split from the HTML one) to write
  `rb/dist/swill.d.ts` for the friendly names during `rake build`; `rake
  test` runs `tsc --noEmit` on it when `tsc` is on the PATH. Lowest priority
  in the workstream.

- **`Swill__*` on the global.** They cannot go away: every compiled
  application links against them through `build/framework.external.mjs`,
  which reads `globalThis.Swill.Swill__X`. The question is only whether they
  are advertised. Making them non-enumerable changes nothing that runs (a
  compiled app, or a JavaScript author already reaching for
  `Swill.Swill__Controller`, keeps working) and removes them from
  autocomplete, `Object.keys` and console listings, which is where a new
  author would otherwise pick one up. Do it: one `defineProperty` loop in
  `browserAPI`, the friendly names documented as the API, and the browser test
  asserting `Object.keys(Swill)` has none. Small, and it can wait until the
  rest of the workstream.
- **Tests.** `spec/runtime_test.mjs` for the names, `nameDidChange`, methods
  reached from `data-action`, `restorable`, typed coercion, and
  `registerBundle` feeding `Image.named`; `spec/browser_test.mjs` for the
  themed example and the navigator.

**Size: M.** Independent; the guide wants Workstream 6's URL.

## Workstream 4: Ruby source maps

**Goal.** Devtools and development problem reports name `hello.rb:12`.

- Per-class maps with file-relative lines: `Compiler#convert` pads the class
  extract with the newlines and columns of its location, and keeps Ruby2JS's
  result object for its `.sourcemap`.
- `rb/compiler/source_map.rb` concatenates the per-class maps of a module:
  VLQ decoding and encoding, row offsets, re-indexed `sources` and `names`;
  sources absolute, which esbuild relativizes.
- `modules(sourcemaps: true)` writes the unformatted `.mjs` with a
  `//# sourceMappingURL`; `Build#run` and the Rakefile format and bundle from
  files rather than stdin, so esbuild composes the maps; `.meta.mjs` stays
  unmapped; minified builds pass `--sources-content=false`.
- Phase A documents that `Error.stack` is unmapped and devtools map it.
  Phase B, inside an `in_development` block, has `ProblemReporter` fetch the
  script's map and rewrite the first frame to `.rb:line:col`, tolerating
  failure.
- Tests: a two-class fixture whose token in the second class maps to the
  right file, line and column; `swill build` and `--minify` writing maps with
  `.rb` sources; a devtools check by hand, recorded in `doc/development.md`.

**Size: M.** Last, since it changes the compiler's core, and the dev loop
makes the payoff visible.

## Workstream 5: Legacy TypeScript relocation

Done: `dev.sh`, `dev_server.py` and `Procfile` live under `ts/`; `ts/dev.sh`
runs from the repository root so the server still serves `examples/ts`;
`ts/README.md` and the root README's layout table say so. `examples/ts`
stays. The bar application imports `ts/src` by path and is unaffected.

## Workstream 6: Release artifacts and the CDN

- `rake release` writes `tmp/release/swill-<VERSION>/` with `swill.js`,
  `swill.min.js`, their maps, `swill-ui`, `resources/swill/`, `swill.d.ts`,
  `LICENSE` and a README holding the page skeleton, zips it, and checks
  `VERSION` against `rb/compiler/version.rb` and the tag.
- `.github/workflows/release.yml`, on `v*` tags: build, optimize, release;
  fail when `rb/dist` differs from a fresh build; upload the zip.
- The CDN: `https://cdn.jsdelivr.net/gh/<owner>/swill@v0.0.1/rb/dist/swill.js`
  and `.../rb/dist/resources/swill/linear.css`, pinned by tag, which depends
  on `rb/dist` staying committed. The README replaces "from a CDN" with the
  URL and the zip link; the first tag bumps the version to 0.0.2. No npm.

**Size: S to M.**

## Framework follow-ups surfaced by movies

Not designed here: a modal form controller (`Controller::Form`: busy, error,
save, cancel, dismiss); a status channel (`Application#post_status`); a typed
`show_window` return; `restorable` on any controller; a stale-query token in
`Controller::List`; a sortable-header template; value-based CSS through
`bind-data-*`, which exists where movies uses `querySelector`; a client-side
`Distant::Enum`.

## Sequencing

1. Workstream 2's gemspec, `Swill::Server`, helpers and data meta, which
   unblock the scaffold page and simplify movies.
2. Workstream 1: `swill dev`, then `swill new`; migrate movies and delete its
   dev tooling. **This is the first slice.**
3. Workstream 2's codegen without a column listing, and enums.
4. Workstream 3's names, `register`, hiding, theme and example, then
   `swill.d.ts` and the guide; Workstream 6, so the guide has a URL.
5. Workstream 4.

## Risks

Polling over large `assets/**` trees: mtime and size keep it cheap, and the
exclusions are documented. `Swill::Server` reaching too far: apps mount its
parts, never the whole thing. Codegen without a database silently
using a stale `schema.json`: `dev` says which it used, and warns when `schema:`
files are newer. Source
map correctness depending on Ruby2JS's token coverage: the fixture comes
first. camelCase aliases colliding: install raises. A stale committed `rb/dist`
reaching the CDN: the release workflow's dist check.
