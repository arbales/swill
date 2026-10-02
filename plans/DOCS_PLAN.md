# Documentation plan

The source-driven RDoc site, class pages, JavaScript spellings, runtime JSDoc
pages, navigator, and guide foundation are implemented; see
[Completed](COMPLETED.md). The remaining work is coverage and editorial/API
clarity, not another site build-out.

## Open work

1. Close the current coverage gap. `Rakefile` sets
   `DOC_COVERAGE_BASELINE = 171`; on 1 October 2026, `bundle exec rake
   doc_coverage` reported **173** undocumented public entries. Document public
   methods, mark true internals `:nodoc:`, and lower the baseline when the
   count improves. `EditableList#commit_distant_edit` remains among the gaps;
   the old reference to `List#observe_collection` is obsolete.
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
5. Decide whether generated identifiers such as `Swill.Swill__Window` should
   be non-enumerable or more explicitly documented as private. Separately
   settle whether `Runtime.send` reading plain-object entries should match
   ordinary JavaScript dot access.
6. Decide whether registered JavaScript models need persisted `static
   attributes` and property `nameDidChange` hooks. The current limitations
   are described in [plain JavaScript](../doc/plain_javascript.md); the hook
   implementation candidate is tracked in [the framework plan](FRAMEWORK_PLAN.md).
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
