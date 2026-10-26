// Installed class declarations, copied from the parent once.
const metadata = new WeakMap();

export function declarations(klass, kind) {
  for (let current = klass; current; current = Object.getPrototypeOf(current)) {
    const known = metadata.get(current);
    if (known) return known[kind];
  }
  return kind === "restorations" ? [] : new Map();
}

export function hasMetadata(klass) {
  return metadata.has(klass);
}

// Whether the class or an ancestor was installed.
export function hasInstalledMetadata(klass) {
  for (let current = klass; current; current = Object.getPrototypeOf(current)) {
    if (metadata.has(current)) return true;
  }
  return false;
}

/**
 * Adds each property and method's JavaScript spelling as a second key beside
 * its Ruby name, so a plain JavaScript page may write `selectedObject` and
 * `sortBy` where Ruby writes `selected_object` and `sort_by`. Only a page
 * that registers JavaScript classes does this, once per class; a key a class
 * already uses keeps its own meaning.
 *
 * @param {Function} klass An installed class.
 * @returns {void}
 */
export function aliasJavaScriptNames(klass) {
  const known = metadata.get(klass);
  if (!known || known.aliased) return;
  for (const kind of ["properties", "methods"]) {
    const map = known[kind];
    for (const [name, descriptor] of [...map]) {
      const js = descriptor.js?.replace(/=$/, "");
      if (js && js !== name && !map.has(js)) map.set(js, descriptor);
    }
  }
  known.aliased = true;
}

export function installMetadata(klass, properties, methods, restorations = []) {
  const parent = Object.getPrototypeOf(klass);
  metadata.set(klass, {
    properties: new Map([
      ...declarations(parent, "properties"),
      ...properties.map(item => [item.name, item])
    ]),
    methods: new Map([
      ...declarations(parent, "methods"),
      ...methods.map(item => [item.name, item])
    ]),
    restorations: [
      ...declarations(parent, "restorations"),
      ...restorations
    ]
  });
}
