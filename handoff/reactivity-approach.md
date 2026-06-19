# Reactivity Approach

Design notes on how Ruby/Opal changes the technical approach to observables,
computed properties, and related reactive plumbing, versus the TypeScript
implementation. These are notes, not a specification.

## The Headline

Most of the TS reactivity machinery exists because JavaScript has no class
macros. The TS tree leans on TC39 decorators (`@observable`, `@computed`,
`@binding`, `@attr`, `@outlet`) that stash state on `Symbol.metadata`, plus
runtime helpers (`metaFor`, `ensureOwnAttrMap`, `outletNamesOf`) that walk that
metadata up the prototype chain to reconstruct what a class declared.

In Ruby the class body is executable code, so the declaration and the
registration are the same act. The existing `property` macro already shows the
shape: a class method calling `define_method`, with no decorator, no metadata
symbol, and no prototype walk. Every other TS decorator reduces to the same
form: `computed :full_name`, `outlet :search_field`, `attr :email`. This is the
direction `opal-api-discussion.md` already chose ("symbol-heavy declarations …
ordinary methods as the primary extension mechanism").

## Observers

`Controller#notify_change` already demonstrates two Ruby affordances the TS
version has to work for:

```ruby
def notify_change(name, previous, value)
  callback = "#{name}_did_change"
  public_send(callback, previous, value) if respond_to?(callback)
  @observers[name.to_sym].dup.each { |observer| observer.call(value) }
end
```

- **Convention dispatch.** `respond_to?` plus string-to-method replaces wiring
  up `${name}DidChange` through accessor pairs.
- **Blocks.** `observe(path) { ... }` returning an unsubscribe lambda replaces
  the TS disposer bookkeeping.

Keep observers explicit. They are greppable and the cost is obvious.

## Computed Properties: A Different Design, Not A Transliteration

This is the one place to redesign rather than port. TS `@computed(["a", "b"])`
requires hand-declared dependencies because instrumenting JS accessor reads is
awkward. In Ruby every property read is an ordinary method call you can cheaply
wrap, so automatic dependency tracking (the MobX/Vue/Knockout trick) becomes
practical:

```ruby
def self.computed(name, &block)
  define_method(name) do
    slot = (@computed ||= {})[name]
    return slot[:value] if slot&.fetch(:valid)

    deps, value = Computation.capture { instance_exec(&block) }
    deps.each { |obj, dep| obj.observe(dep) { @computed[name][:valid] = false } }
    @computed[name] = { value: value, valid: true }
    value
  end
end
```

The only change to the existing `property` getter is one line that records the
read while a computation is on the stack:

```ruby
define_method(name) do
  Computation.record(self, name)   # the whole trick
  @properties[name] = ... unless @properties.key?(name)
  @properties[name]
end
```

So `computed(:full_name) { "#{first} #{last}" }` discovers `first` and `last`
automatically, with no dependency array.

Opal helps here rather than hurts: the "current computation" stack is just a
module-level array, because compiled-to-JS Opal is single-threaded. No
`Thread.current`, no re-entrancy guards that real MRI would push toward.

## Inherited Configuration

TS reconstructs per-class declaration maps by walking `Symbol.metadata` with
copy-on-write (`ensureOwnAttrMap`). Ruby's `inherited` hook does the same thing
explicitly and once, which is also how Sequel handles inherited class config:

```ruby
def self.inherited(subclass)
  super
  subclass.instance_variable_set(:@spec, @spec.dup)
end
```

## Plugins Instead Of Decorator Stacking

Optional features (binding adapters, transformers, a future model mixin) are the
TS `@binding` / `BindingAdapter` story. Sequel's `plugin :foo` is just module
composition:

```ruby
def self.plugin(mod)
  include mod::InstanceMethods if defined?(mod::InstanceMethods)
  extend  mod::ClassMethods    if defined?(mod::ClassMethods)
end
```

More inspectable than decorator composition (`ancestors`), and it avoids
metadata-merge edge cases.

## Key-Path Bindings

TS `observePath` / `readPath` / `writePath` walk dotted paths manually. In Ruby,
`public_send` plus duck typing shortens this: fold the path with `public_send`,
and observe each segment that itself `respond_to?(:observe)`. No typed path
adapter per shape.

## Where Ruby Does Not Help, And Opal Caveats

- **Equality blind spots are unchanged.** `return value if previous == value`
  is nicer with real value equality, but in-place mutation of an array or hash
  property still will not fire a change. The choice between immutability and an
  explicit `will_change` remains.
- **Cost moves, it does not vanish.** Auto-tracking adds a wrapper call on every
  property read, on top of Opal's already non-trivial `define_method` /
  `respond_to?` / `public_send` compilation. Fine at side-project scale; not
  free the way a hand-declared dependency array is.
- **Opal's metaprogramming has a ceiling.** No `TracePoint`, limited
  `ObjectSpace`, partial refinements. Everything above stays within
  `define_method` / `inherited` / `prepend`, all supported.
- **`prepend` is the clean way to wrap setters.** Rather than redefining `name=`
  inside the macro, a prepended module can intercept `name=` and call `super` —
  closer to how `@observable` decorates, without losing the original method.
- **The real risk is over-rotating into magic.** TS explicitness (declare your
  deps, declare your outlets) is verbose but greppable. Keep computed
  auto-tracked; keep observers and outlets explicit. "Why did this recompute?"
  should stay answerable.

## Net

Ruby changes the design space, not just the line count. The biggest concrete
shift is computed properties moving from declared dependencies to tracked
dependencies. Observers, inherited config, and plugins are the same ideas with
about half the scaffolding.
