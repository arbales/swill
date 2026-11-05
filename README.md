# Swill

Swill is a Cocoa-inspired, highly object-oriented, partially (largely?) vibe-coded,
anti-vogue, high-personality, delightfully comfortable, excellent, bad-idea,
browser UI framework.

[Documentation](https://arbales.github.io/swill/)

Applications use HTML, controllers, and observable models. Bindings connect
elements to object properties; actions and keyboard events travel through a
responder chain. Controllers manage regions of the page, including lists,
forms, windows, and dialogs.

The framework is implemented in Ruby, typed with Sorbet, and compiled to
JavaScript by Ruby2JS. Applications can be written in Ruby or in plain
JavaScript against the same framework.

There's also a [Distributed Objects](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/DistrObjects/DistrObjects.html)
inspired Data layer, and some more traditional JSON Model classes you can use to
communicate with a server. You will almost certainly not like the Distributed
Object model system!

## Why!?

I don't enjoy Javascript at all anymore, and this project might be evidence of
that. I also don't enjoy passing HTML fragments around, because I've tried that
and its confusing. Nor do I want my side projects to smell, taste or have a hint
of anything React.

## A Little Example

```ruby
class Hello < Swill::Controller
  # Binds two-ways to stuff!
  property :name, type: String, default: "world"

  # Computed properties will automatically update the UI!
  property :greeting, type: String do
    "Hello, #{name}!"
  end
end
```

```html
<main controller="Hello">
  <h1 bind="greeting"></h1>
  <label>Name <input bind="name"></label>
</main>
```

## Getting Started

### Ruby

Ruby applications need Ruby 3.2+, Bundler, and the standalone `esbuild`
binary. Install [the gem and its Ruby2JS dependency](https://arbales.github.io/swill/doc/getting_started_md.html#installing-as-a-gem),
then create an application:

```sh
bundle exec swill new hello
cd hello
bundle install
bundle exec swill dev
```

Open http://localhost:9292.

Running `swill dev` will automatically rebuild your client and server it via Rack.

For an existing Rack application, `bundle exec swill init` adds a client
skeleton and build configuration. See [Serving](https://arbales.github.io/swill/doc/serving_md.html) for integration
with Roda, Sinatra, or Rack.

The compiler does fancy things to support Ruby syntax and constucts and leverages
Sorbet type information where available to be as precise and performant as possible.

### Plain JavaScript

You can use Swill without Ruby or the compiler as a Javascript file.
You **can't** get Swill from NPM or use NPM. I don't like the contemporary
JavaScript ecosystem.

```html
<html>
<head>
  <title>Hello</title>
  <link rel="stylesheet" data-swill-theme href="/assets/resources/swill/linear.css">
</head>
<body>
  <main controller="Hello">
    <h1 bind="greeting"></h1>
    <label>Name <input bind="name" autofocus></label>
  </main>
  <script src="/assets/swill.js"></script>
  <script src="/assets/hello.js"></script>
</body>
</html>
```

[Getting Started in JavaScript](https://arbales.github.io/swill/doc/javascript_getting_started_md.html)
covers loading the framework and writing the page's controller.
