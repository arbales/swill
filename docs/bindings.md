# Bindings

Bindings connect object properties to DOM endpoints. They are intentionally object-first: markup names paths in the object graph, and the framework decides whether the endpoint is a controller, a `View`, or a raw element.

## Markup Bindings

`bind="path"` is the primary value binding.

```html
<input bind="address">
<span bind="name"></span>
<section controller="MailingListDetail" bind="selectedObject"></section>
```

For form controls it is two-way. For text endpoints it is one-way. For child controllers with `representedObject`, the value is assigned to that represented object.

`bind-*` writes a DOM property:

```html
<input bind-readonly="id:isPresent">
<button bind-disabled="@memberList.selectedIndexes:isEmpty">Remove</button>
```

Binding expressions can apply value transforms with `:name`. The path before the colon is still the observed object path; the transform is applied after reading.

```html
<button bind-disabled="@query:isBlank">Clear</button>
```

`isEmpty` checks exact string or array length. `isBlank` treats whitespace-only strings as empty. `isPresent` is true for non-null values, non-blank strings, and non-empty arrays.

## Binding Roots

Controllers can provide a default prefix by overriding `bindingRoot()`.

```ts
override bindingRoot(): string { return "representedObject"; }
```

With that prefix, `bind="address"` resolves to `this.representedObject.address`.

`@` is shorthand for `this`. It overrides whatever `bindingRoot()` returned:

```html
<button bind-disabled="@saving">Save</button>
```

That resolves to `this.saving`.

## Observable Paths

Bindings observe paths through the `${name}DidChange(prev, next)` convention. `@observable`, `@attr`, `@hasMany`, `@computed`, and `@binding` all participate in that convention.

```ts
@observable accessor query: string = "";

@computed(["query"]) get queryEmpty(): boolean {
  return this.query.trim().length === 0;
}
```

## Reusable Binding Properties

`@binding(adapter)` exposes a writable derived property through a reusable adapter.

```ts
@binding(selectedObjectIdBinding()) accessor selectedObjectId: string | null = null;
```

Adapters declare `dependencies` and optional `get`/`set` methods. This keeps restoration-facing bindings such as `selectedObjectId` adjacent to the controller property, while allowing the same selected-object identity behavior to be reused by different controllers.

## Restoration Bindings

Controllers expose URL restoration state by returning public binding names:

```ts
restorationBindings() {
  return {
    selected: "sourceList.selectedObjectId",
  };
}
```

The application observes the given path and writes it to the URL fragment. On launch, it writes fragment values back through the same binding path. The binding adapter should own any "pending value" behavior needed while data is still loading.
