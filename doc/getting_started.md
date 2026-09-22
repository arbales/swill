# Getting started

## Building an application

The `swill` command compiles an application against the framework and
bundles it into one script that reads the framework from the page:

```sh
exe/swill build frontend            # frontend/app.rb, output frontend/dist/app.js
exe/swill build frontend/app.rb --out public/assets/app.js --with-framework
exe/swill watch frontend            # rebuild as the sources change
```

The entry file's `require_relative` lines name the sources in order, as they
would on MRI; the compiler treats those lines as inert. The page loads
`swill.js` (from a CDN, or the copy `--with-framework` places beside the
output) before `app.js`, and names its application with
`<body application="...">`. `esbuild` must be on the path; a source map is
written beside the output.

## Installing as a gem

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
(`node frontend-ruby/spec/browser_check.mjs`). Its `PORT.md` lists every
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

