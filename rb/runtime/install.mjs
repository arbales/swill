// Install generated declarations once at load time.
import {declarations, hasMetadata, installMetadata} from "./metadata.mjs";
import {record, computedValue, storedValue, writeProperty} from "./properties.mjs";

const classes = new Map();
const names = new Map();
const mixinMetadata = new WeakMap();
const mixinClassFactories = new WeakMap();
const classConfiguration = new WeakMap();
const identityStores = new WeakMap();

function configuration(klass) {
  if (!classConfiguration.has(klass)) {
    classConfiguration.set(klass, {
      registries: new Map(),
      settings: new Map()
    });
  }
  return classConfiguration.get(klass);
}

/**
 * Installs the classes and mixins a compiled bundle defines: their declared
 * properties, methods, registries, settings, and restorable paths. Parents are
 * installed before children, whatever order `meta` lists them in. A compiled
 * bundle calls this as it loads, and `Swill.register` calls it for a plain
 * JavaScript class.
 *
 * @param {object} meta A bundle's `meta` object: `classes` by installed name,
 *   and `mixins`.
 * @returns {void}
 * @throws {Error} `Duplicate class` for a name already installed; `Unknown
 *   mixin`; `Unresolvable superclass order` when a parent never installs.
 * @throws {TypeError} `Missing constructor` for a class entry without one.
 */
export function install(meta) {
  const entries = Object.entries(meta.classes ?? {});
  const mixins = Object.values(meta.mixins ?? {});
  const incoming = new Map(mixins.map(item => [item.factory, item]));
  for (const [name, descriptor] of entries) {
    if (classes.has(name)) {
      throw new Error(`Duplicate class: ${name}`);
    }

    if (
      !Object.hasOwn(descriptor, "constructor") ||
      typeof descriptor.constructor !== "function"
    ) {
      throw new TypeError(`Missing constructor: ${name}`);
    }

    for (const mixin of descriptor.mixins ?? []) {
      if (!incoming.has(mixin) && !mixinMetadata.has(mixin)) {
        throw new Error(`Unknown mixin for ${name}`);
      }
    }
  }

  const pending = new Map(entries.map(([name, descriptor]) => [
    descriptor.constructor,
    {name, descriptor}
  ]));
  if (pending.size !== entries.length) {
    throw new Error("Duplicate constructor in meta");
  }

  const methods = descriptors => Object.entries(descriptors ?? {})
    .map(([name, descriptor]) => ({name, js: name, ...descriptor}));

  for (const mixin of mixins) {
    if (typeof mixin.factory !== "function") {
      throw new Error("Mixin factory must be a function");
    }
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

      const properties = Object.entries(descriptor.properties ?? {})
        .map(([name, property]) => ({
          name,
          js: name,
          ...property,
          computed: typeof property.compute === "function"
        }));

      installClass(
        klass,
        name,
        properties,
        methods(descriptor.methods),
        descriptor.registries,
        descriptor.restorations ?? [],
        descriptor.settings ?? []
      );

      pending.delete(klass);
      progress = true;
    }

    if (!progress) {
      throw new Error("Unresolvable superclass order in meta");
    }
  }
}

/**
 * Includes `mixins` in `klass`, which is not yet installed: each mixin wraps
 * the class's parent in turn, so `super` reaches through every module in
 * order, and a module's `ClassMethods` become static members of `klass`.
 *
 * @param {Function} klass The class, not yet installed.
 * @param {Function[]} mixins The mixin factories, in `include` order.
 * @param {Map} [incoming] Mixins from the bundle being installed, by factory.
 * @returns {void}
 * @throws {Error} When the class is already installed.
 */
export function include(klass, mixins, incoming = new Map()) {
  if (hasMetadata(klass)) {
    throw new Error("Mixins must be attached before class installation");
  }

  let parent = Object.getPrototypeOf(klass);
  for (const mixin of mixins) {
    parent = mixin(parent);
    if (mixinMetadata.has(mixin)) installMetadata(parent, [], mixinMetadata.get(mixin));
  }

  // Preserve native super through the mixin chain.
  Object.setPrototypeOf(klass.prototype, parent.prototype);
  Object.setPrototypeOf(klass, parent);

  for (const mixin of mixins) {
    const classFactory = incoming.get(mixin)?.classFactory ??
      mixinClassFactories.get(mixin);

    if (classFactory) {
      // Constructor helpers must not replace the super chain.
      const helpers = Object.getOwnPropertyDescriptors(
        classFactory(Object.getPrototypeOf(klass))
      );

      delete helpers.constructor;
      Object.defineProperties(klass, helpers);
    }
  }
}

/**
 * Returns `klass`'s own copy of the registry `name`, created on first use from
 * its parent's, so that adding to it leaves the parent's unchanged.
 *
 * @param {Function} klass
 * @param {string} name The registry, such as `associations`.
 * @param {"hash" | "array"} [initial] The empty value when nothing is
 *   inherited.
 * @returns {object | Array} The class's registry, which may be changed.
 */
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

/**
 * With no values, returns `klass`'s own setting `name`, or else the nearest
 * inherited one, or nil; with one value, sets the setting on `klass` and
 * returns the value.
 *
 * @param {Function} klass
 * @param {string} name
 * @param {Array} values Zero values to read, or one to set.
 * @returns {unknown} The setting.
 * @throws {Error} When given more than one value.
 */
export function classSetting(klass, name, values) {
  const own = configuration(klass).settings;

  if (values.length) {
    if (values.length !== 1) {
      throw new Error(`${name} expects zero or one argument`);
    }

    own.set(name, values[0]);
    return values[0];
  }

  if (own.has(name)) return own.get(name);

  const parent = Object.getPrototypeOf(klass);
  return typeof parent?.[name] === "function" ? parent[name]() : null;
}

/**
 * Returns the installed class whose own setting `name`, not an inherited one,
 * is `value`, or nil if there is none.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {Function | null}
 */
export function classWithSetting(name, value) {
  for (const klass of classes.values()) {
    if (classConfiguration.get(klass)?.settings.get(name) === value) return klass;
  }
  return null;
}

/**
 * Returns the identity store for `klass`, created on first use, in which its
 * records are pooled by id. A subclass has its own store.
 *
 * @param {Function} klass
 * @returns {object} A `Swill.Model.Store`.
 */
export function identityStore(klass) {
  let store = identityStores.get(klass);
  if (!store) {
    store = new (resolve("Swill::Model::Store"))();
    identityStores.set(klass, store);
  }
  return store;
}

// Reject declarations the runtime cannot honor.
function rejectProtocolConflicts(klass, properties, restorations) {
  const parent = Object.getPrototypeOf(klass);
  const declared = new Map([
    ...declarations(parent, "properties"),
    ...properties.map(property => [property.name, property])
  ]);
  const own = Object.getOwnPropertyDescriptors(klass.prototype);

  for (const property of declared.values()) {
    if (own[property.js]?.set) {
      throw new Error(`Setter method for declared property: ${property.name}`);
    }
  }

  const keys = new Set(
    declarations(parent, "restorations").map(restoration => restoration.key)
  );

  for (const restoration of restorations) {
    if (!declared.has(restoration.path.split(".")[0])) {
      throw new Error(`Restorable path must start with a declared property: ${restoration.path}`);
    }
    if (keys.has(restoration.key)) {
      throw new Error(`Duplicate restorable key: ${restoration.key}`);
    }

    keys.add(restoration.key);
  }
}

/**
 * Installs one class: its metadata, settings, and registries, and an
 * observable accessor on its prototype for each declared property. `install`
 * calls this for each class a bundle defines.
 *
 * @param {Function} klass
 * @param {string} name The installed name, such as `"Swill::View"`.
 * @param {object[]} properties Property descriptors.
 * @param {object[]} methods Method descriptors.
 * @param {object} [registries] Registry values by name.
 * @param {object[]} [restorations] Restorable path declarations.
 * @param {object[]} [settings] Class body settings, applied in order.
 * @returns {void}
 * @throws {Error} `Duplicate class`; a setter defined for a declared
 *   property; a restorable path not starting with a declared property, or
 *   a duplicate restorable key; a setting or registry the class does not
 *   declare.
 */
export function installClass(klass, name, properties, methods, registries = {}, restorations = [],
  settings = []) {
  if (classes.has(name)) {
    throw new Error(`Duplicate class: ${name}`);
  }

  rejectProtocolConflicts(klass, properties, restorations);
  installMetadata(klass, properties, methods, restorations);

  // Class body settings (endpoint "/api/menus") apply through the setting
  // method the class's ClassMethods declare.
  for (const setting of settings) {
    if (typeof klass[setting.js] !== "function") {
      throw new Error(`Missing setting declaration: ${setting.name}`);
    }
    klass[setting.js](setting.value);
  }

  // A declaration-time registry snapshot replaces the class's inherited
  // copy exactly. The runtime never learns what any of its values mean.
  for (const [registryName, values] of Object.entries(registries ?? {})) {
    if (typeof klass[registryName] !== "function") {
      throw new Error(`Missing registry declaration: ${registryName}`);
    }

    const registry = klass[registryName]();
    if (Array.isArray(registry)) {
      registry.splice(0, registry.length, ...values);
    } else {
      for (const key of Object.keys(registry)) delete registry[key];
      Object.assign(registry, values);
    }
  }

  for (const descriptor of properties) {
    Object.defineProperty(klass.prototype, descriptor.js, {
      configurable: true,
      get() {
        record(this, descriptor.name);
        // Reads follow record, will-access, resolve. Only a property that
        // declares willAccess pays for the hook.
        if (descriptor.willAccess) this.propertyWillAccess(descriptor.name);
        return descriptor.computed
          ? computedValue(this, descriptor)
          : storedValue(this, descriptor);
      },
      ...(descriptor.computed && !descriptor.writer ? {} : {
        set(value) {
          writeProperty(this, descriptor, value);
        }
      })
    });
  }

  classes.set(name, klass);
  names.set(klass, name);
}

// Markup resolves registered classes only.
// The installed class for a name, or undefined.
export function registered(name) {
  return classes.get(name);
}

/**
 * Returns the installed name of the nearest installed class of `object`, or
 * nil if there is none.
 *
 * @param {object} object
 * @returns {string | null}
 */
export function nameOf(object) {
  for (let prototype = Object.getPrototypeOf(object); prototype; prototype = Object.getPrototypeOf(prototype)) {
    const name = names.get(prototype.constructor);
    if (name) return name;
  }
  return null;
}

/**
 * Returns the installed class named `name`, as markup names it: an installed
 * name such as `"Swill::View"`, or the name a plain JavaScript class was
 * registered under.
 *
 * @param {string} name
 * @returns {Function}
 * @throws {Error} `Unknown class` when nothing is installed under the name.
 */
export function resolve(name) {
  if (!classes.has(name)) {
    throw new Error(`Unknown class: ${name}`);
  }

  return classes.get(name);
}
