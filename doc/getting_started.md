# Getting Started

This guide covers starting an application with `swill new`, developing it
with `swill dev`, building with the `swill` command, the `swill.yml` project
file, and installing Swill as a gem.

## A New Application

```sh
bundle exec swill new hello
cd hello
bundle install
bundle exec swill dev
```

Then open http://localhost:9292: a page greeting the name typed into it.
`swill new` writes a `Gemfile`, a `swill.yml`, a `config.ru` that serves the
page and the bundles with `Swill::Server` (see [Serving](serving.md)), the page
in `pages/index.html.erb`, and the client in `client/`: `app.rb` lists its
sources, `application.rb` and `controllers/hello.rb` are the application, and
`client/resources/` holds its stylesheet. `--data` adds `server/server.rb`, a
server entry for [Distant Objects](server_data.md). A directory that already
has files is refused.

An existing application adds a `swill.yml` beside its own server, as below;
`swill dev` runs that server's `config.ru`.

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
`swill.js` (from jsDelivr, as in [Getting Swill](javascript_getting_started.md#getting-swill),
or the copy `--with-framework` places beside the output) before `app.js`, and names its application with
`<body application="...">`. The framework launches the named application on
`DOMContentLoaded` and terminates it on a `pagehide` whose `persisted` flag is
false; a persisted `pagehide` means the page may return from the back-forward
cache. `Swill::Application#browser` is the window, for `prompt` and `print`.
`esbuild` must be on the path. A source map is written beside the output.

## Project Workflow

`swill.yml` at the project root says what to build and watch. All paths are
relative to that file, even when the command is invoked from another
directory:

```yaml
server: server/server.rb        # optional: the Distant data entry
client: client/app.rb
out: public/assets/app.js
framework: false                # true copies swill.js beside the output
types: false                    # or a directory for Sorbet artifacts
watch:
  client: ["client/**/*.rb"]
  resources: ["client/resources/**/*"]
  schema: ["server/**/*.rb"]
  server: ["config.ru", "lib/**/*.rb"]
  pages: ["pages/**/*"]
assets:
  - watch: ["assets/css/**/*.css"]
    run: ["esbuild", "assets/css/app.css", "--bundle", "--outdir=public/assets"]
dev:
  port: 9292
  server: auto
```

```sh
bundle exec swill dev           # build, serve, and rebuild on edits
bundle exec swill dev --once    # build and serve once, then exit
bundle exec swill build         # build once, without a server
```

`swill dev` builds everything, starts the server, and then rebuilds only what
an edit affects, by the category of the file that changed:

| Category | On an edit |
| --- | --- |
| `client`, `resources` | The client is rebuilt (and its types, unless `types: false`) |
| `schema` | The data proxies are generated; the client is rebuilt if they changed; the server restarts |
| `server` | The server restarts |
| any other, such as `pages` | Nothing is rebuilt; the page is offered a reload |
| an `assets` entry | Its `run` command runs, in `chdir` when given |
| `swill.yml` itself | It is read again, and everything is rebuilt |

The installed framework bundle is watched too, and a new one is copied and the
client rebuilt. A `watch` that is a plain list of globs, or no `watch`, is one
category in which any edit rebuilds everything. The build's own outputs (the
generated data proxies, Sorbet artifacts, and the scripts and resources it
writes) are never watched, nor are `tmp`, `vendor`, `node_modules`, `build`
and `.git` folders.

The server is the project's `config.ru`: `dev.server` is `auto` (Falcon when
the bundle has it, else `rackup`), `falcon`, `rackup`, a command of its own as
an argument array, or `false`. It runs with `RACK_ENV=development` and
`SWILL_DEVELOPMENT_STATE`, the revision file `dev.state` names
(`tmp/swill-development.json` by default), which `Swill::Server` reads to turn
on the development reload. `--port`, then `PORT`, then `dev.port` choose the
port; `--no-server` builds and watches without one. Once a rebuild succeeds
and the server answers, the revision is published and the page offers to
reload; a failed step leaves it unpublished, and the page shows the build's
error after a reload (see [Development](#development)).

Each step runs in a fresh Ruby process, so edits to server models are
reflected on every rebuild. `server` is optional for applications without
distant data. `root` defaults to the configuration directory and controls
data generation. `out` defaults to `dist/app.js` beside the client entry.
`framework` defaults to true; `minify` defaults to false. `types` defaults to
the client entry directory; `false` skips type generation. Generation does not
run `srb tc`. An existing `sorbet/config` belongs to the application: update
its source list when adding client files, or remove it to regenerate the
default.

Keep the client Sorbet root separate from server Sorbet configuration. Data
generation also emits shims under `<root>/sorbet/rbi/shims/generated`; those
are for tooling contexts without the executable client proxies. Do not load
both representations of the same class into the client typecheck.

`before_build` runs argument arrays before every full build; `assets` entries
are the per-edit alternative. Both execute directly, without shell
interpolation. The optional `env` mapping supplies string environment
variables to the build steps (not the server). For example,
data generation always runs with `SWILL_SCHEMA_ONLY` set, which
`Swill::Distant.database` reads to generate without the database (see
[Server Data](server_data.md#generating)). Prefer a dedicated server entry
that loads model declarations without starting listeners or workers, or
making external service calls.

An explicit entry on the command line bypasses project discovery. With
`--project`, put build options in the file rather than mixing them with
command-line build flags. `--interval` controls watch polling, and `swill
watch` with a project is `swill dev --no-server`.

## Development

While you build, an application can show its problems as alerts rather than
leaving them in the console. Opt in with a `development` attribute on the
element that names the application:

```html
<body application="Movies::Application" development>
```

A page started from plain JavaScript passes `Swill.start({development: true})`,
and an application can set `development` itself before it launches. It is off by
default, so remove the attribute before deploying.

In development, an uncaught error or a rejected promise is shown in an alert
with the framework's Stop image, and the framework's own warnings, such as a
restorable path it cannot restore, with the Warning image. Each problem is
still logged. One alert shows at a time: problems that arrive while it is open
wait behind it, and one already showing or waiting is not shown twice.

A build that fails to compile is shown the same way. `swill watch`, and
`swill build --show-errors`, replace the application's script with one that
reports the compiler's message, so the page shows "The application failed to
build" with the error, rather than quietly running the last build that
worked. The command still fails, and no application launches until the source
compiles.

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
gem install ./swill-0.0.2.gem
```

The framework's interface is compiled from its sources on demand; it costs
about 0.16s per process.

## Application Ports

The maintainer's notes on the bar application's Ruby frontend and on the
static example are in [development](development.md#application-ports).
