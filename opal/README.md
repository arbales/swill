# Swill, Again

This is the small Opal experiment. It is not a gem and does not need to become one.

## Build

```sh
cd opal
bundle install
bundle exec rake
```

This writes:

- `dist/swill.js`: the framework and Opal runtime.
- `examples/static/dist/app.js`: only the example application.

Open `examples/static/index.html` through the repository development server.

## Shape

Markup names ordinary Ruby constants:

```html
<main controller="HelloController">
```

`Swill::Awakening` resolves that with `Object.const_get`; there is no class registry. Controllers own their markup subtree, `data-action` walks the responder chain, and `bind` connects elements to observable controller properties.

```ruby
class HelloController < Swill::Controller
  property :message, default: "Hello."
end
```

The first pass intentionally omits models, windows, restoration, outlets, collection controls, and clever binding paths. Those can earn their way back.

## Server Alignment

Roda and the browser may share plain Ruby definitions for names, validations, serialization, and route conventions. Sequel datasets, persistence, transactions, and authorization stay on the server. Sharing language is useful; pretending the browser has a database is not.
