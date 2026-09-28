# Sorbet

Sorbet's type declarations tell Swill's Ruby2JS compiler the type of each
receiver, so it lowers method and property calls to the JavaScript form the
receiver's class provides: a typed `post.reload` compiles to a direct call
rather than a lookup at run time, and Ruby's parenthesis-free calls keep their
spelling.

A Sorbet declaration is either erased from the emitted JavaScript, as
`T::Sig` and `sig` are, or compiled into a runtime check.

## Typed Applications

When the compiler knows a receiver's type, it lowers method and property calls
to direct JavaScript calls and property reads.

In untyped code, a Ruby method call without parentheses or arguments could be
a property read or a method call, so the compiler leaves the decision to the
runtime.

```ruby
sig { params(post: Post).returns(String) }
def typed(post)
  document = Swill::Application.shared.browser.document
  element = T.let(document.getElementById("example"), Element)
  name = element.tagName
  element.remove
  post.reload
  post.add_tag :favorite
  title = post.title
  post.mark_read
  post.save!
  title
end

def untyped(post)
  document = Swill::Application.shared.browser.document
  element = document.getElementById("example")
  name = element.tagName
  element.remove
  post.reload
  post.add_tag :favorite
  title = post.title
  post.mark_read()
  post.save!
  title
end
```

```js
typed(post) {
  let document = Swill__Application.shared().browser().document;
  let element = document.getElementById("example");
  let name = element.tagName;
  element.remove();
  post.reload();
  post.addTag("favorite");
  let title = post.title;
  post.markRead();
  post.saveBang();
  return title;
}

untyped(post) {
  let document = Swill__Application.shared().browser().document;
  let element = document.getElementById("example");
  let name = Runtime.send(element, "tagName");
  Runtime.send(element, "remove");
  Runtime.send(post, "reload");
  Runtime.invoke(post, "add_tag", "favorite");
  let title = Runtime.send(post, "title");
  Runtime.invoke(post, "mark_read");
  Runtime.invoke(post, "save!");
  return title;
}
```

A typed call is an ordinary JavaScript call or property read, under the
member's JavaScript name: `add_tag` is `addTag`, and `save!` is `saveBang`. An
untyped one is looked up when it runs, by its Ruby name. Parentheses,
arguments, or a bang make it a call, `Runtime.invoke`; a send with none of
them, such as `post.reload` or `post.title`, could be a property or a method,
and `Runtime.send` resolves it to whichever the object has. An element and
other browser objects respond with their own members. Either raises on a nil
receiver, as Ruby does. The untyped form costs a lookup per call.

`document` is typed in both, since a constant always is. What
`getElementById` returns is not: the DOM table does not list it. The
`T.let` in the typed version supplies the type, so `element.tagName` and
`element.remove` are plain JavaScript; for a browser type the `T.let` is an
annotation only, with no check at run time. The [compiler
reference](compiler.md) lists every rule the types drive.

## Runtime Operations

The `T` methods below are the ones a method body may use. Each keeps
sorbet-runtime's behavior, so shared Ruby fails the same way on MRI and in the
browser, and each tells the compiler the type of its result. No other `T`
construct may appear in a method body, and sorbet-runtime is not bundled.

| Ruby | JavaScript | At run time |
| --- | --- | --- |
| `extend T::Sig`, `sig { ... }` | nothing | Recorded for lowering, then erased |
| `T.must(value)` | `Runtime.must(value)` | Raises `TypeError` for nil, otherwise returns the value |
| `T.cast(value, Type)`, `T.let(value, Type)`, `T.assert_type!(value, Type)` | `Runtime.cast(value, "Type")` | Raises `TypeError` unless the value conforms, otherwise returns it |
| The same, to `T.untyped` or a browser type such as `Element` | `value` | Nothing: an annotation for Sorbet and the compiler |
| `T.unsafe(value)` | `value` | Nothing; the compiler treats the value as untyped, so calls on it are looked up at run time |
| `T.absurd(value)` | `Runtime.absurd(value)` | Always raises `TypeError` |
| `T.bind(self, Type)` | nothing | Nothing: `self` is already the instance |

`T.let` on an assignment keeps its check and types the local.

A check conforms a value to its type the way sorbet-runtime does, shallowly:

| Type | Conforms when the value is |
| --- | --- |
| `String`, `Symbol` | a string |
| `Integer` | a whole number |
| `Float` | a number |
| `T::Boolean` | `true` or `false` |
| `NilClass` | nil |
| `T.nilable(Type)` | nil, or conforms to `Type` |
| `T::Array[...]`, `T::Hash[...]` | an array, or a plain object; the elements are not checked |
| `T.proc...` | a function |
| A class | an instance of it; a generic class's type arguments are not checked |

A union (`T.any`), a module, or a constant the compiler cannot resolve is a
build error in a check.

## Declared Types

A declaration's `type:` is a Sorbet type too, and serves both checkers:

- Sorbet sees a typed reader and writer for every `property`, `attribute`, and
  `outlet`, generated into an RBI.
- A default or a computed block is compiled into a typed probe method, so
  Sorbet checks it against the declared type.
- An outlet's value is checked against its type as the region awakens,
  shallowly, as `T.cast` checks, so a JSON outlet of the wrong shape fails by
  name.

## Typing the Framework

`rake typecheck` checks the framework's own Ruby; see [typechecking the
framework](development.md#typechecking-the-framework).

## Typing an Application

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
host is described by `swill-runtime.rbi`, not checked as source. The config is
written only when absent and belongs to the application afterwards: update its
source list when adding client files. It names absolute paths into the
installed gem, so delete it and rebuild after the gem moves.
