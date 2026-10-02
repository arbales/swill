# Resources

Bundles give the framework and your application a place for images, templates,
stylesheets and other files, found by name and loaded only when a page uses
them.

This guide covers what a bundle is, how its resources are named and found,
how their contents load, images and the image control, stylesheets, and the
server's view of the same bundles.

See [Controls](controls.md) for control templates, and the `Swill::Bundle`,
`Swill::Image` and `Swill::Control::ImageView` class references for member
details.

## Bundles

A bundle is a compiled script and the folder of resources beside it. The
framework is one bundle, named `swill`; an application built with `swill
build` is another, named for its script, so `app.js` is `app`. Each keeps its
files in `resources/<name>/` beside its script:

```text
assets/
  swill.js
  app.js
  resources/
    swill/Warning.svg  controls.html  linear.css  bioplastic.css  fonts/
    app/Poster.png  icons/Star.svg  rows.html
```

An application's resources are the `resources/` folder beside its entry file.
`swill build` copies it, subfolders and all, to `resources/<name>/` beside the
script it writes, and `--with-framework` (or `framework: true` in `swill.yml`)
copies the framework's beside `swill.js`. The framework's own come from the
gem's `rb/dist/resources/swill/`.

As its script loads, a bundle registers itself: its name, the folder its script
was served from, and its manifest, the list of files in its folder. The script
carries no file contents beyond what the build embeds (see
[Loading contents](#loading-contents)), so a folder of hundreds of images costs
a page one line each in the manifest. Resources are served from wherever the
script is, a CDN included; assign `base_url` to serve them from elsewhere.

`Bundle.main` is the application's bundle and `Bundle.framework` the
framework's. `Bundle.named` finds either by name.

## Names

A resource is named by its path in the folder without its extension:
`Poster.png` is `Poster`, and `icons/Star.svg` is `icons/Star`.
`url_for_resource` answers where it is served:

```ruby
bundle = Swill::Bundle.main
bundle.url_for_resource("Poster")               # ".../resources/app/Poster.png"
bundle.url_for_resource("icons/Star", "svg")    # ".../resources/app/icons/Star.svg"
bundle.url_for_resource("Missing")              # nil
```

Without an extension, a name more than one file carries raises rather than
choosing between them; give the extension to pick one. Two files whose paths
differ only in case fail the build, since not every file system tells them
apart. `resource?` answers whether a bundle has a resource.

Names are looked up in the application's bundle first, then the framework's,
so an application can supply its own `Warning` image or its own control
templates.

## Loading Contents

`load_resource` fetches a resource's text once and keeps it; `loaded_resource`
answers the kept text, or nil when it has not been loaded:

```ruby
notes = await Swill::Bundle.main.load_resource("notes", "md")
```

This is the one way a resource's contents arrive. The build embeds each
bundle's HTML files in its script, so controls find their templates without
waiting, but an embedded file is only a load that has already happened: it is
kept exactly as a fetched one would be, and read the same way.

## Templates

Control templates live in HTML catalogs among a bundle's resources. A catalog
is a file of named `<template>` elements; the framework's is `controls.html`.
`Control#load_template` looks a name up through the bundles' loaded catalogs,
the application's first, and parses each catalog once per document. A catalog
that is listed but not loaded raises when a template is needed, naming the
`load_resource` call that would load it. See
[Controls](controls.md#templates-and-lifetime).

## Images

`Swill::Image.named` finds an image by name, trying `svg`, `png`, `webp`,
`jpg`, `jpeg` and `gif` in that order, in the application's bundle and then the
framework's, and answers nil when neither has one. `Swill::Image.new` takes any
path or URL:

```ruby
Swill::Image.named("Warning")          # the framework's
Swill::Image.new("/posters/42.jpg")
```

`Swill::Control::ImageView` shows one through an `<img>`, and the browser loads
it only then. Its value is the image; `image` names one in markup, and `bind`
can supply an image, a name or a URL:

```html
<img klass="Swill::Control::ImageView" image="Warning" alt="">
<img klass="Swill::Control::ImageView" bind="@movie.poster" alt="">
```

A name no bundle has raises as the element awakens. A bound string is looked up
as a name first and otherwise used as a URL; nil removes the image. An image
shown through an `<img>` is sized by CSS, and its colors are its own.

## Stylesheets

A page links the stylesheets it uses, the framework's theme among them (see
[Themes](#themes)).

`Bundle#add_stylesheet` links one while the application runs, once per
document, and answers a promise that settles when it loads:

```ruby
await Swill::Bundle.main.add_stylesheet("themes/dark", application.root.ownerDocument)
```

## Themes

A theme is one of the framework's stylesheets, styling the page, its native
controls and everything the framework draws: windows, alerts, lists and the
controls' templates. The framework has two:

- **Linear**, `linear.css`: dark and flat.
- **Bioplastic**, `bioplastic.css`: light and bevelled, with pinstriped window
  title bars, set in Atkinson Hyperlegible Next. The font is among the
  framework's resources, under `fonts/`, with its licence.

A page links its theme first, marked `data-swill-theme`, so an application's
own stylesheets can override it and the first paint is already right:

```html
<link rel="stylesheet" data-swill-theme href="/assets/resources/swill/linear.css">
<link rel="stylesheet" href="/assets/app.css">
```

`Application#theme` answers the linked theme's name, read at launch from the
link's file name. Assigning another name points the link at that theme, and a
name the framework has no stylesheet for raises:

```ruby
application.theme = "bioplastic"
```

Both themes define the same variables, so an application styled with them
reads correctly in either: `--bg`, `--fg`, `--dim`, `--bright`, `--accent`,
`--selected` and `--rule`, and the semantic `--positive`, `--caution` and
`--negative`. A list's columns are `--list-columns`.

A window presented with `Application#show_window` or `present_window` gets a
title bar showing its content controller's `title`, kept in step as the title
changes. Linear hides it; Bioplastic shows it. A window's default button,
marked with the `default` class, takes focus as the window opens and Enter
presses it from anywhere in the window; an alert's first button is its default
(see [The Key View Loop](responders.md#the-key-view-loop)). Bioplastic draws a
focused button in a ring, and the default button wears it however focus came.

## On the Server

`require "swill/bundles"` gives a server the same bundles, so a template
rendered there writes the URLs the browser would resolve.
`Swill::Bundles::Bundle` describes one by its name, the directory its script
and `resources/` are in, and the URL they are served at;
`Swill::Bundles::Catalog` searches bundles in the browser's order and writes
tags:

```ruby
framework = Swill::Bundles::Bundle.framework(url: "/assets")
app = Swill::Bundles::Bundle.new(name: "app", directory: "public/assets", url: "/assets")
bundles = Swill::Bundles::Catalog.new(app, framework)

bundles.script_tags                     # swill.js, then app.js
bundles.stylesheet_tag("linear")
bundles.image_tag("Poster", alt: "Poster")
bundles.image_tag("Poster", view: true) # awakens as a Control::ImageView
bundles.template("card")                # a template's HTML, to render in place
```

An unknown name raises, so a template naming a missing image fails where it
renders.

`Swill::Bundles::Server` is a Rack application that serves bundles' scripts
and resources from where they are, for an application that would rather mount
them than copy them into its public folder. It serves only the files the
bundles list:

```ruby
r.on("assets") { r.run Swill::Bundles::Server.new(app, framework) }
```
