# Developer Experience Plan

## Goal

`swill new myapp && cd myapp && bundle && swill dev` opens a working, live
reloading page, in Ruby or plain JavaScript, with errors that point at the Ruby
that caused them. An application owns its application; Swill owns the loop.

Two ways in:

# FIXME: How will the existing application flow interact with Sinatra's public folder? Or with Roda's Assets plugin?

- **A new project.** `swill new` writes a self-contained application: the
  client, a page, a `swill.yml` and a `config.ru` on `Swill::Server`, with
  `--data` adding a server entry for Distant.
- **An existing application** (a Roda, Sinatra or plain Rack app that
  already serves pages). `swill init` writes only `swill.yml` and a `client/`
  skeleton beside what is there, and prints what to add to the page: the
  helpers, or the three tags. Swill never takes over the server: the author
  mounts the parts of `Swill::Server` they want (`assets_app` for the bundles,
  `data_app` for `/data`, the development middleware) where their router
  puts things, and `swill dev` starts and restarts *their* server with the
  command `dev.server` names, publishing revisions as it goes. Movies is this
  case.

Workstreams 1, 2, 3 (except `swill.d.ts`), 5 and 6 are done; see
[completed](COMPLETED.md#developer-experience-october-2026). What remains is
below.

## Ruby source maps

**Goal.** Devtools and development problem reports name `hello.rb:12`. The
compiler converts each class from an extract and formats through esbuild's
stdin, so the maps need line padding and file-based formatting.

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

**Size: M.** The risk is Ruby2JS's token coverage: the fixture comes first.

## The first release

`rake release` and `.github/workflows/release.yml` exist, and the version is
0.0.2. Before tagging `v0.0.2`: rebuild and commit `rb/dist` (the workflow
fails when it differs from a fresh build), and make the repository public so
jsDelivr can serve it. The first run is also the first check that the Linux
build matches a Mac's byte for byte.

## `swill.d.ts`, for editors

TypeScript is not a target: Swill neither compiles to it nor builds
TypeScript applications. A declaration file gives plain JavaScript authors
completion, hover documentation and type errors in VS Code and Zed, which read
`.d.ts` files for JavaScript too. `javascript_spelling.rb` already renders
every class's signatures in TypeScript notation for the docs.
`rakelib/swill_doc/typescript.rb` reuses it (a text-only `ts_type` split from
the HTML one) to write `rb/dist/swill.d.ts` for the friendly names during
`rake build`; `rake test` runs `tsc --noEmit` on it when `tsc` is on the PATH;
`rake release` adds it to the zip. Lowest priority.

## Deferred

- **`swill init`**, as the goal describes.
- **Sorbet in one directory.** Sorbet's language server accepts one input
  directory, so the generated configuration is `--dir=.` and nothing else:
  `swill types` copies the gem's `rb/framework` into `sorbet/swill/framework`
  (gitignored, refreshed on every run), writes the RBIs beside it, and lists
  what to skip with `--ignore` lines (`/public`, `/tmp`, `/node_modules`, the
  output directory, and `sorbet/rbi/shims/generated`). It rewrites
  `sorbet/swill.config` on every run and creates `sorbet/config` once, holding
  `@sorbet/swill.config` so an author can add lines. `types: {check: true}`
  runs `srb tc`: a warning in `dev`, fatal in `build --project`.
- **Plain `swill watch ENTRY`** also stamps `resources/**`, and rediscovers
  the sources each tick after a failed build.
- **Static attributes for JavaScript models**, so a registered model can
  declare persisted attributes into the registries.

## Framework follow-ups surfaced by Movies

Not designed here: a modal form controller (`Controller::Form`: busy, error,
save, cancel, dismiss); a status channel (`Application#post_status`); a typed
`show_window` return; `restorable` on any controller; a stale-query token in
`Controller::List`; a sortable-header template; a client-side
`Distant::Enum`.

## Risks

Polling over large `assets/**` trees: mtime and size keep it cheap, and the
exclusions are documented. `Swill::Server` reaching too far: apps mount its
parts, never the whole thing. Codegen without a database silently using a
stale `schema.json`: nothing says so yet; `swill data` should report the
fallback, and warn when `schema:` files are newer. A stale committed `rb/dist`
reaching the CDN: the release workflow's dist check.
