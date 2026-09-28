# Getting Started

This guide covers building an application with the `swill` command, the
`swill.yml` project workflow, and installing Swill as a gem.

## Building an Application

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
`<body application="...">`. The framework launches the named application on
`DOMContentLoaded` and terminates it on a `pagehide` whose `persisted` flag is
false; a persisted `pagehide` means the page may return from the back-forward
cache. `Swill::Application#browser` is the window, for `prompt` and `print`.
`esbuild` must be on the path. A source map is written beside the output.

## Project Workflow

For applications with a server data schema, put `swill.yml` at the project
root. All paths are relative to that file, even when the command is invoked
from another directory:

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
client Sorbet artifacts. Each step runs in a fresh Ruby process, so edits to
server models are reflected on every rebuild. A failing step stops the build
and names the stage; watch mode reports the failure and retries after the next
edit. The build does not start or restart the application's Rack server, and
does not reload the browser.

`server` is optional for applications without distant data. `root` defaults
to the configuration directory and controls data generation. `out` defaults
to `dist/app.js` beside the client entry. `framework` defaults to true;
`minify` defaults to false. `types` defaults to the client entry directory;
`false` skips type generation. Generation does not run `srb tc`. An existing
`sorbet/config` belongs to the application: update its source list when adding
client files, or remove it to regenerate the default.

Keep the client Sorbet root separate from server Sorbet configuration. Data
generation also emits shims under `<root>/sorbet/rbi/shims/generated`; those
are for tooling contexts without the executable client proxies. Do not load
both representations of the same class into the client typecheck.

By default the watcher tracks Ruby files, `Gemfile`, `Gemfile.lock`, and the
project configuration. It detects added and removed files and excludes
generated data and type outputs, `build`, `vendor`, and `node_modules`.
Supply `watch` patterns for additional sources such as stylesheets. Add asset
steps as argument arrays; these execute directly, without shell interpolation:

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
application's own schema-only loader; Swill does not interpret that variable.
Prefer a dedicated server entry that loads model declarations without
starting listeners or workers, or making external service calls.

An explicit entry on the command line bypasses project discovery. With
`--project`, put build options in the file rather than mixing them with
command-line build flags. `--interval` controls watch polling.

## Installing as a Gem

For a complete server-backed example, follow [a bound data form](data_form.md).
The server side's requirements — `sorbet-runtime`, `swill/server`, and
`sequel-privacy` — are stated in [server data](server_data.md).

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

The framework's interface is compiled from its sources on demand; it costs
about 0.16s per process.

## Application Ports

The maintainer's notes on the bar application's Ruby frontend and on the
static example are in [development](development.md#application-ports).
