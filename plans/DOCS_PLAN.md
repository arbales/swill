# Documentation plan

The source-driven RDoc site, class pages, JavaScript spellings, runtime JSDoc
pages, navigator, and guide foundation are implemented; see
[Completed](COMPLETED.md). The remaining work is coverage and editorial/API
clarity, not another site build-out.

## Open work

1. Keep closing the coverage gap. `Rakefile` sets
   `DOC_COVERAGE_BASELINE = 164` (27 October 2026). Document public methods,
   mark true internals `:nodoc:`, and lower the baseline as the count improves.
   New public API arrives documented, so the count does not grow.
2. Settle one vocabulary for binding *target* and *destination* across guides
   and source. Cold-read [markup](../doc/markup.md) and
   [responders](../doc/responders.md) for a newcomer.
3. Decide which controls/controllers need conceptual guides beyond their class
   pages: `Control` and its subclasses, `SortableList`, `EditableList`,
   `CustomSelect`, `NotificationCenter`, and `Window` were candidates after
   `dom_boundaries.md` was retired. Preserve the author's asides and TODOs in
   existing guides.
4. Make the generated Runtime page own runtime reference material now
   duplicated in [the compiler guide](../doc/compiler.md). Keep the compiler
   guide focused on source-to-JavaScript semantics.
5. Settle whether `Runtime.send` reading plain-object entries should match
   ordinary JavaScript dot access. (Hiding the generated `Swill__*`
   identifiers was dropped; see [abandoned](ABANDONED.md).)
6. Decide whether registered JavaScript models need persisted `static
   attributes`; tracked as deferred in [the developer-experience
   plan](DEVX_PLAN.md).
7. Review JavaScript-index treatment of Ruby-only namespaces and extensions;
   implement general collapsible namespace rows only after the expanded-state
   design is settled. Replace the language switch's placeholder UI with its
   finished design.

## Checks

- `STRICT=1 bundle exec rake rdoc` builds the site without warnings.
- `bundle exec rake doc_browser` exercises navigator rendering, navigation,
  resizing, language switching, and the Implementation group.
- `bundle exec rake doc_coverage` measures public API coverage against the
  current ratchet.
- `deno check rb/runtime/*.mjs` checks runtime JSDoc types.
