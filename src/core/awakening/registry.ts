import "../core_ext";

// Runtime class lookup. JavaScript modules do not expose an Objective-C
// style class table, so classes that markup or payloads name by string
// opt in with `@register`. Role comes from the class itself:
// `Controller` subclasses satisfy `controller="..."`, `View` subclasses
// satisfy `klass="..."`, and `Model` subclasses expose static `type`.

export type RegisteredClass = new (...args: any[]) => any;

const classes = new Map<string, RegisteredClass>();

export function registerClass(name: string, ctor: RegisteredClass): void {
  classes.set(name, ctor);
}

export function registeredClasses(): IterableIterator<RegisteredClass> {
  return classes.values();
}

export function registeredClassEntries(): readonly [string, RegisteredClass][] {
  return [...classes.entries()];
}

/** Resolve a registered class by name. Tries the exact key first, then
 * falls back to PascalCase so markup can use snake_case or lowerCamel
 * while classes stay PascalCase. */
export function lookupRegisteredClass(name: string): RegisteredClass | undefined {
  return classes.get(name) ?? classes.get(name.toUpperCamel());
}

function __debugRegistry(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of classes) out[k] = v.name;
  return out;
}

// Expose the registry on globalThis for debugging from the browser console.
declare global {
  // eslint-disable-next-line no-var
  var __classRegistry: Record<string, string>;
}
Object.defineProperty(globalThis, "__classRegistry", {
  configurable: true,
  get: () => __debugRegistry(),
});
