// Browser-only support. No Ruby object model, prototype patches, or eval.
// Static declarations are installed by generated code; changing state lives here.
const classes = new Map();
const metadata = new WeakMap();
const mixinMetadata = new WeakMap();
const mixinClassFactories = new WeakMap();
const classConfiguration = new WeakMap();
const states = new WeakMap();
const captures = [];

// JS trim also strips NBSP and other Unicode whitespace that Ruby String#strip
// retains. Static Ruby calls and string-path calls must use the same rule.
function strip(value) {
  return value.replace(/^[\x00\t\n\v\f\r ]+|[\x00\t\n\v\f\r ]+$/g, "");
}

function state(object) {
  if (!states.has(object)) {
    states.set(object, {values: new Map(), computed: new Map(), observers: new Map(), dependents: new Map()});
  }
  return states.get(object);
}

function declarations(klass, kind) {
  for (let current = klass; current; current = Object.getPrototypeOf(current)) {
    const known = metadata.get(current);
    if (known) return known[kind];
  }
  return new Map();
}

function installMetadata(klass, properties, methods) {
  const parent = Object.getPrototypeOf(klass);
  metadata.set(klass, {
    properties: new Map([...declarations(parent, "properties"), ...properties.map(item => [item.name, item])]),
    methods: new Map([...declarations(parent, "methods"), ...methods.map(item => [item.name, item])])
  });
}

function configuration(klass) {
  if (!classConfiguration.has(klass)) {
    classConfiguration.set(klass, {registries: new Map(), settings: new Map()});
  }
  return classConfiguration.get(klass);
}

function record(object, name) {
  const frame = captures.at(-1);
  if (!frame) return;
  if (!frame.has(object)) frame.set(object, new Set());
  frame.get(object).add(name);
}

function listeners(object, name, kind) {
  const table = state(object)[kind];
  if (!table.has(name)) table.set(name, new Set());
  return table.get(name);
}

function subscribe(object, name, callback, kind) {
  const descriptor = declarations(object.constructor, "properties").get(name);
  if (!descriptor) throw new Error(`Unknown observable property: ${name}`);
  if (descriptor.computed) computedValue(object, descriptor);
  const set = listeners(object, name, kind);
  set.add(callback);
  return () => set.delete(callback);
}

function storedValue(object, descriptor) {
  const values = state(object).values;
  if (!values.has(descriptor.name)) values.set(descriptor.name, descriptor.defaultValue.call(object));
  return values.get(descriptor.name);
}

function computedValue(object, descriptor) {
  const slots = state(object).computed;
  let slot = slots.get(descriptor.name);
  if (!slot) {
    slot = {valid: false, running: false, value: undefined, disposers: []};
    slots.set(descriptor.name, slot);
  }
  if (slot.valid) return slot.value;
  if (slot.running) throw new Error(`Computed cycle: ${descriptor.name}`);
  slot.disposers.splice(0).forEach(dispose => dispose());
  const frame = new Map();
  slot.running = true;
  captures.push(frame);
  try {
    slot.value = descriptor.compute.call(object);
    slot.valid = true;
  } finally {
    captures.pop();
    slot.running = false;
  }
  for (const [dependency, names] of frame) {
    for (const name of names) {
      slot.disposers.push(subscribe(dependency, name, () => invalidate(object, descriptor), "dependents"));
    }
  }
  return slot.value;
}

function invalidate(object, descriptor) {
  const slot = state(object).computed.get(descriptor.name);
  if (!slot?.valid) return;
  const previous = slot.value;
  slot.valid = false;
  for (const callback of [...listeners(object, descriptor.name, "dependents")]) callback();
  if (listeners(object, descriptor.name, "observers").size) {
    const value = computedValue(object, descriptor);
    if (!Runtime.equal(previous, value)) notify(object, descriptor.name, previous, value);
  }
}

function notify(object, name, previous, value) {
  for (const callback of [...listeners(object, name, "dependents")]) callback();
  const hook = declarations(object.constructor, "methods").get(`${name}_did_change`);
  if (hook) object[hook.js](previous, value);
  for (const callback of [...listeners(object, name, "observers")]) callback(value, previous);
}

function writeProperty(object, descriptor, value) {
  const previous = storedValue(object, descriptor);
  value = object.coerce_property_value(descriptor.name, value, previous);
  if (Runtime.equal(previous, value)) return value;
  object.property_will_change(descriptor.name, previous, value);
  state(object).values.set(descriptor.name, value);
  notify(object, descriptor.name, previous, value);
  return value;
}

function pathWriter(object, path) {
  const names = path.split(".");
  const name = names.pop();
  const owner = names.reduce((target, segment) => Runtime.read(target, segment), object);
  if (owner == null) return null;
  const descriptor = declarations(owner.constructor, "properties").get(name);
  if (!descriptor || descriptor.computed) throw new Error(`Read-only binding: ${path}`);
  return {owner, descriptor};
}

export const Runtime = {
  // One load-time operation over generated data. Definitions are inert until
  // here; install parents before children regardless of object key order.
  install(meta) {
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
        if (descriptor.mixins?.length) this.include(klass, descriptor.mixins, incoming);
        const properties = Object.entries(descriptor.properties ?? {}).map(([name, property]) =>
          ({name, js: name, ...property, computed: typeof property.compute === "function"}));
        this.installClass(klass, name, properties, methods(descriptor.methods), descriptor.registries);
        pending.delete(klass);
        progress = true;
      }
      if (!progress) throw new Error("Unresolvable superclass order in meta");
    }
  },

  include(klass, mixins, incoming = new Map()) {
    if (metadata.has(klass)) throw new Error("Mixins must be attached before class installation");
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
  },

  inheritableRegistry(klass, name, initial = "hash") {
    const own = configuration(klass).registries;
    if (own.has(name)) return own.get(name);
    const parent = Object.getPrototypeOf(klass);
    const inherited = typeof parent?.[name] === "function" ? parent[name]() : undefined;
    const value = inherited === undefined
      ? (initial === "array" ? [] : {})
      : (Array.isArray(inherited) ? [...inherited] : {...inherited});
    own.set(name, value);
    return value;
  },

  classSetting(klass, name, values) {
    const own = configuration(klass).settings;
    if (values.length) {
      if (values.length !== 1) throw new Error(`${name} expects zero or one argument`);
      own.set(name, values[0]);
      return values[0];
    }
    if (own.has(name)) return own.get(name);
    const parent = Object.getPrototypeOf(klass);
    return typeof parent?.[name] === "function" ? parent[name]() : null;
  },

  installClass(klass, name, properties, methods, registries = {}) {
    if (classes.has(name)) throw new Error(`Duplicate class: ${name}`);
    installMetadata(klass, properties, methods);
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
  },

  // Fail closed: markup cannot traverse globals or instantiate arbitrary values.
  resolve(name) {
    if (!classes.has(name)) throw new Error(`Unknown class: ${name}`);
    return classes.get(name);
  },

  truthy(value) { return value !== false && value !== null && value !== undefined; },

  // Spike contract: scalar values and acyclic arrays have Ruby value equality;
  // framework objects retain identity. General Hash/custom == is not implemented.
  equal(left, right) {
    if (left === right) return true;
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => this.equal(value, right[index]));
  },

  valueRead(value, name) {
    if (name === "blank?") {
      if (value == null || value === false) return true;
      if (typeof value === "string") return strip(value).length === 0;
      if (Array.isArray(value)) return value.length === 0;
      return false;
    }
    if (typeof value !== "string") throw new TypeError(`${name} requires a string`);
    switch (name) {
      case "strip": return strip(value);
      case "upcase": return value.toUpperCase();
      case "downcase": return value.toLowerCase();
      default: throw new Error(`Unknown value reader: ${name}`);
    }
  },

  read(object, name) {
    if (object == null) return null;
    const property = declarations(object.constructor, "properties").get(name);
    if (property) return object[property.js];
    const method = declarations(object.constructor, "methods").get(name);
    if (method?.arity === 0) return object[method.js]();
    if (["strip", "upcase", "downcase", "blank?"].includes(name)) return this.valueRead(object, name);
    throw new Error(`Unknown reader: ${name}`);
  },

  readPath(object, path) {
    return path.split(".").reduce((owner, name) => this.read(owner, name), object);
  },

  writePath(object, path, value) {
    const writer = pathWriter(object, path);
    if (!writer) throw new Error(`Unavailable binding owner: ${path}`);
    return writeProperty(writer.owner, writer.descriptor, value);
  },

  invoke(object, name, ...args) {
    const method = declarations(object.constructor, "methods").get(name);
    if (!method || method.arity !== args.length) throw new Error(`Unknown action or wrong arity: ${name}`);
    return object[method.js](...args);
  },

  observePath(object, path, callback) {
    let disposers = [];
    let active = true;
    const rehook = () => {
      disposers.splice(0).forEach(dispose => dispose());
      let owner = object;
      for (const name of path.split(".")) {
        if (owner == null) break;
        if (declarations(owner.constructor, "properties").has(name)) {
          disposers.push(subscribe(owner, name, () => {
            if (!active) return;
            rehook(); // Rebind before user code can mutate the new subtree.
            callback(this.readPath(object, path));
          }, "observers"));
        }
        owner = this.read(owner, name);
      }
    };
    rehook();
    return () => {
      active = false;
      disposers.splice(0).forEach(dispose => dispose());
    };
  },

  // Minimal DOM boundary for the browser slice; not a port of Awakening.
  bindElement(object, path, element, {twoWay = false} = {}) {
    if (twoWay) pathWriter(object, path);
    const render = () => {
      const value = this.readPath(object, path);
      if (twoWay) element.value = value ?? "";
      else element.textContent = value ?? "";
    };
    render();
    const dispose = this.observePath(object, path, render);
    const input = () => this.writePath(object, path, element.value);
    if (twoWay) element.addEventListener("input", input);
    return () => {
      dispose();
      if (twoWay) element.removeEventListener("input", input);
    };
  }
};

export class ReactiveObject {
  coerce_property_value(_name, value, _previous) { return value; }
  property_will_change(_name, _previous, _value) {}

  observe(name, callback) { return subscribe(this, name, callback, "observers"); }

  draft() {
    const copy = new this.constructor();
    for (const descriptor of declarations(this.constructor, "properties").values()) {
      if (descriptor.attribute && !descriptor.computed) copy[descriptor.js] = this[descriptor.js];
    }
    return copy;
  }

  dispose() {
    const current = states.get(this);
    if (!current) return;
    for (const slot of current.computed.values()) slot.disposers.splice(0).forEach(dispose => dispose());
    current.computed.clear();
    current.observers.clear();
    current.dependents.clear();
  }
}
