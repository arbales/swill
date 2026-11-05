# Developer experience plan

## Goal

`swill new myapp && cd myapp && bundle && swill dev` opens a working, live
reloading page, in Ruby or plain JavaScript, with errors that point at the Ruby
that caused them. An application owns its application; Swill owns the loop.

The development loop, scaffold, server composition, JavaScript parity, and
release tooling are implemented; see
[completed](COMPLETED.md#developer-experience-october-2026). Remaining work is
below.

- **A new project.** `swill new` writes a self-contained application: the
  client, a page, a `swill.yml` and a `config.ru` on `Swill::Server`, with
  `--data` adding a server entry for Distant.
- **An existing application** (a Roda, Sinatra or plain Rack app that
  already serves pages). `swill init` writes `swill.yml` and `client/` without
  replacing either, and prints the server and page integration steps. Mount
  the desired parts as [serving](../doc/serving.md) describes; Movies uses
  this integration path.

## Ruby source maps

**Goal.** Devtools and development problem reports name `hello.rb:12`.

The Phase A build pipeline is implemented; see
[completed](COMPLETED.md#ruby-source-maps-phase-a) and
[the development guide](../doc/development.md#ruby-source-maps). Extracts use
row-origin tables rather than padding: one emitted class may combine reopened
fragments from several files. Automated checks cover exact positions in raw,
formatted, and minified output, and a paused frame in Chrome.
Phase B is also implemented: development error alerts resolve their displayed
first frame to Ruby without delaying the original error or mutating
`Error.stack`. Failed or late lookups preserve the original report; optimized
bundles omit the decoder. See
[completed](COMPLETED.md#development-error-source-mapping).

Remaining:

- Record the manual DevTools Sources-interface check described in
  [the guide](../doc/development.md#checks-and-manual-inspection). The automated
  Chrome debugger-protocol check has passed; the manual UI check has not run.

## The first release

`rake release` and `.github/workflows/release.yml` exist, and the version is
0.0.2. Before tagging `v0.0.2`, verify the repository is public for jsDelivr
and that committed `rb/dist` matches a fresh build. The first release run
must establish that Linux and Mac builds match byte for byte; having the
workflow and rebuilt bundles does not establish that result.

## `swill.d.ts`, for editors

TypeScript is not a target: Swill neither compiles to it nor builds
TypeScript applications. A declaration file gives plain JavaScript authors
completion, hover documentation and type errors in VS Code and Zed, which read
`.d.ts` files for JavaScript too. `javascript_spelling.rb` already renders
every class's signatures in TypeScript notation for the docs. Planned:
`rakelib/swill_doc/typescript.rb` would reuse it (a text-only `ts_type` split
from the HTML one) to write `rb/dist/swill.d.ts` during `rake build`;
`rake test` would run `tsc --noEmit` when available, and `rake release` would
add it to the zip. Not implemented; lowest priority.

## Generated distribution artifacts

**Current choice: keep `rb/dist` tracked and suppress generated diffs.**
`.gitattributes` marks `/rb/dist/**` with `linguist-generated=true -diff`.
Revisit source-only distribution later; no install or CDN contract changes now.
The deferred tooling items have been implemented; see
[completed](COMPLETED.md#developer-experience-october-2026).

- **Keep it:** Git/path installs serve the framework without building it,
  examples work from a checkout, and jsDelivr serves immutable tagged files.
  Costs: generated diff/history noise and a stale-output check on releases.
- **Mark it generated:** GitHub can collapse generated diffs and omit them
  from language statistics; that alone leaves local diff counts unchanged.
  Adding `-diff` in `.gitattributes` also makes Git treat the output as binary
  for diffs and numeric stats (`git diff --text` can still inspect it).
  This is the current repository policy.
  Git history is unchanged, and other review tools may not honor the attributes.
  This is a review aid, not source-only distribution.
- **Untrack it:** source-only changes and releases built from tagged sources,
  but Git/path installs and examples need an explicit framework build, and
  jsDelivr's current GitHub URLs stop working for new tags. The gemspec,
  server/copy paths, release workflow, and CDN documentation need one coherent
  replacement delivery contract. Release zips already carry built files.

Prefer separating source and release artifacts over hidden install-time
builds. Choose the replacement for Git-based consumers and CDN delivery before
untracking; verify a clean install and release, not just a warm checkout. No
history rewrite is needed to stop tracking future output.

## Framework follow-ups surfaced by Movies

Not designed here: a modal form controller (`Controller::Form`: busy, error,
save, cancel, dismiss); a status channel (`Application#post_status`); a typed
`show_window` return; `restorable` on any controller; a sortable-header
template; a client-side `Distant::Enum`. Stale-result protection is already
owned by `ArrayController#fetch` and Movies' scheduler, not a new List token.

## Risks

Polling over large `assets/**` trees: mtime and size keep it cheap, and the
exclusions are documented. `Swill::Server` reaching too far: apps mount its
parts, never the whole thing. Codegen without a database silently using a
stale `schema.json`: nothing says so yet; `swill data` should report the
fallback, and warn when `schema:` files are newer. A stale committed `rb/dist`
reaching the CDN: the release workflow's dist check.
