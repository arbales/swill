// Class metadata installed from generated meta: property and method tables.
// A class's tables start from its parent's at install time, so lookups never
// walk the prototype chain at call time.
const metadata = new WeakMap();

export function declarations(klass, kind) {
  for (let current = klass; current; current = Object.getPrototypeOf(current)) {
    const known = metadata.get(current);
    if (known) return known[kind];
  }
  return new Map();
}

export function hasMetadata(klass) {
  return metadata.has(klass);
}

export function installMetadata(klass, properties, methods) {
  const parent = Object.getPrototypeOf(klass);
  metadata.set(klass, {
    properties: new Map([...declarations(parent, "properties"), ...properties.map(item => [item.name, item])]),
    methods: new Map([...declarations(parent, "methods"), ...methods.map(item => [item.name, item])])
  });
}
