# Serving

A Swill application is a page, two scripts, the framework's resources, and
sometimes a data connection. `Swill::Server` serves all of it as one Rack
application, or as parts a Roda, Sinatra or plain Rack application you already
have mounts where its router puts things.

This guide covers the server as a whole, mounting its parts, and the page
helpers. See [Resources](resources.md) for what the bundles hold,
[Server Data](server_data.md) for the data connection, and the `Swill::Server`
and `Swill::Bundles::Page` class references for member details.

## One Server

```ruby
# config.ru
require "swill/server"

run Swill::Server.new(
  assets: {url: "/assets", directory: "public/assets", bundles: ["app"]},
  data: {schema: Swill::Distant::Schema.discover, authenticate: ->(env) { ... }},
  pages: {"/" => "pages/index.html.erb"}
)
```

`assets` names where `swill build` wrote the application's bundles and the URL
they are served at; the framework's bundle comes from the gem, so nothing is
copied. `data` is the keywords for a `Swill::Distant::Connection`, a
connection, or nil for an application without data. `pages` maps paths to
ERB templates, rendered with the page helpers as `swill`. `development` is
the revision file `swill dev` writes, `SWILL_DEVELOPMENT_STATE` by default;
set it to nil in production.

## Mounting the Parts

An application with a router of its own takes the parts it wants:

| Part | What it is | Mount it |
| --- | --- | --- |
| `assets_app` | A `Swill::Bundles::Server` for the scripts and resources | at `assets_url` |
| `data_app` | The `Swill::Distant::Connection`, or nil | at `data_path`, `/data` by default |
| `use_in(builder)` | The development middleware, when the server is in development | in `config.ru`: `SWILL.use_in(self)` |
| `helpers(env)` | The page helpers for a request | from a view |

Roda:

```ruby
SWILL = Swill::Server.new(assets: {url: "/assets", directory: "public/assets"}, data: {...})

class App < Roda
  include Swill::Bundles::Helpers
  route do |r|
    r.on("assets") { r.run SWILL.assets_app }
    r.on("data") { r.halt SWILL.data_app.call(r.env) }
    r.root { view :index }
  end
end
```

Sinatra: `SWILL.use_in(self)` in `config.ru`, `helpers Swill::Bundles::Helpers`
for the views, and the two apps mounted with `map` in `config.ru`. Plain Rack:
`Rack::Builder` with `map(SWILL.assets_url) { run SWILL.assets_app }`, which is
what `Swill::Server#to_app` builds.

## Initializing an Existing Application

`swill init` writes `client/` and `swill.yml`, never the existing server or
pages. Like `swill new`, its defaults are `/assets` and `public/assets/`:

```ruby
# In the application's boot file, before its views render:
require "swill/server"
SWILL = Swill::Server.new(
  assets: {url: "/assets", directory: "public/assets"}
)

# In config.ru, after loading the application's boot file:
SWILL.use_in(self)
map("/assets") { run SWILL.assets_app }
map("/") { run App } # your existing Roda, Sinatra, or Rack app
```

Rack dispatches `/assets/*` to Swill before the existing application
sees it. This reserves the whole prefix, including Swill's 404s; the
application's other routes and static files are unchanged. If Sinatra's
public folder or Roda's Assets plugin already serves files under `/assets`,
do not reserve the prefix with this Rack mount unless you intend to replace
those routes. Choose another unused URL or share the prefix in the application's
router. For example, Roda can serve its own assets first, then delegate
unmatched asset requests to Swill:

```ruby
# In the Roda app, instead of map("/assets") in config.ru:
route do |r|
  r.assets
  r.on("assets") { r.run SWILL.assets_app }
  r.root { view :index }
end
```

The URL and disk directory are independently configurable. Check for existing
`public/assets/app.js` and resource files before building; if they collide,
change the asset directory and the output path in `swill.yml` together.
`init` never changes either default automatically.

In the view, write `SWILL.helpers(request.env).head(theme: "linear")`
unescaped, then its `stylesheet_tag("app")` for the client stylesheet.
Name the generated application's class on `body` and its controller on the
relevant region, as the command prints. For ERB use `<%= ... %>`; for
autoescaping Erubi use `<%== ... %>`. Add `/public/assets/` and `/tmp/`
to the application's ignore rules. No dependency or ignore file is edited by
`init`.

## The Page Helpers

`Swill::Bundles::Helpers` gives a view context `swill`, the page helpers for
the server created first (`Swill::Server.default`). A template writes its head
with them:

```erb
<head>
  <title>My App</title>
  <%== swill.head(theme: "linear") %>
  <link rel="stylesheet" href="/assets/app.css">
</head>
```

`head` writes, in order, the development meta tag (nothing outside
development), the theme link marked `data-swill-theme`, and the script tags,
the framework's first. Each is also its own helper: `development_metadata`,
`theme_link(name)`, `script_tags`, `stylesheet_tag(name)` and
`image_tag(name)`. The tags are
HTML, so an engine that escapes output, such as Roda's Erubi, writes them with
`<%==`; Ruby's ERB, which renders a `Swill::Server` page, with `<%=`.

The browser reads the development meta tag itself: `Swill::Application`
polls the endpoint for new builds, and a page without the tag never polls.
The data connection is configured in the application's code, with
`Swill::Distant::Client.configure`; see
[Server Data](server_data.md#connecting). The helpers are one way to write
the tags; a page may write them itself.
