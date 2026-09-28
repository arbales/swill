# Documentation Plan

## Goal

One reference for Swill, generated from its source: the guides in `doc/`, a
page for every class, and the hand-written JavaScript runtime, each readable as
Ruby or as plain JavaScript. The guides explain; the class pages are exact. No
page restates what another page owns.

## Current Baseline

`bundle exec rake rdoc` writes the site to `rdoc/`; `STRICT=1` fails on any RDoc
warning, and CI (`.github/workflows/docs.yml`) builds it that way.

### The generator

A custom RDoc 8 generator, `RDoc::Generator::Swill` (`-f swill`), in
`rakelib/swill_doc/`. Hanna is gone; RDoc is pinned to `~> 8.0` in the
Gemfile's development group, with Rouge for highlighting.

| File | Role |
| --- | --- |
| `rakelib/sorbet_rdoc.rb` | Parsing: Sorbet `sig`s become typed signatures; `property`, `outlet`, and `attribute` become documented declarations; implicit superclasses are named |
| `rakelib/swill_doc/generator.rb` | Writes class pages, guide pages, Ruby and JavaScript source pages, the JavaScript pages, `search_index.js`, and copies the assets and the UI build |
| `rakelib/swill_doc/page_helpers.rb` | Types, signatures, links, highlighting, Markdown |
| `rakelib/swill_doc/javascript_spelling.rb` | A class page's JavaScript spelling, from the compiler's interface |
| `rakelib/swill_doc/javascript.rb` | The runtime's JSDoc, read with `deno doc --json` |
| `rakelib/swill_doc/templates/` | `layout`, `class`, `page`, `source`, `javascript` |
| `rakelib/swill_doc/assets/` | `swill_doc.css`, `navigator.js`, IBM Plex fonts (`rake doc_fonts`) |

### Class pages

- Properties and outlets have their own sections ahead of the methods, with
  type, default, and "computed" or "optional" noted. `doc/declarations.md` and
  `rake declarations` were retired; the class page is the one place a
  declaration is documented.
- Superclass, includes, derivatives, and the defining files link to their
  pages; source pages are highlighted and line-anchored.
- Every reference to a code object renders as code, and links where it can.
- Sections with nothing in them are omitted.

### The template

Built from the Figma file "New Docs": IBM Plex Sans, Serif, and Mono; the
file's variables as CSS custom properties, light and dark; Atom One Light and
Dark for code. The design is the specification.

### The navigator

The left pane is a plain JavaScript Swill application running on the slim UI
build (`swill-ui.min.js`), which makes it the documentation's own test of that
build. Three `Swill.List`s show files, classes, and methods, filtered by one
query.

- Keys: `~` moves to the search; arrows move through every result in order;
  Enter opens the selection, or the first result; Escape abandons the query.
- The pane's width and the file and class indexes' heights are dragged and
  remembered across pages.
- The page index on the right scrolls on its own.

### Ruby and JavaScript

A switch on every page chooses the language; the choice is remembered, and is
posted as `language_did_change` for the navigator to follow.

- Read as JavaScript, a class page uses the compiler's interface, the record
  compiled output is written from: `Swill.List` for `Swill::Controller::List`,
  camelCase members, one signature per optional-argument variant, getters, and
  types in TypeScript notation (`T.nilable(String)` is `string | null`).
- The class index lists every class in Ruby. In JavaScript it lists only the
  classes JavaScript has a name for; the rest follow under a collapsed
  **Implementation** row, which opens by itself when a query matches inside it.
  The only way to show a class in the JavaScript index is to give it a name.

### Public JavaScript names

`JAVASCRIPT_NAMES` and `JAVASCRIPT_ROOTS` in `rb/compiler/names.rb` are the
single source for the `Swill` global, the browser build, and the
documentation. The rule, recorded above them: a class is named when plain
JavaScript subclasses it, constructs it, or calls its class methods. Machinery,
classes only ever handed to an application (`Window`, `Notification`), and
modules are not. Roots are the named classes a registered JavaScript class may
extend. Every class is also on the global under its generated identifier, which
compiled applications link against; that name is private by convention only.

This session exposed `Swill.Object`, `Swill.Button`, and
`Swill.Model.DistantClient`, and made `Object`, `Button`, `ValueTransformer`,
`Model.Base`, `Model.Resource`, and `Model.DistantObject` roots
(`spec/bundle_test.mjs` covers them).

### The runtime's JavaScript

Every member of `Swill.Runtime` and the `Swill` global's own functions carry
JSDoc, which `deno doc` reads to build `javascript/Runtime.html` and
`javascript/Swill.html` in the class pages' format. Groups on the Runtime page
come from the comments in the `Runtime` object literal.

### Guides

`doc/sorbet.md` is complete with filled-in examples; `doc/plain_javascript.md`
documents registration, the roots, and which classes JavaScript extends;
`doc/compiler.md` documents the compiler. `dom_boundaries.md` was deleted.

## Conventions

- **Voice.** Declarative, third person, present tense, after Cocoa's
  conceptual guides and Sequel's documentation. The concept before its
  benefits; no scare quotes around Swill's own terms; sentence-case headings.
- **Asides and TODOs in the guides are the author's own** and stay as written.
  Generated or edited prose never imitates that voice.
- **Descriptions say what a thing returns or does**, mirroring Ruby's core
  documentation: "Returns a string containing the upcased characters in
  `value`." Not "Ruby's `upcase`." Mentioning the Ruby form the compiler emits
  a helper for (`T.must`, `T.cast`) is fine; that is how a reader connects the
  JavaScript to their source.
- **Undocumented is not private.** `:nodoc:` is for what is actually internal,
  not for what is merely unwritten.
- **Member names.** snake_case becomes camelCase; a predicate gains `is`
  unless phrased as a verb (`acceptsFirstResponder`); a bang becomes `Bang`
  (`saveBang`), so `save` and `save!` both exist; collisions are rejected.
- **No Node or npm.** Deno runs the tests, `deno doc` reads the JSDoc, and
  esbuild is the one binary the build needs.

## Checks

| Command | What it proves |
| --- | --- |
| `STRICT=1 bundle exec rake rdoc` | The site builds without a warning |
| `bundle exec rake doc_browser` | The navigator in headless Chrome: rendering, filtering, keys, resizing, the language switch, the Implementation row |
| `bundle exec rake doc_coverage` | Undocumented public API has not grown past `DOC_COVERAGE_BASELINE` (269) |
| `deno check rb/runtime/*.mjs` | The runtime's JSDoc types check |

## Known Gaps

- **Coverage is one over its baseline** (270 against 269):
  `EditableList#commit_distant_edit` and `List#observe_collection` are
  undocumented.
- **`doc/compiler.md` duplicates the runtime's JSDoc** in its runtime
  reference table. One of them should own it; the generated page is the
  natural owner.
- **The private identifiers on the global are enumerable**
  (`Swill.Swill__Window`). Either say plainly that they are private, or make
  them non-enumerable.
- **Plain objects and dot access.** `Runtime.send` still reads a plain
  object's entry by name; whether that should match JavaScript's own dot
  access is undecided.
- **JavaScript models declare properties, not attributes.** A registered
  subclass of `Swill.Model.Base` has observable properties that are never
  persisted; attributes can only be declared in Ruby. A `static attributes`
  would close this.
- **Property change hooks** (`nameDidChange`) are not called on registered
  JavaScript classes; `doc/plain_javascript.md` documents the workaround.
- **In the JavaScript index**, the `Swill::Model` namespace page, the `Object`
  and `String` extensions, and the Ruby `Swill` module are under
  Implementation, since none has a JavaScript name.
- **Namespaces don't collapse** in the class index. The Figma design's
  collapsed row is used only for the Implementation group so far.
- **The expanded state of a collapsed row** (triangle turned down, rows
  indented 12px) is not in the design yet.

## Next

1. Close the coverage gap and lower the baseline as `:nodoc:` goes on true
   internals.
2. Settle the one vocabulary for binding *target* and *destination* across the
   guides and the source.
3. Decide whether the classes `dom_boundaries.md` used to introduce
   (`Control` and its subclasses, `SortableList`, `EditableList`,
   `CustomSelect`, `NotificationCenter`, `Window`) need guides, now that their
   class pages exist.
4. Cold read of `markup.md` and `responders.md`.
5. Replace the language switch's placeholder UI with a design.
6. Give `compiler.md`'s runtime table to the generated Runtime page.
