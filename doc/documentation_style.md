# Documentation Style

Avoid these terms or constructions:

* "Wired" doesn't mean anything to me. Used terms specific to the things being
  connected instead.
* Don't list Cocoa counterparts unless is especially helpful for something
  non-obviouis. I mention Distributed Objects, for example, but we shouldn't say]
  "Table View analog" all the time.
* Avoid writing useless qualifiers about the exceptionality of a case that's not surprising: "only this or that" / "the only place where" / "the single point" / "the real"

## Guides and Class Pages

A guide explains a concept: what it is, how its parts fit, and the rules that
govern it. A class page documents each member of one class or module. The two
point at each other rather than overlap: a guide links the classes it relies on
but does not list their members; a class comment links the guide for its
concept. [Markup](markup.md) is a reference written as a guide: every
attribute, each linking to the guide for its mechanism.

Each guide has a row in the README's index, titled by its own heading, with a
description of what it covers.

## Voice

Descriptions are declarative, in the third person and the present tense, for a
technically capable reader who needs responsibilities, defaults, and
consequences. Address the reader directly only for an instruction: "Override
this method to filter the content."

| Write | Rather than |
| --- | --- |
| A binding is an attribute of one object that may be bound to a property in another such that a change in either one is reflected in the other. | Bindings let you keep your views in sync. |
| `unload` releases what the controller retained. | When you unload, we'll clean everything up for you. |
| An unregistered transformer name raises when its binding is established. | You'll get an error if you forget to register it. |

- **The concept before its benefits.** Define the thing directly, without
  "perhaps most accurately described as" or a comparison the reader must
  already know. State the result before its mechanism.
- **Behavior, not history.** No "now", "previously" or "used to". History
  belongs in commit messages; migration steps in a migration guide.
- **Exact about failure.** Say what raises, and when: at declaration, as the
  region awakens, or at the call. Say what is silently ignored, too, and
  connect a failure to its effect on the caller.
- **No reassurance.** Leave out "simply", "just", "easy", "magic" and
  "seamless". Adjectives mark real distinctions — selected objects, pending
  edits — not the experience of using the framework.
- **Qualifications describe behavior.** "May" for a possible outcome, "can"
  for a capability, "should" for guidance, "must" for a requirement.
  "Typically", "by default" and "attempts to" only where they mark a real
  limit; guaranteed behavior is stated plainly.
- **Literal, not compressed.** "Actions are live" leaves the reader to infer
  which operations completed; name them. Short sentences for simple facts —
  "The default is false." — longer ones only when conditions require.
- **One term per thing.** No synonyms for variety. Name the participant whose
  state is described: the controller's selection, the binding's receiver.
- **Contract, not mechanism.** A guide states what the application can rely
  on. How the framework keeps that promise — a registry, a release callable,
  when a path is resolved — is left out unless it changes what the application
  must do. "Everything connected here is released when the controller
  unloads", not "each connection returns a release callable the controller
  retains, so there is no registry to keep in sync".
- **Documentation, not defense.** A sentence that argues for the design —
  that a boundary has no leak, a mechanism no bookkeeping, a choice no
  alternative — answers a challenge the reader has not raised, and belongs
  in a design note or a commit message. The tells: singularity ("the one
  place", "exactly once", "never stored twice"); absence ("no registry",
  "nothing to keep in sync", "no glue code"); comparison to another design
  or language ("rather than", "unlike", "obviates"); consequence as
  vindication ("that is why", "falls out of"); and "deliberate", "by
  design". If deleting the sentence leaves the reader knowing what to do, it
  is deleted. A constraint that changes what the application must do stays,
  stated as the rule, not as its reason.
- **Swill's own terms are plain words.** No scare quotes around *awaken*,
  *region* or *outlet*. A term is set in bold once, where it is defined.

Asides in the maintainer's own voice — first person, opinions, `TODO:` notes —
are deliberate and stay as written. They may be rewrapped; their words may not.

## Structure

- The first heading is the guide's short title. Headings below it are in
  title case: "Regions and Ownership".
- The opening paragraph says what the guide covers; no "Overview" heading.
- Sections run from the general to the particular: the concept, then its
  rules, then the edge cases. Responsibility and behavior come before
  conditions and consequences; architectural justification is kept apart
  unless it explains a choice the application developer must make.
- A process is described with its actor and its occasion first — "The
  application awakens the markup beneath its root when it launches" — then
  its steps as a numbered list of verbs with that actor as subject, then what
  becomes of the objects it produced, then a see-also.
- One paragraph, one thing, in the order a reader meets them: what the thing
  is, how it is declared, what happens to it at launch, what the API does
  with it later.
- A rule with several cases is a table, as in [Markup](markup.md#bind-).
- Prose is wrapped at 80 columns, with no trailing whitespace. Code blocks and
  tables are exempt.

## History

A guide describes the framework as it is. Removed rather than restyled: a
Before/After comparison with a previous API, a "Migration:" paragraph, a
benchmark against an earlier implementation, and a "previously"/"no longer"
clause. Their surviving content is stated in the present tense. A placeholder
such as "[other features]" is filled or removed.

## Checking

- A fact stated in two guides must agree. When they differ, the code decides,
  and both are corrected to it.
- A sentence rewritten for style keeps its claim; a claim that looks wrong is
  checked against `rb/` before it is changed, and left with a note otherwise.
- Renaming a heading renames its anchor. Every `#anchor` link under `doc/` and
  in `README.md` is checked against the generated ids after a rename.
- Every guide has a row in the README's index.

## Examples

- Short, and complete enough to read alone. Names come from the framework or
  `examples/`, not `foo` and `bar`.
- Ruby first; plain JavaScript in [Plain JavaScript](plain_javascript.md) or
  where the spellings differ. Fenced with the language: `ruby`, `html`, `js`,
  `sh`.
- A sentence before says what the example shows; one after, when needed, reads
  it back.
- Purpose is shown by a concrete situation — a table, detail pane and toolbar
  sharing a selection — not by an argument about design.

## Names and Links

- Code, class names, methods, attributes and paths are in backticks; RDoc
  links a backticked class name to its page.
- `Controller` names the class; a controller is the role.
- `Class#method` for an instance method, `Class.method` for a class method,
  `#method` alone within the class's own page or section.
- Guides use Ruby spellings; class pages supply the JavaScript spelling.
- Links to other guides are relative, with an anchor where it helps:
  `[regions and ownership](awakening.md#regions-and-ownership)`.

## API Comments

Comments in `rb/framework` are Markdown and become the class pages.
`rake doc_coverage` counts every public class, module, method and declaration
without one, and fails if the count grows.

A comment is as long as the behavior requires — one sentence when that says
everything — and does not repeat what the page shows: signature, types, source
file, relations. Each member reads alone: a signature does not explain
ordering, defaults, side effects, or what an index refers to. Repeat a
condition across related entries when each needs it; link the guide rather
than reproduce it.

### Classes and Modules

- The first sentence says what the class is and what it manages:
  "`ArrayController` manages a collection of objects: its arrangement and its
  selection." Responsibilities follow, as a list when there are several.
- Definition before construction, subclassing or reuse; capabilities without
  the language or implementation reasons that made them convenient.
- One concrete use, from the framework or `examples/`, and a link to the
  guide.
- A module says what it adds to its includers.

### Summaries

The first sentence of a member comment is its summary and stands alone.

- A method: a third-person verb — "Returns…", "Selects…", "Creates and
  adds…" — not "Select…", "This method…" or "Answers…".
- A hook: its invocation point — "Invoked after…" — then the state available
  to an override and any restriction on it.
- A property: a noun phrase naming the value. A Boolean: what true means.
- The object is named by its role — "the list" — not "self" or "the
  receiver", which is a binding's receiver.
- Parameters are named in the sentence: "Selects `objects`, replacing the
  current selection." Separate description only when the name and summary
  leave the meaning unclear.

### What a Comment States

- **Edges:** what is returned or held when there is nothing — nil, an empty
  array, an unchanged value.
- **Defaults:** a setting ends with "The default is false."
- **Order and coordinates:** the order of returned objects; whether indexes
  refer to content or arranged content; what invalid indexes do.
- **References or copies**, where a reader could assume either.
- **Side effects:** changes beyond the main operation, and what preserves,
  clears or replaces temporary state.
- **Deferral:** an effect that lands later says when.
- **Costs:** a real performance cost, with the cheaper alternative.
- **Failure and remedy:** "Raises when `content` is also set; set
  `array_controller` alone."
- **Unused by the framework:** a member Swill never reads says whom it is for.
- **Observation:** declared properties are observable, unsaid. A value a
  binding cannot follow says so where a reader would expect otherwise.

### Overridable Methods

Describe the default implementation, then what an override is for, then what
it must still do — including whether to call `super`: "The default
implementation includes every object. Override it to filter the content."
Effect before mechanism: for a filter hook, what the result means and what the
default returns, then that properties read by the hook re-arrange on change.

### Actions and Predicates

An action, invoked through `data-action`, is described by its effect; its
`sender` is not. A predicate paired with an action says which action it guards
and that it exists for bindings such as `bind-disabled`.

### Related Members

A comment links its counterparts: a reader's writer, the inverse
(`select_objects` and `deselect_all`), the many-form (`select_object` and
`select_objects`), the predicate guarding an action.

### Grouping by Task

A class with more than a handful of members groups them with `:section:`. Each
section is a heading on the page and in its index.

```ruby
# :section: Managing Selection
# Choosing objects within the arranged content.

# The selected objects, in the order they were selected.
property :selected_objects, ...
```

- Named for its task, a gerund phrase in title case: "Managing Selection".
- The lines after the directive are its description, one or two sentences,
  then a blank line.
- A section runs to the next `:section:`, so source order matches. Members
  before the first directive form an untitled section shown first, for what
  belongs to no task, such as initialization.
- A `:section:` inside `self.included` covers the declarations after it and
  continues into the module body.
- Related members share a section: a property with its mutators, an action
  with its predicate.

### Declarations

The comment goes above `property`, `outlet` or `attribute`, including
`base.property` in `self.included`. It says what the value means, when it is
nil, and what writing it does.

### Internals

A method public only for the framework's own use is marked `# :nodoc:`, which
removes it from the page and the coverage count. Hooks such as `self.included`
are internals.

### Revising Existing Comments

- Not "Controllers in Swill are perhaps most accurately described as View
  Controllers" but "A `Controller` manages a view or region of elements and
  presents a represented object."
- Not "Ownership is derived from the sparse view tree and never stored twice"
  for `parent`, but "Returns the controller that owns the containing region,
  or `nil` for a root controller."
- Not "Temporary presentation inclusion, cleared by new content or explicit
  sorting" for `show_first`, but "Places `object` before the remaining
  arranged content and selects it. Filtering still applies. Assigning new
  content or sorting clears the placement."

Check the implementation before adopting a description.

## Vocabulary

One word for each idea, in guides and in source. Operational verbs: return,
set, insert, remove, invoke, select, discard. Name the connection: outlets are
connected, bindings are established, action handlers are installed.

A word in the "Not" column that is another layer's own term keeps that
meaning there: the data layer *hydrates* a partial field, and its guides say
so; turning markup into objects is *awaken*.

| Use | For | Not |
| --- | --- | --- |
| receiver | the object a binding keeps up to date | target |
| observed object | the object a binding reads from | source, model |
| key path | the dot-separated path a binding reads | keypath, path string |
| awaken | turning markup into objects | hydrate, mount, boot |
| region | a controller's share of the DOM | scope, subtree |
| owner | the controller a view or outlet belongs to | parent (for this sense) |
| retain, release | taking and giving up responsibility for an observation or object | register, dispose |
| unload | a controller releasing everything it retained | teardown, destroy |
| first responder | the responder that receives key events first | focused controller |
| content | the collection a controller manages, as it was given | items, data |
| arranged content | the content after sorting and filtering, in display order | sorted items, rows |
| selection | the objects chosen within the arranged content | current item |
| represented object | the object a controller presents | model, record |
