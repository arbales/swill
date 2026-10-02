# Slim markup (optional)

Add `gem "slim"` to the application's Gemfile, then `require "swill/slim"` where
the application renders templates. Swill does not load Slim by default. The
same renderer can produce an HTML file during a build or render a response on
the server; it has no dependency on a particular web framework.

```ruby
template = Swill::Slim.from_file("views/toolbar.slim", namespace: "Movies")
html = template.render(self, title: "Movies")
```

A template compiles when it is created and can render again with different
locals. Create a new instance after changing its source in development. For
an inline template, use `Swill::Slim.from_source(source, namespace: "Movies")`.

Capitalized tags name client classes. An unqualified name is relative to the
configured application namespace; names beginning with `Swill::` or the
application namespace stay as written. The adapter emits a real HTML element
with `klass` naming the client class:

```slim
section window="toolbar"
  Menubar.toolbar outlet="menubar" element="header"
    Swill::Control::Button action="new_movie" hidden~="guest" New Movie
```

This produces a `header` with `klass="Movies::Menubar"` and a `button` with
`klass="Swill::Control::Button"`, `data-action="new_movie"`, and
`bind-hidden="guest"`. The browser determines whether `klass` names a
Controller or View subclass when it awakens the element. Existing `controller`
and `klass` markup works as before, including a View `klass` alongside an
explicit `controller`.

Without `element`, a class tag uses `div`, except for the built-in Button,
TextField, Select, and ImageView controls, which use `button`, `input`,
`select`, and `img`. On class tags, `action` abbreviates `data-action`;
ordinary tags keep their native `action` attribute. On any tag, a quoted
attribute ending in `~` abbreviates a client binding (`disabled~="busy"`
becomes `bind-disabled="busy"`). Its value is a literal client path: Ruby
expressions and interpolation are rejected. Other Slim Ruby expressions retain
their normal server-rendering behavior.
