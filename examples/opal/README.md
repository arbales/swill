# Examples from the retired Opal port

Swill had a second Ruby implementation, `opal/`, which shipped the Ruby runtime
to the browser. It was retired on 20 September 2026 in favour of the Ruby2JS
port, whose framework bundle is a quarter the size (26 KB gzip against 112 KB).

These are that port's two example applications, kept as reference: the Ruby
each app was written in, and the markup it awakened. They do not run — the
framework that compiled them is gone — and their compiled `dist/app.js` was
dropped with it.

| Example | What it shows |
| --- | --- |
| `static/app.rb` (327 lines) | The UI surface with no backend: panes, bindings, controls, editing, notifications |
| `giraffic/app.rb` (436 lines) | The backend-backed flow: JSON:API models, datasets, persistence, relationships |

`static/` is already ported, as `examples/rb/static.rb`. `giraffic/` is not,
and PLAN.md names a Giraffic flow as a target, so its Ruby is the closest thing
to a specification for that work.

Three designs existed only in the Opal port and are to be re-implemented
independently rather than translated: a typed command boundary (`Sig` and
`CommandDispatcher`, a server-supplied manifest coerced before the wire),
`html_attribute` for declarative attribute-to-property mapping, and
`EditableList::Persistence` for save-on-commit. The full port is readable at
commit `c142e4f`.
