# Sorbet

Declarations carry explicit types, and method signatures feed the compiler's
static lowering as well as Sorbet:

```ruby
attribute :name, type: String, default: ""

property :label, type: String do
  loud ? name.upcase : name
end
```

`extend T::Sig` and `sig` are erased from output. `T.must`, `T.cast`, `T.let`,
`T.assert_type!`, `T.unsafe`, and `T.absurd` compile to runtime checks with
sorbet-runtime's behavior, and the compiler uses their types: `T.must(person)`
on a nilable property lowers to a direct call on the class, and `T.unsafe`
makes the sends on its result dynamic. No other `T` construct is allowed in a
body, and no browser `sorbet-runtime` is bundled. The build generates RBIs for
declared accessors and type-check-only probes for declaration expressions.


## Typing an application

`swill types` writes the Sorbet artifacts an application needs to check
itself:

```sh
swill types frontend        # writes frontend/sorbet/, then run srb tc there
```

| File | What it carries |
| --- | --- |
| `sorbet/rbi/application.rbi` | The accessors the application's own declarations create |
| `sorbet/rbi/swill.rbi` | The same for the framework's classes |
| `sorbet/rbi/swill-dom.rbi` | The DOM and the browser globals, from `knowledge/dom.rb` |
| `sorbet/rbi/swill-runtime.rbi` | The runtime and declaration-macro boundary, handwritten |
| `sorbet/checks/declarations.rb` | Each declaration expression as a typed method, so defaults and computed blocks are checked |
| `sorbet/config` | Written only if absent; an existing one is the application's own |

The config lists the application's sources, the framework's Ruby (where its
methods and macros are declared), and the generated RBIs. The framework's MRI
host is described by `swill-runtime.rbi` rather than checked as source, since
checking both would declare the declaration macros twice. Because the config
names absolute paths into the installed gem, it is regenerated rather than
committed.

