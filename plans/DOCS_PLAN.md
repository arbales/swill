# Documentation plan

The source-driven RDoc site, class pages, JavaScript spellings, runtime JSDoc
pages, navigator, and guide foundation are implemented; see
[Completed](COMPLETED.md). The remaining work is coverage and editorial/API
clarity, not another site build-out.

## Open work

1. Keep closing the coverage gap against `DOC_COVERAGE_BASELINE` in `Rakefile`.
   Document public methods, mark true internals `:nodoc:`, and lower the baseline
   as the count improves. New public API arrives documented, so the count does
   not grow.
2. Settle one vocabulary for binding *target* and *destination* across guides
   and source. Cold-read [markup](../doc/markup.md) and
   [responders](../doc/responders.md) for a newcomer.
3. Review conceptual gaps beyond class pages. Start with the existing
   [controls](../doc/controls.md), [collections](../doc/collections.md), and
   [lifecycle](../doc/lifecycle.md) guides before adding guides for individual
   controls/controllers or notifications. Preserve the author's asides and
   TODOs in existing guides.
4. Make the generated Runtime page own runtime reference material now
   duplicated in [the compiler guide](../doc/compiler.md). Keep the compiler
   guide focused on source-to-JavaScript semantics.
5. Review JavaScript-index treatment of Ruby-only namespaces and extensions;
   implement general collapsible namespace rows only after the expanded-state
   design is settled. Replace the language switch's placeholder UI with its
   finished design.

Runtime plain-object semantics belong in [the framework plan](FRAMEWORK_PLAN.md);
persisted JavaScript `static attributes` belong in [the developer-experience
plan](DEVX_PLAN.md). Update their documentation when those decisions are made,
rather than maintaining duplicate API tasks here.

## Checks

- `STRICT=1 bundle exec rake rdoc` builds the site without warnings.
- `bundle exec rake doc_browser` exercises navigator rendering, navigation,
  resizing, language switching, and the Implementation group.
- `bundle exec rake doc_coverage` measures public API coverage against the
  current ratchet.
- `deno check rb/runtime/*.mjs` checks runtime JSDoc types.
