// One load-time operation over generated data: link mixin layers, install
// accessors and metadata, seed registries, and register names for markup.
import {declarations, hasMetadata, installMetadata} from "./metadata.mjs";
import {record, computedValue, storedValue, writeProperty} from "./properties.mjs";

const classes = new Map();
const mixinMetadata = new WeakMap();
const mixinClassFactories = new WeakMap();
const classConfiguration = new WeakMap();

function configuration(klass) {
  if (!classConfiguration.has(klass)) {
    classConfiguration.set(klass, {registries: new Map(), settings: new Map()});
  }
  return classConfiguration.get(klass);
}

// Definitions are inert until here; install parents before children
// regardless of object key order.
export function install(meta) {
  const entries = Object.entries(meta.classes ?? {});
  const mixins = Object.values(meta.mixins ?? {});
  const incoming = new Map(mixins.map(item => [item.factory, item]));
  for (const [name, descriptor] of entries) {
    if (classes.has(name)) throw new Error(`Duplicate class: ${name}`);
    if (!Object.hasOwn(descriptor, "constructor") || typeof descriptor.constructor !== "function") {
      throw new TypeError(`Missing constructor: ${name}`);
    }
    for (const mixin of descriptor.mixins ?? []) {
      if (!incoming.has(mixin) && !mixinMetadata.has(mixin)) throw new Error(`Unknown mixin for ${name}`);
    }
  }
  const pending = new Map(entries.map(([name, descriptor]) => [descriptor.constructor, {name, descriptor}]));
  if (pending.size !== entries.length) throw new Error("Duplicate constructor in meta");
  const methods = descriptors => Object.entries(descriptors ?? {}).map(([name, descriptor]) =>
    ({name, js: name, ...descriptor}));
  for (const mixin of mixins) {
    if (typeof mixin.factory !== "function") throw new Error("Mixin factory must be a function");
    if (mixin.classFactory !== undefined && typeof mixin.classFactory !== "function") {
      throw new Error("ClassMethods factory must be a function");
    }
    mixinMetadata.set(mixin.factory, methods(mixin.methods));
    if (mixin.classFactory) mixinClassFactories.set(mixin.factory, mixin.classFactory);
  }
  while (pending.size) {
    let progress = false;
    for (const [klass, {name, descriptor}] of pending) {
      if (pending.has(Object.getPrototypeOf(klass))) continue;
      if (descriptor.mixins?.length) include(klass, descriptor.mixins, incoming);
      const properties = Object.entries(descriptor.properties ?? {}).map(([name, property]) =>
        ({name, js: name, ...property, computed: typeof property.compute === "function"}));
      installClass(klass, name, properties, methods(descriptor.methods), descriptor.registries, descriptor.restorations ?? []);
      pending.delete(klass);
      progress = true;
    }
    if (!progress) throw new Error("Unresolvable superclass order in meta");
  }
}

export function include(klass, mixins, incoming = new Map()) {
  if (hasMetadata(klass)) throw new Error("Mixins must be attached before class installation");
  let parent = Object.getPrototypeOf(klass);
  for (const mixin of mixins) {
    parent = mixin(parent);
    if (mixinMetadata.has(mixin)) installMetadata(parent, [], mixinMetadata.get(mixin));
  }
  // Wire both chains once, before instances exist. Native super resolves
  // through the method's home object, so copying methods would not suffice.
  Object.setPrototypeOf(klass.prototype, parent.prototype);
  Object.setPrototypeOf(klass, parent);
  for (const mixin of mixins) {
    const classFactory = incoming.get(mixin)?.classFactory ?? mixinClassFactories.get(mixin);
    if (classFactory) {
      // Class declaration helpers are copied onto the constructor rather
      // than inserted into its prototype chain. A JavaScript subclass uses
      // that chain as its dynamic `super()` target, so replacing it with a
      // ClassMethods object makes otherwise valid subclasses unconstructable.
      // The supported helpers are state-free methods whose receiver is the
      // class; ordinary constructor inheritance carries them to subclasses.
      const helpers = Object.getOwnPropertyDescriptors(
        classFactory(Object.getPrototypeOf(klass))
      );
      delete helpers.constructor;
      Object.defineProperties(klass, helpers);
    }
  }
}

export function inheritableRegistry(klass, name, initial = "hash") {
  const own = configuration(klass).registries;
  if (own.has(name)) return own.get(name);
  const parent = Object.getPrototypeOf(klass);
  const inherited = typeof parent?.[name] === "function" ? parent[name]() : undefined;
  const value = inherited === undefined
    ? (initial === "array" ? [] : {})
    : (Array.isArray(inherited) ? [...inherited] : {...inherited});
  own.set(name, value);
  return value;
}

export function classSetting(klass, name, values) {
  const own = configuration(klass).settings;
  if (values.length) {
    if (values.length !== 1) throw new Error(`${name} expects zero or one argument`);
    own.set(name, values[0]);
    return values[0];
  }
  if (own.has(name)) return own.get(name);
  const parent = Object.getPrototypeOf(klass);
  return typeof parent?.[name] === "function" ? parent[name]() : null;
}

export function installClass(klass, name, properties, methods, registries = {}, restorations = []) {
  if (classes.has(name)) throw new Error(`Duplicate class: ${name}`);
  installMetadata(klass, properties, methods, restorations);
  const propertyByName = new Map(properties.map(property => [property.name, property]));
  for (const [registryName, seeds] of Object.entries(registries)) {
    if (typeof klass[registryName] !== "function") {
      throw new Error(`Missing registry declaration: ${registryName}`);
    }
    const registry = klass[registryName]();
    for (const [name, seed] of Object.entries(seeds)) {
      const property = propertyByName.get(seed.property);
      if (!property) throw new Error(`Unknown registry property: ${seed.property}`);
      registry[name] = {...seed, type: property.type, defaultValue: property.defaultValue};
    }
  }
  for (const descriptor of properties) {
    Object.defineProperty(klass.prototype, descriptor.js, {
      configurable: true,
      get() {
        record(this, descriptor.name);
        return descriptor.computed ? computedValue(this, descriptor) : storedValue(this, descriptor);
      },
      ...(descriptor.computed ? {} : {set(value) { writeProperty(this, descriptor, value); }})
    });
  }
  classes.set(name, klass);
}

// Fail closed: markup cannot traverse globals or instantiate arbitrary values.
export function resolve(name) {
  if (!classes.has(name)) throw new Error(`Unknown class: ${name}`);
  return classes.get(name);
}
