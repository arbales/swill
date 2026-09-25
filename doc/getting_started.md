# Getting started

## Building an application

The `swill` command compiles an application against the framework and
bundles it into one script that reads the framework from the page:

```sh
bundle exec swill build frontend            # frontend/app.rb, output frontend/dist/app.js
bundle exec swill build frontend/app.rb --out public/assets/app.js --with-framework
bundle exec swill watch frontend            # rebuild as the sources change
```

The entry file's `require_relative` lines name the sources in order, as they
would on MRI; the compiler treats those lines as inert. The page loads
`swill.js` (from a CDN, or the copy `--with-framework` places beside the
output) before `app.js`, and names its application with
`<body application="...">`. `esbuild` must be on the path; a source map is
written beside the output.

## Project workflow

For applications with a server data schema, put `swill.yml` at the project
root. All paths are relative to that file, even when invoked from elsewhere:

```yaml
server: server.rb
client: client/app.rb
root: .
out: public/assets/app.js
framework: true
types: client
```

```sh
bundle exec swill build
bundle exec swill watch
# Or select a project explicitly from another working directory:
bundle exec swill build --project /path/to/app/swill.yml
```

Each build generates the data proxies and schema, compiles the application,
copies the installed gem's framework bundle and source map, and generates
client Sorbet artifacts. Steps run in fresh Ruby processes so server model
edits are reflected on every rebuild. A failing step stops the build and names
the stage; watch mode reports the failure and retries after the next edit.
It does not start or restart your Rack server or reload the browser.

`server` is optional for applications without distant data. `root` defaults
to the configuration directory and controls data generation. `out` defaults
to `dist/app.js` beside the client entry. `framework` defaults to true;
`minify` defaults to false. `types` defaults to the client entry directory;
use `false` to skip type generation. Generation does not run `srb tc`.
An existing `sorbet/config` remains application-owned: update its source list
when adding client files, or remove it to regenerate the default.

Keep the client Sorbet root separate from server Sorbet configuration. Data
generation also emits shims under `<root>/sorbet/rbi/shims/generated`; those
are for tooling contexts without the executable client proxies. Do not load
both representations of the same class into the client typecheck.

By default the watcher tracks Ruby files, `Gemfile`, `Gemfile.lock`, and the
project configuration. It detects added and removed files and excludes
generated data/type outputs, `build`, `vendor`, and `node_modules`. Supply
`watch` patterns for additional sources such as stylesheets. Add asset steps
as argument arrays; these execute directly, without shell interpolation:

```yaml
before_build:
  - [bin/build_assets]
watch:
  - "server/**/*.rb"
  - "server.rb"
  - "client/**/*.rb"
  - "assets/**/*.css"
  - "Gemfile*"
```

The optional `env` mapping supplies string environment variables to build
steps. For example, `env: { SWILL_SCHEMA_ONLY: "1" }` can select an
application's own schema-only loader. Swill does not interpret that variable.
Prefer a dedicated server entry that loads model declarations without
starting listeners, workers, or making external service calls.

Explicit entry commands retain their existing behavior and bypass project
discovery. With `--project`, put build options in the file rather than mixing
them with command-line build flags. `--interval` controls watch polling.

## Installing as a gem

For a complete server-backed example, follow [a bound data form](data_form.md).
The compiler installs `sorbet-runtime`; server-only code need not load it.
To use real Sorbet on the server, require it before `swill/server`. Otherwise
the server entrypoint supplies the documented type subset. Add
`sequel-privacy` explicitly only for applications using that integration.

The gem carries the compiler, the framework's Ruby, the JavaScript runtime,
a prebuilt `swill.js`, and the `swill` command, so an application needs no
checkout of this repository. Install it from the repository with Bundler:

```ruby
# Gemfile
gem "swill", github: "arbales/swill"
gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
```

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
gem build swill.gemspec
gem install ./swill-0.0.1.gem
```

The framework's interface is compiled from its sources on demand rather than
shipped prebuilt: it costs about 0.16s per process, against a whole
application build of roughly 0.25s, so precomputing it would buy nothing and
could go stale.


## Application ports

The "bar" application (`~/Workspace/bar`, a Roda API with a TypeScript
Swill frontend) has a second frontend in Ruby under `frontend-ruby/`,
compiled by `bin/drinks frontend:build --ruby` through the `swill` command
and checked in headless Chrome against a fake JSON:API server
(`deno run -A frontend-ruby/spec/browser_check.mjs`). Its `PORT.md` lists every
markup change against the TypeScript markup and whether it is a naming
difference, a framework difference, or a choice of the port. Two framework
rules came out of it: a `false` value removes a `data-*` attribute (ARIA
attributes keep `"false"`), and a first responder that new window content
chooses while loading (a field focused in `controller_did_load`) stands.
`Swill::Application#browser` is the window, for `prompt` and `print`.

## The static example

`examples/rb/static/index.html` with `examples/rb/static.rb` is the full proof of
the UI surface, ported from the retired Opal port's static example
(`examples/opal/static/app.rb`): a toolbar that switches
the main window between a bindings pane (key-path bindings, computed model
predicates, a draft editor, a nested card with a binding root, a nested
counter posting notifications, and a first-responder readout), a controls
pane (text field, select, custom select), and a data pane (an editable,
sortable list of plain observable objects); a palette dialog; and a
workspace window whose panes keep their fields in the URL fragment. The
brewery search from the original waits for the backend model slice.
