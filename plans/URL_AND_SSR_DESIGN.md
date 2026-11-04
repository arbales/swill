# URL and server rendering design

## Status and intent

This is the plan of record for URLs and server rendering, adopted 3 November
2026. Build order is at the end; nothing here is built yet.

Restoration lives in the fragment today (`#main=movies,view=all,s=44;
toolbar.mode=owner`), through `URLFragment` and each window's content
controller's `restorable` declarations (see [lifecycle](../doc/lifecycle.md)).
A server never sees a fragment, so it cannot serve the page a link names, an
application's server routes and its client state are two unrelated things,
and the server renders a page whose windows are empty until the client fills
them.

URLs are not how the application works. It changes windows and selections
through its own API, as a Cocoa application does, and the URL is a reflection
of that state: something to reload from, and a link to hand the user. This
design makes these three URLs mean the same thing, and then asks what the
server can render for them:

```
/#main=movies,view=all,s=44;toolbar.mode=owner
/movies?view=all,s=44;toolbar.mode=owner
/movies/44?view=all;toolbar.mode=owner
```

Decisions: one grouped grammar (`,` and `;`), identical wherever it
lives; custom parsers on both sides, shared as one Ruby codec; no window is
special by name — the routed window is declared; an unscoped group head is
told from a scoped one by its dot, and the writer scopes whenever that would
be ambiguous; that convenience is configurable; the mount (`/` or `/app`) is
the server's and never hand-written in the page. The `&` syntax is a
same-semantics alternative, not pursued. Server rendering proceeds in three
steps, each useful alone and each the next one's prerequisite: a route-shaped
page, then data preload, then the client's own templates rendered on the
server and adopted by the client ([Part 2](#part-2-server-rendering)). Running
the compiled application on the server and server-driven fragments were
considered and set aside ([abandoned](ABANDONED.md)).

## Part 1: URLs

### The grammar

```
state := group (";" group)*
group := head ("," key "=" value)*
head  := window "=" content         a window's content name
       | window "." key "=" value   a window's key
       | key "=" value              the routed window's key (path mode only)
```

Groups are a writing convenience, not structure. These are the same state:

```
main=movies,toolbar=1,foo=bar
main.toolbar=1;main=movies;main.foo=bar
```

Order is free; the writer sorts windows and keys and writes a window's state
together, as now. Values are the existing codec's, unchanged: arrays `(1,2)`,
`ids=()` empty array, `q=` empty string, `labels=('')`, nil omitted, names and
values percent-encoded individually with `(`, `)` and `'` escaped, `%20` for
space and `+` literal, malformed groups ignored, an invalid array rejected
whole.

**Where it lives.** Fragment mode: after `#`, as today. Path mode: after `?`,
with the routed window's content name in the path, optionally one of its keys
in the segment after it, and a presented window's name after that.

| | fragment mode | path mode |
| --- | --- | --- |
| the routed window's initial content | `/` | `/`, also `/movies` |
| another content of it | `main=watched` | `/watched` |
| its key declared `in: :path` | `s=44` | `/movies/44` |
| its other keys | `main=movies,view=all` | `view=all`, or `main.view=all` |
| a presented window declared `path` | `edit-movie.id=44` | `/movies/44/edit` |
| every other window | `toolbar.mode=owner` | `toolbar.mode=owner`, `toolbar=compact` |

**Reading a head.** The first dot in a group's head names a window. A head
with no dot is the routed window's key, unless its name is a window's, in
which case it is that window's content (`toolbar=compact`). The writer leaves
the routed group unscoped only when that reading is unambiguous: every key
undotted and none a window's name. Otherwise it scopes the group:

```
/movies?main.movie_list.selected_object_id=44,view=all;toolbar.mode=owner
```

### Declaring the windows

Today a `[window]` container is a plain `Swill::Window`, and a presented
window is one made from its template. This design lets an application give a
window a class, so what a window is (routed, in the path, its segment) is
declared in Ruby beside the controllers, and markup only names it:

```ruby
module Movies
  # The routed window: its content name is the path, and its content's
  # restorable keys may be written bare. One per page.
  class MainWindow < Swill::Window
    routed
  end

  # A presented window that belongs in the path, as /movies/44/edit. Its
  # segment defaults to the window's name; `edit-movie` is given a shorter one.
  class EditMovieWindow < Swill::Window
    path "edit"
  end
end
```

```erb
<section window="main" klass="Movies::MainWindow" name="movies">
  <div controller="Movies::MainView">…</div>          <!-- / and /movies -->
</section>
<template for="window" name="watched">…</template>     <!-- /watched -->
<template for="window" name="edit-movie" klass="Movies::EditMovieWindow">…</template>
```

Markup alone also works, for a page with no Ruby of its own: `<section
window="main" routed>` and `<template for="window" name="edit-movie"
path="edit">`. A page that declares no routed window is in fragment mode,
which is what a static or CDN-served page stays in. Nothing is special about
the name `main`.

`klass` on a window container or window template names a `Swill::Window`
subclass to instantiate in place of `Swill::Window`; `routed` and `path` are
class settings on `Swill::Window`, as `endpoint` is on a model. This is the
one new mechanism in Part 1; windows otherwise behave as now.

### Declaring state

Nothing new reaches a controller except `in: :path`:

```ruby
module Movies
  class MainView < Swill::Controller
    property :movie_scope, type: String, default: "all"
    restorable :movie_scope, key: :view
    # The selected movie's id is the segment after the content name:
    # /movies/44. At most one path key per class; scalar types only.
    restorable "movie_list.selected_object_id", key: :s, in: :path
  end

  class MovieForm < Swill::Controller       # the edit-movie window's content
    restorable :movie_id, key: :id          # edit-movie.id=44 in fragment mode
  end

  class Menubar < Swill::Controller
    restorable :mode                        # toolbar.mode=owner, in either mode
    restorable :theme
  end
end
```

Values restore through these declarations whichever part of the URL carries
them, with the same typing and `controller_did_restore` as now. The history
rules are as now: a content change pushes, a key's change replaces; a window
in the path pushes when presented and replaces when dismissed.

### Restoring a presented window

Today a presented window writes its keys to the fragment but is not reopened
from it on reload. A window declared `path` (or whose keys appear in the
fragment) is: at launch, after the containers restore, the application
presents it and restores its content's keys, so `/movies/44/edit` opens the
editor on movie 44 as the user left it. The window's content controller
receives its state as any content does; the application does nothing.

### Links

The application never navigates by URL. It changes content with
`load_window_content`, presents windows with `show_window`, and selects
through its lists; the URL follows. What it needs from URLs is a link to give
the user:

```ruby
# A hash key is the routed window's key; a window's name takes that
# window's keys as a hash, or its content as a string.
application.url_for(id: 44, view: "all")          # => "/movies/44?view=all"
application.url_for("watched", view: "all")       # => "/watched?view=all"
application.url_for(toolbar: {mode: "owner"})     # => "/?toolbar.mode=owner"
application.url_for(toolbar: "compact")           # => "/?toolbar=compact"
application.url                                   # the current one, to copy
```

```erb
<a bind-href="movie_url">Permalink</a>   <!-- a computed property on the row -->
```

A link the server renders (`swill.url_for`, below) is an ordinary link: the
page loads and restores. There is no in-page interception of links.

### Scoping

```ruby
class Application < Swill::Application
  # Which window each key is written under. :implicit, the default, leaves
  # the routed window's keys bare when that is unambiguous (?view=all);
  # :explicit writes every key with its window (?main.view=all).
  url_scope :explicit
end
```

### Plain JavaScript

```js
class MainWindow extends Swill.Window { static routed = true; }
class EditMovieWindow extends Swill.Window { static path = "edit"; }
class MainView extends Swill.Controller {
  static properties = {movieScope: {default: "all"}};
  static restorable = {
    movieScope: "view",
    "movieList.selectedObjectId": {key: "s", in: "path"}
  };
}
Swill.register(MainWindow); Swill.register(EditMovieWindow); Swill.register(MainView);
Swill.start();
Swill.Application.shared().urlFor({id: 44, view: "all"});
```

### The server's side of a URL

The server learns the windows and contents from the page it serves (the
build never parses page markup; window templates live in the page). It scans
the template text for `[window]` containers, their `klass` or `routed`, the
window templates and their `path`, re-reading when the file changes; what a
Ruby window class declares comes from the compiled metadata (the same `meta`
the client installs). The state codec is the same Ruby the client compiles,
so both sides parse one way.

With `routes: {"/" => template}` and the page above:

| request | content | id | window | the page is rendered with |
| --- | --- | --- | --- | --- |
| `/` | `movies` (initial) | | | the initial content |
| `/movies` | `movies` | | | the same |
| `/movies/44?view=all` | `movies` | `44` | | the list, selection 44, scope all |
| `/movies/44/edit` | `movies` | `44` | `edit-movie` | the list, and the editor presented on 44 |
| `/watched` | `watched` | | | the `watched` content in the routed window |
| `/nothing` | | | | 404 |

Mounted under `/app`, every path above follows `/app`; `swill.head` writes
`<base href="/app/">`, which is how the client learns the mount
(`document.baseURI`), so neither the page nor the Ruby spells it.

**Rack:**

```ruby
# config.ru
run Swill::Server.new(
  assets: {url: "/assets", directory: "public/assets", bundles: ["app"]},
  routes: {"/" => "pages/index.html.erb"}   # or "/app"; `pages:` stays for exact paths
)
```

**Roda:**

```ruby
class App < Roda
  plugin :render, views: "views"
  plugin :swill, server: SWILL      # SWILL declares routes: {"/" => "views/app.erb"}
  include Swill::Bundles::Helpers

  route do |r|
    r.on("data") { r.halt SWILL.data_app.call(r.env) }
    r.on("api") { … }               # the app's own branches come first and win
    r.swill_page { view :app, layout: false }   # the rest: match, or 404
  end
end
```

**Sinatra:**

```ruby
helpers Swill::Bundles::Helpers
get "/*" do
  swill.route or halt 404
  erb :app
end
```

In a template, `swill.route` is the match (`content`, `id`, `window`,
`state`; nil when absent; strings, since the server has no declared types),
and `swill.url_for` builds the URLs the client would:

```erb
<a href="<%= swill.url_for("watched", view: "all") %>">Watched</a>
```

## Part 2: Server rendering

### What the client does with markup today

Swill is markup-first: controllers awaken on the DOM that is there. A
`[window]` container's `name` and first child are taken as its initial
content; a window template's content is cloned when it is shown; rows a list
finds in its markup are replaced as it awakens; a text binding writes
`textContent` on its first push, whatever the property holds. So a server
can already decide the *shape* of the page, but anything it fills with data
is thrown away (rows) or overwritten with nothing (a bound element whose
property is still nil) until the client's own data arrives over `/data`.
Movies keeps a second, hand-written row template (`views/_row.erb`) for its
server-rendered page, which is the duplication a rendering design must end.

### The approaches

**A. Route-shaped page.** The template reads `swill.route` and renders the
right content in the routed container, and the presented window's markup,
with no data. The client awakens what is there. First paint has the right
structure and empty lists; data arrives as now.

- Needs: Part 1; `swill.template(name)` (writes a window template's content)
  and `swill.present(name)` (writes a presented window the client adopts as
  presented instead of cloning). Nothing in the client beyond adopting a
  pre-presented window.
- Costs nothing at runtime; duplicates nothing.

**B. Data preload.** The server embeds the records the page needs, in the
schema's own encoding, and the client seeds its Distant pool from them
before awakening, so the first query is already answered and the first push
of every binding has its value. No markup is filled on the server.

```erb
<%= swill.preload(Movie.where(watched: false).limit(50), selected: route.id) %>
```

```html
<script type="application/swill-data">…records, by class and id…</script>
```

- Needs: the Distant codec on the server (exists: the WebSocket encodes
  records today); `Distant::Client` reading an inline snapshot at launch and
  installing it as if received; a query that finds its results already in
  the pool and reports them without a round trip (the query freshness
  contract in [the data plan](DATA_PLAN.md) decides whether it still refreshes).
- First paint still has empty rows until the client renders them, but no
  network wait, and no flash of blanked text. Privacy and authorization go
  through the same dispatcher as a request would.

**C. Bound markup rendered on the server.** The server renders the client's
own templates against the client's own models: a row template's `bind="title"`
is evaluated on the server with the same key-path rules, for each record,
and the client *adopts* the result rather than replacing it. One template,
one model, both sides.

```erb
<section window="main" klass="Movies::MainWindow" name="movies">
  <div controller="Movies::MainView">
    <table controller="Movies::MovieList" bind="movies">
      <tbody outlet="rows">
        <%= swill.render_rows(movies, selected: route.id) %>   <%# the list's own row template %>
      </tbody>
      <template for="row">…</template>
    </table>
  </div>
</section>
<% if route.window == "edit-movie" %>
  <%= swill.present("edit-movie", Movie[route.id]) %>         <%# the form, bound to the movie %>
<% end %>
```

- Needs, on the server: a renderer that walks a template and applies
  `bind`, `bind-*`, `transform` and `for="row"` against a Ruby object with
  the client's key-path semantics (`nil?`, `empty?`, `present?`, `@` roots).
  The objects are the generated client models loaded on MRI (they load
  today: `spec/shared_test.rb` requires `Distant::Object` and the generated
  classes), filled from Sequel rows through the same schema, so names, types
  and transformers are the client's. Actions, outlets and events are not
  rendered; they are the client's.
- Needs, on the client: **adoption**. A list that finds rows marked with their
  object ids reconciles them by identity instead of clearing (the list
  rendering item in [the framework plan](FRAMEWORK_PLAN.md) is this work);
  a binding whose property is still nil leaves pre-rendered content until a
  value arrives, or, with B, never sees nil. C therefore builds on B: the
  preload supplies the objects the adopted rows bind to.
- First paint is the finished page. The cost is the server renderer, a
  second implementation of binding evaluation (small, string-based, no
  DOM), kept honest by a fixture both sides render.

**D. Running the compiled application on the server.** Execute `swill.js`
and `app.js` in a server-side JavaScript runtime against a DOM
implementation, let the application awaken and fetch, serialize the
document, and hydrate on the client. One implementation of everything.

- Needs a JavaScript runtime in the Ruby process or beside it (mini_racer,
  Deno), a DOM for it (the test DOM in `spec/dom.mjs` is a start, not a
  browser), the application's data path running server-side (the Distant
  client talking to its own dispatcher in-process), and hydration that maps
  a serialized document back onto live objects.
- Rejected for now: it brings the Node-shaped toolchain Swill has avoided,
  the framework assumes a browser (history, focus, layout), and the
  rendering it would give is C's result at far higher cost. Recorded so it
  is not re-proposed without new reasons.

**E. Server-driven fragments.** The server renders HTML fragments and pushes
them into the page over SSE, as Movies' Datastar page does.

- Not Swill's model: state and bindings live in the client's objects, and a
  fragment pushed from outside bypasses them. Not pursued.

### Comparison

| | first paint | waits on network | duplicated code | server needs | client needs |
| --- | --- | --- | --- | --- | --- |
| A route-shaped | right shape, empty | yes | none | `template`, `present` | adopt a presented window |
| B preload | right shape, empty | no | none | Distant snapshot | pool seeding, query short-circuit |
| C bound markup | finished | no | renderer (fixture-checked) | B + renderer, models on MRI | B + adoption, row reconciliation |
| D run the app | finished | no | none | JS runtime, DOM, in-process data | hydration |
| E fragments | finished | per fragment | templates | SSE | bypasses bindings |

### Decision

A, then B, then C: each is useful alone and each is a prerequisite of the
next. A is Part 1's natural end. B is the larger win for less: it removes
the wait and the flash and touches no markup. C ends the duplicate row
template and gives a finished first paint, and its client half (row
reconciliation, binding adoption) is work the framework plan wants anyway.

### What each needs, in order

1. **A.** `Bundles::Page#template` and `#present`; the client adopting a
   window already in the page as presented (the `isConnected` check in
   `present_window` becomes "adopt"); the Movies page rendering its content
   from `swill.route`.
2. **B.** `Page#preload(records, **state)` encoding through the schema's
   codec with the dispatcher's privacy rules; `Distant::Client` reading the
   inline snapshot before launch; `fetch` answering from the pool without a
   round trip, per the freshness contract; a browser test that a preloaded
   page makes no `/data` request before interaction.
3. **C.** `Swill::Bundles::Renderer`: key-path reads (`rb/runtime/paths` on
   MRI, or a string-level equivalent), `bind`/`bind-*`/`transform`/`for="row"`;
   `Page#render(template, object)`, `#render_rows(objects, selected:)`,
   `#present(name, object)`; rows carrying their object id; `List` adopting
   rows by id (reconciliation); bindings leaving pre-rendered content on an
   initial nil; a fixture rendered on both sides and compared.

## What the pieces are

- **`Swill::URLState`** (`rb/framework/core/url_state.rb`): the string codec,
  extracted from `URLFragment`. Pure Ruby over strings, compiled for the
  client and loaded on MRI by the server; MRI gets `encodeURIComponent` and
  `decodeURIComponent` shims in `rb/runtime/runtime.rb` (the encoder already
  exists as `Bundles::Manifest.encode_component`).
- **`Swill::Window` classes**: `klass` on a container or window template;
  `routed` and `path` as class settings; metadata emitted for the server.
- **`Swill::URLLocation`** (replaces `URLFragment`): mode, base from
  `document.baseURI`, the routed window, its content, path key and presented
  window; reads the state from the hash or the search; writes the state
  string in place and the path for content, id and window; `url_for`;
  `popstate` as now.
- **`Application`**: the routed container and its content from the path
  before awakening (where `requested_content` reads `params["main"]` today);
  `load_window_content` pushes the path for the routed window; presented
  windows restored at launch, or adopted when the server rendered them;
  `url_scope`; `url_for`, `url`.
- **`restorable(path, key:, in:)`**: the macro, MRI declaration, reflection,
  emitted meta, runtime install and JS `static restorable` accept `in:`; the
  compiler rejects a second path key or a non-scalar one.
- **`Swill::Bundles::Routes`**: scans a page template and the compiled
  metadata; `match(path, query)` answers `Route{content, id, window, state}`
  or nil; `url_for`.
- **`Swill::Server`** `routes:`; `swill.head` writing `<base>` when mounted;
  **`Bundles::Page#route`, `#url_for`, `#template`, `#present`**, then
  `#preload`, then `#render` and `#render_rows`; the **Roda plugin**
  `rb/swill/server/roda.rb` (Roda a development dependency, for its test);
  Sinatra documented.
- **`Swill::Bundles::Renderer`** (C) and the Distant snapshot (B).
- **Docs**: `doc/lifecycle.md` (the grammar, the three forms, the head rule,
  `in: :path`, window classes), `doc/serving.md` (Rack, Roda, Sinatra,
  rendering), `doc/plain_javascript.md`, the scaffold page.

## Build order

1. The codec as shared Ruby, with one fixture (`spec/fixtures/url_state.json`)
   run on MRI (`spec/shared_test.rb`) and JS (`spec/runtime_test.mjs`), on the
   pattern of the existing "codecs agree with MRI" test: the three forms,
   scoped and unscoped heads, content and key heads, arrays, escapes,
   malformed groups.
2. Window classes (`klass`, `routed`, `path`) and `in: :path` through the
   declaration chain.
3. `URLLocation` and the application changes, presented-window restoration;
   browser tests for restoring from a path, pushing on content change and
   presentation, back and forward.
4. The server: `Routes`, helpers, `Swill::Server routes:`, `<base>`, the
   Roda plugin; `bundles_test` for the path table above and the helpers; a
   Roda test. This is rendering approach A.
5. Movies: the Ruby page at `/` (or `/app`), `MainWindow` and
   `EditMovieWindow`, `in: :path` on `s`, the page shaped by `swill.route`.
6. Rendering B, then C, as above; Movies drops `views/_row.erb`.

## Open questions

- Nested contents extending the path (`/movies/44/cast`): start flat.
- Whether `route.id` should be typed on the server from the compiled meta;
  strings first.
- B: whether a query whose results were preloaded still refreshes once, and
  how a preloaded snapshot expresses partial fields and privacy nils (the
  same way a response does, presumably).
- C: how far the server renderer follows key paths through associations
  (`author.name`), and whether `klass`-created controls (segmented, select)
  are rendered on the server or left to the client.
- Whether `<base>` is acceptable: it changes how every relative URL on the
  page resolves. Swill's own URLs are absolute; a page with relative links of
  its own would feel it.
