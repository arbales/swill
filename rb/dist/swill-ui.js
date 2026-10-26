(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // rb/runtime/metadata.mjs
  var metadata = /* @__PURE__ */ new WeakMap();
  function declarations(klass, kind) {
    for (let current = klass; current; current = Object.getPrototypeOf(current)) {
      const known = metadata.get(current);
      if (known) return known[kind];
    }
    return kind === "restorations" ? [] : /* @__PURE__ */ new Map();
  }
  function hasMetadata(klass) {
    return metadata.has(klass);
  }
  function hasInstalledMetadata(klass) {
    for (let current = klass; current; current = Object.getPrototypeOf(current)) {
      if (metadata.has(current)) return true;
    }
    return false;
  }
  function aliasJavaScriptNames(klass) {
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
  function installMetadata(klass, properties, methods, restorations2 = []) {
    const parent = Object.getPrototypeOf(klass);
    metadata.set(klass, {
      properties: new Map([
        ...declarations(parent, "properties"),
        ...properties.map((item) => [item.name, item])
      ]),
      methods: new Map([
        ...declarations(parent, "methods"),
        ...methods.map((item) => [item.name, item])
      ]),
      restorations: [
        ...declarations(parent, "restorations"),
        ...restorations2
      ]
    });
  }

  // rb/runtime/values.mjs
  function stripString(value) {
    return value.replace(/^[\x00\t\n\v\f\r ]+|[\x00\t\n\v\f\r ]+$/g, "");
  }
  function isTruthy(value) {
    return value !== false && value !== null && value !== void 0;
  }
  function logicalAnd(left, right) {
    return isTruthy(left) ? right() : left;
  }
  function logicalOr(left, right) {
    return isTruthy(left) ? left : right();
  }
  function nilable(value) {
    return value === void 0 ? null : value;
  }
  function isEqual(left, right) {
    if (left === right) return true;
    if (left == null && right == null) return true;
    const valueType = left?.[/* @__PURE__ */ Symbol.for("swill.data.type")];
    if (valueType && valueType === right?.[/* @__PURE__ */ Symbol.for("swill.data.type")]) {
      return left.equals(right);
    }
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => isEqual(value, right[index]));
  }
  function isPlainObject(value) {
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }
  function duplicate(value) {
    if (Array.isArray(value)) return value.slice();
    if (isPlainObject(value)) return { ...value };
    if (value !== null && typeof value === "object") {
      throw new TypeError("dup of a framework object is not supported; use draft");
    }
    return value;
  }
  function isBlank(value) {
    if (value == null || value === false) return true;
    if (typeof value === "string") return stripString(value).length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (isPlainObject(value)) return Object.keys(value).length === 0;
    return false;
  }
  function isPresent(value) {
    return !isBlank(value);
  }
  function isEmpty(value) {
    if (typeof value === "string" || Array.isArray(value)) {
      return value.length === 0;
    }
    if (isPlainObject(value)) return Object.keys(value).length === 0;
    throw new TypeError("empty? requires a string, array, or hash");
  }
  function strip(value) {
    if (typeof value !== "string") throw new TypeError("strip requires a string");
    return stripString(value);
  }
  function upcase(value) {
    if (typeof value !== "string") throw new TypeError("upcase requires a string");
    return value.toUpperCase();
  }
  function downcase(value) {
    if (typeof value !== "string") throw new TypeError("downcase requires a string");
    return value.toLowerCase();
  }
  function length(value) {
    if (typeof value === "string" || Array.isArray(value)) {
      return value.length;
    }
    if (isPlainObject(value)) return Object.keys(value).length;
    throw new TypeError("length requires a string, array, or hash");
  }
  function stringify(value) {
    return value == null ? "" : String(value);
  }
  function toInteger(value) {
    const match = /^\s*[+-]?\d+/.exec(String(value));
    return match ? Number.parseInt(match[0], 10) : 0;
  }
  function toFloat(value) {
    const match = /^\s*[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(String(value));
    return match ? Number.parseFloat(match[0]) : 0;
  }
  function capitalize(value) {
    if (typeof value !== "string") {
      throw new TypeError("capitalize requires a string");
    }
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1).toLowerCase();
  }
  function split(value, separator) {
    if (typeof value !== "string") {
      throw new TypeError("split requires a string");
    }
    const parts = separator === void 0 || separator === " " ? stripString(value).split(/\s+/).filter((part) => part.length > 0) : value.split(separator);
    while (parts.length > 0 && parts.at(-1) === "") parts.pop();
    return parts;
  }
  function slice(value, start2, count) {
    if (typeof value !== "string") {
      throw new TypeError("slice requires a string");
    }
    const from = start2 < 0 ? value.length + start2 : start2;
    if (count === void 0) {
      return from >= 0 && from < value.length ? value[from] : null;
    }
    if (from < 0 || from > value.length || count < 0) return null;
    return value.substr(from, count);
  }
  function compare(left, right) {
    if (typeof left !== typeof right) {
      throw new TypeError("comparison of mismatched types");
    }
    return left < right ? -1 : left > right ? 1 : 0;
  }
  function sort(values) {
    return values.slice().sort(compare);
  }
  function sortWith(values, comparator) {
    return values.slice().sort(comparator);
  }
  function sortBy(values, keyOf) {
    return values.map((value, index) => ({ value, key: keyOf(value), index })).sort((left, right) => compare(left.key, right.key) || left.index - right.index).map((entry) => entry.value);
  }
  function minBy(values, keyOf) {
    return values.length === 0 ? null : sortBy(values, keyOf)[0];
  }
  function maxBy(values, keyOf) {
    return values.length === 0 ? null : sortBy(values, keyOf).at(-1);
  }
  function min(values) {
    return values.length === 0 ? null : sort(values)[0];
  }
  function max(values) {
    return values.length === 0 ? null : sort(values).at(-1);
  }
  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }
  function uniq(values) {
    return values.filter(
      (value, index) => values.findIndex((other) => isEqual(other, value)) === index
    );
  }
  function compact(values) {
    return values.filter((value) => value != null);
  }
  function flatten(values) {
    return values.flat(Infinity);
  }
  function reverse(values) {
    return values.slice().reverse();
  }
  function indexOf(values, wanted) {
    const index = values.findIndex((value) => isEqual(value, wanted));
    return index < 0 ? null : index;
  }
  function append(values, value) {
    values.push(value);
    return values;
  }
  function prepend(values, value) {
    values.unshift(value);
    return values;
  }
  function difference(values, removed) {
    return values.filter(
      (value) => !removed.some((other) => isEqual(other, value))
    );
  }
  function fetch2(hash, key, ...fallback) {
    if (Object.hasOwn(hash, key)) return hash[key];
    if (fallback.length > 0) return fallback[0];
    throw new Error(`key not found: ${key}`);
  }
  function deleteKey(hash, key) {
    if (!Object.hasOwn(hash, key)) return null;
    const value = hash[key];
    delete hash[key];
    return value;
  }
  function intDiv(left, right) {
    if (right === 0) throw new RangeError("divided by 0");
    return Math.floor(left / right);
  }
  function modulo(left, right) {
    if (right === 0) throw new RangeError("divided by 0");
    return (left % right + right) % right;
  }
  function isNumber(value) {
    return typeof value === "number";
  }
  function isBoolean(value) {
    return typeof value === "boolean";
  }
  function compareText(left, right) {
    return left.localeCompare(right);
  }
  function between(value, low, high) {
    return value >= low && value <= high;
  }
  function clamp(value, low, high) {
    return Math.min(Math.max(value, low), high);
  }
  function arrayOnly(value, name) {
    if (!Array.isArray(value)) throw new TypeError(`${name} requires an array`);
    return value;
  }
  function valueInvoke(value, name, args) {
    switch (name) {
      case "index":
        return indexOf(arrayOnly(value, name), args[0]);
      case "take":
        return arrayOnly(value, name).slice(0, args[0]);
      case "drop":
        return arrayOnly(value, name).slice(args[0]);
      case "include?":
        return typeof value === "string" ? value.includes(args[0]) : arrayOnly(value, name).some((other) => isEqual(other, args[0]));
      default:
        throw new Error(`Unknown value method: ${name}`);
    }
  }
  function valueRead(value, name) {
    switch (name) {
      case "nil?":
        return value == null;
      case "zero?":
        return typeof value === "number" && value === 0;
      case "positive?":
        return typeof value === "number" && value > 0;
      case "negative?":
        return typeof value === "number" && value < 0;
      case "blank?":
        return isBlank(value);
      case "present?":
        return isPresent(value);
      case "empty?":
        return isEmpty(value);
      case "size":
      case "length":
        return length(value);
      case "strip":
        return strip(value);
      case "upcase":
        return upcase(value);
      case "downcase":
        return downcase(value);
      case "dup":
        return duplicate(value);
      case "first":
        return arrayOnly(value, name).length > 0 ? value[0] : null;
      case "last":
        return arrayOnly(value, name).length > 0 ? value.at(-1) : null;
      case "compact":
        return compact(arrayOnly(value, name));
      case "uniq":
        return uniq(arrayOnly(value, name));
      case "reverse":
        return typeof value === "string" ? [...value].reverse().join("") : reverse(arrayOnly(value, name));
      case "sum":
        return sum(arrayOnly(value, name));
      case "min":
        return min(arrayOnly(value, name));
      case "max":
        return max(arrayOnly(value, name));
      case "to_s":
        return stringify(value);
      case "to_sym":
        return String(value);
      case "to_i":
        return toInteger(value);
      case "to_f":
        return toFloat(value);
      case "capitalize":
        return capitalize(value);
      default:
        throw new Error(`Unknown value reader: ${name}`);
    }
  }
  var NIL_READERS = ["nil?", "blank?", "present?", "to_s", "to_i", "to_f"];
  var VALUE_READERS = [
    "nil?",
    "zero?",
    "positive?",
    "negative?",
    "blank?",
    "present?",
    "empty?",
    "size",
    "length",
    "strip",
    "upcase",
    "downcase",
    "dup",
    "first",
    "last",
    "compact",
    "uniq",
    "reverse",
    "sum",
    "min",
    "max",
    "to_s",
    "to_sym",
    "to_i",
    "to_f",
    "capitalize"
  ];
  var VALUE_METHODS = ["index", "take", "drop", "include?"];

  // rb/runtime/properties.mjs
  var states = /* @__PURE__ */ new WeakMap();
  var captures = [];
  var dependentTargets = /* @__PURE__ */ new WeakMap();
  function state(object) {
    let current = states.get(object);
    if (!current) {
      current = {
        values: /* @__PURE__ */ new Map(),
        computed: /* @__PURE__ */ new Map(),
        observers: /* @__PURE__ */ new Map(),
        dependents: /* @__PURE__ */ new Map(),
        retained: []
      };
      states.set(object, current);
      for (const descriptor of declarations(object.constructor, "properties").values()) {
        if (descriptor.computed && hooked(object, descriptor.name)) {
          computedValue(object, descriptor);
        }
      }
    }
    return current;
  }
  function hooked(object, name) {
    return declarations(object.constructor, "methods").has(`${name}_did_change`);
  }
  function record(object, name) {
    const frame = captures.at(-1);
    if (!frame) return;
    if (!frame.has(object)) frame.set(object, /* @__PURE__ */ new Set());
    frame.get(object).add(name);
  }
  function listeners(object, name, kind) {
    const table = state(object)[kind];
    if (!table.has(name)) table.set(name, /* @__PURE__ */ new Set());
    return table.get(name);
  }
  function subscribe(object, name, callback, kind, target = null) {
    if (target) dependentTargets.set(callback, target);
    const descriptor = declarations(object.constructor, "properties").get(name);
    if (!descriptor) {
      throw new Error(`Unknown observable property: ${name}`);
    }
    if (descriptor.computed) computedValue(object, descriptor);
    const set = listeners(object, descriptor.name, kind);
    set.add(callback);
    return () => set.delete(callback);
  }
  function observed(object, name, visited = /* @__PURE__ */ new Map()) {
    const names2 = visited.get(object) ?? /* @__PURE__ */ new Set();
    if (names2.has(name)) return false;
    names2.add(name);
    visited.set(object, names2);
    const current = states.get(object);
    if (!current) return false;
    if (current.observers.get(name)?.size || hooked(object, name)) return true;
    for (const callback of current.dependents.get(name) ?? []) {
      const target = dependentTargets.get(callback);
      if (target && observed(target[0], target[1], visited)) return true;
    }
    return false;
  }
  function storedValue(object, descriptor) {
    const values = state(object).values;
    if (!values.has(descriptor.name)) {
      values.set(descriptor.name, descriptor.defaultValue.call(object));
    }
    return values.get(descriptor.name);
  }
  function computedValue(object, descriptor) {
    const slots = state(object).computed;
    let slot = slots.get(descriptor.name);
    if (!slot) {
      slot = {
        valid: false,
        running: false,
        value: void 0,
        disposers: []
      };
      slots.set(descriptor.name, slot);
    }
    if (slot.valid) return slot.value;
    if (slot.running) {
      throw new Error(`Computed cycle: ${descriptor.name}`);
    }
    slot.disposers.splice(0).forEach((dispose) => dispose());
    const frame = /* @__PURE__ */ new Map();
    slot.running = true;
    captures.push(frame);
    try {
      slot.value = descriptor.compute.call(object);
      slot.valid = true;
    } finally {
      captures.pop();
      slot.running = false;
    }
    for (const [dependency, names2] of frame) {
      for (const name of names2) {
        slot.disposers.push(
          subscribe(
            dependency,
            name,
            () => invalidate(object, descriptor),
            "dependents",
            [object, descriptor.name]
          )
        );
      }
    }
    return slot.value;
  }
  function invalidate(object, descriptor) {
    const slot = state(object).computed.get(descriptor.name);
    if (!slot?.valid) return;
    const previous = slot.value;
    slot.valid = false;
    slot.disposers.splice(0).forEach((dispose) => dispose());
    for (const callback of [
      ...listeners(object, descriptor.name, "dependents")
    ]) callback();
    if (listeners(object, descriptor.name, "observers").size || hooked(object, descriptor.name)) {
      const value = computedValue(object, descriptor);
      if (!isEqual(previous, value)) notify(object, descriptor.name, previous, value);
    }
  }
  function notify(object, name, previous, value) {
    for (const callback of [
      ...listeners(object, name, "dependents")
    ]) callback();
    const hook = declarations(object.constructor, "methods").get(`${name}_did_change`);
    if (hook) object[hook.js](previous, value);
    for (const callback of [
      ...listeners(object, name, "observers")
    ]) callback(value, previous);
  }
  function writeProperty(object, descriptor, value) {
    if (descriptor.writer) return object[descriptor.writer](value);
    if (descriptor.computed) throw new Error(`Read-only property: ${descriptor.name}`);
    const previous = storedValue(object, descriptor);
    value = object.coercePropertyValue(descriptor.name, value, previous);
    if (isEqual(previous, value)) return value;
    object.propertyWillChange(descriptor.name, previous, value);
    state(object).values.set(descriptor.name, value);
    notify(object, descriptor.name, previous, value);
    return value;
  }
  function observe(object, name, callback) {
    return subscribe(object, name, callback, "observers");
  }
  function retain(object, disposer) {
    state(object).retained.push(disposer);
    return disposer;
  }
  function release(object, disposer) {
    const retained = states.get(object)?.retained;
    const index = retained ? retained.indexOf(disposer) : -1;
    if (index >= 0) retained.splice(index, 1);
    disposer();
  }
  function dealloc(object) {
    const current = states.get(object);
    if (current) current.retained.splice(0).forEach((disposer) => disposer());
    disconnect(object);
  }
  function disconnect(object) {
    const current = states.get(object);
    if (!current) return;
    const dependents = [...current.dependents.values()].flatMap((callbacks) => [...callbacks]);
    for (const slot of current.computed.values()) {
      slot.disposers.splice(0).forEach((dispose) => dispose());
    }
    current.computed.clear();
    current.observers.clear();
    current.dependents.clear();
    dependents.forEach((callback) => callback());
  }

  // rb/runtime/install.mjs
  var classes = /* @__PURE__ */ new Map();
  var names = /* @__PURE__ */ new Map();
  var mixinMetadata = /* @__PURE__ */ new WeakMap();
  var mixinClassFactories = /* @__PURE__ */ new WeakMap();
  var classConfiguration = /* @__PURE__ */ new WeakMap();
  var identityStores = /* @__PURE__ */ new WeakMap();
  function configuration(klass) {
    if (!classConfiguration.has(klass)) {
      classConfiguration.set(klass, {
        registries: /* @__PURE__ */ new Map(),
        settings: /* @__PURE__ */ new Map()
      });
    }
    return classConfiguration.get(klass);
  }
  function install(meta2) {
    const entries = Object.entries(meta2.classes ?? {});
    const mixins = Object.values(meta2.mixins ?? {});
    const incoming = new Map(mixins.map((item) => [item.factory, item]));
    for (const [name, descriptor] of entries) {
      if (classes.has(name)) {
        throw new Error(`Duplicate class: ${name}`);
      }
      if (!Object.hasOwn(descriptor, "constructor") || typeof descriptor.constructor !== "function") {
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
      { name, descriptor }
    ]));
    if (pending.size !== entries.length) {
      throw new Error("Duplicate constructor in meta");
    }
    const methods = (descriptors) => Object.entries(descriptors ?? {}).map(([name, descriptor]) => ({ name, js: name, ...descriptor }));
    for (const mixin of mixins) {
      if (typeof mixin.factory !== "function") {
        throw new Error("Mixin factory must be a function");
      }
      if (mixin.classFactory !== void 0 && typeof mixin.classFactory !== "function") {
        throw new Error("ClassMethods factory must be a function");
      }
      mixinMetadata.set(mixin.factory, methods(mixin.methods));
      if (mixin.classFactory) mixinClassFactories.set(mixin.factory, mixin.classFactory);
    }
    while (pending.size) {
      let progress = false;
      for (const [klass, { name, descriptor }] of pending) {
        if (pending.has(Object.getPrototypeOf(klass))) continue;
        if (descriptor.mixins?.length) include(klass, descriptor.mixins, incoming);
        const properties = Object.entries(descriptor.properties ?? {}).map(([name2, property]) => ({
          name: name2,
          js: name2,
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
  function include(klass, mixins, incoming = /* @__PURE__ */ new Map()) {
    if (hasMetadata(klass)) {
      throw new Error("Mixins must be attached before class installation");
    }
    let parent = Object.getPrototypeOf(klass);
    for (const mixin of mixins) {
      parent = mixin(parent);
      if (mixinMetadata.has(mixin)) installMetadata(parent, [], mixinMetadata.get(mixin));
    }
    Object.setPrototypeOf(klass.prototype, parent.prototype);
    Object.setPrototypeOf(klass, parent);
    for (const mixin of mixins) {
      const classFactory = incoming.get(mixin)?.classFactory ?? mixinClassFactories.get(mixin);
      if (classFactory) {
        const helpers = Object.getOwnPropertyDescriptors(
          classFactory(Object.getPrototypeOf(klass))
        );
        delete helpers.constructor;
        Object.defineProperties(klass, helpers);
      }
    }
  }
  function inheritableRegistry(klass, name, initial = "hash") {
    const own = configuration(klass).registries;
    if (own.has(name)) return own.get(name);
    const parent = Object.getPrototypeOf(klass);
    const inherited = typeof parent?.[name] === "function" ? parent[name]() : void 0;
    const value = inherited === void 0 ? initial === "array" ? [] : {} : Array.isArray(inherited) ? [...inherited] : { ...inherited };
    own.set(name, value);
    return value;
  }
  function classSetting(klass, name, values) {
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
  function classWithSetting(name, value) {
    for (const klass of classes.values()) {
      if (classConfiguration.get(klass)?.settings.get(name) === value) return klass;
    }
    return null;
  }
  function identityStore(klass) {
    let store = identityStores.get(klass);
    if (!store) {
      store = new (resolve("Swill::Model::Store"))();
      identityStores.set(klass, store);
    }
    return store;
  }
  function rejectProtocolConflicts(klass, properties, restorations2) {
    const parent = Object.getPrototypeOf(klass);
    const declared = new Map([
      ...declarations(parent, "properties"),
      ...properties.map((property) => [property.name, property])
    ]);
    const own = Object.getOwnPropertyDescriptors(klass.prototype);
    for (const property of declared.values()) {
      if (own[property.js]?.set) {
        throw new Error(`Setter method for declared property: ${property.name}`);
      }
    }
    const keys = new Set(
      declarations(parent, "restorations").map((restoration) => restoration.key)
    );
    for (const restoration of restorations2) {
      if (!declared.has(restoration.path.split(".")[0])) {
        throw new Error(`Restorable path must start with a declared property: ${restoration.path}`);
      }
      if (keys.has(restoration.key)) {
        throw new Error(`Duplicate restorable key: ${restoration.key}`);
      }
      keys.add(restoration.key);
    }
  }
  function installClass(klass, name, properties, methods, registries = {}, restorations2 = [], settings = []) {
    if (classes.has(name)) {
      throw new Error(`Duplicate class: ${name}`);
    }
    rejectProtocolConflicts(klass, properties, restorations2);
    installMetadata(klass, properties, methods, restorations2);
    for (const setting of settings) {
      if (typeof klass[setting.js] !== "function") {
        throw new Error(`Missing setting declaration: ${setting.name}`);
      }
      klass[setting.js](setting.value);
    }
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
          if (descriptor.willAccess) this.propertyWillAccess(descriptor.name);
          return descriptor.computed ? computedValue(this, descriptor) : storedValue(this, descriptor);
        },
        // A computed property without a writer has a setter all the same, so
        // an assignment raises `Read-only property` rather than TypeError.
        set(value) {
          writeProperty(this, descriptor, value);
        }
      });
    }
    classes.set(name, klass);
    names.set(klass, name);
  }
  function registered(name) {
    return classes.get(name);
  }
  function nameOf(object) {
    for (let prototype = Object.getPrototypeOf(object); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const name = names.get(prototype.constructor);
      if (name) return name;
    }
    return null;
  }
  function resolve(name) {
    if (!classes.has(name) && name.includes(".") && !name.includes("::")) name = name.replaceAll(".", "::");
    if (!classes.has(name) && publicNames.has(name)) return publicNames.get(name);
    if (!classes.has(name)) {
      throw new Error(`Unknown class: ${name}`);
    }
    return classes.get(name);
  }
  function aliasInstalledJavaScriptNames(names2 = {}) {
    for (const klass of classes.values()) aliasJavaScriptNames(klass);
    for (const [name, klass] of Object.entries(names2)) publicNames.set(name, klass);
  }
  var publicNames = /* @__PURE__ */ new Map();
  function classIsA(name, ancestor) {
    const klass = resolve(name);
    const parent = resolve(ancestor);
    return klass === parent || klass.prototype instanceof parent;
  }

  // rb/runtime/arguments.mjs
  var KEYWORDS = /* @__PURE__ */ Symbol("Swill keywords");
  var BLOCK = /* @__PURE__ */ Symbol("Swill block");
  var OMITTED = Object.freeze({});
  function keywordArguments(value) {
    return { [KEYWORDS]: true, value };
  }
  function blockArgument(value) {
    return { [BLOCK]: true, value };
  }
  function omittedArgument() {
    return OMITTED;
  }
  function isOmittedArgument(value) {
    return value === OMITTED;
  }
  function isKeywordArguments(value) {
    return value != null && value[KEYWORDS] === true;
  }
  function isBlockArgument(value) {
    return value != null && value[BLOCK] === true;
  }
  function positionalArgumentCount(values) {
    let count = values.length;
    if (count > 0 && isBlockArgument(values[count - 1])) count -= 1;
    if (count > 0 && isKeywordArguments(values[count - 1])) count -= 1;
    return count;
  }
  function bindArguments(values, signature) {
    const supplied = values.slice();
    const blockCarrier = isBlockArgument(supplied.at(-1)) ? supplied.pop() : null;
    const keywordCarrier = isKeywordArguments(supplied.at(-1)) ? supplied.pop() : null;
    const keywords = keywordCarrier?.value ?? {};
    const bound = /* @__PURE__ */ Object.create(null);
    const positional = signature.positional;
    const restIndex = positional.findIndex((parameter) => parameter.kind === "rest");
    const optionalIndexes = positional.flatMap((parameter, index) => parameter.kind === "opt" ? [index] : []);
    const required = positional.length - optionalIndexes.length - (restIndex >= 0 ? 1 : 0);
    const maximum = restIndex >= 0 ? Infinity : positional.length;
    if (supplied.length < required || supplied.length > maximum) {
      throw new Error(`wrong number of arguments (given ${supplied.length}, expected ${required}${maximum === Infinity ? "+" : required === maximum ? "" : `..${maximum}`})`);
    }
    const beforeRest = restIndex >= 0 ? positional.slice(0, restIndex) : positional;
    const afterRest = restIndex >= 0 ? positional.slice(restIndex + 1) : [];
    const firstOptional = beforeRest.findIndex((parameter) => parameter.kind === "opt");
    const prefix = firstOptional >= 0 ? beforeRest.slice(0, firstOptional) : beforeRest;
    const tail = firstOptional >= 0 ? beforeRest.slice(firstOptional) : [];
    const optionals = tail.filter((parameter) => parameter.kind === "opt");
    const post = [...tail.filter((parameter) => parameter.kind === "req"), ...afterRest];
    let front = 0;
    let back = supplied.length;
    for (const parameter of prefix) bound[parameter.name] = supplied[front++];
    for (let index = post.length - 1; index >= 0; index -= 1) bound[post[index].name] = supplied[--back];
    for (const parameter of optionals) {
      bound[parameter.name] = front < back ? supplied[front++] : OMITTED;
    }
    if (restIndex >= 0) bound[positional[restIndex].name] = supplied.slice(front, back);
    const known = new Set(signature.keywords.map((parameter) => parameter.name));
    for (const parameter of signature.keywords) {
      if (Object.hasOwn(keywords, parameter.name)) bound[parameter.name] = keywords[parameter.name];
      else if (parameter.kind === "keyreq") throw new Error(`missing keyword: ${parameter.name}`);
      else bound[parameter.name] = OMITTED;
    }
    const extras = Object.keys(keywords).filter((name) => !known.has(name));
    if (signature.keywordRest) {
      bound[signature.keywordRest] = Object.fromEntries(extras.map((name) => [name, keywords[name]]));
    } else if (extras.length > 0) {
      throw new Error(`unknown keyword${extras.length === 1 ? "" : "s"}: ${extras.join(", ")}`);
    }
    bound[signature.block ?? "__swill_block"] = blockCarrier?.value ?? null;
    return bound;
  }
  function argument(bound, name) {
    return bound[name];
  }
  function yieldBlock(block, ...values) {
    if (block == null) throw new Error("no block given");
    return block(...values);
  }

  // rb/runtime/paths.mjs
  var methodIndexes = /* @__PURE__ */ new WeakMap();
  function methodIndex(methods) {
    let index = methodIndexes.get(methods);
    if (index) return index;
    index = /* @__PURE__ */ new Map();
    for (const method of methods.values()) {
      const name = method.family ?? method.name;
      if (!index.has(name)) index.set(name, /* @__PURE__ */ new Map());
      index.get(name).set(method.arity, method);
    }
    methodIndexes.set(methods, index);
    return index;
  }
  function resolveMethod(methods, name, count) {
    const base = methods.get(name);
    if (!base) return null;
    if (base.minimum != null && count >= base.minimum && (base.maximum == null || count <= base.maximum)) return base;
    if (base.arity === count) return base;
    return methodIndex(methods).get(name)?.get(count) ?? null;
  }
  function widestMethod(methods, name, limit) {
    const family = methodIndex(methods).get(name);
    if (!family) return null;
    for (let count = limit; count >= 0; count -= 1) {
      if (family.has(count)) return family.get(count);
    }
    return null;
  }
  function read(object, name) {
    if (object == null) {
      return NIL_READERS.includes(name) ? valueRead(object, name) : null;
    }
    if (typeof object !== "object" && typeof object !== "function") {
      return valueRead(object, name);
    }
    if (isPlainObject(object)) {
      if (Object.hasOwn(object, name)) return object[name];
      return VALUE_READERS.includes(name) ? valueRead(object, name) : null;
    }
    const property = declarations(object.constructor, "properties").get(name);
    if (property) return object[property.js];
    const method = resolveMethod(declarations(object.constructor, "methods"), name, 0);
    if (method) return method.accessor ? object[method.js] : object[method.js]();
    if (name === "dup" && hasInstalledMetadata(object.constructor)) return duplicateObject(object);
    if (VALUE_READERS.includes(name)) return valueRead(object, name);
    if (!hasInstalledMetadata(object.constructor)) return nativeMember(object, name, [], false);
    throw new Error(`Unknown reader: ${name}`);
  }
  function nativeMember(object, name, args, call) {
    const member = object[name];
    if (typeof member === "function") return member.apply(object, args);
    if (call && !(name in object)) throw new Error(`Unknown method: ${name}`);
    if (args.length > 0) throw new Error(`Not a method: ${name}`);
    return member;
  }
  function duplicateObject(object) {
    const copy = new object.constructor();
    for (const descriptor of declarations(object.constructor, "properties").values()) {
      if (descriptor.computed || descriptor.outlet) continue;
      copy[descriptor.js] = object[descriptor.js];
    }
    return copy;
  }
  function segments(path) {
    return path === "" ? [] : path.split(".");
  }
  function readPath(object, path) {
    return segments(path).reduce((owner, name) => read(owner, name), object);
  }
  function write(object, name, value) {
    if (object == null) {
      throw new Error(`Cannot write ${name} on nil`);
    }
    if (isPlainObject(object)) {
      if (!Object.hasOwn(object, name)) throw new Error(`Unknown key: ${name}`);
      object[name] = value;
      return value;
    }
    const property = declarations(object.constructor, "properties").get(name);
    if (property) {
      if (property.computed && !property.writer) {
        throw new Error(`Read-only property: ${name}`);
      }
      return writeProperty(object, property, value);
    }
    const method = resolveMethod(declarations(object.constructor, "methods"), `${name}=`, 1);
    if (method) {
      object[(method.js ?? name).replace(/=$/, "")] = value;
      return value;
    }
    throw new Error(`Unknown writer: ${name}`);
  }
  function pathWriter(object, path) {
    const names2 = segments(path);
    if (names2.length === 0) {
      throw new Error(`Read-only binding: ${path}`);
    }
    const name = names2.pop();
    const owner = names2.reduce((target, segment) => read(target, segment), object);
    if (owner == null) return null;
    if (isPlainObject(owner)) {
      if (!Object.hasOwn(owner, name)) throw new Error(`Unknown key: ${name}`);
      return { owner, key: name };
    }
    const descriptor = declarations(owner.constructor, "properties").get(name);
    if (!descriptor || descriptor.computed && !descriptor.writer) {
      throw new Error(`Read-only binding: ${path}`);
    }
    return { owner, descriptor };
  }
  function assertWritablePath(object, path) {
    pathWriter(object, path);
  }
  function writePath(object, path, value) {
    const writer = pathWriter(object, path);
    if (!writer) return void 0;
    if (writer.key !== void 0) return write(writer.owner, writer.key, value);
    return writeProperty(writer.owner, writer.descriptor, value);
  }
  function observePath(object, path, callback) {
    const names2 = segments(path);
    let active = true;
    if (names2.length === 1) {
      const name = names2[0];
      if (object == null || !declarations(object.constructor, "properties").has(name)) {
        return () => {
        };
      }
      const dispose = subscribe(object, name, () => {
        if (active) callback(read(object, name));
      }, "observers");
      return () => {
        active = false;
        dispose();
      };
    }
    const owners = [object];
    const disposers = [];
    const hook = (start2) => {
      for (let index = start2; index < disposers.length; index += 1) disposers[index]?.();
      disposers.length = start2;
      owners.length = start2;
      owners[start2] = start2 === 0 ? object : read(owners[start2 - 1], names2[start2 - 1]);
      let owner = owners[start2];
      for (let index = start2; index < names2.length; index += 1) {
        if (owner == null) break;
        const name = names2[index];
        disposers[index] = declarations(owner.constructor, "properties").has(name) ? subscribe(owner, name, () => {
          if (!active) return;
          if (index + 1 < names2.length) hook(index + 1);
          callback(readPath(object, path));
        }, "observers") : null;
        owner = read(owner, name);
        owners[index + 1] = owner;
      }
    };
    hook(0);
    return () => {
      active = false;
      for (const dispose of disposers) dispose?.();
      disposers.length = 0;
    };
  }
  function respondsTo(object, name) {
    if (object == null) return NIL_READERS.includes(name);
    if (typeof object !== "object" && typeof object !== "function") {
      return VALUE_READERS.includes(name);
    }
    if (isPlainObject(object)) {
      return Object.hasOwn(object, name) || VALUE_READERS.includes(name);
    }
    const properties = declarations(object.constructor, "properties");
    const methods = declarations(object.constructor, "methods");
    if (name.endsWith("=")) {
      const property = properties.get(name.slice(0, -1));
      return !!property && (!property.computed || property.writer) || methods.has(name);
    }
    return properties.has(name) || methods.has(name);
  }
  function methodAccepts(object, name, count) {
    if (object == null || typeof object !== "object" && typeof object !== "function") return false;
    if (isPlainObject(object)) return false;
    return resolveMethod(declarations(object.constructor, "methods"), name, count) !== null;
  }
  function send(object, name) {
    if (object == null && !NIL_READERS.includes(name)) {
      throw new Error(`Cannot call ${name} on nil`);
    }
    return read(object, name);
  }
  function invoke(object, name, ...args) {
    if (object == null) {
      throw new Error(`Cannot call ${name} on nil`);
    }
    const methods = declarations(object.constructor, "methods");
    if (!methods.has(name) && VALUE_METHODS.includes(name)) return valueInvoke(object, name, args);
    const method = resolveMethod(methods, name, positionalArgumentCount(args));
    if (!method) {
      const property = args.length === 0 && declarations(object.constructor, "properties").get(name);
      if (property) return object[property.js];
      if (!hasInstalledMetadata(object.constructor) && !isPlainObject(object)) return nativeMember(object, name, args, true);
      throw new Error(`Unknown method or wrong arity: ${name}`);
    }
    if (method.minimum == null && args.some(isKeywordArguments)) {
      throw new Error(`Unknown method or wrong keywords: ${name}`);
    }
    if (method.minimum == null && args.some(isBlockArgument)) {
      throw new Error(`Method does not accept a block: ${name}`);
    }
    if (method.accessor) return object[method.js];
    return object[method.js](...args);
  }
  function performAction(object, name, sender, event) {
    const method = widestMethod(declarations(object.constructor, "methods"), name, 2);
    if (!method || method.accessor) {
      throw new Error(`Unknown action or wrong arity: ${name}`);
    }
    return object[method.js](...[sender, event].slice(0, method.arity));
  }

  // rb/runtime/types.mjs
  function must(value) {
    if (value == null) throw new TypeError("T.must received nil");
    return value;
  }
  function cast(value, type) {
    if (!conforms(value, type)) {
      throw new TypeError(`T.cast expected ${type}, got ${describe(value)}`);
    }
    return value;
  }
  function absurd(value) {
    throw new TypeError(`T.absurd reached with ${describe(value)}`);
  }
  function conforms(value, type) {
    const nilable2 = /^T\.nilable\((.+)\)$/.exec(type);
    if (nilable2) return value == null || conforms(value, nilable2[1]);
    if (type.startsWith("T.proc")) return typeof value === "function";
    switch (type) {
      case "T.untyped":
        return true;
      case "NilClass":
        return value == null;
      case "String":
      case "Symbol":
        return typeof value === "string";
      case "Integer":
        return Number.isInteger(value);
      case "Float":
        return typeof value === "number";
      case "T::Boolean":
        return typeof value === "boolean";
      case "Date":
      case "DateTime":
      case "Time":
      case "BigDecimal":
      case "TimeOfDay":
      case "Interval":
      case "Swill::Distant::RangeValue":
        return value?.[/* @__PURE__ */ Symbol.for("swill.data.type")] === (type === "Swill::Distant::RangeValue" ? "RangeValue" : type);
      default:
    }
    if (type === "Array" || type.startsWith("T::Array[")) return Array.isArray(value);
    if (type === "Hash" || type.startsWith("T::Hash[")) return isPlainObject(value);
    const klass = registered(type) ?? globalThis[type];
    if (typeof klass !== "function") throw new Error(`Unknown class: ${type}`);
    return value instanceof klass;
  }
  function describe(value) {
    if (value == null) return "nil";
    if (Array.isArray(value)) return "Array";
    if (isPlainObject(value)) return "Hash";
    if (typeof value === "object") return value.constructor?.name ?? "object";
    return typeof value;
  }

  // rb/runtime/attributes.mjs
  function restorations(object) {
    return declarations(object.constructor, "restorations");
  }
  function outlets(object) {
    return [...declarations(object.constructor, "properties").values()].filter((descriptor) => descriptor.outlet);
  }

  // rb/runtime/runtime_ui.mjs
  function warn(message) {
    console.warn(`[Swill] ${message}`);
    for (const observer of [...warningObservers]) observer(message);
  }
  var warningObservers = /* @__PURE__ */ new Set();
  var development = false;
  function isDevelopment() {
    return development;
  }
  function setDevelopment(flag) {
    development = flag === true;
  }
  var failedBuild = null;
  function reportBuildFailure(message) {
    console.error(`[Swill] The application failed to build: ${message}`);
    failedBuild = String(message);
  }
  function buildFailure() {
    return failedBuild;
  }
  function observeWarnings(callback) {
    warningObservers.add(callback);
    return () => {
      warningObservers.delete(callback);
    };
  }
  var UIRuntime = {
    // Classes
    install,
    include,
    installClass,
    inheritableRegistry,
    classSetting,
    classWithSetting,
    identityStore,
    resolve,
    classIsA,
    nameOf,
    aliasInstalledJavaScriptNames,
    // Values
    isTruthy,
    logicalAnd,
    logicalOr,
    isEqual,
    duplicate,
    nilable,
    isBlank,
    isPresent,
    isEmpty,
    strip,
    upcase,
    downcase,
    valueRead,
    NIL_READERS,
    VALUE_READERS,
    // Ruby core semantics
    length,
    stringify,
    toInteger,
    toFloat,
    capitalize,
    split,
    slice,
    sort,
    sortWith,
    sortBy,
    minBy,
    maxBy,
    min,
    max,
    sum,
    uniq,
    compact,
    flatten,
    reverse,
    indexOf,
    append,
    prepend,
    difference,
    fetch: fetch2,
    deleteKey,
    intDiv,
    modulo,
    between,
    clamp,
    isNumber,
    isBoolean,
    compareText,
    // Sorbet runtime operations
    must,
    cast,
    absurd,
    conforms,
    // Dispatch
    read,
    segments,
    readPath,
    write,
    assertWritablePath,
    writePath,
    respondsTo,
    methodAccepts,
    send,
    invoke,
    performAction,
    // Observation
    observe,
    observed,
    observePath,
    retain,
    release,
    dealloc,
    disconnect,
    // Declarations
    restorations,
    outlets,
    // Ruby complex calls
    keywordArguments,
    blockArgument,
    omittedArgument,
    isOmittedArgument,
    bindArguments,
    argument,
    yieldBlock,
    // Reporting
    warn,
    observeWarnings,
    reportBuildFailure,
    buildFailure,
    isDevelopment,
    setDevelopment
  };

  // build/ui/framework.mjs
  var framework_exports = {};
  __export(framework_exports, {
    Swill__Alert: () => Swill__Alert,
    Swill__Application: () => Swill__Application,
    Swill__ArrayController: () => Swill__ArrayController,
    Swill__Awakening: () => Swill__Awakening,
    Swill__Binding: () => Swill__Binding,
    Swill__BindingDestination: () => Swill__BindingDestination,
    Swill__BindingDestination__Checkbox: () => Swill__BindingDestination__Checkbox,
    Swill__BindingDestination__ElementProperty: () => Swill__BindingDestination__ElementProperty,
    Swill__BindingDestination__Field: () => Swill__BindingDestination__Field,
    Swill__BindingDestination__ObjectProperty: () => Swill__BindingDestination__ObjectProperty,
    Swill__BindingDestination__Select: () => Swill__BindingDestination__Select,
    Swill__BindingDestination__Text: () => Swill__BindingDestination__Text,
    Swill__BooleanTransformer: () => Swill__BooleanTransformer,
    Swill__Bundle: () => Swill__Bundle,
    Swill__CollectionArrangement: () => Swill__CollectionArrangement,
    Swill__Connections__Actions: () => Swill__Connections__Actions,
    Swill__Connections__Bindings: () => Swill__Connections__Bindings,
    Swill__Connections__Outlets: () => Swill__Connections__Outlets,
    Swill__Control: () => Swill__Control,
    Swill__Control__Button: () => Swill__Control__Button,
    Swill__Control__ImageView: () => Swill__Control__ImageView,
    Swill__Controller: () => Swill__Controller,
    Swill__Controller__List: () => Swill__Controller__List,
    Swill__DOM: () => Swill__DOM,
    Swill__DateTransformer: () => Swill__DateTransformer,
    Swill__DevelopmentMonitor: () => Swill__DevelopmentMonitor,
    Swill__Image: () => Swill__Image,
    Swill__Launcher: () => Swill__Launcher,
    Swill__Notification: () => Swill__Notification,
    Swill__NotificationCenter: () => Swill__NotificationCenter,
    Swill__NumberTransformer: () => Swill__NumberTransformer,
    Swill__Object: () => Swill__Object,
    Swill__ObjectBindings: () => Swill__ObjectBindings,
    Swill__Observable: () => Swill__Observable,
    Swill__OutletOwner: () => Swill__OutletOwner,
    Swill__OutletOwner_ClassMethods: () => Swill__OutletOwner_ClassMethods,
    Swill__ProblemReporter: () => Swill__ProblemReporter,
    Swill__Responder: () => Swill__Responder,
    Swill__Swell: () => Swill__Swell,
    Swill__SystemAlert: () => Swill__SystemAlert,
    Swill__Templates: () => Swill__Templates,
    Swill__URLFragment: () => Swill__URLFragment,
    Swill__ValueTransformer: () => Swill__ValueTransformer,
    Swill__View: () => Swill__View,
    Swill__Window: () => Swill__Window
  });

  // build/ui/framework.classes.mjs
  function Swill__Observable(Superclass) {
    class Swill__Observable_Layer extends Superclass {
      // Observes a property, on the receiver or on +object+, calling +callback+
      // with each new value. The receiver is the observer: it retains the
      // observation and releases it on `dealloc`.
      //
      //     observe(:query, ->(value) { reload })
      //     observe(document, :selection, ->(value) { reload })
      //
      // sorbet-runtime will not wrap a method whose optional parameter comes
      // first, so this signature is static only.
      observeWithObject(object, name, callback) {
        return this.retain(UIRuntime.observe(
          object == null ? this : object,
          name,
          callback
        ));
      }
      // Claims ownership of +disposer+; the receiver releases it on `dealloc`.
      // Anything with the receiver's lifetime goes through here — an
      // observation, a notification, a DOM listener, a binding's release.
      // Answers the disposer.
      retain(disposer) {
        return UIRuntime.retain(this, disposer);
      }
      // Gives up a disposer ahead of `dealloc`.
      release(disposer) {
        return UIRuntime.release(this, disposer);
      }
      // Releases everything retained and leaves the observation graph. End of
      // life for the object.
      dealloc() {
        return UIRuntime.dealloc(this);
      }
      // Leaves the observation graph without ending: stored values are kept and
      // computed properties resubscribe on the next read.
      disconnect() {
        return UIRuntime.disconnect(this);
      }
      // Runs before a write lands, answering the value to store. Override it to
      // coerce or to reject the write by raising.
      coercePropertyValue(name, value, previous) {
        return value;
      }
      // Runs before a write lands, after coercion.
      propertyWillChange(name, previous, value) {
        return null;
      }
      // Runs before a read resolves, for a property declared `will_access:`, so
      // the value can load itself.
      propertyWillAccess(name) {
        return null;
      }
      observe(name, callback) {
        return Swill__Observable_Layer.prototype.observeWithObject.call(
          this,
          null,
          name,
          callback
        );
      }
    }
    return Swill__Observable_Layer;
  }
  var Swill__Object = class extends Object {
  };
  function Swill__DOM(Superclass) {
    class Swill__DOM_Layer extends Superclass {
    }
    return Swill__DOM_Layer;
  }
  var Swill__DOM_Functions = class extends Object {
    static eachChild(element, callback) {
      let children = element.children;
      let index = 0;
      while (index < children.length) {
        callback(children[index]);
        index++;
      }
    }
    static focus(element) {
      return element.focus({ preventScroll: true });
    }
    static focusRevealing(element) {
      return element.focus();
    }
    static eachOwned(root, include_root, callback) {
      if (include_root) callback(root, false);
      return Swill__DOM.eachChild(root, (child) => {
        let view = child.__swill_view__;
        return UIRuntime.isTruthy(child.hasAttribute("controller") || view && view.isOwnsContent()) ? callback(
          child,
          true
        ) : Swill__DOM.eachOwned(child, true, callback);
      });
    }
    static isHandlesKey(event) {
      if (event.isComposing) return true;
      let element = event.target;
      let key = event.key;
      let tag = element.tagName;
      if (tag === "TEXTAREA" || element.isContentEditable) {
        return key !== "Escape" && key !== "Tab";
      }
      ;
      if (tag === "SELECT") {
        return UIRuntime.logicalAnd(
          key !== "Enter" && key !== "Escape",
          () => key !== "Tab"
        );
      }
      ;
      if (tag === "BUTTON") return key === "Enter" || key === " ";
      if (tag !== "INPUT") return false;
      switch (element.type) {
        case "button":
        case "submit":
        case "reset":
          return key === "Enter" || key === " ";
        case "checkbox":
          return key === " ";
        case "radio":
          return key === " " || key.startsWith("Arrow");
        case "range":
          return key.startsWith("Arrow") || key === "Home" || key === "End";
        case "":
        case "text":
        case "search":
        case "email":
        case "url":
        case "tel":
        case "password":
          return !["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown"].includes(key);
        default:
          return UIRuntime.logicalAnd(
            key !== "Enter" && key !== "Escape",
            () => key !== "Tab"
          );
      }
    }
    static ownedMatching(root, selector) {
      let found = UIRuntime.cast([], "T::Array[Element]");
      Swill__DOM.eachOwned(root, true, (element, _controller_root) => {
        if (UIRuntime.isTruthy((element === root || !element.hasAttribute("controller")) && element.matches(selector))) {
          return UIRuntime.append(found, element);
        }
      });
      return found;
    }
  };
  Swill__DOM.eachChild = Swill__DOM_Functions.eachChild;
  Swill__DOM.focus = Swill__DOM_Functions.focus;
  Swill__DOM.focusRevealing = Swill__DOM_Functions.focusRevealing;
  Swill__DOM.eachOwned = Swill__DOM_Functions.eachOwned;
  Swill__DOM.isHandlesKey = Swill__DOM_Functions.isHandlesKey;
  Swill__DOM.ownedMatching = Swill__DOM_Functions.ownedMatching;
  var Swill__Swell = class _Swill__Swell extends Swill__Object {
    static $index(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [{ name: "element", kind: "req" }],
        keywords: [],
        keywordRest: null,
        block: "block"
      });
      let element = UIRuntime.argument(__swill_bound, "element");
      let block = UIRuntime.argument(__swill_bound, "block");
      let dom = new this(element);
      if (block) block(dom);
      return dom;
    }
    // Creates a wrapper for `element`, preserving its existing view and owner.
    constructor(element) {
      super();
      this._element = element;
    }
    // The element this wrapper reads and changes.
    get element() {
      return this._element;
    }
    // :section: Managing Classes
    // Reading and changing the element's CSS classes.
    // Adds the class `name` and returns the wrapper. See `#remove_class`.
    addClass(name) {
      this._element.classList.add(name);
      return this;
    }
    // Removes the class `name` and returns the wrapper. See `#add_class`.
    removeClass(name) {
      this._element.classList.remove(name);
      return this;
    }
    // Adds the class `name` when `on` is true, removes it when false, and
    // returns the wrapper. When `on` is omitted or nil, reverses the class's
    // presence. See `#has_class?`.
    toggleClassWithOn(name, on) {
      if (on == null) {
        this._element.classList.toggle(name);
      } else {
        this._element.classList.toggle(name, on);
      }
      ;
      return this;
    }
    // Returns whether the element has the class `name`. See `#toggle_class`.
    hasClass(name) {
      return this._element.classList.contains(name);
    }
    // :section: Managing Attributes
    // Reading and changing HTML, ARIA, and data attributes.
    // Sets the attribute `name` from `value` and returns the wrapper.
    // A nil or false value removes the attribute; true sets an empty string.
    // Other values are converted to strings. See `#attribute`, `#aria`, and
    // `#data` for reading attributes and writing prefixed values.
    attr(name, value) {
      if (value == null || value === false) {
        this._element.removeAttribute(name);
      } else {
        this._element.setAttribute(
          name,
          value === true ? "" : UIRuntime.send(value, "to_s")
        );
      }
      ;
      return this;
    }
    // Returns the attribute `name` as a string, or nil when absent.
    // See `#attr` and `#has_attribute?`.
    attribute(name) {
      return this._element.getAttribute(name);
    }
    // Returns whether the element has the attribute `name`, including an
    // attribute whose value is an empty string. See `#attribute`.
    hasAttribute(name) {
      return this._element.hasAttribute(name);
    }
    // Removes the attribute `name` and returns the wrapper.
    // See `#attr` and `#has_attribute?`.
    removeAttr(name) {
      this._element.removeAttribute(name);
      return this;
    }
    // Sets `aria-name` to the string form of `value` and returns the wrapper.
    // A nil value removes the attribute; false is written as "false".
    // Supply the suffix, such as "expanded", as `name`. See `#aria_value`.
    aria(name, value) {
      return this.attr(
        `aria-${name}`,
        value == null ? null : UIRuntime.send(value, "to_s")
      );
    }
    // Sets `data-name` to the string form of `value` and returns the wrapper.
    // A nil value removes the attribute; false is written as "false".
    // Supply the suffix, such as "value", as `name`. See `#data_value`.
    data(name, value) {
      return this.attr(
        `data-${name}`,
        value == null ? null : UIRuntime.send(value, "to_s")
      );
    }
    // Returns the value of `aria-name`, or nil when absent. `name` is the
    // suffix without "aria-". See `#aria`.
    ariaValue(name) {
      return this.attribute(`aria-${name}`);
    }
    // Returns the value of `data-name`, or nil when absent. `name` is the
    // suffix without "data-". See `#data`.
    dataValue(name) {
      return this.attribute(`data-${name}`);
    }
    // :section: Managing Properties
    // Reading and assigning the element's DOM properties.
    // Assigns `value` to the DOM property `name` and returns the wrapper.
    // Uses the property's JavaScript name, such as "readOnly". The DOM
    // property's setter determines how the value is stored.
    // See `#property_value`.
    prop(name, value) {
      this._element[name] = value;
      return this;
    }
    // Returns the DOM property `name` using its JavaScript spelling.
    // An absent property returns JavaScript's undefined value. See `#prop`.
    propertyValue(name) {
      return this._element[name];
    }
    // :section: Managing Content and Visibility
    // Updating text, child nodes, and the element's hidden state.
    // Replaces the element's contents with the string form of `value` and
    // returns the wrapper. Text is displayed literally; nil clears the
    // contents. See `#text_content` and `#empty`.
    text(value) {
      this._element.textContent = UIRuntime.send(value, "to_s");
      return this;
    }
    // Returns the element's text content, or an empty string when it has
    // none. See `#text`.
    textContent() {
      return this._element.textContent;
    }
    // Sets the element's hidden property to true and returns the wrapper.
    // See `#show`.
    hide() {
      this._element.hidden = true;
      return this;
    }
    // Sets the element's hidden property to false and returns the wrapper.
    // See `#hide`.
    show() {
      this._element.hidden = false;
      return this;
    }
    // Removes all child nodes and returns the wrapper. See `#append`.
    empty() {
      this._element.replaceChildren();
      return this;
    }
    // Appends `node` as the last child and returns the wrapper. An existing
    // node moves from its current parent. See `#empty`.
    append(node) {
      this._element.appendChild(node);
      return this;
    }
    // Inserts `node` before the element's current children and returns the wrapper.
    prepend(node) {
      this._element.insertBefore(node, this._element.firstElementChild);
      return this;
    }
    // Removes the element from its parent and returns the wrapper.
    // An element with no parent remains unchanged.
    remove() {
      this._element.remove();
      return this;
    }
    // :section: Finding Elements
    // Looking up descendants by CSS selector.
    // Returns a new wrapper for the first descendant matching `selector`,
    // or nil when none matches. See `#find!`.
    find(selector) {
      let found = this._element.querySelector(selector);
      return found ? _Swill__Swell.$index(found) : null;
    }
    // Returns a new wrapper for the first descendant matching `selector`.
    // Raises "No element matching ..." when none matches; use `#find` when
    // the descendant may be absent.
    findBang(selector) {
      let found = this.find(selector);
      if (!found) throw new Error(`No element matching ${selector}`);
      return found;
    }
    // :section: Listening for Events
    // Registering event handlers and releasing them with their owner.
    // Registers `handler` for events of `type` and returns a callable that
    // removes the listener. The handler receives the DOM event. `capture`
    // selects the capture phase; the default is false.
    //
    // Retain the returned callable on the controller or view that owns the
    // listener so it is removed when that owner unloads.
    listen(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "type", kind: "req" },
          { name: "handler", kind: "req" }
        ],
        keywords: [{ name: "capture", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let type = UIRuntime.argument(__swill_bound, "type");
      let handler = UIRuntime.argument(__swill_bound, "handler");
      let capture = UIRuntime.argument(__swill_bound, "capture");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(capture))) capture = false;
      this._element.addEventListener(type, handler, capture);
      return () => this._element.removeEventListener(type, handler, capture);
    }
    toggleClass(name) {
      return _Swill__Swell.prototype.toggleClassWithOn.call(
        this,
        name,
        null
      );
    }
  };
  var Swill__Notification = class extends Swill__Object {
    constructor(name, object, user_info) {
      super();
      this._name = name;
      this._object = object;
      this._user_info = user_info;
    }
    get name() {
      return this._name;
    }
    get object() {
      return this._object;
    }
    get userInfo() {
      return this._user_info;
    }
  };
  var Swill__NotificationCenter = class _Swill__NotificationCenter extends Swill__Object {
    static default() {
      let center = this._default;
      if (center) return center;
      this._default = UIRuntime.cast(
        new _Swill__NotificationCenter(),
        "T.nilable(Swill::NotificationCenter)"
      );
      return UIRuntime.must(this._default);
    }
    constructor() {
      super();
      this._observers = UIRuntime.cast(
        {},
        "T::Hash[String, T::Array[T.proc.params(notification:Notification).void]]"
      );
    }
    addObserver(name, callback) {
      let list = this._observers[name];
      if (!list) {
        list = [];
        this._observers[name] = list;
      }
      ;
      UIRuntime.append(list, callback);
      return () => {
        let current = this._observers[name];
        if (current) {
          return this._observers[name] = current.filter((candidate) => !UIRuntime.isEqual(candidate, callback));
        }
      };
    }
    // Observers are called in the order they subscribed, on a copy of the
    // list, so one may unsubscribe as it runs.
    post(name, object, user_info) {
      let notification = new Swill__Notification(name, object, user_info);
      let list = this._observers[name];
      if (list) list.slice().forEach((callback) => callback(notification));
      return notification;
    }
  };
  var Swill__ValueTransformer = class _Swill__ValueTransformer extends Swill__Object {
    static register(name, transformer) {
      _Swill__ValueTransformer.registry()[name] = transformer;
      return transformer;
    }
    static named(name) {
      return _Swill__ValueTransformer.registry()[name];
    }
    static registry() {
      let known = this._registry;
      if (known) return known;
      this._registry = UIRuntime.cast(
        {
          string: new _Swill__ValueTransformer(),
          number: new Swill__NumberTransformer(),
          boolean: new Swill__BooleanTransformer(),
          date: new Swill__DateTransformer()
        },
        "T.nilable(T::Hash[String, ValueTransformer])"
      );
      return UIRuntime.must(this._registry);
    }
    // The text shown for a value; nil shows as nothing.
    format(value) {
      return value == null ? "" : `${value}`;
    }
    // The value a control's text stands for.
    parse(text) {
      return text;
    }
  };
  var Swill__NumberTransformer = class extends Swill__ValueTransformer {
    parse(text) {
      let stripped = UIRuntime.strip(text);
      return UIRuntime.isEmpty(stripped) ? null : UIRuntime.toFloat(stripped);
    }
  };
  var Swill__BooleanTransformer = class extends Swill__ValueTransformer {
    format(value) {
      return UIRuntime.isTruthy(value) ? "true" : "false";
    }
    parse(text) {
      return text === "true" || text === "1" || text === "on";
    }
  };
  var Swill__DateTransformer = class extends Swill__ValueTransformer {
    format(value) {
      return value == null ? "" : UIRuntime.dataDateISO(value);
    }
    parse(text) {
      return UIRuntime.isEmpty(text) ? null : UIRuntime.dataDateFromISO(text);
    }
  };
  var Swill__BindingDestination = class extends Object {
    write(receiver, binding, value) {
      return (() => {
        throw new Error("BindingDestination subclasses implement write");
      })();
    }
    read(receiver, binding) {
      return (() => {
        throw new Error("BindingDestination subclasses implement read");
      })();
    }
    // Whether this destination feeds the model as well as showing it.
    isTwoWay(receiver, binding) {
      return false;
    }
    // Whether a transformer means anything here. A checkbox shows the truth of
    // a value rather than a rendering of it, so formatting it for display would
    // be answering a question nobody asked.
    isTransforms() {
      return true;
    }
    // What to show when the path has no value. An destination that renders text
    // wants the empty string; one that hands the value onward wants the nil,
    // which means something different from "".
    nullPlaceholder() {
      return "";
    }
    // Reports edits. The destination decides what "changed" means for its kind and
    // hands over its value; the binding decides what to do with it. Answers the
    // disposer that stops the reporting.
    listen(receiver, binding, callback) {
      return () => null;
    }
    static forElement(element) {
      let tag = element.tagName;
      if (tag === "INPUT") {
        if (element.type === "checkbox") return UIRuntime.must(this.shared().checkbox);
        return UIRuntime.must(this.shared().field);
      }
      ;
      if (tag === "TEXTAREA") return UIRuntime.must(this.shared().field);
      if (tag === "SELECT") return UIRuntime.must(this.shared().select);
      return UIRuntime.must(this.shared().text);
    }
    static elementProperty() {
      return UIRuntime.must(this.shared().property);
    }
    static objectProperty() {
      return UIRuntime.must(this.shared().object);
    }
    static shared() {
      let known = this._shared;
      if (known) return known;
      this._shared = UIRuntime.cast(
        {
          text: new Swill__BindingDestination__Text(),
          field: new Swill__BindingDestination__Field(),
          select: new Swill__BindingDestination__Select(),
          checkbox: new Swill__BindingDestination__Checkbox(),
          property: new Swill__BindingDestination__ElementProperty(),
          object: new Swill__BindingDestination__ObjectProperty()
        },
        "T.nilable(T::Hash[String, BindingDestination])"
      );
      return UIRuntime.must(this._shared);
    }
  };
  var Swill__BindingDestination__Text = class extends Swill__BindingDestination {
    write(receiver, binding, value) {
      return receiver.textContent = value;
    }
    read(receiver, binding) {
      return receiver.textContent;
    }
  };
  var Swill__BindingDestination__Field = class extends Swill__BindingDestination {
    write(receiver, binding, value) {
      return receiver.value = value;
    }
    read(receiver, binding) {
      return receiver.value;
    }
    // A readonly control shows the value without answering back.
    isTwoWay(receiver, binding) {
      return !receiver.hasAttribute("readonly");
    }
    listen(receiver, binding, callback) {
      let name = this.eventName();
      let handler = (event) => callback(this.read(receiver, binding));
      receiver.addEventListener(name, handler);
      return () => receiver.removeEventListener(name, handler);
    }
    // The DOM event that means "the user changed me".
    eventName() {
      return "input";
    }
  };
  var Swill__BindingDestination__Select = class extends Swill__BindingDestination__Field {
    eventName() {
      return "change";
    }
  };
  var Swill__BindingDestination__Checkbox = class extends Swill__BindingDestination__Field {
    write(receiver, binding, value) {
      return receiver.checked = UIRuntime.isTruthy(value);
    }
    read(receiver, binding) {
      return receiver.checked;
    }
    isTransforms() {
      return false;
    }
    nullPlaceholder() {
      return null;
    }
    eventName() {
      return "change";
    }
  };
  var Swill__BindingDestination__ElementProperty = class extends Swill__BindingDestination {
    write(receiver, binding, value) {
      let property = UIRuntime.must(binding);
      if (property.startsWith("data-") || property.startsWith("aria-")) {
        if (UIRuntime.isTruthy(value == null || value === "" || value === false && property.startsWith("data-"))) {
          receiver.removeAttribute(property);
        } else {
          receiver.setAttribute(property, value);
        }
        ;
        return;
      }
      ;
      if (UIRuntime.isTruthy((property === "href" || property === "src") && value == null)) {
        receiver.removeAttribute(property);
        receiver[property] = "";
        return;
      }
      ;
      return receiver[property] = this.isBooleanProperty(property) ? UIRuntime.isTruthy(value) : value;
    }
    isBooleanProperty(property) {
      switch (property) {
        case "disabled":
        case "checked":
        case "hidden":
        case "readOnly":
        case "required":
        case "open":
          return true;
        default:
          return false;
      }
    }
    // nil is a value here: it is what removes an attribute.
    nullPlaceholder() {
      return null;
    }
    isTransforms() {
      return false;
    }
  };
  var Swill__BindingDestination__ObjectProperty = class extends Swill__BindingDestination {
    write(receiver, binding, value) {
      return UIRuntime.write(receiver, UIRuntime.must(binding), value);
    }
    read(receiver, binding) {
      return UIRuntime.read(receiver, UIRuntime.must(binding));
    }
    isTwoWay(receiver, binding) {
      return true;
    }
    // A property takes the nil. Substituting "" would store a different value.
    nullPlaceholder() {
      return null;
    }
    listen(receiver, binding, callback) {
      return UIRuntime.observe(
        receiver,
        UIRuntime.must(binding),
        (value) => callback(value)
      );
    }
  };
  var Swill__Binding = class extends Object {
    static establish(destination, receiver, binding, object, key_path, transformer, placeholder, one_way) {
      let transforms = transformer != null && destination.isTransforms();
      let two_way = !one_way && destination.isTwoWay(receiver, binding);
      if (UIRuntime.isTruthy(two_way)) UIRuntime.assertWritablePath(object, key_path);
      let push = (_value) => {
        let value = UIRuntime.readPath(object, key_path);
        value = UIRuntime.isTruthy(transforms) ? UIRuntime.must(transformer).format(value) : (() => {
          return value == null ? placeholder : value;
        })();
        return destination.write(receiver, binding, value);
      };
      push(null);
      let release_push = UIRuntime.observePath(object, key_path, push);
      if (!UIRuntime.isTruthy(two_way)) return release_push;
      let release_pull = destination.listen(receiver, binding, (value) => UIRuntime.writePath(
        object,
        key_path,
        UIRuntime.isTruthy(transforms) ? UIRuntime.must(transformer).parse(value) : value
      ));
      return () => {
        release_push();
        return release_pull();
      };
    }
  };
  function Swill__ObjectBindings(Superclass) {
    class Swill__ObjectBindings_Layer extends Superclass {
      // Establishes a binding that keeps the property `binding` equal to
      // `key_path` on `to`, and returns the object. The property receives
      // `null_placeholder` whenever the path has no value; the default is nil.
      // `transform` names a registered `ValueTransformer`, as `transform` does in
      // markup, and raises when no transformer has that name. A binding already
      // established under this name is released first.
      bind(...__swill_arguments) {
        let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
          positional: [{ name: "binding", kind: "req" }],
          keywords: [
            { name: "to", kind: "keyreq" },
            { name: "key_path", kind: "keyreq" },
            { name: "null_placeholder", kind: "key" },
            { name: "transform", kind: "key" }
          ],
          keywordRest: null,
          block: "__swill_block"
        });
        let binding = UIRuntime.argument(__swill_bound, "binding");
        let to = UIRuntime.argument(__swill_bound, "to");
        let key_path = UIRuntime.argument(__swill_bound, "key_path");
        let null_placeholder = UIRuntime.argument(
          __swill_bound,
          "null_placeholder"
        );
        if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(null_placeholder))) {
          null_placeholder = null;
        }
        ;
        let transform = UIRuntime.argument(__swill_bound, "transform");
        if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(transform))) transform = null;
        this.unbind(binding);
        let transformer = transform != null ? Swill__ValueTransformer.named(transform) : null;
        if (UIRuntime.isTruthy(transform != null ? !transformer : transform)) {
          throw new Error(`unknown transform ${transform}`);
        }
        ;
        this.objectBindings()[binding] = Swill__Binding.establish(
          Swill__BindingDestination.objectProperty(),
          this,
          binding,
          to,
          key_path,
          transformer,
          null_placeholder,
          true
        );
        return this;
      }
      // Releases the binding named `binding`, if there is one, and returns the
      // object.
      unbind(binding) {
        let dispose = this.objectBindings()[binding];
        if (!UIRuntime.isTruthy(dispose)) return this;
        dispose();
        UIRuntime.deleteKey(this.objectBindings(), binding);
        return this;
      }
      // Releases every binding on the object and returns it. A controller
      // calls this as it unloads.
      unbindAll() {
        Object.entries(this.objectBindings()).forEach(([_binding, dispose]) => dispose());
        this._object_bindings = {};
        return this;
      }
      // The release callable of each binding, by name.
      objectBindings() {
        if (!this._object_bindings) this._object_bindings = {};
        return this._object_bindings;
      }
    }
    return Swill__ObjectBindings_Layer;
  }
  function Swill__CollectionArrangement(Superclass) {
    class Swill__CollectionArrangement_Layer extends Superclass {
      // :nodoc:
      // :section: Arranging Content
      // The content, and the filtered and sorted content presented from it.
      // The collection to arrange: an array, or a `Model::Collection`, whose
      // `records` are arranged. Nil until assigned. Raises when assigned while
      // `array_controller` is set.
      // An `ArrayController` that arranges and selects on this object's
      // behalf; every property and method here delegates to it while it is
      // set. Nil by default. Raises when assigned while `content` is set, or
      // when the controller delegates, directly or through others, back to
      // this object.
      // The sort key and direction, and the object `show_first` placed ahead
      // of the rest, as one value.
      // :nodoc:
      // The content after filtering and sorting, in display order; an empty
      // array when there is no content. Properties read while arranging are
      // its dependencies, so it rearranges when they change.
      // :section: Sorting
      // One key and one direction at a time.
      // The key path the arranged content is sorted by, or nil when unsorted.
      // Writing it sorts.
      // `"ascending"` or `"descending"`. The default is `"ascending"`. Writing
      // it sorts.
      // The sort key mapped to its direction, for `bind-aria-sort`; an empty
      // hash when unsorted.
      // :section: Selecting
      // The selection, held by object identity within the arranged content.
      // The requested selection: the objects, and the id to fall back to.
      // :nodoc:
      // The selected objects that are present in the arranged content, in
      // the order they were selected; an empty array when nothing is
      // selected. Writing it replaces the selection.
      // The id of the first selected object, or nil when nothing is selected
      // or the object has no id. Writing it selects the object with that id
      // now, or once the content includes it, which is how a restored
      // selection waits for its record.
      // The first selected object, or nil when nothing is selected.
      // The indexes of the selected objects within the arranged content, in
      // ascending order; an empty array when nothing is selected.
      // :section: Arranging Content
      coercePropertyValue(name, value, previous) {
        if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
          name === "content" && value != null,
          () => this.arrayController
        ))) throw new Error("Use either content or array_controller, not both");
        if (UIRuntime.isTruthy(name === "array_controller" && value)) {
          if (this.content != null) {
            throw new Error("Use either content or array_controller, not both");
          }
          ;
          let cursor = UIRuntime.cast(
            UIRuntime.cast(value, "T.nilable(Swill::ArrayController)"),
            "T.nilable(Swill::ArrayController)"
          );
          while (cursor) {
            if (cursor === this) {
              throw new Error("An array controller cannot delegate to itself");
            }
            ;
            cursor = cursor.arrayController;
          }
        }
        ;
        return super.coercePropertyValue(name, value, previous);
      }
      // Returns the content filtered by `includes_object?` and sorted by
      // `sort_key` and `sort_direction`, with the object `show_first` placed
      // ahead of the rest. Nil values sort last, numbers and booleans by value,
      // and everything else as text. The default implementation is what
      // `arranged_objects` computes; override it to arrange another way.
      arrangeContent() {
        let controller = this.arrayController;
        if (controller) return controller.arrangedObjects;
        let source = this.content;
        if (this.isCollection(source)) source = UIRuntime.send(source, "records");
        let objects = UIRuntime.cast(
          UIRuntime.cast(
            UIRuntime.logicalOr(source, () => []),
            "T::Array[T.untyped]"
          ),
          "T::Array[T.untyped]"
        );
        let options = this.arrangementOptions;
        let leading = UIRuntime.isEqual(options.source, this.content) ? UIRuntime.cast(
          UIRuntime.logicalOr(options.leading, () => []),
          "T::Array[T.untyped]"
        ) : [];
        leading = leading.filter((object) => this.includesObject(object));
        objects = objects.filter((object) => UIRuntime.isTruthy(!leading.includes(object) && this.includesObject(object)));
        let key = UIRuntime.cast(options.key, "T.nilable(String)");
        if (key != null) {
          let direction = options.direction === "descending" ? -1 : 1;
          let values = UIRuntime.cast(
            objects.map((object) => [UIRuntime.read(object, key), object]),
            "T::Array[T::Array[T.untyped]]"
          );
          values = UIRuntime.sortWith(
            values,
            (left, right) => this.compareSortValues(left[0], right[0]) * direction
          );
          objects = values.map((entry) => entry[1]);
        }
        ;
        return leading.concat(objects);
      }
      // Returns whether `object` belongs in the arranged content. The default
      // implementation returns true for every object. Override it to filter;
      // properties read in the override are dependencies of the arrangement,
      // so a change to them rearranges.
      includesObject(_object) {
        return true;
      }
      contentDidChange(_previous, _value) {
        let options = this.arrangementOptions;
        if (!Object.hasOwn(options, "source")) return;
        return this.arrangementOptions = {
          key: options.key,
          direction: options.direction
        };
      }
      isCollection(objects) {
        return UIRuntime.logicalAnd(
          objects != null && !Array.isArray(objects),
          () => UIRuntime.respondsTo(objects, "records")
        );
      }
      // Places `object` ahead of the arranged content, whether or not the
      // content includes it, and selects it. `includes_object?` still applies.
      // Assigning new content or sorting clears the placement.
      showFirst(object) {
        let controller = this.arrayController;
        if (controller) {
          return controller.showFirst(object);
        } else {
          this.arrangementOptions = Object.assign(
            {},
            this.arrangementOptions,
            { source: this.content, leading: [object] }
          );
          return this.selectObject(object);
        }
      }
      // Replaces `original` with `replacement` in the content: through
      // `replace` on a `Model::Collection`, or by assigning a new array.
      // Editing a plain row ends this way. A read-only collection raises.
      replaceObject(original, replacement) {
        let controller = this.arrayController;
        if (controller) {
          controller.replaceObject(original, replacement);
          return;
        }
        ;
        let source = this.content;
        let records = this.isCollection(source) ? UIRuntime.send(
          source,
          "records"
        ) : source;
        let values = UIRuntime.cast(
          UIRuntime.logicalOr(records, () => []),
          "T::Array[T.untyped]"
        ).map((object) => UIRuntime.isEqual(object, original) ? replacement : object);
        return this.isCollection(source) ? UIRuntime.invoke(
          source,
          "replace",
          values
        ) : this.content = values;
      }
      compareSortValues(left, right) {
        if (UIRuntime.isTruthy(left == null && right == null)) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        if (UIRuntime.isTruthy(UIRuntime.dataValueType(left) === "BigDecimal" && UIRuntime.dataValueType(right) === "BigDecimal")) {
          return UIRuntime.compareDecimal(left, right);
        }
        ;
        if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
          UIRuntime.isNumber(left),
          () => UIRuntime.isNumber(right)
        ))) return left - right;
        if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
          UIRuntime.isBoolean(left),
          () => UIRuntime.isBoolean(right)
        ))) {
          return (UIRuntime.isTruthy(left) ? 1 : 0) - (UIRuntime.isTruthy(right) ? 1 : 0);
        }
        ;
        return UIRuntime.compareText(
          UIRuntime.send(left, "to_s"),
          UIRuntime.send(right, "to_s")
        );
      }
      // :section: Sorting
      // Sorts the arranged content by `key` in `direction`, `"ascending"` or
      // `"descending"`; nil for `key` leaves the content unsorted. Raises for
      // any other direction. Sorting clears a `show_first` placement.
      sort(key, direction) {
        let controller = this.arrayController;
        if (controller) {
          return controller.sort(key, direction);
        } else {
          if (!["ascending", "descending"].includes(direction)) {
            throw new Error("Sort direction must be ascending or descending");
          }
          ;
          return this.arrangementOptions = { key, direction };
        }
      }
      // Sorts by `key`: descending when `key` is already the sort key in
      // ascending order, ascending otherwise. A sort header's action.
      toggleSort(key) {
        let direction = UIRuntime.isTruthy(this.sortKey === key && this.sortDirection === "ascending") ? "descending" : "ascending";
        return this.sort(key, direction);
      }
      // Sorts by `key` in the current direction; the writer of `sort_key`.
      changeSortKey(key) {
        return this.sort(key, this.sortDirection);
      }
      // Sorts by the current key in `direction`; the writer of
      // `sort_direction`.
      changeSortDirection(direction) {
        return this.sort(this.sortKey, direction);
      }
      // :section: Selecting
      arrangedSelection() {
        let controller = this.arrayController;
        if (controller) return controller.selectedObjects;
        let objects = this.arrangedObjects;
        let requested = UIRuntime.cast(
          UIRuntime.logicalOr(this.selectionState.objects, () => []),
          "T::Array[T.untyped]"
        );
        let selected = requested.filter((object) => objects.includes(object));
        if (UIRuntime.isEmpty(selected)) {
          let identifier = UIRuntime.cast(
            UIRuntime.logicalOr(this.selectionState.id, () => null),
            "T.nilable(String)"
          );
          let found = identifier != null ? objects.find((object) => this.identifierFor(object) === identifier) : null;
          if (UIRuntime.isTruthy(found)) selected = [found];
        }
        ;
        return selected;
      }
      // Selects `objects`, replacing the current selection; the writer of
      // `selected_objects`. The array is copied. An object the arranged content
      // does not include stays requested, and is selected once it appears.
      selectObjects(objects) {
        let controller = this.arrayController;
        return controller ? controller.selectedObjects = objects : this.selectionState = {
          objects: objects.slice(),
          id: this.identifierFor(objects[0])
        };
      }
      // Selects the object whose id is `identifier`, now or once the content
      // includes it, replacing the current selection; the writer of
      // `selected_object_id`. Nil deselects.
      selectIdentifier(identifier) {
        let controller = this.arrayController;
        return controller ? controller.selectedObjectId = identifier : this.selectionState = {
          objects: [],
          id: identifier
        };
      }
      // Selects the objects at `indexes` in the arranged content, replacing
      // the current selection. An index outside the content is ignored.
      selectIndexes(indexes) {
        let arranged = this.arrangedObjects;
        let objects = UIRuntime.cast([], "T::Array[T.untyped]");
        indexes.forEach((index) => {
          if (UIRuntime.isTruthy(index >= 0 && index < arranged.length)) {
            UIRuntime.append(objects, arranged[index]);
          }
        });
        return this.selectedObjects = objects;
      }
      // Selects `object` alone, replacing the current selection. Nil deselects.
      selectObject(object) {
        return this.selectedObjects = object == null ? [] : [object];
      }
      // Empties the selection.
      deselectAll() {
        return this.selectedObjects = [];
      }
      // Selects the first arranged object when nothing is selected and there
      // is one.
      selectFirstIfNothingSelected() {
        if (UIRuntime.isTruthy(UIRuntime.isEmpty(this.selectedObjects) && !UIRuntime.isEmpty(this.arrangedObjects))) {
          return this.selectIndexes([0]);
        }
      }
      // Returns the arranged object at `index`, or nil when `index` is outside
      // the arranged content.
      objectAt(index) {
        let objects = this.arrangedObjects;
        return UIRuntime.isTruthy(index >= 0 && index < objects.length) ? objects[index] : null;
      }
      // Returns `object`'s `id` as a string, or nil when `object` is nil, has
      // no `id`, or its id is nil.
      identifierFor(object) {
        if (!UIRuntime.isTruthy(object)) return null;
        if (!UIRuntime.isTruthy(UIRuntime.respondsTo(object, "id"))) return null;
        let value = UIRuntime.send(object, "id");
        if (value == null) return null;
        return UIRuntime.send(value, "to_s");
      }
      // Returns the arranged object whose id is `identifier`, or nil when none
      // has it or `identifier` is nil or empty.
      objectWithId(identifier) {
        if (identifier == null || UIRuntime.isEmpty(identifier)) return null;
        return this.arrangedObjects.find((object) => this.identifierFor(object) === identifier);
      }
      currentSelection() {
        return this.selectedObjects;
      }
      // :nodoc:
      currentIndexes() {
        return this.selectedIndexes;
      }
      // :nodoc:
      reconcileSelection() {
        return this.selectedObjects;
      }
    }
    return Swill__CollectionArrangement_Layer;
  }
  var Swill__ArrayController = class extends Swill__Object {
  };
  var Swill__Responder = class _Swill__Responder extends Swill__Object {
    // The next link in the chain, or nil at the end of it.
    nextResponder() {
      return null;
    }
    // Sends +name+ to the first responder in the chain that implements it.
    // Raises when no responder does.
    performAction(name, sender, event) {
      let target = this.actionTarget(name);
      if (!target) throw new Error(`Unhandled action: ${name}`);
      return UIRuntime.performAction(target, name, sender, event);
    }
    // TODO: It's unclear to me that this is the right place to handle this bubbling.
    // The responder that would handle +name+, or nil.
    actionTarget(name) {
      if (UIRuntime.isTruthy(UIRuntime.respondsTo(this, name))) return this;
      return UIRuntime.nilable(this.nextResponder()?.actionTarget(name));
    }
    // Whether this responder will take focus. False here; a controller
    // accepts when its region holds something focusable.
    acceptsFirstResponder() {
      return false;
    }
    // The element this responder's focus lies within: a view's element, or a
    // controller's view's. Nil here, for a responder with no place on the
    // page.
    focusRegion() {
      return null;
    }
    // The element that carries this responder's focus: becoming first
    // responder focuses it. Nil here; a view's is its first focusable
    // element, and a controller's is its view's.
    keyElement() {
      return null;
    }
    // Called as this responder takes focus. Answer false to refuse it.
    becomeFirstResponder() {
      return true;
    }
    // Called as focus moves to +next_responder+. Answer false to keep it.
    resignFirstResponder(next_responder) {
      return true;
    }
    // Translates a key into a command and sends it to this responder, as
    // Cocoa's interpretKeyEvents: does. A command something in the chain
    // takes is the key's whole effect, so the browser's own is prevented; one
    // that reaches the end of the chain untaken leaves the key to the
    // browser. A key the focused element handles itself, such as typing in a
    // field, stops here. A key held with Control, Command or Option, or one no
    // command names, passes to the next responder as it is. An override sees
    // the raw key before any of this.
    keyDown(event) {
      if (event.isComposing) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (Swill__DOM.isHandlesKey(event)) return;
        if (this.commandFor(event)) {
          if (!_Swill__Responder.isDeclined(event)) event.preventDefault();
          return;
        }
      }
      ;
      let target = this.nextResponder();
      if (target) return target.keyDown(event);
    }
    // Sends the command +event+'s key names, answering whether there is one.
    commandFor(event) {
      switch (event.key) {
        case "Escape":
          this.cancelOperation(event);
          break;
        case "Enter":
          this.insertNewline(event);
          break;
        case "Tab":
          if (event.shiftKey) {
            this.insertBacktab(event);
          } else {
            this.insertTab(event);
          }
          ;
          break;
        case "ArrowUp":
          this.moveUp(event);
          break;
        case "ArrowDown":
          this.moveDown(event);
          break;
        case "ArrowLeft":
          this.moveLeft(event);
          break;
        case "ArrowRight":
          this.moveRight(event);
          break;
        case "Home":
          this.moveToBeginningOfDocument(event);
          break;
        case "End":
          this.moveToEndOfDocument(event);
          break;
        default:
          return false;
      }
      ;
      return true;
    }
    static decline(event) {
      this._declined = event;
      return this._declined;
    }
    static isDeclined(event) {
      return this._declined === event;
    }
    // Passes to the next responder.
    keyUp(event) {
      let target = this.nextResponder();
      if (target) return target.keyUp(event);
    }
    // :section: Commands
    // What keys mean. Each passes to the next responder, so implementing one
    // takes that key for this responder's region, and calling super declines
    // it. A command taken prevents the browser's handling of its key.
    // Escape. Dismiss what is open.
    cancelOperation(event) {
      let target = this.nextResponder();
      return target ? target.cancelOperation(event) : _Swill__Responder.decline(event);
    }
    // Enter. Commit what is being edited.
    insertNewline(event) {
      let target = this.nextResponder();
      return target ? target.insertNewline(event) : _Swill__Responder.decline(event);
    }
    // Tab. The application moves through the key view loop.
    insertTab(event) {
      let target = this.nextResponder();
      return target ? target.insertTab(event) : _Swill__Responder.decline(event);
    }
    // Shift-Tab.
    insertBacktab(event) {
      let target = this.nextResponder();
      return target ? target.insertBacktab(event) : _Swill__Responder.decline(event);
    }
    // Up arrow.
    moveUp(event) {
      let target = this.nextResponder();
      return target ? target.moveUp(event) : _Swill__Responder.decline(event);
    }
    // Down arrow.
    moveDown(event) {
      let target = this.nextResponder();
      return target ? target.moveDown(event) : _Swill__Responder.decline(event);
    }
    // Left arrow.
    moveLeft(event) {
      let target = this.nextResponder();
      return target ? target.moveLeft(event) : _Swill__Responder.decline(event);
    }
    // Right arrow.
    moveRight(event) {
      let target = this.nextResponder();
      return target ? target.moveRight(event) : _Swill__Responder.decline(event);
    }
    // Home.
    moveToBeginningOfDocument(event) {
      let target = this.nextResponder();
      return target ? target.moveToBeginningOfDocument(event) : _Swill__Responder.decline(event);
    }
    // End.
    moveToEndOfDocument(event) {
      let target = this.nextResponder();
      return target ? target.moveToEndOfDocument(event) : _Swill__Responder.decline(event);
    }
  };
  function Swill__OutletOwner(Superclass) {
    class Swill__OutletOwner_Layer extends Superclass {
      // Declares a property connected at launch/awakening to the element in
      // the owner's region with a matching `outlet` attribute. It holds nil
      // until then; a missing element raises unless `optional:` is true.
      // Returns the value to assign to JSON outlet `name` from its parsed
      // `value`; nil when the script element was empty. Override to turn parsed
      // data into models before assignment. The default returns it unchanged.
      decodeOutletData(name, value) {
        return value;
      }
    }
    return Swill__OutletOwner_Layer;
  }
  function Swill__OutletOwner_ClassMethods(Superclass) {
    class Swill__OutletOwner_ClassMethods_Layer extends Object {
    }
    Object.setPrototypeOf(Swill__OutletOwner_ClassMethods_Layer.prototype, Superclass);
    return Swill__OutletOwner_ClassMethods_Layer.prototype;
  }
  var Swill__Bundle = class _Swill__Bundle extends Swill__Object {
    static register(name, base_url, manifest, embedded, main) {
      let bundle = new _Swill__Bundle(name, base_url, manifest, embedded);
      let bundles = this._bundles || {};
      this._bundles = UIRuntime.cast(
        bundles,
        "T.nilable(T::Hash[String, Bundle])"
      );
      bundles[name] = bundle;
      if (main) this._main = UIRuntime.cast(bundle, "T.nilable(Swill::Bundle)");
      return bundle;
    }
    static main() {
      return this._main;
    }
    static framework() {
      return this.named("swill");
    }
    static named(name) {
      let bundles = this._bundles;
      return bundles ? bundles[name] : null;
    }
    static searchOrder() {
      return UIRuntime.uniq(UIRuntime.compact([this.main(), this.framework()]));
    }
    // Creates a bundle; a bundle's script calls Bundle.register instead.
    // +embedded+ holds contents already loaded, by path.
    constructor(name, base_url, manifest, embedded) {
      super();
      this._name = name;
      this._base_url = base_url;
      this._manifest = manifest;
      this._contents = UIRuntime.cast(
        Object.assign({}, embedded),
        "T::Hash[String, String]"
      );
      this._stems = UIRuntime.cast({}, "T::Hash[String, T::Array[String]]");
      manifest.forEach((path) => {
        let stem = _Swill__Bundle.stem(path);
        let paths = this._stems[stem];
        return paths ? UIRuntime.append(paths, path) : this._stems[stem] = [path];
      });
    }
    // The bundle's name, which is also its folder under `resources/`.
    get name() {
      return this._name;
    }
    // The folder the bundle's script was served from, ending in a slash.
    // Assign it to serve the resources from somewhere else.
    get baseURL() {
      return this._base_url;
    }
    set baseURL(base_url) {
      this._base_url = base_url;
      return this._base_url;
    }
    // Every resource path, relative to the bundle's resources folder.
    get manifest() {
      return this._manifest;
    }
    // The path of the resource +name+ with +extension+, or nil when the
    // bundle has none. Without an extension, a name that more than one file
    // carries raises rather than choosing.
    pathForResourceWithExtension(name, extension) {
      if (extension != null) {
        let path = `${name}.${extension}`;
        return this._manifest.includes(path) ? path : null;
      }
      ;
      let paths = this._stems[name] || [];
      if (UIRuntime.send(paths, "length") > 1) {
        throw new Error(`Ambiguous resource ${name} in bundle ${this._name}: ${UIRuntime.invoke(
          paths,
          "join",
          ", "
        )}`);
      }
      ;
      return UIRuntime.send(paths, "first");
    }
    // The URL of a resource, or nil when the bundle has none. See
    // #path_for_resource.
    urlForResourceWithExtension(name, extension) {
      let path = this.pathForResourceWithExtension(name, extension);
      return path != null ? this.urlForPath(path) : null;
    }
    // Whether the bundle has the resource. See #path_for_resource.
    isResourceWithExtension(name, extension) {
      return this.pathForResourceWithExtension(name, extension) != null;
    }
    // The URL of the resource at +path+ in the manifest.
    urlForPath(path) {
      let encoded = UIRuntime.split(path, "/").map((segment) => encodeURIComponent(segment)).join("/");
      return `${this._base_url}resources/${encodeURIComponent(this._name)}/${encoded}`;
    }
    async loadResource(name, extension) {
      let path = this.pathForResourceWithExtension(name, extension);
      if (path == null) {
        throw new Error(`No resource ${name} in bundle ${this._name}`);
      }
      ;
      let loaded = UIRuntime.fetch(this._contents, path, null);
      if (loaded != null) return loaded;
      let response = await fetch(this.urlForPath(path));
      if (!response.ok) {
        throw new Error(`Could not load ${path} from bundle ${this._name}: ${response.status}`);
      }
      ;
      let text = await response.text();
      this._contents[path] = text;
      return text;
    }
    // The resource's text when it has been loaded, or embedded, and nil
    // otherwise. See #load_resource.
    loadedResourceWithExtension(name, extension) {
      let path = this.pathForResourceWithExtension(name, extension);
      return path != null ? UIRuntime.fetch(this._contents, path, null) : null;
    }
    // The loaded text of the resource at +path+, or nil.
    loadedPath(path) {
      return UIRuntime.fetch(this._contents, path, null);
    }
    // Links the stylesheet +name+ into +document+ once, and answers a promise
    // that settles as it loads. Pages usually link their stylesheets
    // themselves; this is for adding one while running.
    addStylesheet(name, document2) {
      let url = this.urlForResourceWithExtension(name, "css");
      if (url == null) {
        throw new Error(`No stylesheet ${name} in bundle ${this._name}`);
      }
      ;
      let existing = document2.querySelector(`link[data-swill-stylesheet="${url}"]`);
      if (existing) return Promise.resolve(existing);
      let link = document2.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", url);
      link.setAttribute("data-swill-stylesheet", url);
      let loaded = new Promise((resolve2, reject) => {
        link.addEventListener("load", (_event) => resolve2(link));
        return link.addEventListener(
          "error",
          (_event) => reject(`Could not load stylesheet ${url}`)
        );
      });
      document2.head.appendChild(link);
      return loaded;
    }
    static stem(path) {
      let segments2 = UIRuntime.split(path, "/");
      let file = UIRuntime.must(segments2.pop());
      let parts = UIRuntime.split(file, ".");
      let name = UIRuntime.isTruthy(parts.length > 1 && !UIRuntime.isEmpty(UIRuntime.must(parts[0]))) ? parts.slice(
        0,
        parts.length - 1
      ).join(".") : file;
      return segments2.concat([name]).join("/");
    }
    pathForResource(name) {
      return _Swill__Bundle.prototype.pathForResourceWithExtension.call(
        this,
        name,
        null
      );
    }
    urlForResource(name) {
      return _Swill__Bundle.prototype.urlForResourceWithExtension.call(
        this,
        name,
        null
      );
    }
    isResource(name) {
      return _Swill__Bundle.prototype.isResourceWithExtension.call(
        this,
        name,
        null
      );
    }
    loadedResource(name) {
      return _Swill__Bundle.prototype.loadedResourceWithExtension.call(
        this,
        name,
        null
      );
    }
  };
  function Swill__Templates(Superclass) {
    class Swill__Templates_Layer extends Superclass {
    }
    return Swill__Templates_Layer;
  }
  var Swill__Templates_Functions = class extends Object {
    static named(name, document2) {
      let unloaded = UIRuntime.cast([], "T::Array[String]");
      let found = null;
      Swill__Bundle.searchOrder().forEach((bundle) => bundle.manifest.filter((path) => path.endsWith(".html")).forEach((path) => {
        if (UIRuntime.isTruthy(found)) return;
        let source = bundle.loadedPath(path);
        if (source != null) {
          found = Swill__Templates.find(
            Swill__Templates.catalog(document2, bundle, path, source),
            name
          );
          return found;
        } else {
          return UIRuntime.append(unloaded, `${bundle.name}/${path}`);
        }
      }));
      if (found) return found;
      let hint = UIRuntime.isEmpty(unloaded) ? "" : ` (not loaded yet: ${unloaded.join(", ")}; await Bundle#load_resource first)`;
      return (() => {
        throw new Error(`Unknown control template: ${name}${hint}`);
      })();
    }
    static catalog(document2, bundle, path, source) {
      let catalogs = document2.__swill_templates__;
      if (!catalogs) {
        catalogs = {};
        document2.__swill_templates__ = catalogs;
      }
      ;
      let key = `${bundle.name}/${path}`;
      let catalog = catalogs[key];
      if (!catalog) {
        catalog = document2.createElement("template");
        catalog.innerHTML = source;
        catalogs[key] = catalog;
      }
      ;
      return catalog;
    }
    static find(catalog, name) {
      let templates = catalog.content.children;
      let index = 0;
      while (index < templates.length) {
        let template = UIRuntime.must(templates[index]);
        if (template.getAttribute("name") === name) return template;
        index++;
      }
      ;
      return null;
    }
  };
  Swill__Templates.named = Swill__Templates_Functions.named;
  Swill__Templates.catalog = Swill__Templates_Functions.catalog;
  Swill__Templates.find = Swill__Templates_Functions.find;
  var Swill__Image = class _Swill__Image extends Swill__Object {
    static extensions() {
      return ["svg", "png", "webp", "jpg", "jpeg", "gif"];
    }
    static named(name) {
      let urls = Swill__Bundle.searchOrder().flatMap((bundle) => _Swill__Image.extensions().map((extension) => bundle.urlForResourceWithExtension(name, extension)));
      let url = UIRuntime.compact(urls)[0];
      return UIRuntime.isTruthy(url) ? new _Swill__Image(url) : null;
    }
    // An image at +url+, a path or URL as an `<img src>` would take it.
    constructor(url) {
      super();
      this._url = url;
    }
    // Where the image is, as an `<img src>` would take it.
    get url() {
      return this._url;
    }
  };
  var Swill__View = class _Swill__View extends Swill__Responder {
    // :section: Wrapping an Element
    // A view, its element, and the controller rooted there.
    // Creates the view for `element`, marking the element managed. An element
    // holds at most one view; `View.of` finds it.
    constructor(element) {
      super();
      this._owns_content = UIRuntime.cast(false, "T::Boolean");
      this._element = element;
      this._controller = UIRuntime.cast(null, "T.nilable(Swill::Controller)");
      this._superview = UIRuntime.cast(null, "T.nilable(Swill::View)");
      this._subviews = UIRuntime.cast([], "T::Array[View]");
      element.__swill_view__ = this;
    }
    // Template internals have their own connections, but stay in the view tree.
    isOwnsContent() {
      return this._owns_content;
    }
    unload() {
      let owning_controller = this._controller;
      if (owning_controller) {
        owning_controller.unload();
        return;
      }
      ;
      if (Swill__Application.isRunning()) {
        Swill__Application.shared().releaseFirstResponder(this._element);
      }
      ;
      this._subviews.slice().forEach((__swill_item) => __swill_item.unload());
      this.dealloc();
      this.removeFromSuperview();
      return this._element.__swill_view__ = null;
    }
    // The element this view wraps.
    get element() {
      return this._element;
    }
    // Returns the controller rooted at this view, or nil when the view is not
    // a controller root. `owner` finds the controller a view belongs to.
    controllerValue() {
      return this._controller;
    }
    set controller(controller) {
      this._controller = controller;
      return this._controller;
    }
    // :section: Forming the View Tree
    // Adoption links views into the tree that ownership is read from.
    // The view that adopted this one, or nil for a view outside the tree.
    get superview() {
      return this._superview;
    }
    // The views this one adopted, in adoption order; an empty array when there
    // are none.
    get subviews() {
      return this._subviews;
    }
    // Returns the controller this view belongs to: the controller rooted here,
    // or else the superview's owner. Returns nil for a view outside any
    // controller's region.
    owner() {
      let own = this._controller;
      if (own) return own;
      return UIRuntime.nilable(this._superview?.owner());
    }
    // Adopts `child` as a subview, releasing it from any previous superview,
    // and returns it. Adoption changes the view tree only; it does not move
    // or awaken elements.
    adoptSubview(child) {
      let previous = child.superview;
      UIRuntime.nilable(previous?.releaseSubview(child));
      child.assignSuperview(this);
      UIRuntime.append(this._subviews, child);
      return child;
    }
    // Releases `child` from this view's subviews, leaving it with no superview.
    releaseSubview(child) {
      this._subviews = this._subviews.filter((candidate) => !(candidate === child));
      return child.assignSuperview(null);
    }
    // Releases this view from its superview, if it has one.
    removeFromSuperview() {
      let superview = this._superview;
      return UIRuntime.nilable(superview?.releaseSubview(this));
    }
    // Set by adopt_subview and release_subview, which keep both sides consistent.
    assignSuperview(superview) {
      this._superview = superview;
      return this._superview;
    }
    static of(element) {
      return element.__swill_view__;
    }
    static controllerFor(element) {
      let view = _Swill__View.of(element);
      return UIRuntime.nilable(view?.controllerValue());
    }
    // Returns whether this view's element carries the attribute `name`.
    hasAttribute(name) {
      return this._element.hasAttribute(name);
    }
    // Returns whether `element` lies within this view's element.
    contains(element) {
      return this._element.contains(element);
    }
    // A fresh template root, or a blank div when the template has no element.
    cloneTemplate(template) {
      let node = template.content.firstElementChild;
      return node ? node.cloneNode(true) : this._element.ownerDocument.createElement("div");
    }
    // Appends `element` as the last child of this view's element.
    append(element) {
      return this._element.appendChild(element);
    }
    // Inserts `element` immediately after `anchor`.
    insertAfter(anchor, element) {
      return anchor.after(element);
    }
    // Removes `element` from the document.
    remove(element) {
      return element.remove();
    }
    // Returns the direct child of this view's element that contains
    // `element`, or nil when `element` is not within this view.
    childContaining(element) {
      let node = element;
      while (node && node.parentElement !== this._element) {
        node = node.parentElement;
      }
      ;
      return node;
    }
    // Adds the class `name` to `element` when `on` is true, and removes it
    // otherwise.
    mark(element, name, on) {
      return element.classList.toggle(name, on);
    }
    // Marks `element` selected or not, as the `selected` class.
    markSelected(element, on) {
      return this.mark(element, "selected", on);
    }
    // Scrolls the nearest scrolling ancestor just far enough to bring
    // `element` into view.
    reveal(element) {
      return element.scrollIntoView({ block: "nearest" });
    }
    // Clears the browser's text selection, as before a shift-click extends
    // a list selection.
    clearTextSelection() {
      let selection = this._element.ownerDocument.getSelection();
      return selection?.removeAllRanges();
    }
    // Adds an event listener for `type` on this view's element and returns
    // a callable that removes it. A controller retains the callable so the
    // listener is removed when it unloads.
    listen(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "type", kind: "req" },
          { name: "handler", kind: "req" }
        ],
        keywords: [{ name: "capture", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let type = UIRuntime.argument(__swill_bound, "type");
      let handler = UIRuntime.argument(__swill_bound, "handler");
      let capture = UIRuntime.argument(__swill_bound, "capture");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(capture))) capture = false;
      this._element.addEventListener(type, handler, capture);
      return () => this._element.removeEventListener(type, handler, capture);
    }
    // :section: Focusing
    // What is focusable within this view, and the view as a responder.
    // Returns the selector that decides what counts as focusable within this
    // view. The default is `"input, select, textarea, button, [tabindex]"`.
    // Override it to widen or narrow the set.
    focusableSelector() {
      return "input, select, textarea, button, [tabindex]";
    }
    // Gives this view's element a tab stop, `tabindex="0"`, unless it already
    // has one, so keyboard focus can reach it.
    ensureFocusable() {
      if (!this._element.hasAttribute("tabindex")) {
        return this._element.setAttribute("tabindex", "0");
      }
    }
    // Returns this view's element when it matches `focusable_selector`, else
    // its first focusable descendant, or nil when nothing within it is
    // focusable.
    firstFocusableElement() {
      if (this._element.matches(this.focusableSelector())) return this._element;
      return this._element.querySelector(this.focusableSelector());
    }
    // The view's element, which its focus lies within.
    focusRegion() {
      return this._element;
    }
    // The element focus goes to when this view becomes first responder: its
    // `first_focusable_element`.
    keyElement() {
      return this.firstFocusableElement();
    }
    // Focuses `key_element` without scrolling, if there is one.
    focusElement() {
      let target = this.keyElement();
      if (target) return Swill__DOM.focus(target);
    }
    // Blurs the focused element when it lies within this view, which may be
    // a descendant other than `key_element`. Focus already inside
    // +next_responder+, as when the browser moved it to a nested control, is
    // left where it is: resigning never takes focus from the responder that
    // follows.
    blurElementWithNextResponder(next_responder) {
      let active = this._element.ownerDocument.activeElement;
      if (!UIRuntime.isTruthy(active && this._element.contains(active))) return;
      let region = next_responder ? next_responder.focusRegion() : null;
      if (!UIRuntime.isTruthy(region && region.contains(active))) return active.blur();
    }
    // Returns the controller rooted at this view, or else its superview. The
    // chain leaves the view tree at the first controller it meets.
    nextResponder() {
      return this._controller || this._superview;
    }
    // Returns true: a view always accepts first responder.
    acceptsFirstResponder() {
      return true;
    }
    // Focuses `key_element` and returns true.
    becomeFirstResponder() {
      this.focusElement();
      return true;
    }
    // Blurs the focused element within this view and returns true.
    resignFirstResponder(next_responder) {
      if (!super.resignFirstResponder(next_responder)) return false;
      this.blurElementWithNextResponder(next_responder);
      return true;
    }
    // :section: Accessibility
    // What assistive technology is told about the view, as NSAccessibility
    // tells it about an NSView.
    // Writes the view's ARIA roles, states and labels onto its element and
    // the parts it draws. This is the one place Swill writes them, and it
    // never reads them back: behavior and styles follow the view's own state
    // and classes, so ARIA is decoration for screen readers alone.
    //
    // The default labels a window by its title bar. A subclass overrides it,
    // calling `super`, and calls it again whenever what it describes changes;
    // a window's view is updated as the window opens.
    updateAccessibility() {
      let header = this._element.firstElementChild;
      if (!UIRuntime.isTruthy(header && header.classList.contains("window-title"))) {
        return;
      }
      ;
      let identifier = header.firstElementChild?.getAttribute("id");
      if (identifier != null) {
        return this._element.setAttribute("aria-labelledby", identifier);
      }
    }
    blurElement() {
      return _Swill__View.prototype.blurElementWithNextResponder.call(
        this,
        null
      );
    }
  };
  var Swill__Control = class extends Swill__View {
    // The object consulted before the control resigns first responder. It may
    // implement `control_should_resign_first_responder(control, next_responder)`
    // and return false to refuse the change. The default is nil.
    // See `#resign_first_responder`.
    // Replaces the element's contents with a copy of the named control template
    // and connects its outlets, bindings, and actions to this control.
    // Raises "Control template already loaded" if a template has been loaded,
    // or "Unknown control template: ..." if the name is absent from the catalog.
    // Connections are released when the control unloads.
    loadTemplate(name) {
      if (this._owns_content) throw new Error("Control template already loaded");
      let template = Swill__Templates.named(
        name,
        this._element.ownerDocument
      );
      this._owns_content = true;
      this._element.replaceChildren(template.content.cloneNode(true));
      return Swill__Awakening.awakenOwned(this._element, this);
    }
    // Invoked before first responder moves to `next_responder`. Returns false
    // if the delegate refuses; otherwise returns the superclass result.
    // An override should call `super` to preserve the delegate's decision.
    // See `#delegate`.
    resignFirstResponder(next_responder) {
      let current = this.delegate;
      if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
        current,
        () => UIRuntime.respondsTo(current, "control_should_resign_first_responder")
      ))) {
        if (!UIRuntime.isTruthy(UIRuntime.invoke(
          current,
          "control_should_resign_first_responder",
          this,
          next_responder
        ))) return false;
      }
      ;
      return super.resignFirstResponder(next_responder);
    }
  };
  var Swill__Control__Button = class extends Swill__Control {
    // Creates a control for `element` and adds `tabindex="0"` when no tabindex
    // is present. An existing tabindex is preserved.
    constructor(element) {
      super(element);
      this.ensureFocusable();
    }
  };
  var Swill__Control__ImageView = class extends Swill__Control {
    // The image shown, or nil for none. A string is looked up with
    // Image.named, and taken as a URL when no bundle has that name.
    // Creates the control for `element`. An `image` attribute must name an
    // image a bundle has; raises "Unknown image: ..." otherwise.
    constructor(element) {
      super(element);
      this.updateAccessibility();
      let name = element.getAttribute("image");
      if (name == null) return;
      let found = Swill__Image.named(name);
      if (!found) throw new Error(`Unknown image: ${name}`);
      this.value = found;
    }
    coercePropertyValue(name, value, previous) {
      if (!UIRuntime.isTruthy(name === "value" && UIRuntime.conforms(
        value,
        "String"
      ))) return super.coercePropertyValue(name, value, previous);
      return Swill__Image.named(value) || new Swill__Image(value);
    }
    // Invoked after `value` changes to update the element's `src`.
    valueDidChange(_previous, image) {
      return image ? this.imageElement().setAttribute("src", image.url) : this.imageElement().removeAttribute("src");
    }
    // The `<img>` the control shows its image in.
    imageElement() {
      if (this._element.tagName === "IMG") return this._element;
      let found = this._element.querySelector("img");
      if (found) return found;
      let created = this._element.ownerDocument.createElement("img");
      created.setAttribute("alt", "");
      this._element.appendChild(created);
      return created;
    }
    // An image with empty alt text is decoration, hidden from screen readers.
    updateAccessibility() {
      super.updateAccessibility();
      if (this.imageElement().getAttribute("alt") === "") {
        return this.imageElement().setAttribute("aria-hidden", "true");
      }
    }
  };
  var Swill__Controller = class extends Swill__Responder {
    // :section: Declaring Outlets and Restorable Paths
    // Class-level declarations beyond `property`.
    // Declares a bindable `path` whose value the application keeps in the URL
    // fragment under `key`, which defaults to the path itself. The value's
    // type is derived when the class is compiled; the path is checked when the
    // runtime installs the class. `controller_did_restore` reports whether a
    // value was applied.
    // :section: Presenting an Object
    // The object this controller's region binds to.
    // The object this controller presents. A parent controller assigns it
    // through `bind="path"` on this controller's root element; nil until then.
    // Bindings within the region resolve under `binding_root`, which by
    // default is the controller itself.
    // The title of the window this controller is the content of, shown in its
    // title bar where the theme draws one. Nil leaves the title bar empty. A
    // subclass sets it, binds it, or declares it computed.
    // Returns the property under which `bind` paths in this region resolve,
    // or nil to resolve them against the controller itself. A path beginning
    // with `@` in markup ignores the root. The default is nil; override it to
    // bind a region to the represented object directly.
    bindingRoot() {
      return null;
    }
    // :section: Locating the Region
    // This controller's view, and the controllers around it.
    // Adopts `element` as this controller's root view, creating a `View` for
    // it when it has none, and returns the controller. The awakener calls
    // this for an element carrying `controller`.
    attach(element) {
      this._view = Swill__View.of(element) || new Swill__View(element);
      this._view.controller = this;
      return this;
    }
    // The root view of this controller's region.
    get view() {
      return this._view;
    }
    // Returns the controller that owns the containing region, or nil for a
    // root controller.
    parent() {
      return UIRuntime.nilable(this._view.superview?.owner());
    }
    // Returns the controllers rooted directly within this region, in document
    // order; an empty array when there are none.
    childControllers() {
      let found = UIRuntime.cast([], "T::Array[Controller]");
      this.collectChildControllers(this._view, found);
      return found;
    }
    // Returns the application running on this page.
    application() {
      return Swill__Application.shared();
    }
    // :section: Responding
    // This controller's place in the responder chain.
    // Returns the parent controller, or the application for a root
    // controller. The application ends the chain.
    nextResponder() {
      return this.parent() || this.application();
    }
    // Observes the notification named `name` until this controller unloads.
    // `callback` receives each `Notification` posted under that name.
    observeNotification(name, callback) {
      return this.retain(Swill__NotificationCenter.default().addObserver(
        name,
        callback
      ));
    }
    // Returns whether the region has a key element. A controller with nothing
    // to focus refuses first responder.
    acceptsFirstResponder() {
      return this.keyElement() != null;
    }
    // The element of this controller's view, which its focus lies within.
    focusRegion() {
      return this._view.element;
    }
    // The element focus goes to when this controller becomes first
    // responder: its view's `key_element`.
    keyElement() {
      return this._view.keyElement();
    }
    // Focuses the region's key element and returns true.
    becomeFirstResponder() {
      if (!super.becomeFirstResponder()) {
        return false;
      }
      ;
      this._view.focusElement();
      return true;
    }
    // Blurs the focused element within the region and returns true. Override
    // to return false, which refuses the change and keeps this controller
    // first responder.
    resignFirstResponder(next_responder) {
      if (!super.resignFirstResponder(next_responder)) return false;
      this._view.blurElementWithNextResponder(next_responder);
      return true;
    }
    // :section: Loading and Unloading
    // The hooks that run as a region awakens and goes away, in the order they
    // run. Each hook's default implementation does nothing.
    // Releases everything this controller holds, then unloads its child
    // controllers. Bindings, retained observations, and the controller's own
    // observers are released; the region's views are dropped from the view
    // tree, though each element keeps its `View`, so the region can awaken
    // again. `view_will_disappear` runs first and `view_did_disappear` last.
    // A second call does nothing.
    unload() {
      if (this._view.controllerValue() !== this) return;
      this.viewWillDisappear();
      this.application().releaseFirstResponder(this._view.element);
      this.unbindAll();
      this.dealloc();
      this.childControllers().forEach((__swill_item) => __swill_item.unload());
      this._view.subviews.slice().forEach((__swill_item) => __swill_item.unload());
      this._view.removeFromSuperview();
      this._view.controller = null;
      return this.viewDidDisappear();
    }
    // Invoked after the region's outlets are connected and before any binding
    // is established. State set here is what bindings push first. Elements
    // added here awaken as the region's markup did, so a `klass` or
    // `controller` among them is live before bindings and actions connect.
    viewDidLoad() {
      return null;
    }
    // Invoked after every binding in the region has pushed its initial value,
    // every `data-action` has its handler installed, and every child
    // controller has awakened.
    awakeFromDOM() {
      return null;
    }
    // Invoked on a window's controller after values from the URL fragment
    // were applied to its restorable paths, and before `controller_did_load`.
    // `restored` is true when at least one value was applied.
    controllerDidRestore(restored) {
      return null;
    }
    // Invoked once per controller instance, after the whole region, including
    // any restored values, is in place.
    controllerDidLoad() {
      return null;
    }
    // Invoked before the region appears, each time it awakens.
    viewWillAppear() {
      return null;
    }
    // Invoked after the region has appeared.
    viewDidAppear() {
      return null;
    }
    // Invoked as `unload` begins, before anything the controller holds is
    // released.
    viewWillDisappear() {
      return null;
    }
    // Invoked as `unload` ends, after everything the controller held has been
    // released.
    viewDidDisappear() {
      return null;
    }
    collectChildControllers(view, found) {
      return view.subviews.forEach((subview) => {
        let controller = subview.controllerValue();
        return controller ? UIRuntime.append(found, controller) : this.collectChildControllers(
          subview,
          found
        );
      });
    }
  };
  function Swill__Connections__Bindings(Superclass) {
    class Swill__Connections__Bindings_Layer extends Superclass {
    }
    return Swill__Connections__Bindings_Layer;
  }
  var Swill__Connections__Bindings_Functions = class extends Object {
    static establish(controller) {
      let root = controller.view.element;
      let prefix = controller.bindingRoot();
      let disposers = UIRuntime.cast([], "T::Array[T.proc.void]");
      this.propertiesIn(controller, prefix, root, disposers);
      this.regionIn(controller, prefix, root, disposers);
      controller.retain(this.releasing(disposers));
      return controller;
    }
    static establishIn(element, object) {
      let disposers = UIRuntime.cast([], "T::Array[T.proc.void]");
      if (element.hasAttribute("bind")) {
        UIRuntime.append(disposers, this.connect(object, element, null));
      }
      ;
      if (!element.hasAttribute("controller")) {
        this.propertiesIn(object, null, element, disposers);
        this.regionIn(object, null, element, disposers);
      }
      ;
      return this.releasing(disposers);
    }
    static regionIn(object, prefix, element, disposers) {
      return Swill__DOM.eachOwned(
        element,
        false,
        (child, _controller_root) => {
          if (child.hasAttribute("bind")) {
            UIRuntime.append(disposers, this.connect(object, child, prefix));
          }
          ;
          if (!child.hasAttribute("controller")) {
            return this.propertiesIn(object, prefix, child, disposers);
          }
        }
      );
    }
    static propertiesIn(object, prefix, element, disposers) {
      return element.getAttributeNames().forEach((name) => {
        if (!name.startsWith("bind-")) return;
        let property = UIRuntime.must(UIRuntime.slice(name, 5, name.length));
        return UIRuntime.append(disposers, this.connectProperty(
          object,
          prefix,
          element,
          property,
          UIRuntime.must(element.getAttribute(name))
        ));
      });
    }
    static releasing(disposers) {
      return () => disposers.forEach((dispose) => dispose());
    }
    static resolvePath(prefix, path) {
      if (path[0] === "@") {
        return UIRuntime.logicalOr(
          UIRuntime.slice(path, 1, path.length),
          () => ""
        );
      }
      ;
      if (prefix == null) return path;
      return path.length === 0 ? `${prefix}` : `${prefix}.${path}`;
    }
    static transformerFor(element) {
      let name = element.getAttribute("transform");
      if (name == null) return null;
      let transformer = Swill__ValueTransformer.named(name);
      if (!transformer) throw new Error(`unknown transform ${name}`);
      return transformer;
    }
    static connect(object, element, prefix) {
      let path = this.resolvePath(
        prefix,
        UIRuntime.must(element.getAttribute("bind"))
      );
      let transformer = this.transformerFor(element);
      let view = element.__swill_view__;
      let child = view ? view.controllerValue() : null;
      if (child) return this.connectRepresentedObject(object, child, path);
      if (view instanceof Swill__Control) {
        return this.connectControl(
          object,
          UIRuntime.cast(view, "Swill::Control"),
          path,
          transformer
        );
      }
      ;
      let destination = Swill__BindingDestination.forElement(element);
      return Swill__Binding.establish(
        destination,
        element,
        null,
        object,
        path,
        transformer,
        destination.nullPlaceholder(),
        false
      );
    }
    static connectControl(object, control, path, transformer) {
      return Swill__Binding.establish(
        Swill__BindingDestination.objectProperty(),
        control,
        "value",
        object,
        path,
        transformer,
        "",
        false
      );
    }
    static connectRepresentedObject(object, child, path) {
      return Swill__Binding.establish(
        Swill__BindingDestination.objectProperty(),
        child,
        "represented_object",
        object,
        path,
        null,
        null,
        true
      );
    }
    static connectProperty(object, prefix, element, property, path) {
      let name = property === "readonly" ? "readOnly" : property;
      return Swill__Binding.establish(
        Swill__BindingDestination.elementProperty(),
        element,
        name,
        object,
        this.resolvePath(prefix, path),
        null,
        null,
        false
      );
    }
  };
  Swill__Connections__Bindings.establish = Swill__Connections__Bindings_Functions.establish;
  Swill__Connections__Bindings.establishIn = Swill__Connections__Bindings_Functions.establishIn;
  Swill__Connections__Bindings.regionIn = Swill__Connections__Bindings_Functions.regionIn;
  Swill__Connections__Bindings.propertiesIn = Swill__Connections__Bindings_Functions.propertiesIn;
  Swill__Connections__Bindings.releasing = Swill__Connections__Bindings_Functions.releasing;
  Swill__Connections__Bindings.resolvePath = Swill__Connections__Bindings_Functions.resolvePath;
  Swill__Connections__Bindings.transformerFor = Swill__Connections__Bindings_Functions.transformerFor;
  Swill__Connections__Bindings.connect = Swill__Connections__Bindings_Functions.connect;
  Swill__Connections__Bindings.connectControl = Swill__Connections__Bindings_Functions.connectControl;
  Swill__Connections__Bindings.connectRepresentedObject = Swill__Connections__Bindings_Functions.connectRepresentedObject;
  Swill__Connections__Bindings.connectProperty = Swill__Connections__Bindings_Functions.connectProperty;
  function Swill__Connections__Actions(Superclass) {
    class Swill__Connections__Actions_Layer extends Superclass {
    }
    return Swill__Connections__Actions_Layer;
  }
  var Swill__Connections__Actions_Functions = class extends Object {
    static establish(controller) {
      controller.retain(this.establishIn(
        controller.view.element,
        controller
      ));
      return controller;
    }
    static establishIn(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "element", kind: "req" },
          { name: "controller", kind: "req" }
        ],
        keywords: [{ name: "include_root", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let element = UIRuntime.argument(__swill_bound, "element");
      let controller = UIRuntime.argument(__swill_bound, "controller");
      let include_root = UIRuntime.argument(__swill_bound, "include_root");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(include_root))) {
        include_root = true;
      }
      ;
      let disposers = Swill__DOM.ownedMatching(element, "[data-action]").map((target) => UIRuntime.isTruthy(target === element && !include_root) ? () => null : this.connect(
        target,
        controller
      ));
      return () => disposers.forEach((dispose) => dispose());
    }
    static connect(element, controller) {
      let event_name, action_name;
      if (element.__swill_action__) return () => null;
      let attribute = element.getAttribute("data-action");
      let specification = attribute != null ? UIRuntime.strip(attribute) : "";
      if (UIRuntime.isEmpty(specification)) return () => null;
      if (specification.includes(":")) {
        let parts = UIRuntime.split(specification, ":");
        event_name = UIRuntime.must(parts[0]);
        action_name = UIRuntime.must(parts[1]);
      } else {
        event_name = "click";
        action_name = specification;
      }
      ;
      let handler = (event) => controller.performAction(action_name, element, event);
      element.__swill_action__ = true;
      element.addEventListener(event_name, handler);
      return () => {
        element.removeEventListener(event_name, handler);
        return element.__swill_action__ = false;
      };
    }
  };
  Swill__Connections__Actions.establish = Swill__Connections__Actions_Functions.establish;
  Swill__Connections__Actions.establishIn = Swill__Connections__Actions_Functions.establishIn;
  Swill__Connections__Actions.connect = Swill__Connections__Actions_Functions.connect;
  function Swill__Connections__Outlets(Superclass) {
    class Swill__Connections__Outlets_Layer extends Superclass {
    }
    return Swill__Connections__Outlets_Layer;
  }
  var Swill__Connections__Outlets_Functions = class extends Object {
    static establish(controller, root) {
      let declared = UIRuntime.cast(
        UIRuntime.outlets(controller),
        "T::Array[T.untyped]"
      );
      if (UIRuntime.isEmpty(declared)) return controller;
      let by_name = UIRuntime.cast({}, "T::Hash[String, T.untyped]");
      declared.forEach((descriptor) => by_name[UIRuntime.send(descriptor, "name")] = descriptor);
      let connected = UIRuntime.cast({}, "T::Hash[String, Element]");
      this.candidates(root).forEach((element) => {
        let name = UIRuntime.must(element.getAttribute("outlet"));
        if (!UIRuntime.isTruthy(by_name[name])) {
          throw new Error(this.undeclared(
            controller,
            name,
            element,
            Object.keys(by_name)
          ));
        }
        ;
        let first = connected[name];
        if (first) {
          throw new Error(`${`Duplicate outlet ${name} on ${this.ownerName(controller)}: ${this.describe(first)} and `}${`${this.describe(element)} both carry outlet="${name}"; an outlet connects one element`}`);
        }
        ;
        connected[name] = element;
        return UIRuntime.write(
          controller,
          name,
          this.valueFor(controller, by_name[name], element)
        );
      });
      declared.forEach((descriptor) => {
        let name = UIRuntime.send(descriptor, "name");
        if (UIRuntime.isTruthy(!UIRuntime.isTruthy(UIRuntime.send(
          descriptor,
          "optional"
        )) && !connected[name])) {
          return (() => {
            throw new Error(this.unresolved(
              controller,
              name,
              root
            ));
          })();
        }
      });
      return controller;
    }
    static undeclared(controller, name, element, declared) {
      let owner = this.ownerName(controller);
      let message = `Undeclared outlet ${name} on ${owner}: ${this.describe(element)} names an outlet ${owner} does not declare`;
      let similar = this.similarNames(name, declared);
      if (!UIRuntime.isEmpty(similar)) {
        message += `. Did you mean ${similar.join(" or ")}?`;
      }
      ;
      let known = UIRuntime.isEmpty(declared) ? "none" : declared.join(", ");
      return `${message} Its outlets: ${known}. Declare it with \`outlet :${name}, type: ...\`, or remove the attribute`;
    }
    static unresolved(controller, name, root) {
      let owner = this.ownerName(controller);
      let message = `Unresolved outlet ${name} on ${owner}: no element in its region carries outlet="${name}"`;
      let elsewhere = root.querySelector(`[outlet="${name}"]`);
      if (elsewhere) {
        let region = this.regionOwner(elsewhere, root);
        message += `. ${this.describe(elsewhere)} does, but it is inside ${region}, whose outlets are its own`;
      }
      ;
      return `${message}. Add the attribute to an element ${owner} owns, or declare the outlet \`optional: true\``;
    }
    static ownerName(controller) {
      return UIRuntime.logicalOr(
        UIRuntime.cast(UIRuntime.nameOf(controller), "T.nilable(String)"),
        () => "the application"
      );
    }
    static describe(element) {
      let attributes = ["controller", "klass", "outlet", "id"].filter((name) => element.hasAttribute(name)).map((name) => ` ${name}="${element.getAttribute(name)}"`);
      return `<${UIRuntime.downcase(element.tagName)}${attributes.join("")}>`;
    }
    static regionOwner(element, root) {
      let current = element.parentElement;
      while (current && current !== root) {
        let view = current.__swill_view__;
        if (UIRuntime.isTruthy(current.hasAttribute("controller") || view && view.isOwnsContent())) {
          return `${this.describe(current)}'s region`;
        }
        ;
        current = current.parentElement;
      }
      ;
      return "another region";
    }
    static similarNames(name, declared) {
      let folded = UIRuntime.split(UIRuntime.downcase(name), "_").join("");
      let limit = name.length > 3 ? 2 : 1;
      return declared.filter((candidate) => UIRuntime.split(UIRuntime.downcase(candidate), "_").join("") === folded || this.editDistance(
        name,
        candidate
      ) <= limit);
    }
    static editDistance(a, b) {
      let previous = UIRuntime.cast([], "T::Array[Integer]");
      let column = 0;
      while (column <= b.length) {
        UIRuntime.append(previous, column);
        column++;
      }
      ;
      let row = 1;
      while (row <= a.length) {
        let current = UIRuntime.cast([row], "T::Array[Integer]");
        column = 1;
        while (column <= b.length) {
          let cost = UIRuntime.isEqual(a[row - 1], b[column - 1]) ? 0 : 1;
          let deletion = UIRuntime.must(previous[column]) + 1;
          let insertion = UIRuntime.must(current[column - 1]) + 1;
          let substitution = UIRuntime.must(previous[column - 1]) + cost;
          let nearer = deletion < insertion ? deletion : insertion;
          UIRuntime.append(
            current,
            nearer < substitution ? nearer : substitution
          );
          column++;
        }
        ;
        previous = current;
        row++;
      }
      ;
      return UIRuntime.must(previous[b.length]);
    }
    static candidates(root) {
      let found = UIRuntime.cast([], "T::Array[Element]");
      Swill__DOM.eachOwned(root, false, (element, _controller_root) => {
        if (element.hasAttribute("outlet")) return UIRuntime.append(found, element);
      });
      return found;
    }
    static valueFor(controller, descriptor, element) {
      let name = UIRuntime.send(descriptor, "name");
      let value = this.materialize(controller, name, element);
      let typed = UIRuntime.logicalAnd(
        UIRuntime.send(descriptor, "type"),
        () => UIRuntime.send(descriptor, "type") !== "T.untyped"
      );
      if (UIRuntime.isTruthy(UIRuntime.logicalAnd(typed, () => !UIRuntime.isTruthy(UIRuntime.conforms(
        value,
        UIRuntime.send(descriptor, "type")
      ))))) {
        throw new Error(`Outlet ${name} expects ${UIRuntime.send(
          descriptor,
          "type"
        )}`);
      }
      ;
      return value;
    }
    static materialize(controller, name, element) {
      if (UIRuntime.isTruthy(element.tagName === "SCRIPT" && element.type === "application/json")) {
        return this.decode(controller, name, element);
      }
      ;
      if (element.tagName === "TEMPLATE") return element;
      let view = element.__swill_view__;
      if (!view) throw new Error(`Outlet ${name} is not a managed element`);
      let owner = view.controllerValue();
      return owner ? owner : view;
    }
    static decode(controller, name, element) {
      let text = UIRuntime.strip(element.textContent);
      return controller.decodeOutletData(
        name,
        UIRuntime.isEmpty(text) ? null : JSON.parse(text)
      );
    }
  };
  Swill__Connections__Outlets.establish = Swill__Connections__Outlets_Functions.establish;
  Swill__Connections__Outlets.undeclared = Swill__Connections__Outlets_Functions.undeclared;
  Swill__Connections__Outlets.unresolved = Swill__Connections__Outlets_Functions.unresolved;
  Swill__Connections__Outlets.ownerName = Swill__Connections__Outlets_Functions.ownerName;
  Swill__Connections__Outlets.describe = Swill__Connections__Outlets_Functions.describe;
  Swill__Connections__Outlets.regionOwner = Swill__Connections__Outlets_Functions.regionOwner;
  Swill__Connections__Outlets.similarNames = Swill__Connections__Outlets_Functions.similarNames;
  Swill__Connections__Outlets.editDistance = Swill__Connections__Outlets_Functions.editDistance;
  Swill__Connections__Outlets.candidates = Swill__Connections__Outlets_Functions.candidates;
  Swill__Connections__Outlets.valueFor = Swill__Connections__Outlets_Functions.valueFor;
  Swill__Connections__Outlets.materialize = Swill__Connections__Outlets_Functions.materialize;
  Swill__Connections__Outlets.decode = Swill__Connections__Outlets_Functions.decode;
  function Swill__Awakening(Superclass) {
    class Swill__Awakening_Layer extends Superclass {
    }
    return Swill__Awakening_Layer;
  }
  var Swill__Awakening_Functions = class extends Object {
    static instantiate(root) {
      let controllers = this.awaken(root);
      this.finish(controllers);
      return controllers;
    }
    static awaken(root) {
      let controllers = this.prepare(root);
      UIRuntime.reverse(controllers).forEach((controller) => this.load(controller));
      return controllers;
    }
    static prepare(root) {
      let controllers = UIRuntime.cast([], "T::Array[Controller]");
      this.walk(root, this.nearestView(root.parentElement), controllers);
      return controllers;
    }
    static awakenOwned(root, owner) {
      let controllers = UIRuntime.cast([], "T::Array[Controller]");
      Swill__DOM.eachChild(
        root,
        (child) => this.walk(child, owner, controllers)
      );
      Swill__Connections__Outlets.establish(owner, root);
      let disposers = UIRuntime.cast([], "T::Array[T.proc.void]");
      Swill__Connections__Bindings.regionIn(owner, null, root, disposers);
      owner.retain(Swill__Connections__Bindings.releasing(disposers));
      owner.retain(Swill__Connections__Actions.establishIn(
        root,
        owner,
        UIRuntime.keywordArguments({ include_root: false })
      ));
      UIRuntime.reverse(controllers).forEach((controller) => this.load(controller));
      return this.finish(controllers);
    }
    static finish(controllers) {
      UIRuntime.reverse(controllers).forEach((controller) => controller.controllerDidLoad());
      UIRuntime.reverse(controllers).forEach((controller) => controller.viewWillAppear());
      return UIRuntime.reverse(controllers).forEach((controller) => controller.viewDidAppear());
    }
    static load(controller) {
      let root = controller.view.element;
      Swill__Connections__Outlets.establish(controller, root);
      controller.viewDidLoad();
      let added = UIRuntime.cast([], "T::Array[Controller]");
      Swill__DOM.eachChild(
        root,
        (child) => this.walk(child, controller.view, added)
      );
      UIRuntime.reverse(added).forEach((child) => this.load(child));
      this.finish(added);
      Swill__Connections__Bindings.establish(controller);
      Swill__Connections__Actions.establish(controller);
      return controller.awakeFromDOM();
    }
    static walk(element, owner, controllers) {
      let view = element.__swill_view__;
      if (element.hasAttribute("klass")) this.classify(element);
      if (UIRuntime.isTruthy(!view && this.isManaged(element))) {
        view = this.createView(element);
      }
      ;
      if (view) {
        if (UIRuntime.isTruthy(owner && !view.superview)) owner.adoptSubview(view);
        if (UIRuntime.isTruthy(element.hasAttribute("controller") && !view.controllerValue())) {
          let controller = UIRuntime.cast(
            new (UIRuntime.resolve(UIRuntime.must(element.getAttribute("controller"))))(),
            "Swill::Controller"
          );
          controller.attach(element);
          UIRuntime.append(controllers, controller);
        }
      }
      ;
      if (UIRuntime.isTruthy(view && view.isOwnsContent())) return;
      let next_owner = view || owner;
      return Swill__DOM.eachChild(
        element,
        (child) => this.walk(child, next_owner, controllers)
      );
    }
    static classify(element) {
      let name = UIRuntime.must(element.getAttribute("klass"));
      if (UIRuntime.isTruthy(UIRuntime.classIsA(name, "Swill::Controller"))) {
        if (element.hasAttribute("controller")) {
          throw new Error(`${name} conflicts with controller on the same element`);
        }
        ;
        element.removeAttribute("klass");
        return element.setAttribute("controller", name);
      } else if (!UIRuntime.isTruthy(UIRuntime.classIsA(name, "Swill::View"))) {
        return (() => {
          throw new Error(`${name} is not a Swill::View or Swill::Controller`);
        })();
      }
    }
    static isManaged(element) {
      if (element.nodeType !== 1) return false;
      if (element.tagName === "TEMPLATE" || element.tagName === "SCRIPT") {
        return false;
      }
      ;
      return element.hasAttribute("klass") || element.hasAttribute("controller") || element.hasAttribute("outlet");
    }
    static createView(element) {
      let name = element.getAttribute("klass");
      if (name == null) return new Swill__View(element);
      let view = new (UIRuntime.resolve(name))(element);
      if (!(view instanceof Swill__View)) {
        throw new Error(`${name} is not a Swill::View`);
      }
      ;
      return view;
    }
    static controllersWithin(node) {
      let found = UIRuntime.cast([], "T::Array[Controller]");
      this.collectControllers(node, found);
      return found;
    }
    static collectControllers(element, found) {
      let view = element.__swill_view__;
      let controller = view ? view.controllerValue() : null;
      if (controller) UIRuntime.append(found, controller);
      return Swill__DOM.eachChild(
        element,
        (child) => this.collectControllers(child, found)
      );
    }
    static detach(node) {
      let view = node.__swill_view__;
      let controller = view ? view.controllerValue() : null;
      if (controller) {
        return controller.unload();
      } else if (view) {
        return view.unload();
      } else {
        return Swill__DOM.eachChild(node, (child) => this.detach(child));
      }
    }
    static nearestView(element) {
      if (!element) return null;
      let view = element.__swill_view__;
      return view ? view : this.nearestView(element.parentElement);
    }
  };
  Swill__Awakening.instantiate = Swill__Awakening_Functions.instantiate;
  Swill__Awakening.awaken = Swill__Awakening_Functions.awaken;
  Swill__Awakening.prepare = Swill__Awakening_Functions.prepare;
  Swill__Awakening.awakenOwned = Swill__Awakening_Functions.awakenOwned;
  Swill__Awakening.finish = Swill__Awakening_Functions.finish;
  Swill__Awakening.load = Swill__Awakening_Functions.load;
  Swill__Awakening.walk = Swill__Awakening_Functions.walk;
  Swill__Awakening.classify = Swill__Awakening_Functions.classify;
  Swill__Awakening.isManaged = Swill__Awakening_Functions.isManaged;
  Swill__Awakening.createView = Swill__Awakening_Functions.createView;
  Swill__Awakening.controllersWithin = Swill__Awakening_Functions.controllersWithin;
  Swill__Awakening.collectControllers = Swill__Awakening_Functions.collectControllers;
  Swill__Awakening.detach = Swill__Awakening_Functions.detach;
  Swill__Awakening.nearestView = Swill__Awakening_Functions.nearestView;
  var Swill__URLFragment = class extends Object {
    constructor(browser) {
      super();
      this._browser = browser;
      this._suspended = false;
      this._on_change = UIRuntime.cast(
        null,
        "T.nilable(T.proc.params(event:Event).void)"
      );
    }
    isAvailable() {
      let browser = this._browser;
      return UIRuntime.logicalAnd(
        browser != null && browser.location != null,
        () => browser.history != null
      );
    }
    params() {
      let found = UIRuntime.cast({}, "T::Hash[String, String]");
      let browser = this._browser;
      if (!UIRuntime.isTruthy(browser && this.isAvailable())) return found;
      let search = new URLSearchParams(browser.location.hash.replace(
        /^#/m,
        ""
      ));
      search.forEach((value, key) => found[key] = value);
      return found;
    }
    // :push adds a history entry, :replace rewrites the current one, :none is
    // a no-op. Writes are also dropped while fragment state is being applied.
    write(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "key", kind: "req" },
          { name: "value", kind: "req" }
        ],
        keywords: [{ name: "history", kind: "keyreq" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let key = UIRuntime.argument(__swill_bound, "key");
      let value = UIRuntime.argument(__swill_bound, "value");
      let history = UIRuntime.argument(__swill_bound, "history");
      if (history === "none" || this._suspended) return;
      let browser = this._browser;
      if (!UIRuntime.isTruthy(browser && this.isAvailable())) return;
      let location = browser.location;
      let search = new URLSearchParams(location.hash.replace(/^#/m, ""));
      if (value == null) {
        search.delete(key);
      } else {
        search.set(key, value);
      }
      ;
      let query = search.toString();
      let next_url = location.pathname + location.search + (UIRuntime.isEmpty(query) ? "" : "#" + query);
      if (next_url === location.pathname + location.search + location.hash) return;
      return history === "push" ? browser.history.pushState(
        null,
        "",
        next_url
      ) : browser.history.replaceState(null, "", next_url);
    }
    // Run a block with writes suppressed, so observers fired by applying
    // fragment values do not write back mid-application.
    suspended(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(
        __swill_arguments,
        { positional: [], keywords: [], keywordRest: null, block: "block" }
      );
      let block = UIRuntime.argument(__swill_bound, "block");
      let _implicitBlockYield = block;
      this._suspended = true;
      try {
        return UIRuntime.yieldBlock(_implicitBlockYield);
      } finally {
        this._suspended = false;
      }
    }
    startObserving(callback) {
      let browser = this._browser;
      if (!UIRuntime.isTruthy(browser && this.isAvailable())) return;
      let on_change = (_event) => callback();
      this._on_change = on_change;
      browser.addEventListener("popstate", on_change);
      return browser.addEventListener("hashchange", on_change);
    }
    stopObserving() {
      let on_change = this._on_change;
      let browser = this._browser;
      if (!UIRuntime.isTruthy(UIRuntime.logicalAnd(on_change, () => browser))) return;
      browser.removeEventListener("popstate", on_change);
      browser.removeEventListener("hashchange", on_change);
      this._on_change = null;
      return this._on_change;
    }
  };
  var Swill__Window = class extends Swill__Object {
    constructor(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "name", kind: "req" },
          { name: "root", kind: "req" }
        ],
        keywords: [{ name: "modal", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let name = UIRuntime.argument(__swill_bound, "name");
      let root = UIRuntime.argument(__swill_bound, "root");
      let modal = UIRuntime.argument(__swill_bound, "modal");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(modal))) modal = false;
      super();
      this._name = name;
      this._root = root;
      this._modal = modal;
      this._controller = UIRuntime.cast(null, "T.nilable(Swill::Controller)");
      this._content_name = UIRuntime.cast(null, "T.nilable(String)");
      this._first_responder = UIRuntime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._focused_element = null;
      this._restoration_disposers = UIRuntime.cast(
        [],
        "T::Array[T.proc.void]"
      );
      this._restoration_keys = UIRuntime.cast([], "T::Array[String]");
      this._resolve_closed = null;
      this._closed = new Promise((resolve2, _reject) => {
        this._resolve_closed = resolve2;
        return this._resolve_closed;
      });
    }
    // ---- fragment restoration ----
    //
    // The window's own fragment param is its bare name (main=farewell); its
    // controller's state params are scoped under it (main.n=3).
    scopedKey(key) {
      return `${this._name}.${key}`;
    }
    addRestoration(disposer, key) {
      UIRuntime.append(this._restoration_disposers, disposer);
      return UIRuntime.append(this._restoration_keys, key);
    }
    // Release the current restoration subscriptions; returns the scoped keys
    // they covered so a caller can prune ones the next controller will not own.
    disposeRestoration() {
      let disposers = this._restoration_disposers;
      let keys = this._restoration_keys;
      this._restoration_disposers = [];
      this._restoration_keys = [];
      disposers.forEach((dispose) => dispose());
      return keys;
    }
    get name() {
      return this._name;
    }
    get root() {
      return this._root;
    }
    get controller() {
      return this._controller;
    }
    // Whether the window was shown modally, keeping the keyboard inside it.
    isModal() {
      return this._modal;
    }
    get contentName() {
      return this._content_name;
    }
    // Resolves with nil when the window is dismissed.
    get closed() {
      return this._closed;
    }
    // The responder that has the keyboard while this window is key, or nil
    // when the window itself (the application, for the page) has it. Set
    // through Application#make_first_responder.
    get firstResponder() {
      return this._first_responder;
    }
    set firstResponder(first_responder) {
      this._first_responder = first_responder;
      return this._first_responder;
    }
    // The element that last had focus in this window, within or beside its
    // first responder's key element; the keyboard goes back to it when the
    // window is key again.
    get focusedElement() {
      return this._focused_element;
    }
    set focusedElement(focused_element) {
      this._focused_element = focused_element;
      return this._focused_element;
    }
    // :section: Key Views
    // The elements Tab moves among within the window.
    // The elements Tab stops at within the window, in document order: those
    // that are focusable and enabled, not taken out of the order with
    // `tabindex="-1"`, not hidden or inert, and not inside one of the
    // +excluded+ roots (other windows the page holds).
    keyViews(excluded) {
      let views = UIRuntime.cast([], "T::Array[Element]");
      this._root.querySelectorAll("button, input, select, textarea, [tabindex]").forEach((element) => {
        if (this.isKeyView(element, excluded)) return UIRuntime.append(views, element);
      });
      return views;
    }
    // Whether +element+ is one of the window's key views.
    isKeyView(element, excluded) {
      if (element.disabled || element.getAttribute("tabindex") === "-1") {
        return false;
      }
      ;
      if (element.closest("[hidden]") || element.closest("[inert]")) return false;
      return !excluded.some((root) => root.contains(element));
    }
    // Where the keyboard goes as the window opens: an element marked
    // `autofocus`, else the default button, else the first key view. Nil when
    // the window has no key view.
    initialFocusElement(excluded) {
      return this.firstKeyView("[autofocus]", excluded) || this.defaultButton(excluded) || this.keyViews(excluded)[0];
    }
    // The window's default button, the one marked with the `default` class,
    // which Enter presses from anywhere in the window. Nil when it has none.
    defaultButton(excluded) {
      return this.firstKeyView("button.default", excluded);
    }
    firstKeyView(selector, excluded) {
      let found = null;
      this._root.querySelectorAll(selector).forEach((element) => {
        if (UIRuntime.isTruthy(found == null && this.isKeyView(
          element,
          excluded
        ))) {
          found = element;
          return found;
        }
      });
      return found;
    }
    assignContent(content_name, controller) {
      this._content_name = content_name;
      this._controller = controller;
      return this._controller;
    }
    // A named [window] container, as opposed to a template-instantiated dialog.
    isContainer() {
      return this._root.hasAttribute("window");
    }
    containsController(candidate) {
      return candidate === this._controller || this._root.contains(candidate.view.element);
    }
    // Adds the title bar for a presented dialog and follows its controller's title.
    showTitle(identifier, controller) {
      let document2 = this._root.ownerDocument;
      let title = Swill__Swell.$index(document2.createElement("span")).attr(
        "id",
        identifier
      );
      let header = Swill__Swell.$index(document2.createElement("header")).addClass("window-title").append(title.element);
      Swill__Swell.$index(this._root).prepend(header.element);
      title.text(controller.title);
      return controller.observeWithObject(
        controller,
        "title",
        (value) => title.text(value)
      );
    }
    // Tear down the subtree, close a dialog, remove the root, and resolve.
    dismiss() {
      this.disposeRestoration();
      Swill__Awakening.detach(this._root);
      if (this._root.tagName === "DIALOG") this._root.close();
      this._root.remove();
      return this._resolve_closed.call(null, null);
    }
  };
  var Swill__Application = class _Swill__Application extends Swill__Responder {
    static shared() {
      let running = this._running;
      if (!running) throw new Error("No application is running");
      return running;
    }
    static isRunning() {
      return this._running != null;
    }
    static launched(application) {
      this._running = UIRuntime.cast(
        application,
        "T.nilable(Swill::Application)"
      );
      return this._running;
    }
    static terminated(application) {
      if (this._running === application) {
        this._running = null;
        return this._running;
      }
    }
    // Creates the application. Call #launch to start it.
    constructor() {
      super();
      this._windows = UIRuntime.cast([], "T::Array[Window]");
      this._controllers = UIRuntime.cast([], "T::Array[Controller]");
      this._templates = UIRuntime.cast({}, "T::Hash[String, Element]");
      this._captured = UIRuntime.cast({}, "T::Hash[String, Element]");
      this._page = UIRuntime.cast(null, "T.nilable(Swill::Window)");
      this._key_windows = UIRuntime.cast([], "T::Array[Window]");
      this._changing_windows = UIRuntime.cast(false, "T::Boolean");
      this._posted_first_responder = UIRuntime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._observer = null;
      this._unrestored = UIRuntime.cast([], "T::Array[String]");
      this._unrestorable_paths = UIRuntime.cast([], "T::Array[String]");
      this._problems = UIRuntime.cast(
        null,
        "T.nilable(Swill::ProblemReporter)"
      );
      this._development_monitor = UIRuntime.cast(
        null,
        "T.nilable(Swill::DevelopmentMonitor)"
      );
      this._connection_state = UIRuntime.cast("idle", "String");
      this._reconnect = UIRuntime.cast(null, "T.nilable(T.proc.void)");
      this._on_online = (_event) => {
        if (this._connection_state === "disconnected") {
          return this._reconnect?.call(null);
        }
      };
      this._window_titles = UIRuntime.cast(0, "Integer");
    }
    // The theme the page is drawn in: the name of one of the framework's
    // stylesheets, such as linear or bioplastic. The page links its theme as
    // `<link rel="stylesheet" data-swill-theme href=".../linear.css">`; at
    // launch this reads that link, and setting it points the link at another
    // theme. Raises for a theme the framework does not have.
    // Whether the application is in development, which shows its problems as
    // alerts as well as in the console. Opt in with a `development` attribute
    // on the application's element, `Swill.start({development: true})`, or by
    // setting this before launch. False by default. See ProblemReporter.
    // Code in an in_development block runs only while this is true.
    developmentDidChange(_previous, development2) {
      return UIRuntime.setDevelopment(development2);
    }
    // Starts the application at +root+: awakens the markup beneath it,
    // restores window content from the URL fragment, and begins watching for
    // content added later. One application runs per page.
    launch(root) {
      if (_Swill__Application.isRunning()) {
        throw new Error("An application is already running");
      }
      ;
      _Swill__Application.launched(this);
      this._root = root;
      root.ownerDocument.defaultView?.addEventListener("online", this._on_online);
      this.adoptTheme(root.ownerDocument);
      if (root.hasAttribute("development")) this.development = true;
      let problems = new Swill__ProblemReporter(root.ownerDocument.defaultView);
      if (this.development) problems.start();
      this._problems = problems;
      let page = new Swill__Window("", root);
      this._page = page;
      this._key_windows = [page];
      this._on_focus = (event) => this.focusIn(event);
      this._on_focus_out = (event) => this.focusOut(event);
      this._on_key_down = (event) => this.keyDownInWindow(event);
      this._on_key_up = (event) => this.firstResponder().keyUp(event);
      root.addEventListener("focusin", this._on_focus, true);
      root.addEventListener("focusout", this._on_focus_out, true);
      root.addEventListener("keydown", this._on_key_down);
      root.addEventListener("keyup", this._on_key_up);
      this._fragments = new Swill__URLFragment(root.ownerDocument.defaultView);
      this.scanTemplates();
      this.prepareWindowContainers();
      this._controllers = Swill__Awakening.prepare(root);
      Swill__Connections__Outlets.establish(this, root);
      UIRuntime.reverse(this._controllers).forEach((controller) => Swill__Awakening.load(controller));
      this.registerWindowContainers();
      this.restoreLaunchedWindows();
      this.warnUnrestored(this._controllers);
      Swill__Awakening.finish(this._controllers);
      this._fragments.startObserving(() => this.applyFragment());
      this.watch(root);
      this.adoptFocus(root);
      this.applicationDidLaunch();
      Swill__NotificationCenter.default().post(
        "application_did_launch",
        this,
        null
      );
      let monitor = new Swill__DevelopmentMonitor(root.ownerDocument, problems);
      monitor.start();
      this._development_monitor = monitor;
      return this;
    }
    // Presents connection notices without coupling UI-only applications to a
    // particular data transport. The transport supplies its recovery action.
    connectionChanged(state2, detail, retry_action) {
      this._connection_state = state2;
      this._reconnect = retry_action;
      return UIRuntime.nilable(this._problems?.connectionChanged(state2, detail, retry_action));
    }
    // Reports a recoverable operation problem, including in production.
    reportProblem(message, detail) {
      return UIRuntime.nilable(this._problems?.report("Warning", message, detail));
    }
    // The browser window the application runs in, for what only it offers:
    // a prompt, printing.
    browser() {
      return UIRuntime.must(this.root.ownerDocument.defaultView);
    }
    // Every controller awakened at launch, in document order.
    get controllers() {
      return this._controllers;
    }
    // The element the application was launched at.
    get root() {
      return this._root;
    }
    // Idempotent: a page may see more than one pagehide before it is unloaded.
    terminate() {
      if (!UIRuntime.isTruthy(_Swill__Application.isRunning() && _Swill__Application.shared() === this)) {
        return;
      }
      ;
      this.applicationWillTerminate();
      this.root.ownerDocument.defaultView?.removeEventListener("online", this._on_online);
      this._reconnect = null;
      UIRuntime.nilable(this._development_monitor?.stop());
      this._development_monitor = null;
      UIRuntime.nilable(this._problems?.stop());
      this._problems = null;
      Swill__NotificationCenter.default().post(
        "application_will_terminate",
        this,
        null
      );
      this._fragments.stopObserving();
      let observer = this._observer;
      if (observer) observer.disconnect();
      this._windows.forEach((window) => this.releaseWindow(window));
      this._windows = [];
      this._controllers.forEach((controller) => UIRuntime.send(controller, "unload"));
      Swill__Awakening.detach(this._root);
      this._controllers = [];
      this._root.removeEventListener("focusin", this._on_focus, true);
      this._root.removeEventListener("focusout", this._on_focus_out, true);
      this._root.removeEventListener("keydown", this._on_key_down);
      this._root.removeEventListener("keyup", this._on_key_up);
      this.assignFirstResponder(null);
      this._key_windows = [];
      this._page = null;
      UIRuntime.setDevelopment(false);
      return _Swill__Application.terminated(this);
    }
    // The application is running and its markup is awake.
    applicationDidLaunch() {
      return null;
    }
    // The application is about to stop. Everything it owns is still alive.
    applicationWillTerminate() {
      return null;
    }
    // ---- windows ----
    // Replace a named container's content with a window template or captured
    // pre-rendered content, awaken it, record the content in the URL fragment
    // as a history entry, restore the new controller's state, and offer the
    // first responder to it. Returns that controller.
    // history is :push for navigation, :replace to rewrite the entry, or :none
    // when the fragment itself asked for the content (Back/Forward).
    loadWindowContent(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "window_name", kind: "req" },
          { name: "content_name", kind: "req" }
        ],
        keywords: [{ name: "history", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let window_name = UIRuntime.argument(__swill_bound, "window_name");
      let content_name = UIRuntime.argument(__swill_bound, "content_name");
      let history = UIRuntime.argument(__swill_bound, "history");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(history))) history = "push";
      let window = this.windowNamed(window_name);
      if (!window) throw new Error(`No window container: ${window_name}`);
      let container = window.root;
      let previous = this.firstResponder();
      Swill__DOM.eachChild(
        container,
        (child) => Swill__Awakening.detach(child)
      );
      container.replaceChildren();
      container.appendChild(this.cloneWindowContent(content_name));
      container.setAttribute("name", content_name);
      let controllers = Swill__Awakening.awaken(container);
      window.assignContent(content_name, this.topControllerIn(container));
      this._fragments.write(
        window.name,
        content_name,
        UIRuntime.keywordArguments({ history })
      );
      this.restoreWindowState(window, UIRuntime.keywordArguments({
        prune_stale: history !== "none",
        write_content: history !== "none"
      }));
      this.warnUnrestored(controllers);
      Swill__Awakening.finish(controllers);
      let controller = window.controller;
      if (controller) {
        if (!this.isResponderWithin(this.firstResponder(), container)) {
          this.makeFirstResponder(controller);
        }
      } else if (this.isAttached(previous)) {
        this.makeFirstResponder(previous);
      }
      ;
      return controller;
    }
    // Present a template as a window appended to the root. A <dialog> root is
    // shown. The window becomes key, and the keyboard goes to its initial
    // first responder; see Window#initial_focus_element. Dismiss it with
    // dismiss(controller); the window's closed promise resolves then.
    showWindow(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [{ name: "name", kind: "req" }],
        keywords: [{ name: "into", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let name = UIRuntime.argument(__swill_bound, "name");
      let into = UIRuntime.argument(__swill_bound, "into");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(into))) into = this._root;
      let node = this.cloneWindowContent(name);
      into.appendChild(node);
      let window = this.beginWindow(name, node, false);
      let controllers = Swill__Awakening.awaken(node);
      let controller = Swill__View.controllerFor(node);
      if (!controller) {
        this._key_windows = this._key_windows.filter((candidate) => !(candidate === window));
        Swill__Awakening.detach(node);
        node.remove();
        throw new Error(`Window root has no controller: ${name}`);
      }
      ;
      return this.openWindow(window, controller, controllers);
    }
    // Present a controller built in code as a window named +name+, its view
    // appended to the root, as a template's would be. The controller has
    // attached its root element; anything managed inside it awakens first,
    // then the controller loads. A <dialog> root is shown, and when +modal+
    // it is shown modally: the rest of the page is inert until it is
    // dismissed, and the keyboard stays inside it.
    presentWindow(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [
          { name: "controller", kind: "req" },
          { name: "name", kind: "req" }
        ],
        keywords: [{ name: "into", kind: "key" }, { name: "modal", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let controller = UIRuntime.argument(__swill_bound, "controller");
      let name = UIRuntime.argument(__swill_bound, "name");
      let into = UIRuntime.argument(__swill_bound, "into");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(into))) into = this._root;
      let modal = UIRuntime.argument(__swill_bound, "modal");
      if (UIRuntime.isTruthy(UIRuntime.isOmittedArgument(modal))) modal = false;
      let node = controller.view.element;
      if (node.isConnected) throw new Error(`Window is already presented: ${name}`);
      into.appendChild(node);
      let window = this.beginWindow(name, node, modal);
      let controllers = Swill__Awakening.awaken(node);
      Swill__Awakening.load(controller);
      return this.openWindow(
        window,
        controller,
        [controller].concat(controllers)
      );
    }
    // A window about to be presented is key before its content awakens, so
    // content that takes the keyboard as it loads takes it in this window,
    // not the page.
    beginWindow(name, node, modal) {
      let window = new Swill__Window(name, node, UIRuntime.keywordArguments({ modal }));
      UIRuntime.append(this._key_windows, window);
      return window;
    }
    openWindow(window, controller, controllers) {
      let node = window.root;
      if (UIRuntime.isTruthy(node.tagName === "DIALOG" && node.classList.contains("window"))) {
        this._window_titles++;
        window.showTitle(
          `swill-window-title-${this._window_titles}`,
          controller
        );
      }
      ;
      controller.view.updateAccessibility();
      window.assignContent(window.name, controller);
      if (node.tagName === "DIALOG") {
        this.changingWindows(UIRuntime.blockArgument(() => {
          if (window.isModal()) {
            node.showModal();
            return node.addEventListener(
              "cancel",
              (event) => event.preventDefault()
            );
          } else {
            return node.show();
          }
        }));
        node.getBoundingClientRect();
      }
      ;
      UIRuntime.append(this._windows, window);
      this.restoreWindowState(
        window,
        UIRuntime.keywordArguments({ prune_stale: false, write_content: false })
      );
      this.warnUnrestored(controllers);
      Swill__Awakening.finish(controllers);
      this.takeInitialFirstResponder(window, controller);
      return window;
    }
    // The keyboard goes to the window's initial first responder, unless its
    // content took it while loading; either way it is focused now that the
    // window is open, since a browser ignores focus in a closed dialog. With
    // nothing to focus, the controller is offered it and refuses.
    takeInitialFirstResponder(window, controller) {
      let chosen = window.firstResponder;
      let element = chosen ? chosen.keyElement() : window.initialFocusElement(this.excludedRoots(window));
      if (element) {
        this.focusInWindow(element);
      } else if (!chosen) {
        this.makeFirstResponder(controller);
      }
      ;
      this.postFirstResponderChange();
      if (globalThis.__SWILL_DEV__ !== false && UIRuntime.isDevelopment()) {
        return this.verifyFocus("a window opened");
      }
    }
    // Focuses +element+, or, when it already has focus (a dialog's own
    // focusing steps may have chosen it), reconciles the first responder
    // with it as the focus event would have.
    focusInWindow(element) {
      return element.ownerDocument.activeElement === element ? this.syncFirstResponder(
        element,
        null
      ) : Swill__DOM.focus(element);
    }
    // Runs +block+ while windows open or close. Focus the browser moves then,
    // by a dialog's focusing steps or its return of focus on closing, is not
    // the user's; the framework places the keyboard itself afterward.
    changingWindows(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(
        __swill_arguments,
        { positional: [], keywords: [], keywordRest: null, block: "block" }
      );
      let block = UIRuntime.argument(__swill_bound, "block");
      this._changing_windows = true;
      try {
        return block();
      } finally {
        this._changing_windows = false;
      }
    }
    // The page's theme link, or nil when the page links none.
    themeLink(document2) {
      return document2.querySelector("link[data-swill-theme]");
    }
    adoptTheme(document2) {
      let link = this.themeLink(document2);
      if (!link) return;
      let file = UIRuntime.stringify(UIRuntime.split(
        UIRuntime.must(UIRuntime.split(
          UIRuntime.must(link.getAttribute("href")),
          "?"
        )[0]),
        "/"
      ).at(-1));
      return this.theme = UIRuntime.split(file, ".")[0];
    }
    themeDidChange(_previous, theme) {
      let root = this._root;
      if (!UIRuntime.isTruthy(theme != null ? root : theme)) return;
      let link = this.themeLink(root.ownerDocument);
      if (!link) return;
      let framework2 = Swill__Bundle.framework();
      let url = framework2 ? framework2.urlForResourceWithExtension(
        theme,
        "css"
      ) : null;
      if (url == null) throw new Error(`Unknown theme: ${theme}`);
      let current = UIRuntime.stringify(link.getAttribute("href"));
      if (current.endsWith(`/${theme}.css`) || current === `${theme}.css`) return;
      return link.setAttribute("href", url);
    }
    // Only a window's content controller is restored, so restorable paths
    // declared on any other controller would be silently ignored. Warns once
    // per class, naming the paths. A class that is some window's content as
    // well is declaring for that use, so it is not warned about.
    warnUnrestored(controllers) {
      let contents = UIRuntime.compact(this._windows.map((window) => UIRuntime.send(window, "controller"))).map((content) => UIRuntime.nameOf(content));
      return controllers.forEach((controller) => {
        if (this._windows.some((window) => UIRuntime.send(window, "controller") === controller)) return;
        let declarations2 = UIRuntime.cast(
          UIRuntime.restorations(controller),
          "T::Array[T.untyped]"
        );
        if (UIRuntime.isEmpty(declarations2)) return;
        let name = UIRuntime.logicalOr(
          UIRuntime.cast(UIRuntime.nameOf(controller), "T.nilable(String)"),
          () => "a controller"
        );
        if (contents.includes(name) || this._unrestored.includes(name)) return;
        UIRuntime.append(this._unrestored, name);
        let paths = declarations2.map((declaration) => UIRuntime.send(declaration, "path")).join(", ");
        return UIRuntime.warn(`${`${name} declares restorable ${paths}, but only a window's content controller is restored; `}declare it there as a path through this controller`);
      });
    }
    // Closes the window +controller+ belongs to. The window that was key
    // before it is key again, and its first responder, kept all along, takes
    // the keyboard back.
    dismiss(controller) {
      let window = this.windowContaining(controller);
      if (!window) return false;
      this._windows = this._windows.filter((candidate) => candidate !== window);
      this._key_windows = this._key_windows.filter((candidate) => candidate !== window);
      this.changingWindows(UIRuntime.blockArgument(() => window.dismiss()));
      this.refocusKeyWindow();
      return true;
    }
    // The key window's first responder takes focus again, as an NSWindow's
    // does when the window becomes key, without becoming first responder
    // anew: at the element within it that last had focus, or else at its key
    // element.
    refocusKeyWindow() {
      let responder = this.firstResponder();
      let owner = this.responderElement(responder);
      let window = this.keyWindow();
      let last = window ? window.focusedElement : null;
      let element = UIRuntime.isTruthy(UIRuntime.logicalAnd(
        UIRuntime.logicalAnd(last && owner, () => owner.contains(last)),
        () => this._root.contains(last)
      )) ? last : responder.keyElement();
      if (UIRuntime.isTruthy(element && this._root.contains(element))) {
        this.focusInWindow(element);
      }
      ;
      this.postFirstResponderChange();
      if (globalThis.__SWILL_DEV__ !== false && UIRuntime.isDevelopment()) {
        return this.verifyFocus("a window closed");
      }
    }
    // The window with +name+, or nil.
    windowNamed(name) {
      return this._windows.find((window) => this.matchesContainer(window, name));
    }
    // Whether content named +name+ exists to be loaded into a window.
    isWindowContent(name) {
      return (this._captured[name] || this.windowTemplate(name)) != null;
    }
    // ---- key window and first responder ----
    // The page, the window everything else is presented over, as Cocoa's main
    // window is the document a panel serves. Its first responder is kept
    // while other windows are key. Nil before launch.
    mainWindow() {
      return this._page;
    }
    // The page and the presented windows, in the order they were last key.
    keyWindows() {
      return this._key_windows;
    }
    // The window that has the keyboard: the most recently presented window
    // still open, or the window focus last moved into; the page when none
    // is presented. Nil before launch.
    keyWindow() {
      return this._key_windows.at(-1);
    }
    // The key window's first responder, which keys go to; the application
    // itself when nothing more specific holds it.
    firstResponder() {
      let window = this.keyWindow();
      let responder = window ? window.firstResponder : null;
      return responder || this;
    }
    // Cocoa's makeFirstResponder, on the window +responder+ belongs to: a
    // responder that does not accept is refused up front; that window's
    // current first responder may refuse to resign; a responder that refuses
    // to become leaves the window with none, and the application holds it.
    // In the key window, becoming focuses the responder's key element; a
    // window that is not key keeps the responder for when it is, as making a
    // first responder does not make its window key. Nil gives the key
    // window's first responder up to the application.
    //
    // The first responder changes in four places only: here, when the
    // browser moves focus (sync_first_responder), when focus leaves the page
    // (focus_left), and when its region is torn down
    // (release_first_responder).
    makeFirstResponder(responder) {
      if (UIRuntime.isTruthy(responder && !responder.acceptsFirstResponder())) {
        return false;
      }
      ;
      let window = responder ? this.windowOf(responder) : this.keyWindow();
      if (!window) return false;
      let current = UIRuntime.cast(
        window.firstResponder || this,
        "Swill::Responder"
      );
      if (responder === current) return true;
      if (!current.resignFirstResponder(responder)) return false;
      window.firstResponder = null;
      if (window !== this.keyWindow()) {
        window.firstResponder = responder;
      } else if (UIRuntime.isTruthy(responder && responder.becomeFirstResponder())) {
        if (window.firstResponder == null) window.firstResponder = responder;
      }
      ;
      this.postFirstResponderChange();
      if (globalThis.__SWILL_DEV__ !== false && UIRuntime.isDevelopment()) {
        this.verifyFocus("make_first_responder");
      }
      ;
      return true;
    }
    // Gives the key window's keyboard to +responder+ without asking anyone,
    // for the framework's own bookkeeping.
    assignFirstResponder(responder) {
      let window = this.keyWindow();
      if (window) return this.assignWindowFirstResponder(window, responder);
    }
    assignWindowFirstResponder(window, responder) {
      window.firstResponder = responder;
      return this.postFirstResponderChange();
    }
    // Every change of first responder is posted once as
    // first_responder_did_change, with the application as the object and the
    // responder as user info, so a debugging view or a toolbar can follow it
    // without polling. Focus moving during become may already have posted
    // the same responder; the last one posted is remembered for that.
    postFirstResponderChange() {
      let window = this.keyWindow();
      let responder = window ? window.firstResponder : null;
      if (responder === this._posted_first_responder) return;
      this._posted_first_responder = responder;
      return Swill__NotificationCenter.default().post(
        "first_responder_did_change",
        this,
        responder
      );
    }
    // A responder's class, and for a view or controller the element it is
    // rooted at, as the development focus checks name it.
    describeResponder(responder) {
      let name = UIRuntime.logicalOr(
        UIRuntime.cast(UIRuntime.nameOf(responder), "T.nilable(String)"),
        () => "a responder"
      );
      let element = this.responderElement(responder);
      return element ? `${name} ${this.describeElement(element)}` : name;
    }
    // The window +responder+ belongs to: the innermost window holding its
    // element, or the key window for one with no element.
    windowOf(responder) {
      let element = this.responderElement(responder);
      return element ? this.windowHolding(element) : this.keyWindow();
    }
    // The innermost window holding +element+: a presented window whose root
    // contains it, else the page.
    windowHolding(element) {
      return UIRuntime.reverse(this.keyWindows()).find((window) => window.root.contains(element));
    }
    // The roots of the presented windows other than +window+. The page's
    // root holds them all, but their controls are not the page's key views.
    excludedRoots(window) {
      return this.keyWindows().filter((other) => UIRuntime.isTruthy(other !== window && other !== this._page)).map((__swill_item) => __swill_item.root);
    }
    keyDownInWindow(event) {
      if (globalThis.__SWILL_DEV__ !== false && UIRuntime.isDevelopment()) {
        this.verifyFocus("a key");
      }
      ;
      return this.firstResponder().keyDown(event);
    }
    // Focus the browser gave before launch, as to an `autofocus` field,
    // makes its responder first, as later focus does.
    adoptFocus(root) {
      let active = root.ownerDocument.activeElement;
      if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
        active && active !== root,
        () => root.contains(active)
      ))) return this.syncFirstResponder(active, null);
    }
    // In development, checks that the keyboard is where the first responder
    // says: focus outside the page is fine (the first responder waits for
    // it), but focus inside it must be in the key window and within the key
    // window's first responder, which must be attached and accept. A
    // mismatch is a framework bug or a focus moved behind the framework's
    // back, and is reported as a warning naming +moment+.
    verifyFocus(moment) {
      let window = this.keyWindow();
      let active = this._root.ownerDocument.activeElement;
      if (!UIRuntime.isTruthy(UIRuntime.logicalAnd(
        UIRuntime.logicalAnd(
          window && active,
          () => this._root.contains(active)
        ),
        () => active !== this._root
      ))) return;
      let responder = this.firstResponder();
      let owner = this.responderElement(responder);
      let problem = this.windowHolding(active) !== window ? `focus is in another window than the key window ${this.windowLabel(window)}` : UIRuntime.isTruthy(responder !== this && !this.isAttached(responder)) ? "the first responder is no longer in the page" : UIRuntime.isTruthy(responder !== this && !responder.acceptsFirstResponder()) ? "the first responder does not accept being first responder" : UIRuntime.isTruthy(owner && !owner.contains(active)) ? "the focused element is outside the first responder" : null;
      if (!UIRuntime.isTruthy(problem)) return;
      let focused = this.describeElement(active);
      return UIRuntime.warn(`Focus check after ${moment}: ${problem}. First responder: ${this.describeResponder(responder)}; focused: ${focused}.`);
    }
    windowLabel(window) {
      return window === this._page ? "(the page)" : `"${window.name}"`;
    }
    describeElement(element) {
      let tag = UIRuntime.downcase(element.tagName);
      ["outlet", "controller", "klass", "data-action", "class"].forEach((attribute) => {
        let value = element.getAttribute(attribute);
        if (value != null) {
          tag = `${tag} ${attribute}="${value}"`;
          return tag;
        }
      });
      return `<${tag}>`;
    }
    focusIn(event) {
      if (this._changing_windows) return;
      let target = event.target;
      let window = this.windowHolding(target);
      if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
        window && window !== this._page,
        () => window.root === target
      ))) {
        let previous = event.relatedTarget;
        let back = UIRuntime.isTruthy(UIRuntime.logicalAnd(
          previous && previous !== target,
          () => target.contains(previous)
        )) ? previous : null;
        back ||= window.initialFocusElement(this.excludedRoots(window));
        if (back) return Swill__DOM.focus(back);
      }
      ;
      return this.syncFirstResponder(target, event.relatedTarget);
    }
    // Tab moves through the key window's key view loop: its key views in
    // document order, wrapping at either end, as an NSWindow's does. The
    // browser's own Tab is prevented. A responder that takes insert_tab
    // without calling super keeps Tab for itself.
    insertTab(event) {
      if (!this.selectKeyView(event, 1)) return super.insertTab(event);
    }
    // Shift-Tab, the key view loop backward.
    insertBacktab(event) {
      if (!this.selectKeyView(event, -1)) return super.insertBacktab(event);
    }
    // Enter that nothing else took presses the key window's default button,
    // the one marked with the `default` class.
    insertNewline(event) {
      let window = this.keyWindow();
      let button = window ? window.defaultButton(this.excludedRoots(window)) : null;
      if (!button) return super.insertNewline(event);
      event.preventDefault();
      return button.click();
    }
    // Focuses the key view +delta+ places from the event's target in the key
    // window, wrapping; one focus cannot take (hidden by a style, say) is
    // passed over.
    selectKeyView(event, delta) {
      let window = this.keyWindow();
      if (!window) return false;
      let views = window.keyViews(this.excludedRoots(window));
      if (UIRuntime.isEmpty(views)) return false;
      event.preventDefault();
      let found = UIRuntime.indexOf(views, event.target);
      let index = UIRuntime.cast(
        found != null ? found : (() => {
          return delta > 0 ? -1 : 0;
        })(),
        "Integer"
      );
      let attempts = 0;
      while (attempts < views.length) {
        index = UIRuntime.modulo(index + delta, views.length);
        let candidate = UIRuntime.must(views[index]);
        Swill__DOM.focusRevealing(candidate);
        if (candidate.ownerDocument.activeElement === candidate) return true;
        attempts++;
      }
      ;
      return true;
    }
    focusOut(event) {
      return this.focusLeft(event.relatedTarget);
    }
    // The browser already moved focus; reconcile the first responder without
    // re-running become. A responder that does not accept is refused, as
    // make_first_responder refuses it, and so is a change the current first
    // responder will not resign for; either way focus goes back.
    syncFirstResponder(target, previous) {
      let window = this.windowHolding(target);
      if (!window) return;
      if (window !== this.keyWindow()) {
        this._key_windows = this._key_windows.filter((other) => other !== window).concat([window]);
      }
      ;
      window.focusedElement = target;
      let responder = this.responderFor(target);
      let current = UIRuntime.cast(
        window.firstResponder || this,
        "Swill::Responder"
      );
      if (responder === current) return;
      if (UIRuntime.isTruthy(responder && !responder.acceptsFirstResponder())) {
        if (this.responderElement(current)) {
          this.restoreFocus(current, previous);
        } else {
          target.blur();
        }
        ;
        return;
      }
      ;
      if (!current.resignFirstResponder(responder)) {
        this.restoreFocus(current, previous);
        return;
      }
      ;
      this.assignWindowFirstResponder(window, responder);
      if (globalThis.__SWILL_DEV__ !== false && UIRuntime.isDevelopment()) {
        return this.verifyFocus("focus moved");
      }
    }
    // Focus moved to another part of the page: the first responder falls
    // back here. A null destination (the browser's own chrome, or dead space
    // in the page) leaves it alone, as Cocoa does, so keys still reach it
    // when focus returns.
    focusLeft(destination) {
      if (UIRuntime.isTruthy(destination && !this._root.contains(destination))) {
        return this.assignFirstResponder(null);
      }
    }
    // A window's first responder inside a region being torn down falls back
    // to the window, so the application holds it.
    releaseFirstResponder(element) {
      this.keyWindows().forEach((window) => {
        let responder = window.firstResponder;
        let owner = responder ? this.responderElement(responder) : null;
        if (UIRuntime.isTruthy(owner && (owner === element || element.contains(owner)))) {
          return window.firstResponder = null;
        }
      });
      return this.postFirstResponderChange();
    }
    // The responder for a DOM location: the first managed view above it,
    // which yields its controller for a controller root and itself otherwise.
    responderFor(element) {
      if (!element) return null;
      let view = element.__swill_view__;
      if (view) return view.controllerValue() || view;
      return this.responderFor(element.parentElement);
    }
    responderElement(responder) {
      return responder.focusRegion();
    }
    restoreFocus(responder, previous) {
      let owner = this.responderElement(responder);
      if (!owner) return;
      let target = UIRuntime.isTruthy(previous && owner.contains(previous)) ? previous : responder.keyElement();
      if (target) return Swill__DOM.focus(target);
    }
    // ---- window templates, containers, and content ----
    // <template for="window" name="x"> anywhere, or <template name="x"> directly
    // under the root. Templates are inert; content is cloned from them.
    scanTemplates() {
      return this._root.querySelectorAll("template[name]").forEach((template) => {
        let name = UIRuntime.must(template.getAttribute("name"));
        if (template.getAttribute("for") === "window" || template.parentElement === this._root) {
          return this._templates[name] = template;
        }
      });
    }
    // Rescans once on a miss so templates inserted after launch are found.
    windowTemplate(name) {
      let found = this._templates[name];
      if (found) return found;
      this.scanTemplates();
      return this._templates[name];
    }
    cloneWindowContent(name) {
      let captured = this._captured[name];
      if (captured) return captured.cloneNode(true);
      let template = this.windowTemplate(name);
      if (!template) throw new Error(`No window content template: ${name}`);
      let node = template.content.firstElementChild;
      if (!node) throw new Error(`Empty window template: ${name}`);
      return node.cloneNode(true);
    }
    windowContainers() {
      let found = UIRuntime.cast([], "T::Array[Element]");
      if (this._root.hasAttribute("window")) UIRuntime.append(found, this._root);
      this._root.querySelectorAll("[window]").forEach((container) => UIRuntime.append(found, container));
      return found;
    }
    // Before awakening: capture pre-rendered content under the container's
    // name so it can be reloaded later, and fill empty containers from the
    // template their name attribute (or window name) selects.
    prepareWindowContainers() {
      let params = this._fragments.params();
      return this.windowContainers().forEach((container) => {
        let window_name = UIRuntime.must(container.getAttribute("window"));
        let default_name = UIRuntime.logicalOr(
          container.getAttribute("name"),
          () => window_name
        );
        let first = container.firstElementChild;
        if (UIRuntime.isTruthy(first && !this._captured[default_name])) {
          this._captured[default_name] = first.cloneNode(true);
        }
        ;
        let content_name = this.requestedContent(
          window_name,
          default_name,
          params[window_name]
        );
        if (UIRuntime.isTruthy(first && content_name === default_name)) return;
        container.replaceChildren();
        container.appendChild(this.cloneWindowContent(content_name));
        return container.setAttribute("name", content_name);
      });
    }
    // The fragment may name the content to show; unknown names are reported
    // and the default stands.
    requestedContent(window_name, default_name, requested) {
      if (requested == null || requested === default_name) return default_name;
      if (this.isWindowContent(requested)) return requested;
      UIRuntime.warn(`window "${window_name}" requested unknown content "${requested}"`);
      return default_name;
    }
    registerWindowContainers() {
      return this.windowContainers().forEach((container) => {
        let window = new Swill__Window(UIRuntime.must(container.getAttribute("window")), container);
        window.assignContent(
          container.getAttribute("name"),
          this.topControllerIn(container)
        );
        return UIRuntime.append(this._windows, window);
      });
    }
    // The first controller inside the container whose parent is outside it.
    topControllerIn(container) {
      return Swill__Awakening.controllersWithin(container).find((controller) => this.isTopWithin(controller, container));
    }
    isTopWithin(controller, container) {
      let parent = controller.parent();
      return parent == null || !container.contains(parent.view.element);
    }
    matchesContainer(window, name) {
      return window.isContainer() && window.name === name;
    }
    windowContaining(controller) {
      return this._windows.find((window) => this.holds(window, controller));
    }
    holds(window, controller) {
      return window.containsController(controller);
    }
    // Whether a responder's element sits inside an element; the application
    // itself sits nowhere.
    isResponderWithin(responder, container) {
      if (responder === this) return false;
      let element = this.responderElement(responder);
      return element != null && container.contains(element);
    }
    isAttached(responder) {
      if (!responder) return false;
      let element = this.responderElement(responder);
      return element != null && this._root.contains(element);
    }
    // At terminate: a container's content is torn down in place; a dialog is
    // dismissed.
    releaseWindow(window) {
      if (window.isContainer()) {
        window.disposeRestoration();
        return Swill__Awakening.detach(window.root);
      } else {
        return window.dismiss();
      }
    }
    // ---- fragment restoration ----
    //
    // Restoration reuses the binding machinery: restorable paths are
    // observed and written exactly as bind paths are. Runs after the load
    // phase and before controller_did_load, so restored values are in place
    // for it.
    restoreWindowState(...__swill_arguments) {
      let __swill_bound = UIRuntime.bindArguments(__swill_arguments, {
        positional: [{ name: "window", kind: "req" }],
        keywords: [
          { name: "prune_stale", kind: "keyreq" },
          { name: "write_content", kind: "keyreq" }
        ],
        keywordRest: null,
        block: "__swill_block"
      });
      let window = UIRuntime.argument(__swill_bound, "window");
      let prune_stale = UIRuntime.argument(__swill_bound, "prune_stale");
      let write_content = UIRuntime.argument(__swill_bound, "write_content");
      let stale = window.disposeRestoration();
      let controller = window.controller;
      let declarations2 = UIRuntime.cast(
        controller ? UIRuntime.restorations(controller) : [],
        "T::Array[T.untyped]"
      );
      let keys = declarations2.map((declaration) => window.scopedKey(UIRuntime.send(declaration, "key")));
      let content = window.contentName;
      if (UIRuntime.isTruthy(write_content && content)) {
        this._fragments.write(
          window.name,
          content,
          UIRuntime.keywordArguments({ history: "replace" })
        );
      }
      ;
      if (prune_stale) {
        stale.forEach((key) => {
          if (!keys.includes(key)) {
            this._fragments.write(
              key,
              null,
              UIRuntime.keywordArguments({ history: "replace" })
            );
          }
        });
      }
      ;
      if (!controller) return;
      let params = this._fragments.params();
      let applied = 0;
      let unrestorable = UIRuntime.cast([], "T::Array[String]");
      this._fragments.suspended(UIRuntime.blockArgument(() => declarations2.forEach((declaration) => {
        let key = window.scopedKey(UIRuntime.send(declaration, "key"));
        let text = params[key];
        if (text == null) return;
        let value = this.decodeFragmentValue(
          UIRuntime.send(declaration, "type"),
          text
        );
        if (value == null) return;
        return this.restorePath(
          controller,
          UIRuntime.send(declaration, "path"),
          value
        ) ? ++applied : UIRuntime.append(unrestorable, key);
      })));
      unrestorable.forEach((key) => this._fragments.write(
        key,
        null,
        UIRuntime.keywordArguments({ history: "replace" })
      ));
      if (!UIRuntime.isEmpty(declarations2)) {
        controller.controllerDidRestore(applied > 0);
      }
      ;
      return declarations2.forEach((declaration) => {
        let disposer = UIRuntime.observePath(
          controller,
          UIRuntime.send(declaration, "path"),
          (_value) => this.writeWindowState(window)
        );
        return window.addRestoration(
          disposer,
          window.scopedKey(UIRuntime.send(declaration, "key"))
        );
      });
    }
    restoreLaunchedWindows() {
      return this._windows.forEach((window) => this.restoreWindowState(
        window,
        UIRuntime.keywordArguments({ prune_stale: false, write_content: true })
      ));
    }
    // Push the controller's current restorable state into the fragment.
    writeWindowState(window) {
      let controller = window.controller;
      if (!controller) return;
      return UIRuntime.cast(
        UIRuntime.restorations(controller),
        "T::Array[T.untyped]"
      ).forEach((declaration) => {
        let path = UIRuntime.send(declaration, "path");
        let value = this.isWritablePath(controller, path) ? this.encodeFragmentValue(
          controller,
          UIRuntime.readPath(controller, path),
          path
        ) : null;
        return this._fragments.write(
          window.scopedKey(UIRuntime.send(declaration, "key")),
          value,
          UIRuntime.keywordArguments({ history: "replace" })
        );
      });
    }
    // Typed URL leaves; nil rejects invalid values.
    decodeFragmentValue(type, text) {
      if (type === "Integer" || type === "T.nilable(Integer)") {
        let stripped = UIRuntime.strip(text);
        if (!UIRuntime.isTruthy(/^[+-]?\d/.test(stripped))) return null;
        return UIRuntime.toInteger(stripped);
      }
      ;
      if (type === "T::Boolean" || type === "T.nilable(T::Boolean)") {
        if (text === "true" || text === "1") return true;
        if (text === "false" || text === "0") return false;
        return null;
      }
      ;
      return text;
    }
    // A value's text in the fragment, or nil to leave it out. Only a string,
    // number or boolean round-trips through a URL; anything else is left out,
    // with a warning, rather than written as text that cannot be restored.
    encodeFragmentValue(controller, value, path) {
      if (value == null || value === "") return null;
      if (UIRuntime.conforms(value, "String")) return value;
      if (UIRuntime.conforms(value, "Integer") || UIRuntime.conforms(
        value,
        "Float"
      ) || value === true || value === false) return `${value}`;
      this.warnUnrestorable(
        controller,
        path,
        "its value cannot be written to the URL; restore a string, number or boolean"
      );
      return null;
    }
    // Writes a restored value through +path+, answering false when the path
    // cannot take it, so the rest of the window's state still restores.
    restorePath(controller, path, value) {
      try {
        UIRuntime.writePath(controller, path, value);
        return true;
      } catch (error) {
        this.warnUnrestorable(controller, path, error.message);
        return false;
      }
    }
    // Whether a value read through +path+ could be written back. A path
    // through an owner that is missing for now still counts as writable.
    isWritablePath(controller, path) {
      try {
        UIRuntime.assertWritablePath(controller, path);
        return true;
      } catch (error) {
        this.warnUnrestorable(controller, path, error.message);
        return false;
      }
    }
    // Warns once per class and path.
    warnUnrestorable(controller, path, reason) {
      let name = UIRuntime.logicalOr(
        UIRuntime.cast(UIRuntime.nameOf(controller), "T.nilable(String)"),
        () => "a controller"
      );
      if (this._unrestorable_paths.includes(`${name} ${path}`)) return;
      UIRuntime.append(this._unrestorable_paths, `${name} ${path}`);
      return UIRuntime.warn(`${name}: restorable ${path} is left out of the URL: ${reason}`);
    }
    // Back/Forward: a container whose fragment names other known content loads
    // it without touching history; otherwise its state is reapplied.
    applyFragment() {
      let params = this._fragments.params();
      return this._windows.forEach((window) => this.applyFragmentTo(window, params));
    }
    applyFragmentTo(window, params) {
      if (!window.isContainer()) return;
      let requested = params[window.name];
      if (UIRuntime.isTruthy(requested != null && requested !== window.contentName)) {
        return this.isWindowContent(requested) ? this.loadWindowContent(
          window.name,
          requested,
          UIRuntime.keywordArguments({ history: "none" })
        ) : UIRuntime.warn(`window "${window.name}" requested unknown content "${requested}"`);
      } else {
        return this.restoreWindowState(
          window,
          UIRuntime.keywordArguments({ prune_stale: false, write_content: false })
        );
      }
    }
    // Code-created content awakens through the same path as markup: the
    // observer wires added subtrees and detaches removed ones. Explicit wiring
    // before the observer runs is harmless, since both are idempotent.
    watch(root) {
      if (!UIRuntime.isTruthy(typeof MutationObserver !== "undefined")) return;
      let observer = new MutationObserver((records, _observer) => records.forEach((record2) => {
        record2.removedNodes.forEach((node) => {
          if (node.nodeType === 1) return Swill__Awakening.detach(node);
        });
        return record2.addedNodes.forEach((node) => {
          if (node.nodeType === 1) return Swill__Awakening.instantiate(node);
        });
      }));
      observer.observe(root, { childList: true, subtree: true });
      this._observer = observer;
      return this._observer;
    }
  };
  var Swill__Launcher = class extends Swill__Object {
    install(document2) {
      return document2.readyState === "loading" ? document2.addEventListener(
        "DOMContentLoaded",
        (_event) => this.launch(document2),
        { once: true }
      ) : this.launch(document2);
    }
    // A page without an [application] element is inert; a page naming an
    // unregistered class fails closed through Runtime.resolve. A running
    // application is returned rather than launched again.
    launch(document2) {
      let element = document2.querySelector("[application]");
      if (!element) return null;
      let failure = UIRuntime.cast(
        UIRuntime.buildFailure(),
        "T.nilable(String)"
      );
      if (failure != null) {
        this.showBuildFailure(element, failure);
        return null;
      }
      ;
      if (Swill__Application.isRunning()) return Swill__Application.shared();
      let application = UIRuntime.cast(
        new (UIRuntime.resolve(UIRuntime.must(element.getAttribute("application"))))(),
        "Swill::Application"
      );
      application.launch(element);
      UIRuntime.must(document2.defaultView).addEventListener(
        "pagehide",
        (event) => {
          if (!event.persisted) return application.terminate();
        }
      );
      return application;
    }
    // A development build that failed to compile replaces the application's
    // script with one reporting the error. No application can launch, so the
    // error is shown as an alert is, without one, in +root+, the element that
    // names the application.
    showBuildFailure(root, message) {
      let dialog = UIRuntime.must(Swill__Templates.named(
        "alert",
        root.ownerDocument
      ).content.firstElementChild).cloneNode(true);
      let alert = Swill__Swell.$index(dialog);
      alert.findBang("h2").text("The application failed to build");
      Swill__Swell.$index(UIRuntime.must(alert.findBang(".alert-text").element.querySelector("p"))).text(message);
      let stop = Swill__Image.named("Stop");
      if (stop) alert.findBang("img").attr("src", stop.url);
      alert.findBang(".actions").remove();
      root.appendChild(dialog);
      return dialog.show();
    }
  };
  var Swill__Controller__List = class extends Swill__Controller {
    // bind accepts either content or an explicit arrangement owner.
    setRepresentedObject(objects) {
      if (UIRuntime.isEqual(this.representedObject, objects)) return;
      this._setting_content = true;
      try {
        if (objects instanceof Swill__ArrayController) {
          this.content = null;
          this.arrayController = UIRuntime.cast(
            objects,
            "Swill::ArrayController"
          );
        } else {
          this.arrayController = null;
          this.content = objects;
        }
      } finally {
        this._setting_content = false;
      }
      ;
      if (this._awakened) return this.renderAll();
    }
    // NSTableHeaderView analog; never a row.
    // Where rows mount; without it, rows go into the list's own element.
    // Shift-click extends the selection from the last plain click. A multiple
    // attribute on the root turns this on from markup.
    // Enter and double-click. By default the owner receives an
    // activate_selection target-action with this list as the sender; when no
    // responder handles it, nothing happens.
    activateSelection() {
      let target = this.nextResponder();
      let handler = target ? target.actionTarget("activate_selection") : null;
      if (handler) {
        return UIRuntime.performAction(
          handler,
          "activate_selection",
          this,
          null
        );
      }
    }
    // Runs when the leading selected object changes, not when only the
    // indexes do. The runtime keeps selected_object current because this
    // hook exists, and dispatches it before selected_objects_did_change.
    selectedObjectDidChange(_previous, _object) {
      return null;
    }
    // The index of the row containing element, or -1 when it is in none; the
    // way an action handler learns which row its sender sits in.
    rowFor(element) {
      let row = this.containerView().childContaining(element);
      let index = row ? UIRuntime.indexOf(this.rowElements(), row) : null;
      return index == null ? -1 : index;
    }
    // ---- lifecycle ----
    viewDidLoad() {
      super.viewDidLoad();
      this._view.ensureFocusable();
      if (this._view.hasAttribute("multiple")) {
        return this.allowsMultipleSelection = true;
      }
    }
    // After outlets connect, so rows and header_view are known.
    awakeFromDOM() {
      super.awakeFromDOM();
      this.installSelection();
      this._awakened = true;
      return this.renderAll();
    }
    representedObjectDidChange(_previous, _objects) {
      return null;
    }
    arrangedObjectsDidChange(_previous, _objects) {
      this._selection_anchor = null;
      if (UIRuntime.isTruthy(this._awakened && !this._setting_content)) {
        return this.renderAll();
      }
    }
    selectedObjectsDidChange(_previous, _objects) {
      if (!this._setting_content) return this.syncSelectedRows();
    }
    // ---- keyboard ----
    // Taking the keyboard selects the first row when nothing is selected.
    becomeFirstResponder() {
      if (!super.becomeFirstResponder()) return false;
      this.selectFirstIfNothingSelected();
      return true;
    }
    // Down moves a single selection to the next row.
    moveDown(event) {
      let total = this.arrangedObjects.length;
      if (total === 0) return super.moveDown(event);
      event.preventDefault();
      let indexes = this.currentIndexes();
      let current = UIRuntime.isEmpty(indexes) ? -1 : UIRuntime.must(indexes[0]);
      let index = current < 0 ? 0 : current + 1;
      if (index > total - 1) index = total - 1;
      this.selectIndexes([index]);
      this._selection_anchor = index;
      return this._selection_anchor;
    }
    // Up moves a single selection to the previous row. Up from the first row,
    // or with nothing selected, is Escape: the list is done.
    moveUp(event) {
      if (this.arrangedObjects.length === 0) return super.moveUp(event);
      event.preventDefault();
      let indexes = this.currentIndexes();
      let current = UIRuntime.isEmpty(indexes) ? -1 : UIRuntime.must(indexes[0]);
      if (current <= 0) {
        return this.cancelOperation(event);
      } else {
        this.selectIndexes([current - 1]);
        this._selection_anchor = current - 1;
        return this._selection_anchor;
      }
    }
    // Enter activates the selection when there is one.
    insertNewline(event) {
      if (!UIRuntime.isEmpty(this.currentSelection())) {
        event.preventDefault();
        return this.activateSelection();
      } else {
        return super.insertNewline(event);
      }
    }
    // ---- rows ----
    // Where rows mount.
    container() {
      return UIRuntime.nilable(this.rows?.element) || this._view.element;
    }
    containerView() {
      let mount = this.rows;
      return mount ? mount : this._view;
    }
    // Rows in order: the container's children other than templates and
    // whatever row_element? rejects.
    rowElements() {
      let found = UIRuntime.cast([], "T::Array[Element]");
      Swill__DOM.eachChild(this.container(), (child) => {
        if (UIRuntime.isTruthy(child.tagName !== "TEMPLATE" && this.isRowElement(child))) {
          return UIRuntime.append(found, child);
        }
      });
      return found;
    }
    // Override when other children share the container. The header view is
    // never a row.
    isRowElement(element) {
      let header = this.headerView;
      return header == null || header.element !== element;
    }
    // Real views per row, or bare elements when many rows must stay cheap.
    rowsAreViews() {
      return true;
    }
    rowTemplate() {
      let found = Swill__DOM.ownedMatching(
        this._view.element,
        'template[for="row"]'
      );
      return UIRuntime.isEmpty(found) ? null : found[0];
    }
    // The element for item. Clones the row template; override to build rows
    // in code. Bindings, actions, selection, and configure_row still apply.
    makeRowElement(_item) {
      let template = this.rowTemplate();
      if (!template) {
        throw new Error('List has no <template for="row"> and no make_row_element override');
      }
      ;
      return this.containerView().cloneTemplate(template);
    }
    // NSTableView willDisplayCell analog.
    configureRow(_element, _item) {
      return null;
    }
    renderAll() {
      this.clearRows();
      this.arrangedObjects.forEach((item) => this.attachRow(item));
      return this.syncSelectedRows();
    }
    attachRow(item) {
      let element = this.makeRowElement(item);
      this.containerView().append(element);
      if (this.rowsAreViews()) {
        let row_view = Swill__View.of(element) || new Swill__View(element);
        this.containerView().adoptSubview(row_view);
      }
      ;
      let controllers = Swill__Awakening.awaken(element);
      let release_bindings = Swill__Connections__Bindings.establishIn(
        element,
        item
      );
      let release_actions = Swill__Connections__Actions.establishIn(
        element,
        this
      );
      element.__swill_row__ = () => {
        release_bindings();
        return release_actions();
      };
      Swill__Awakening.finish(controllers);
      return this.configureRow(element, item);
    }
    clearRows() {
      return this.rowElements().forEach((element) => this.releaseRow(element));
    }
    releaseRow(element) {
      Swill__Awakening.detach(element);
      let release2 = element.__swill_row__;
      if (release2) {
        release2();
        element.__swill_row__ = null;
      }
      ;
      let row_view = Swill__View.of(element);
      if (row_view) row_view.removeFromSuperview();
      return this.containerView().remove(element);
    }
    // Reflect the selection onto the rendered rows and keep the leading
    // selected row in view.
    syncSelectedRows() {
      if (!this._awakened) return;
      let indexes = this.currentIndexes();
      let elements = this.rowElements();
      elements.forEach((element, index) => this.containerView().markSelected(element, indexes.includes(index)));
      let first = UIRuntime.isEmpty(indexes) ? null : elements[UIRuntime.must(indexes[0])];
      if (first) return this.containerView().reveal(first);
    }
    // ---- mouse: click selects, shift-click extends, double-click activates ----
    installSelection() {
      let stop_mouse_down = this._view.listen(
        "mousedown",
        (event) => this.rowMouseDown(event)
      );
      let stop_click = this._view.listen(
        "click",
        (event) => this.rowClicked(event),
        UIRuntime.keywordArguments({ capture: true })
      );
      let stop_double_click = this._view.listen(
        "dblclick",
        (event) => this.rowDoubleClicked(event)
      );
      return this.retain(() => {
        stop_mouse_down();
        stop_click();
        stop_double_click();
        this.clearRows();
        this._awakened = false;
        return this._awakened;
      });
    }
    // Shift-click extends the selection; suppress the browser's text
    // selection sweep across rows.
    rowMouseDown(event) {
      if (!UIRuntime.isTruthy(this.allowsMultipleSelection && event.shiftKey)) return;
      if (this.rowFor(event.target) < 0) return;
      event.preventDefault();
      return this._view.clearTextSelection();
    }
    rowClicked(event) {
      let index = this.rowFor(event.target);
      if (index < 0) return;
      let anchor = this._selection_anchor;
      if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
        this.allowsMultipleSelection && event.shiftKey,
        () => anchor != null
      ))) {
        return this.selectRange(anchor, index);
      } else {
        this.selectIndexes([index]);
        this._selection_anchor = index;
        return this._selection_anchor;
      }
    }
    rowDoubleClicked(event) {
      let index = this.rowFor(event.target);
      if (index < 0) return;
      this.selectIndexes([index]);
      this._selection_anchor = index;
      return this.activateSelection();
    }
    selectRange(anchor, index) {
      let low = anchor < index ? anchor : index;
      let high = anchor < index ? index : anchor;
      let indexes = UIRuntime.cast([], "T::Array[Integer]");
      let current = low;
      while (current <= high) {
        UIRuntime.append(indexes, current);
        current++;
      }
      ;
      return this.selectIndexes(indexes);
    }
  };
  var Swill__Alert = class extends Swill__Controller {
    // The question, shown as the alert's heading.
    // More about the question, shown below it. Empty shows nothing.
    // The image beside the text, by name or URL, as Control::ImageView takes
    // it: the framework's Warning by default, or Stop for an error.
    // The button each title is cloned from.
    // Creates an alert with no text and no buttons. Set the text, add the
    // buttons, then #run it.
    constructor() {
      super();
      this._button_titles = UIRuntime.cast([], "T::Array[String]");
      this._choice = UIRuntime.cast(null, "T.nilable(String)");
    }
    // Adds a button titled +title+ after those already added. An alert with
    // none shows OK.
    addButton(title) {
      return UIRuntime.append(this._button_titles, title);
    }
    async run() {
      let document2 = this.application().root.ownerDocument;
      let template = Swill__Templates.named("alert", document2);
      let dialog = UIRuntime.must(template.content.firstElementChild).cloneNode(true);
      this.attach(dialog);
      if (this.title == null) this.title = document2.title;
      let window = this.application().presentWindow(
        this,
        "alert",
        UIRuntime.keywordArguments({ modal: true })
      );
      await window.closed;
      return this._choice;
    }
    // The action every button sends.
    choose(sender) {
      return this.finish(sender.textContent);
    }
    // Escape chooses the button titled Cancel, or dismisses the alert with
    // nil when it has none.
    cancelOperation(event) {
      event.preventDefault();
      return this.finish(this._button_titles.includes("Cancel") ? "Cancel" : null);
    }
    finish(choice) {
      this._choice = choice;
      return this.application().dismiss(this);
    }
    // Adds a button per title, before the region's actions are connected so
    // each sends choose.
    viewDidLoad() {
      let actions = Swill__Swell.$index(this.view.element).findBang(".actions");
      return (UIRuntime.isEmpty(this._button_titles) ? ["OK"] : this._button_titles).forEach((label, index) => {
        let button = Swill__Swell.$index(this.view.cloneTemplate(UIRuntime.must(this.buttonTemplate))).text(label);
        if (index === 0) button.addClass("default");
        return actions.append(button.element);
      });
    }
  };
  var Swill__SystemAlert = class _Swill__SystemAlert extends Swill__Alert {
    static RETRY_TITLE = "Retry Now";
    static RELOAD_TITLE = "Reload";
    static REFRESH_TITLE = "Refresh";
    constructor() {
      super();
      this._retry_action = UIRuntime.cast(null, "T.nilable(T.proc.void)");
      this._required = UIRuntime.cast(false, "T::Boolean");
    }
    set retryAction(retry_action) {
      this._retry_action = retry_action;
      return this._retry_action;
    }
    set required(required) {
      this._required = required;
      return this._required;
    }
    choose(sender) {
      let action = this._retry_action;
      if (UIRuntime.isTruthy(sender.textContent === _Swill__SystemAlert.RETRY_TITLE && action)) {
        return action();
      } else if ([
        _Swill__SystemAlert.RELOAD_TITLE,
        _Swill__SystemAlert.REFRESH_TITLE
      ].includes(sender.textContent)) {
        return this.application().browser().location.reload();
      } else {
        return super.choose(sender);
      }
    }
    cancelOperation(event) {
      return this._required ? event.preventDefault() : super.cancelOperation(event);
    }
  };
  var Swill__DevelopmentMonitor = class extends Swill__Object {
    constructor(document2, reporter) {
      super();
      this._document = document2;
      this._reporter = reporter;
      this._endpoint = UIRuntime.cast("", "String");
      this._loaded_revision = UIRuntime.cast("", "String");
      this._timer = UIRuntime.cast(null, "T.nilable(Integer)");
      this._request = null;
      this._stopped = UIRuntime.cast(true, "T::Boolean");
      this._on_visibility = (_event) => {
        if (this._document.visibilityState === "visible") return this.poll();
      };
    }
    start() {
      let metadata2 = this._document.querySelector('meta[name="swill-development"]');
      if (!metadata2) return;
      this._endpoint = UIRuntime.stringify(metadata2.getAttribute("data-endpoint"));
      this._loaded_revision = UIRuntime.stringify(metadata2.getAttribute("content"));
      if (UIRuntime.isEmpty(this._endpoint)) return;
      this._stopped = false;
      this._document.addEventListener(
        "visibilitychange",
        this._on_visibility
      );
      return this.poll();
    }
    stop() {
      this._stopped = true;
      this._document.removeEventListener(
        "visibilitychange",
        this._on_visibility
      );
      let timer = this._timer;
      if (timer != null) clearTimeout(timer);
      this._timer = null;
      let request = this._request;
      if (request) return request.abort();
    }
    isRunning() {
      return !this._stopped;
    }
    async poll() {
      if (UIRuntime.isTruthy(this._stopped || this._request)) {
        return;
      }
      ;
      let timer = this._timer;
      if (timer != null) clearTimeout(timer);
      this._timer = null;
      if (this._document.visibilityState !== "visible") return;
      let request = new AbortController();
      this._request = request;
      let timeout = setTimeout(() => request.abort(), 5e3);
      try {
        let state2, revision;
        let response = await fetch(
          this._endpoint,
          { cache: "no-store", signal: request.signal }
        );
        if (response.ok) {
          state2 = UIRuntime.cast(
            await response.json(),
            "T::Hash[String, T.untyped]"
          );
          revision = UIRuntime.send(state2.revision, "to_s");
          if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
            UIRuntime.logicalAnd(
              this.isRunning() && state2.ready === true,
              () => !UIRuntime.send(revision, "empty?")
            ),
            () => revision !== this._loaded_revision
          ))) return this._reporter.revisionChanged(revision);
        }
      } catch (_e) {
        if (_e instanceof Error) {
        } else {
          throw _e;
        }
      } finally {
        clearTimeout(timeout);
        this._request = null;
        if (!this._stopped) this._timer = setTimeout(() => this.poll(), 1e3);
      }
    }
  };
  var Swill__ProblemReporter = class _Swill__ProblemReporter extends Swill__Object {
    static CONNECTION = "connection";
    static RELOAD = "reload";
    static REVISION = "revision";
    static CONNECTION_MESSAGE = "Connection lost";
    static CONNECTION_DETAIL = "Reconnecting automatically. Your local edits are still here.";
    static REVISION_MESSAGE = "Application updated";
    static REVISION_DETAIL = "A new development build is ready. Refresh when you are ready to leave this page.";
    // Creates a reporter for +window+, the browser window whose uncaught
    // errors it reports. #start opts into development error reporting.
    constructor(window) {
      super();
      this._window = window;
      this._pending = UIRuntime.cast([], "T::Array[T::Hash[Symbol, String]]");
      this._current = UIRuntime.cast(null, "T.nilable(String)");
      this._active = UIRuntime.cast(null, "T.nilable(Swill::SystemAlert)");
      this._kind = "";
      this._state = "idle";
      this._stopped = false;
      this._retry = UIRuntime.cast(null, "T.nilable(T.proc.void)");
      this._revision = "";
      this._dismissed = false;
      this._acknowledged_revision = "";
      this._on_error = (event) => this.reportError(event);
      this._on_rejection = (event) => this.reportRejection(event);
      this._stop_warnings = UIRuntime.cast(null, "T.nilable(T.proc.void)");
    }
    // Starts reporting uncaught errors, rejected promises and warnings.
    start() {
      let window = this._window;
      if (window) {
        window.addEventListener("error", this._on_error);
        window.addEventListener("unhandledrejection", this._on_rejection);
      }
      ;
      this._stop_warnings = UIRuntime.observeWarnings((message) => this.report("Warning", message, ""));
      return this._stop_warnings;
    }
    // Stops reporting and closes any notice before application teardown.
    stop() {
      let window = this._window;
      if (window) {
        window.removeEventListener("error", this._on_error);
        window.removeEventListener("unhandledrejection", this._on_rejection);
      }
      ;
      let stop_warnings = this._stop_warnings;
      stop_warnings?.call(null);
      this._stop_warnings = null;
      this._pending = [];
      this._stopped = true;
      return UIRuntime.nilable(this._active?.finish(null));
    }
    reportError(event) {
      let error = event.error;
      let message = error == null ? event.message : _Swill__ProblemReporter.messageOf(error);
      let origin = error == null ? "" : _Swill__ProblemReporter.originOf(error);
      if (UIRuntime.isTruthy(UIRuntime.isEmpty(origin) && !UIRuntime.isEmpty(event.filename))) {
        origin = `at ${event.filename}:${event.lineno}:${event.colno}`;
      }
      ;
      return this.report("Stop", message, origin);
    }
    reportRejection(event) {
      let reason = event.reason;
      if (UIRuntime.isTruthy(reason instanceof Error && [
        "connection_lost",
        "schema_mismatch",
        "actor_scope_changed",
        "outcome_unknown"
      ].includes(UIRuntime.stringify(reason.code)))) {
        return;
      }
      ;
      return this.report(
        "Stop",
        _Swill__ProblemReporter.messageOf(reason),
        _Swill__ProblemReporter.originOf(reason)
      );
    }
    // Queues a problem, showing it now when no alert is showing.
    report(icon, message, detail) {
      if (this._stopped || this._current === message || this._pending.some((problem) => problem.message === message)) return;
      UIRuntime.append(this._pending, { kind: "", icon, message, detail });
      if (this._current == null) return this.showNext();
    }
    // These notices are available in production, independent of error reporting.
    connectionChanged(state2, detail, retry_action) {
      this._state = state2;
      this._retry = retry_action;
      switch (state2) {
        case "connected":
        case "idle":
          return this.connectionRestored();
        case "reload_required":
          return this.requireReload(detail);
        case "disconnected":
          if (!this._dismissed) return this.connectionLost();
      }
    }
    // Coalesce builds while a notice is open. Later acknowledges the latest
    // revision seen, rather than only the one which first opened the alert.
    revisionChanged(revision) {
      this._revision = revision;
      if (revision === this._acknowledged_revision || this._state === "reload_required") {
        return;
      }
      ;
      return this.enqueueNotice(
        _Swill__ProblemReporter.REVISION,
        _Swill__ProblemReporter.REVISION_MESSAGE,
        _Swill__ProblemReporter.REVISION_DETAIL
      );
    }
    enqueueNotice(kind, message, detail) {
      if (this._stopped || this._kind === kind || this._pending.some((item) => item.kind === kind)) return;
      let icon = kind === _Swill__ProblemReporter.CONNECTION ? "NetworkLost" : "Warning";
      UIRuntime.prepend(this._pending, { kind, icon, message, detail });
      if (this._current == null) return this.showNext();
    }
    async showNext() {
      if (this._stopped) {
        return;
      }
      ;
      let first = this._pending[0];
      if (UIRuntime.isTruthy(UIRuntime.logicalAnd(
        first && first.kind === _Swill__ProblemReporter.REVISION,
        () => ["disconnected", "connecting"].includes(this._state)
      ))) return;
      let problem = this._pending.shift();
      if (!problem) return;
      this._current = UIRuntime.fetch(problem, "message");
      this._kind = UIRuntime.fetch(problem, "kind");
      let kind = this._kind;
      try {
        let alert = new Swill__SystemAlert();
        alert.retryAction = kind === _Swill__ProblemReporter.CONNECTION ? this._retry : null;
        alert.required = kind === _Swill__ProblemReporter.RELOAD;
        this._active = alert;
        alert.icon = UIRuntime.fetch(problem, "icon");
        alert.title = UIRuntime.isEmpty(kind) ? (() => {
          return alert.icon === "Stop" ? "Error" : "Warning";
        })() : "Application";
        alert.messageText = UIRuntime.fetch(problem, "message");
        alert.informativeText = UIRuntime.fetch(problem, "detail");
        this.buttonTitles(kind).forEach((label) => alert.addButton(label));
        await alert.run();
        if (UIRuntime.isTruthy(kind === _Swill__ProblemReporter.CONNECTION && [
          "disconnected",
          "connecting"
        ].includes(this._state))) this._dismissed = true;
        if (UIRuntime.isTruthy(kind === _Swill__ProblemReporter.REVISION && [
          "idle",
          "connected"
        ].includes(this._state))) this._acknowledged_revision = this._revision;
      } catch (_e) {
        this._pending = [];
      } finally {
        this._current = null;
        this._kind = "";
        this._active = null;
      }
      ;
      if (!UIRuntime.isEmpty(this._pending)) return this.showNext();
    }
    connectionRestored() {
      this._dismissed = false;
      this._pending = this._pending.filter((item) => ![_Swill__ProblemReporter.CONNECTION, _Swill__ProblemReporter.RELOAD].includes(item.kind));
      if ([
        _Swill__ProblemReporter.CONNECTION,
        _Swill__ProblemReporter.RELOAD
      ].includes(this._kind)) UIRuntime.nilable(this._active?.finish(null));
      if (this._current == null) return this.showNext();
    }
    requireReload(detail) {
      this._pending = this._pending.filter((item) => ![
        _Swill__ProblemReporter.CONNECTION,
        _Swill__ProblemReporter.REVISION
      ].includes(item.kind));
      this.enqueueNotice(
        _Swill__ProblemReporter.RELOAD,
        "Reload required",
        detail
      );
      if (this._kind !== _Swill__ProblemReporter.RELOAD) {
        return UIRuntime.nilable(this._active?.finish(null));
      }
    }
    connectionLost() {
      if (this._kind === _Swill__ProblemReporter.REVISION) {
        UIRuntime.append(this._pending, {
          kind: _Swill__ProblemReporter.REVISION,
          icon: "Warning",
          message: _Swill__ProblemReporter.REVISION_MESSAGE,
          detail: _Swill__ProblemReporter.REVISION_DETAIL
        });
        UIRuntime.nilable(this._active?.finish(null));
      }
      ;
      return this.enqueueNotice(
        _Swill__ProblemReporter.CONNECTION,
        _Swill__ProblemReporter.CONNECTION_MESSAGE,
        _Swill__ProblemReporter.CONNECTION_DETAIL
      );
    }
    buttonTitles(kind) {
      switch (kind) {
        case _Swill__ProblemReporter.CONNECTION:
          return [Swill__SystemAlert.RETRY_TITLE, "Dismiss"];
        case _Swill__ProblemReporter.RELOAD:
          return [Swill__SystemAlert.RELOAD_TITLE];
        case _Swill__ProblemReporter.REVISION:
          return [Swill__SystemAlert.REFRESH_TITLE, "Later"];
        default:
          return ["OK"];
      }
    }
    static messageOf(value) {
      if (value instanceof Error) return value.message;
      return UIRuntime.send(value, "to_s");
    }
    static originOf(value) {
      if (!(value instanceof Error)) return "";
      let stack = UIRuntime.logicalOr(value.stack, () => "");
      let found = UIRuntime.split(stack, "\n").find((line) => UIRuntime.isTruthy(/:\d+:\d+\)?$/m.test(UIRuntime.strip(line))));
      if (found == null) return "";
      let frame = UIRuntime.cast(UIRuntime.strip(found), "String");
      if (frame.startsWith("at ")) return frame;
      let parts = UIRuntime.cast(
        UIRuntime.split(frame, "@"),
        "T::Array[String]"
      );
      if (parts.length < 2) return `at ${frame}`;
      let $function = UIRuntime.must(parts[0]);
      let location = parts.slice(1).join("@");
      return UIRuntime.isEmpty($function) ? `at ${location}` : `at ${$function} (${location})`;
    }
  };

  // build/ui/framework.meta.mjs
  var meta = {
    mixins: {
      "Swill::Observable": {
        factory: Swill__Observable,
        methods: {
          "observe": {
            "arity": 2
          },
          "observe_with_object": {
            "arity": 3,
            "js": "observeWithObject",
            "family": "observe"
          },
          "retain": {
            "arity": 1
          },
          "release": {
            "arity": 1
          },
          "dealloc": {
            "arity": 0
          },
          "disconnect": {
            "arity": 0
          },
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "property_will_change": {
            "arity": 3,
            "js": "propertyWillChange"
          },
          "property_will_access": {
            "arity": 1,
            "js": "propertyWillAccess"
          }
        }
      },
      "Swill::DOM": {
        factory: Swill__DOM,
        methods: {}
      },
      "Swill::ObjectBindings": {
        factory: Swill__ObjectBindings,
        methods: {
          "bind": {
            "arity": 1,
            "minimum": 1,
            "maximum": 1
          },
          "unbind": {
            "arity": 1
          },
          "unbind_all": {
            "arity": 0,
            "js": "unbindAll"
          },
          "object_bindings": {
            "arity": 0,
            "js": "objectBindings"
          }
        }
      },
      "Swill::CollectionArrangement": {
        factory: Swill__CollectionArrangement,
        methods: {
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "arrange_content": {
            "arity": 0,
            "js": "arrangeContent"
          },
          "includes_object?": {
            "arity": 1,
            "js": "includesObject"
          },
          "content_did_change": {
            "arity": 2,
            "js": "contentDidChange"
          },
          "collection?": {
            "arity": 1,
            "js": "isCollection"
          },
          "show_first": {
            "arity": 1,
            "js": "showFirst"
          },
          "replace_object": {
            "arity": 2,
            "js": "replaceObject"
          },
          "compare_sort_values": {
            "arity": 2,
            "js": "compareSortValues"
          },
          "sort": {
            "arity": 2
          },
          "toggle_sort": {
            "arity": 1,
            "js": "toggleSort"
          },
          "change_sort_key": {
            "arity": 1,
            "js": "changeSortKey"
          },
          "change_sort_direction": {
            "arity": 1,
            "js": "changeSortDirection"
          },
          "arranged_selection": {
            "arity": 0,
            "js": "arrangedSelection"
          },
          "select_objects": {
            "arity": 1,
            "js": "selectObjects"
          },
          "select_identifier": {
            "arity": 1,
            "js": "selectIdentifier"
          },
          "select_indexes": {
            "arity": 1,
            "js": "selectIndexes"
          },
          "select_object": {
            "arity": 1,
            "js": "selectObject"
          },
          "deselect_all": {
            "arity": 0,
            "js": "deselectAll"
          },
          "select_first_if_nothing_selected": {
            "arity": 0,
            "js": "selectFirstIfNothingSelected"
          },
          "object_at": {
            "arity": 1,
            "js": "objectAt"
          },
          "identifier_for": {
            "arity": 1,
            "js": "identifierFor"
          },
          "object_with_id": {
            "arity": 1,
            "js": "objectWithId"
          },
          "current_selection": {
            "arity": 0,
            "js": "currentSelection"
          },
          "current_indexes": {
            "arity": 0,
            "js": "currentIndexes"
          },
          "reconcile_selection": {
            "arity": 0,
            "js": "reconcileSelection"
          }
        }
      },
      "Swill::OutletOwner": {
        factory: Swill__OutletOwner,
        classFactory: Swill__OutletOwner_ClassMethods,
        methods: {
          "decode_outlet_data": {
            "arity": 2,
            "js": "decodeOutletData"
          }
        }
      },
      "Swill::Templates": {
        factory: Swill__Templates,
        methods: {}
      },
      "Swill::Connections::Bindings": {
        factory: Swill__Connections__Bindings,
        methods: {}
      },
      "Swill::Connections::Actions": {
        factory: Swill__Connections__Actions,
        methods: {}
      },
      "Swill::Connections::Outlets": {
        factory: Swill__Connections__Outlets,
        methods: {}
      },
      "Swill::Awakening": {
        factory: Swill__Awakening,
        methods: {}
      }
    },
    classes: {
      "Swill::Object": {
        constructor: Swill__Object,
        mixins: [Swill__Observable],
        properties: {},
        methods: {}
      },
      "Swill::Swell": {
        constructor: Swill__Swell,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          },
          "element": {
            "arity": 0,
            "accessor": true
          },
          "add_class": {
            "arity": 1,
            "js": "addClass"
          },
          "remove_class": {
            "arity": 1,
            "js": "removeClass"
          },
          "toggle_class": {
            "arity": 1,
            "js": "toggleClass"
          },
          "toggle_class_with_on": {
            "arity": 2,
            "js": "toggleClassWithOn",
            "family": "toggle_class"
          },
          "has_class?": {
            "arity": 1,
            "js": "hasClass"
          },
          "attr": {
            "arity": 2
          },
          "attribute": {
            "arity": 1
          },
          "has_attribute?": {
            "arity": 1,
            "js": "hasAttribute"
          },
          "remove_attr": {
            "arity": 1,
            "js": "removeAttr"
          },
          "aria": {
            "arity": 2
          },
          "data": {
            "arity": 2
          },
          "aria_value": {
            "arity": 1,
            "js": "ariaValue"
          },
          "data_value": {
            "arity": 1,
            "js": "dataValue"
          },
          "prop": {
            "arity": 2
          },
          "property_value": {
            "arity": 1,
            "js": "propertyValue"
          },
          "text": {
            "arity": 1
          },
          "text_content": {
            "arity": 0,
            "js": "textContent"
          },
          "hide": {
            "arity": 0
          },
          "show": {
            "arity": 0
          },
          "empty": {
            "arity": 0
          },
          "append": {
            "arity": 1
          },
          "prepend": {
            "arity": 1
          },
          "remove": {
            "arity": 0
          },
          "find": {
            "arity": 1
          },
          "find!": {
            "arity": 1,
            "js": "findBang"
          },
          "listen": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2
          }
        }
      },
      "Swill::Notification": {
        constructor: Swill__Notification,
        properties: {},
        methods: {
          "initialize": {
            "arity": 3
          },
          "name": {
            "arity": 0,
            "accessor": true
          },
          "object": {
            "arity": 0,
            "accessor": true
          },
          "user_info": {
            "arity": 0,
            "js": "userInfo",
            "accessor": true
          }
        }
      },
      "Swill::NotificationCenter": {
        constructor: Swill__NotificationCenter,
        properties: {},
        methods: {
          "initialize": {
            "arity": 0
          },
          "add_observer": {
            "arity": 2,
            "js": "addObserver"
          },
          "post": {
            "arity": 3
          }
        }
      },
      "Swill::ValueTransformer": {
        constructor: Swill__ValueTransformer,
        properties: {},
        methods: {
          "format": {
            "arity": 1
          },
          "parse": {
            "arity": 1
          }
        }
      },
      "Swill::NumberTransformer": {
        constructor: Swill__NumberTransformer,
        properties: {},
        methods: {
          "parse": {
            "arity": 1
          }
        }
      },
      "Swill::BooleanTransformer": {
        constructor: Swill__BooleanTransformer,
        properties: {},
        methods: {
          "format": {
            "arity": 1
          },
          "parse": {
            "arity": 1
          }
        }
      },
      "Swill::DateTransformer": {
        constructor: Swill__DateTransformer,
        properties: {},
        methods: {
          "format": {
            "arity": 1
          },
          "parse": {
            "arity": 1
          }
        }
      },
      "Swill::BindingDestination": {
        constructor: Swill__BindingDestination,
        properties: {},
        methods: {
          "write": {
            "arity": 3
          },
          "read": {
            "arity": 2
          },
          "two_way?": {
            "arity": 2,
            "js": "isTwoWay"
          },
          "transforms?": {
            "arity": 0,
            "js": "isTransforms"
          },
          "null_placeholder": {
            "arity": 0,
            "js": "nullPlaceholder"
          },
          "listen": {
            "arity": 3
          }
        }
      },
      "Swill::BindingDestination::Text": {
        constructor: Swill__BindingDestination__Text,
        properties: {},
        methods: {
          "write": {
            "arity": 3
          },
          "read": {
            "arity": 2
          }
        }
      },
      "Swill::BindingDestination::Field": {
        constructor: Swill__BindingDestination__Field,
        properties: {},
        methods: {
          "write": {
            "arity": 3
          },
          "read": {
            "arity": 2
          },
          "two_way?": {
            "arity": 2,
            "js": "isTwoWay"
          },
          "listen": {
            "arity": 3
          },
          "event_name": {
            "arity": 0,
            "js": "eventName"
          }
        }
      },
      "Swill::BindingDestination::Select": {
        constructor: Swill__BindingDestination__Select,
        properties: {},
        methods: {
          "event_name": {
            "arity": 0,
            "js": "eventName"
          }
        }
      },
      "Swill::BindingDestination::Checkbox": {
        constructor: Swill__BindingDestination__Checkbox,
        properties: {},
        methods: {
          "write": {
            "arity": 3
          },
          "read": {
            "arity": 2
          },
          "transforms?": {
            "arity": 0,
            "js": "isTransforms"
          },
          "null_placeholder": {
            "arity": 0,
            "js": "nullPlaceholder"
          },
          "event_name": {
            "arity": 0,
            "js": "eventName"
          }
        }
      },
      "Swill::BindingDestination::ElementProperty": {
        constructor: Swill__BindingDestination__ElementProperty,
        properties: {},
        methods: {
          "write": {
            "arity": 3
          },
          "boolean_property?": {
            "arity": 1,
            "js": "isBooleanProperty"
          },
          "null_placeholder": {
            "arity": 0,
            "js": "nullPlaceholder"
          },
          "transforms?": {
            "arity": 0,
            "js": "isTransforms"
          }
        }
      },
      "Swill::BindingDestination::ObjectProperty": {
        constructor: Swill__BindingDestination__ObjectProperty,
        properties: {},
        methods: {
          "write": {
            "arity": 3
          },
          "read": {
            "arity": 2
          },
          "two_way?": {
            "arity": 2,
            "js": "isTwoWay"
          },
          "null_placeholder": {
            "arity": 0,
            "js": "nullPlaceholder"
          },
          "listen": {
            "arity": 3
          }
        }
      },
      "Swill::Binding": {
        constructor: Swill__Binding,
        properties: {},
        methods: {}
      },
      "Swill::ArrayController": {
        constructor: Swill__ArrayController,
        mixins: [Swill__CollectionArrangement, Swill__ObjectBindings],
        properties: {
          "content": {
            type: "T.untyped",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "array_controller": {
            js: "arrayController",
            type: "T.nilable(Swill::ArrayController)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "arrangement_options": {
            js: "arrangementOptions",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "arranged_objects": {
            js: "arrangedObjects",
            type: "T::Array[T.untyped]",
            attribute: false,
            compute: function compute_arrangedObjects() {
              return this.arrangeContent();
            }
          },
          "sort_key": {
            js: "sortKey",
            type: "T.nilable(String)",
            attribute: false,
            writer: "changeSortKey",
            compute: function compute_sortKey() {
              let controller = this.arrayController;
              return controller ? controller.sortKey : UIRuntime.cast(
                UIRuntime.logicalOr(this.arrangementOptions.key, () => null),
                "T.nilable(String)"
              );
            }
          },
          "sort_direction": {
            js: "sortDirection",
            type: "String",
            attribute: false,
            writer: "changeSortDirection",
            compute: function compute_sortDirection() {
              let controller = this.arrayController;
              return controller ? controller.sortDirection : UIRuntime.cast(
                UIRuntime.logicalOr(
                  this.arrangementOptions.direction,
                  () => "ascending"
                ),
                "String"
              );
            }
          },
          "sort_states": {
            js: "sortStates",
            type: "T::Hash[String, String]",
            attribute: false,
            compute: function compute_sortStates() {
              let key = this.sortKey;
              return key != null ? { [key]: this.sortDirection } : {};
            }
          },
          "selection_state": {
            js: "selectionState",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "selected_objects": {
            js: "selectedObjects",
            type: "T::Array[T.untyped]",
            attribute: false,
            writer: "selectObjects",
            compute: function compute_selectedObjects() {
              return this.arrangedSelection();
            }
          },
          "selected_object_id": {
            js: "selectedObjectId",
            type: "T.nilable(String)",
            attribute: false,
            writer: "selectIdentifier",
            compute: function compute_selectedObjectId() {
              let controller = this.arrayController;
              return controller ? controller.selectedObjectId : UIRuntime.cast(
                UIRuntime.logicalOr(this.selectionState.id, () => null),
                "T.nilable(String)"
              );
            }
          },
          "selected_object": {
            js: "selectedObject",
            type: "T.untyped",
            attribute: false,
            compute: function compute_selectedObject() {
              return UIRuntime.isEmpty(this.selectedObjects) ? null : this.selectedObjects[0];
            }
          },
          "selected_indexes": {
            js: "selectedIndexes",
            type: "T::Array[Integer]",
            attribute: false,
            compute: function compute_selectedIndexes() {
              let selected = this.selectedObjects;
              let indexes = UIRuntime.cast([], "T::Array[Integer]");
              this.arrangedObjects.forEach((object, index) => {
                if (selected.includes(object)) UIRuntime.append(indexes, index);
              });
              return indexes;
            }
          }
        },
        methods: {}
      },
      "Swill::Responder": {
        constructor: Swill__Responder,
        properties: {},
        methods: {
          "next_responder": {
            "arity": 0,
            "js": "nextResponder"
          },
          "perform_action": {
            "arity": 3,
            "js": "performAction"
          },
          "action_target": {
            "arity": 1,
            "js": "actionTarget"
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "acceptsFirstResponder"
          },
          "focus_region": {
            "arity": 0,
            "js": "focusRegion"
          },
          "key_element": {
            "arity": 0,
            "js": "keyElement"
          },
          "become_first_responder": {
            "arity": 0,
            "js": "becomeFirstResponder"
          },
          "resign_first_responder": {
            "arity": 1,
            "js": "resignFirstResponder"
          },
          "key_down": {
            "arity": 1,
            "js": "keyDown"
          },
          "command_for": {
            "arity": 1,
            "js": "commandFor"
          },
          "key_up": {
            "arity": 1,
            "js": "keyUp"
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          },
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "insert_tab": {
            "arity": 1,
            "js": "insertTab"
          },
          "insert_backtab": {
            "arity": 1,
            "js": "insertBacktab"
          },
          "move_up": {
            "arity": 1,
            "js": "moveUp"
          },
          "move_down": {
            "arity": 1,
            "js": "moveDown"
          },
          "move_left": {
            "arity": 1,
            "js": "moveLeft"
          },
          "move_right": {
            "arity": 1,
            "js": "moveRight"
          },
          "move_to_beginning_of_document": {
            "arity": 1,
            "js": "moveToBeginningOfDocument"
          },
          "move_to_end_of_document": {
            "arity": 1,
            "js": "moveToEndOfDocument"
          }
        }
      },
      "Swill::Bundle": {
        constructor: Swill__Bundle,
        properties: {},
        methods: {
          "initialize": {
            "arity": 4
          },
          "name": {
            "arity": 0,
            "accessor": true
          },
          "base_url": {
            "arity": 0,
            "js": "baseURL",
            "accessor": true
          },
          "base_url=": {
            "arity": 1,
            "js": "baseURL="
          },
          "manifest": {
            "arity": 0,
            "accessor": true
          },
          "path_for_resource": {
            "arity": 1,
            "js": "pathForResource"
          },
          "path_for_resource_with_extension": {
            "arity": 2,
            "js": "pathForResourceWithExtension",
            "family": "path_for_resource"
          },
          "url_for_resource": {
            "arity": 1,
            "js": "urlForResource"
          },
          "url_for_resource_with_extension": {
            "arity": 2,
            "js": "urlForResourceWithExtension",
            "family": "url_for_resource"
          },
          "resource?": {
            "arity": 1,
            "js": "isResource"
          },
          "resource_with_extension?": {
            "arity": 2,
            "js": "isResourceWithExtension",
            "family": "resource?"
          },
          "url_for_path": {
            "arity": 1,
            "js": "urlForPath"
          },
          "load_resource": {
            "arity": 2,
            "js": "loadResource"
          },
          "loaded_resource": {
            "arity": 1,
            "js": "loadedResource"
          },
          "loaded_resource_with_extension": {
            "arity": 2,
            "js": "loadedResourceWithExtension",
            "family": "loaded_resource"
          },
          "loaded_path": {
            "arity": 1,
            "js": "loadedPath"
          },
          "add_stylesheet": {
            "arity": 2,
            "js": "addStylesheet"
          }
        }
      },
      "Swill::Image": {
        constructor: Swill__Image,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          },
          "url": {
            "arity": 0,
            "accessor": true
          }
        }
      },
      "Swill::View": {
        constructor: Swill__View,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          },
          "owns_content?": {
            "arity": 0,
            "js": "isOwnsContent"
          },
          "unload": {
            "arity": 0
          },
          "element": {
            "arity": 0,
            "accessor": true
          },
          "controller_value": {
            "arity": 0,
            "js": "controllerValue"
          },
          "controller=": {
            "arity": 1
          },
          "superview": {
            "arity": 0,
            "accessor": true
          },
          "subviews": {
            "arity": 0,
            "accessor": true
          },
          "owner": {
            "arity": 0
          },
          "adopt_subview": {
            "arity": 1,
            "js": "adoptSubview"
          },
          "release_subview": {
            "arity": 1,
            "js": "releaseSubview"
          },
          "remove_from_superview": {
            "arity": 0,
            "js": "removeFromSuperview"
          },
          "assign_superview": {
            "arity": 1,
            "js": "assignSuperview"
          },
          "has_attribute?": {
            "arity": 1,
            "js": "hasAttribute"
          },
          "contains?": {
            "arity": 1,
            "js": "contains"
          },
          "clone_template": {
            "arity": 1,
            "js": "cloneTemplate"
          },
          "append": {
            "arity": 1
          },
          "insert_after": {
            "arity": 2,
            "js": "insertAfter"
          },
          "remove": {
            "arity": 1
          },
          "child_containing": {
            "arity": 1,
            "js": "childContaining"
          },
          "mark": {
            "arity": 3
          },
          "mark_selected": {
            "arity": 2,
            "js": "markSelected"
          },
          "reveal": {
            "arity": 1
          },
          "clear_text_selection": {
            "arity": 0,
            "js": "clearTextSelection"
          },
          "listen": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2
          },
          "focusable_selector": {
            "arity": 0,
            "js": "focusableSelector"
          },
          "ensure_focusable": {
            "arity": 0,
            "js": "ensureFocusable"
          },
          "first_focusable_element": {
            "arity": 0,
            "js": "firstFocusableElement"
          },
          "focus_region": {
            "arity": 0,
            "js": "focusRegion"
          },
          "key_element": {
            "arity": 0,
            "js": "keyElement"
          },
          "focus_element": {
            "arity": 0,
            "js": "focusElement"
          },
          "blur_element": {
            "arity": 0,
            "js": "blurElement"
          },
          "blur_element_with_next_responder": {
            "arity": 1,
            "js": "blurElementWithNextResponder",
            "family": "blur_element"
          },
          "next_responder": {
            "arity": 0,
            "js": "nextResponder"
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "acceptsFirstResponder"
          },
          "become_first_responder": {
            "arity": 0,
            "js": "becomeFirstResponder"
          },
          "resign_first_responder": {
            "arity": 1,
            "js": "resignFirstResponder"
          },
          "update_accessibility": {
            "arity": 0,
            "js": "updateAccessibility"
          }
        }
      },
      "Swill::Control": {
        constructor: Swill__Control,
        mixins: [Swill__OutletOwner],
        properties: {
          "delegate": {
            type: "T.untyped",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "load_template": {
            "arity": 1,
            "js": "loadTemplate"
          },
          "resign_first_responder": {
            "arity": 1,
            "js": "resignFirstResponder"
          }
        }
      },
      "Swill::Control::Button": {
        constructor: Swill__Control__Button,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          }
        }
      },
      "Swill::Control::ImageView": {
        constructor: Swill__Control__ImageView,
        properties: {
          "value": {
            type: "T.nilable(Swill::Image)",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 1
          },
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "value_did_change": {
            "arity": 2,
            "js": "valueDidChange"
          },
          "image_element": {
            "arity": 0,
            "js": "imageElement"
          },
          "update_accessibility": {
            "arity": 0,
            "js": "updateAccessibility"
          }
        }
      },
      "Swill::Controller": {
        constructor: Swill__Controller,
        mixins: [Swill__ObjectBindings, Swill__OutletOwner],
        properties: {
          "represented_object": {
            js: "representedObject",
            type: "T.untyped",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "title": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "binding_root": {
            "arity": 0,
            "js": "bindingRoot"
          },
          "attach": {
            "arity": 1
          },
          "view": {
            "arity": 0,
            "accessor": true
          },
          "parent": {
            "arity": 0
          },
          "child_controllers": {
            "arity": 0,
            "js": "childControllers"
          },
          "application": {
            "arity": 0
          },
          "next_responder": {
            "arity": 0,
            "js": "nextResponder"
          },
          "observe_notification": {
            "arity": 2,
            "js": "observeNotification"
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "acceptsFirstResponder"
          },
          "focus_region": {
            "arity": 0,
            "js": "focusRegion"
          },
          "key_element": {
            "arity": 0,
            "js": "keyElement"
          },
          "become_first_responder": {
            "arity": 0,
            "js": "becomeFirstResponder"
          },
          "resign_first_responder": {
            "arity": 1,
            "js": "resignFirstResponder"
          },
          "unload": {
            "arity": 0
          },
          "view_did_load": {
            "arity": 0,
            "js": "viewDidLoad"
          },
          "awake_from_dom": {
            "arity": 0,
            "js": "awakeFromDOM"
          },
          "controller_did_restore": {
            "arity": 1,
            "js": "controllerDidRestore"
          },
          "controller_did_load": {
            "arity": 0,
            "js": "controllerDidLoad"
          },
          "view_will_appear": {
            "arity": 0,
            "js": "viewWillAppear"
          },
          "view_did_appear": {
            "arity": 0,
            "js": "viewDidAppear"
          },
          "view_will_disappear": {
            "arity": 0,
            "js": "viewWillDisappear"
          },
          "view_did_disappear": {
            "arity": 0,
            "js": "viewDidDisappear"
          },
          "collect_child_controllers": {
            "arity": 2,
            "js": "collectChildControllers"
          }
        }
      },
      "Swill::URLFragment": {
        constructor: Swill__URLFragment,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          },
          "available?": {
            "arity": 0,
            "js": "isAvailable"
          },
          "params": {
            "arity": 0
          },
          "write": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2
          },
          "suspended": {
            "arity": 0,
            "minimum": 0,
            "maximum": 0
          },
          "start_observing": {
            "arity": 1,
            "js": "startObserving"
          },
          "stop_observing": {
            "arity": 0,
            "js": "stopObserving"
          }
        }
      },
      "Swill::Window": {
        constructor: Swill__Window,
        properties: {},
        methods: {
          "initialize": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2
          },
          "scoped_key": {
            "arity": 1,
            "js": "scopedKey"
          },
          "add_restoration": {
            "arity": 2,
            "js": "addRestoration"
          },
          "dispose_restoration": {
            "arity": 0,
            "js": "disposeRestoration"
          },
          "name": {
            "arity": 0,
            "accessor": true
          },
          "root": {
            "arity": 0,
            "accessor": true
          },
          "controller": {
            "arity": 0,
            "accessor": true
          },
          "modal?": {
            "arity": 0,
            "js": "isModal"
          },
          "content_name": {
            "arity": 0,
            "js": "contentName",
            "accessor": true
          },
          "closed": {
            "arity": 0,
            "accessor": true
          },
          "first_responder": {
            "arity": 0,
            "js": "firstResponder",
            "accessor": true
          },
          "first_responder=": {
            "arity": 1,
            "js": "firstResponder="
          },
          "focused_element": {
            "arity": 0,
            "js": "focusedElement",
            "accessor": true
          },
          "focused_element=": {
            "arity": 1,
            "js": "focusedElement="
          },
          "key_views": {
            "arity": 1,
            "js": "keyViews"
          },
          "key_view?": {
            "arity": 2,
            "js": "isKeyView"
          },
          "initial_focus_element": {
            "arity": 1,
            "js": "initialFocusElement"
          },
          "default_button": {
            "arity": 1,
            "js": "defaultButton"
          },
          "first_key_view": {
            "arity": 2,
            "js": "firstKeyView"
          },
          "assign_content": {
            "arity": 2,
            "js": "assignContent"
          },
          "container?": {
            "arity": 0,
            "js": "isContainer"
          },
          "contains_controller?": {
            "arity": 1,
            "js": "containsController"
          },
          "show_title": {
            "arity": 2,
            "js": "showTitle"
          },
          "dismiss": {
            "arity": 0
          }
        }
      },
      "Swill::Application": {
        constructor: Swill__Application,
        mixins: [Swill__OutletOwner],
        properties: {
          "theme": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "development": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 0
          },
          "development_did_change": {
            "arity": 2,
            "js": "developmentDidChange"
          },
          "launch": {
            "arity": 1
          },
          "connection_changed": {
            "arity": 3,
            "js": "connectionChanged"
          },
          "report_problem": {
            "arity": 2,
            "js": "reportProblem"
          },
          "browser": {
            "arity": 0
          },
          "controllers": {
            "arity": 0,
            "accessor": true
          },
          "root": {
            "arity": 0,
            "accessor": true
          },
          "terminate": {
            "arity": 0
          },
          "application_did_launch": {
            "arity": 0,
            "js": "applicationDidLaunch"
          },
          "application_will_terminate": {
            "arity": 0,
            "js": "applicationWillTerminate"
          },
          "load_window_content": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2,
            "js": "loadWindowContent"
          },
          "show_window": {
            "arity": 1,
            "minimum": 1,
            "maximum": 1,
            "js": "showWindow"
          },
          "present_window": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2,
            "js": "presentWindow"
          },
          "begin_window": {
            "arity": 3,
            "js": "beginWindow"
          },
          "open_window": {
            "arity": 3,
            "js": "openWindow"
          },
          "take_initial_first_responder": {
            "arity": 2,
            "js": "takeInitialFirstResponder"
          },
          "focus_in_window": {
            "arity": 1,
            "js": "focusInWindow"
          },
          "changing_windows": {
            "arity": 0,
            "minimum": 0,
            "maximum": 0,
            "js": "changingWindows"
          },
          "theme_link": {
            "arity": 1,
            "js": "themeLink"
          },
          "adopt_theme": {
            "arity": 1,
            "js": "adoptTheme"
          },
          "theme_did_change": {
            "arity": 2,
            "js": "themeDidChange"
          },
          "warn_unrestored": {
            "arity": 1,
            "js": "warnUnrestored"
          },
          "dismiss": {
            "arity": 1
          },
          "refocus_key_window": {
            "arity": 0,
            "js": "refocusKeyWindow"
          },
          "window_named": {
            "arity": 1,
            "js": "windowNamed"
          },
          "window_content?": {
            "arity": 1,
            "js": "isWindowContent"
          },
          "main_window": {
            "arity": 0,
            "js": "mainWindow"
          },
          "key_windows": {
            "arity": 0,
            "js": "keyWindows"
          },
          "key_window": {
            "arity": 0,
            "js": "keyWindow"
          },
          "first_responder": {
            "arity": 0,
            "js": "firstResponder"
          },
          "make_first_responder": {
            "arity": 1,
            "js": "makeFirstResponder"
          },
          "assign_first_responder": {
            "arity": 1,
            "js": "assignFirstResponder"
          },
          "assign_window_first_responder": {
            "arity": 2,
            "js": "assignWindowFirstResponder"
          },
          "post_first_responder_change": {
            "arity": 0,
            "js": "postFirstResponderChange"
          },
          "describe_responder": {
            "arity": 1,
            "js": "describeResponder"
          },
          "window_of": {
            "arity": 1,
            "js": "windowOf"
          },
          "window_holding": {
            "arity": 1,
            "js": "windowHolding"
          },
          "excluded_roots": {
            "arity": 1,
            "js": "excludedRoots"
          },
          "key_down_in_window": {
            "arity": 1,
            "js": "keyDownInWindow"
          },
          "adopt_focus": {
            "arity": 1,
            "js": "adoptFocus"
          },
          "verify_focus": {
            "arity": 1,
            "js": "verifyFocus"
          },
          "window_label": {
            "arity": 1,
            "js": "windowLabel"
          },
          "describe_element": {
            "arity": 1,
            "js": "describeElement"
          },
          "focus_in": {
            "arity": 1,
            "js": "focusIn"
          },
          "insert_tab": {
            "arity": 1,
            "js": "insertTab"
          },
          "insert_backtab": {
            "arity": 1,
            "js": "insertBacktab"
          },
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "select_key_view": {
            "arity": 2,
            "js": "selectKeyView"
          },
          "focus_out": {
            "arity": 1,
            "js": "focusOut"
          },
          "sync_first_responder": {
            "arity": 2,
            "js": "syncFirstResponder"
          },
          "focus_left": {
            "arity": 1,
            "js": "focusLeft"
          },
          "release_first_responder": {
            "arity": 1,
            "js": "releaseFirstResponder"
          },
          "responder_for": {
            "arity": 1,
            "js": "responderFor"
          },
          "responder_element": {
            "arity": 1,
            "js": "responderElement"
          },
          "restore_focus": {
            "arity": 2,
            "js": "restoreFocus"
          },
          "scan_templates": {
            "arity": 0,
            "js": "scanTemplates"
          },
          "window_template": {
            "arity": 1,
            "js": "windowTemplate"
          },
          "clone_window_content": {
            "arity": 1,
            "js": "cloneWindowContent"
          },
          "window_containers": {
            "arity": 0,
            "js": "windowContainers"
          },
          "prepare_window_containers": {
            "arity": 0,
            "js": "prepareWindowContainers"
          },
          "requested_content": {
            "arity": 3,
            "js": "requestedContent"
          },
          "register_window_containers": {
            "arity": 0,
            "js": "registerWindowContainers"
          },
          "top_controller_in": {
            "arity": 1,
            "js": "topControllerIn"
          },
          "top_within?": {
            "arity": 2,
            "js": "isTopWithin"
          },
          "matches_container?": {
            "arity": 2,
            "js": "matchesContainer"
          },
          "window_containing": {
            "arity": 1,
            "js": "windowContaining"
          },
          "holds?": {
            "arity": 2,
            "js": "holds"
          },
          "responder_within?": {
            "arity": 2,
            "js": "isResponderWithin"
          },
          "attached?": {
            "arity": 1,
            "js": "isAttached"
          },
          "release_window": {
            "arity": 1,
            "js": "releaseWindow"
          },
          "restore_window_state": {
            "arity": 1,
            "minimum": 1,
            "maximum": 1,
            "js": "restoreWindowState"
          },
          "restore_launched_windows": {
            "arity": 0,
            "js": "restoreLaunchedWindows"
          },
          "write_window_state": {
            "arity": 1,
            "js": "writeWindowState"
          },
          "decode_fragment_value": {
            "arity": 2,
            "js": "decodeFragmentValue"
          },
          "encode_fragment_value": {
            "arity": 3,
            "js": "encodeFragmentValue"
          },
          "restore_path": {
            "arity": 3,
            "js": "restorePath"
          },
          "writable_path?": {
            "arity": 2,
            "js": "isWritablePath"
          },
          "warn_unrestorable": {
            "arity": 3,
            "js": "warnUnrestorable"
          },
          "apply_fragment": {
            "arity": 0,
            "js": "applyFragment"
          },
          "apply_fragment_to": {
            "arity": 2,
            "js": "applyFragmentTo"
          },
          "watch": {
            "arity": 1
          }
        }
      },
      "Swill::Launcher": {
        constructor: Swill__Launcher,
        properties: {},
        methods: {
          "install": {
            "arity": 1
          },
          "launch": {
            "arity": 1
          },
          "show_build_failure": {
            "arity": 2,
            "js": "showBuildFailure"
          }
        }
      },
      "Swill::Controller::List": {
        constructor: Swill__Controller__List,
        mixins: [Swill__CollectionArrangement],
        properties: {
          "content": {
            type: "T.untyped",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "array_controller": {
            js: "arrayController",
            type: "T.nilable(Swill::ArrayController)",
            attribute: false,
            defaultValue() {
              return null;
            }
          },
          "arrangement_options": {
            js: "arrangementOptions",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "arranged_objects": {
            js: "arrangedObjects",
            type: "T::Array[T.untyped]",
            attribute: false,
            compute: function compute_arrangedObjects2() {
              return this.arrangeContent();
            }
          },
          "sort_key": {
            js: "sortKey",
            type: "T.nilable(String)",
            attribute: false,
            writer: "changeSortKey",
            compute: function compute_sortKey2() {
              let controller = this.arrayController;
              return controller ? controller.sortKey : UIRuntime.cast(
                UIRuntime.logicalOr(this.arrangementOptions.key, () => null),
                "T.nilable(String)"
              );
            }
          },
          "sort_direction": {
            js: "sortDirection",
            type: "String",
            attribute: false,
            writer: "changeSortDirection",
            compute: function compute_sortDirection2() {
              let controller = this.arrayController;
              return controller ? controller.sortDirection : UIRuntime.cast(
                UIRuntime.logicalOr(
                  this.arrangementOptions.direction,
                  () => "ascending"
                ),
                "String"
              );
            }
          },
          "sort_states": {
            js: "sortStates",
            type: "T::Hash[String, String]",
            attribute: false,
            compute: function compute_sortStates2() {
              let key = this.sortKey;
              return key != null ? { [key]: this.sortDirection } : {};
            }
          },
          "selection_state": {
            js: "selectionState",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "selected_objects": {
            js: "selectedObjects",
            type: "T::Array[T.untyped]",
            attribute: false,
            writer: "selectObjects",
            compute: function compute_selectedObjects2() {
              return this.arrangedSelection();
            }
          },
          "selected_object_id": {
            js: "selectedObjectId",
            type: "T.nilable(String)",
            attribute: false,
            writer: "selectIdentifier",
            compute: function compute_selectedObjectId2() {
              let controller = this.arrayController;
              return controller ? controller.selectedObjectId : UIRuntime.cast(
                UIRuntime.logicalOr(this.selectionState.id, () => null),
                "T.nilable(String)"
              );
            }
          },
          "selected_object": {
            js: "selectedObject",
            type: "T.untyped",
            attribute: false,
            compute: function compute_selectedObject2() {
              return UIRuntime.isEmpty(this.selectedObjects) ? null : this.selectedObjects[0];
            }
          },
          "selected_indexes": {
            js: "selectedIndexes",
            type: "T::Array[Integer]",
            attribute: false,
            compute: function compute_selectedIndexes2() {
              let selected = this.selectedObjects;
              let indexes = UIRuntime.cast([], "T::Array[Integer]");
              this.arrangedObjects.forEach((object, index) => {
                if (selected.includes(object)) UIRuntime.append(indexes, index);
              });
              return indexes;
            }
          },
          "represented_object": {
            js: "representedObject",
            type: "T.untyped",
            attribute: false,
            writer: "setRepresentedObject",
            compute: function compute_representedObject() {
              return this.arrayController || this.content;
            }
          },
          "header_view": {
            js: "headerView",
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue() {
              return null;
            }
          },
          "rows": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue() {
              return null;
            }
          },
          "allows_multiple_selection": {
            js: "allowsMultipleSelection",
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          }
        },
        methods: {
          "set_represented_object": {
            "arity": 1,
            "js": "setRepresentedObject"
          },
          "activate_selection": {
            "arity": 0,
            "js": "activateSelection"
          },
          "selected_object_did_change": {
            "arity": 2,
            "js": "selectedObjectDidChange"
          },
          "row_for": {
            "arity": 1,
            "js": "rowFor"
          },
          "view_did_load": {
            "arity": 0,
            "js": "viewDidLoad"
          },
          "awake_from_dom": {
            "arity": 0,
            "js": "awakeFromDOM"
          },
          "represented_object_did_change": {
            "arity": 2,
            "js": "representedObjectDidChange"
          },
          "arranged_objects_did_change": {
            "arity": 2,
            "js": "arrangedObjectsDidChange"
          },
          "selected_objects_did_change": {
            "arity": 2,
            "js": "selectedObjectsDidChange"
          },
          "become_first_responder": {
            "arity": 0,
            "js": "becomeFirstResponder"
          },
          "move_down": {
            "arity": 1,
            "js": "moveDown"
          },
          "move_up": {
            "arity": 1,
            "js": "moveUp"
          },
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "container": {
            "arity": 0
          },
          "container_view": {
            "arity": 0,
            "js": "containerView"
          },
          "row_elements": {
            "arity": 0,
            "js": "rowElements"
          },
          "row_element?": {
            "arity": 1,
            "js": "isRowElement"
          },
          "rows_are_views?": {
            "arity": 0,
            "js": "rowsAreViews"
          },
          "row_template": {
            "arity": 0,
            "js": "rowTemplate"
          },
          "make_row_element": {
            "arity": 1,
            "js": "makeRowElement"
          },
          "configure_row": {
            "arity": 2,
            "js": "configureRow"
          },
          "render_all": {
            "arity": 0,
            "js": "renderAll"
          },
          "attach_row": {
            "arity": 1,
            "js": "attachRow"
          },
          "clear_rows": {
            "arity": 0,
            "js": "clearRows"
          },
          "release_row": {
            "arity": 1,
            "js": "releaseRow"
          },
          "sync_selected_rows": {
            "arity": 0,
            "js": "syncSelectedRows"
          },
          "install_selection": {
            "arity": 0,
            "js": "installSelection"
          },
          "row_mouse_down": {
            "arity": 1,
            "js": "rowMouseDown"
          },
          "row_clicked": {
            "arity": 1,
            "js": "rowClicked"
          },
          "row_double_clicked": {
            "arity": 1,
            "js": "rowDoubleClicked"
          },
          "select_range": {
            "arity": 2,
            "js": "selectRange"
          }
        }
      },
      "Swill::Alert": {
        constructor: Swill__Alert,
        properties: {
          "message_text": {
            js: "messageText",
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          },
          "informative_text": {
            js: "informativeText",
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          },
          "icon": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "Warning";
            }
          },
          "button_template": {
            js: "buttonTemplate",
            type: "T.nilable(HTMLTemplateElement)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 0
          },
          "add_button": {
            "arity": 1,
            "js": "addButton"
          },
          "run": {
            "arity": 0
          },
          "choose": {
            "arity": 1
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          },
          "finish": {
            "arity": 1
          },
          "view_did_load": {
            "arity": 0,
            "js": "viewDidLoad"
          }
        }
      },
      "Swill::SystemAlert": {
        constructor: Swill__SystemAlert,
        properties: {},
        methods: {
          "initialize": {
            "arity": 0
          },
          "retry_action=": {
            "arity": 1,
            "js": "retryAction="
          },
          "required=": {
            "arity": 1
          },
          "choose": {
            "arity": 1
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          }
        }
      },
      "Swill::DevelopmentMonitor": {
        constructor: Swill__DevelopmentMonitor,
        properties: {},
        methods: {
          "initialize": {
            "arity": 2
          },
          "start": {
            "arity": 0
          },
          "stop": {
            "arity": 0
          },
          "running?": {
            "arity": 0,
            "js": "isRunning"
          },
          "poll": {
            "arity": 0
          }
        }
      },
      "Swill::ProblemReporter": {
        constructor: Swill__ProblemReporter,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          },
          "start": {
            "arity": 0
          },
          "stop": {
            "arity": 0
          },
          "report_error": {
            "arity": 1,
            "js": "reportError"
          },
          "report_rejection": {
            "arity": 1,
            "js": "reportRejection"
          },
          "report": {
            "arity": 3
          },
          "connection_changed": {
            "arity": 3,
            "js": "connectionChanged"
          },
          "revision_changed": {
            "arity": 1,
            "js": "revisionChanged"
          },
          "enqueue_notice": {
            "arity": 3,
            "js": "enqueueNotice"
          },
          "show_next": {
            "arity": 0,
            "js": "showNext"
          },
          "connection_restored": {
            "arity": 0,
            "js": "connectionRestored",
            "visibility": "private"
          },
          "require_reload": {
            "arity": 1,
            "js": "requireReload",
            "visibility": "private"
          },
          "connection_lost": {
            "arity": 0,
            "js": "connectionLost",
            "visibility": "private"
          },
          "button_titles": {
            "arity": 1,
            "js": "buttonTitles",
            "visibility": "private"
          }
        }
      }
    }
  };

  // build/ui/framework.mjs
  UIRuntime.install(meta);

  // rb/runtime/browser_api.mjs
  var registered2 = /* @__PURE__ */ new WeakSet();
  var isObject = (value) => value !== null && typeof value === "object";
  function assertDescriptorMap(value, declaration) {
    if (!isObject(value) || Array.isArray(value)) {
      throw new TypeError(`static ${declaration} must be an object`);
    }
  }
  function assertKeys(descriptor, allowed, declaration) {
    const unknown = Object.keys(descriptor).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new TypeError(`Unknown ${declaration} option: ${unknown[0]}`);
  }
  function defaultValue(name, descriptor) {
    if (!isObject(descriptor) || Array.isArray(descriptor)) {
      throw new TypeError(`Property ${name} must use a descriptor with default`);
    }
    assertKeys(descriptor, ["default"], `property ${name}`);
    if (!Object.hasOwn(descriptor, "default")) throw new TypeError(`Property ${name} is missing default`);
    const value = descriptor.default;
    if (typeof value === "function") {
      if (value.length !== 0) throw new TypeError(`Default factory for ${name} must accept no arguments`);
      return value;
    }
    if (value !== null && !["string", "number", "boolean", "bigint"].includes(typeof value)) {
      throw new TypeError(`Mutable default for ${name} must use a factory`);
    }
    return () => value;
  }
  function ownDeclaration(klass, name, fallback) {
    return Object.hasOwn(klass, name) ? klass[name] : fallback;
  }
  function declarationsFor(klass) {
    const properties = /* @__PURE__ */ Object.create(null);
    const methods = /* @__PURE__ */ Object.create(null);
    const names2 = /* @__PURE__ */ new Set();
    const declared = ownDeclaration(klass, "properties", {});
    assertDescriptorMap(declared, "properties");
    for (const [name, descriptor] of Object.entries(declared)) {
      if (name.length === 0) throw new TypeError("Property names must not be empty");
      properties[name] = { defaultValue: defaultValue(name, descriptor) };
      names2.add(name);
    }
    const outlets2 = ownDeclaration(klass, "outlets", {});
    assertDescriptorMap(outlets2, "outlets");
    for (const [name, descriptor] of Object.entries(outlets2)) {
      if (name.length === 0) throw new TypeError("Outlet names must not be empty");
      if (names2.has(name)) throw new TypeError(`Duplicate declaration: ${name}`);
      if (!isObject(descriptor) || Array.isArray(descriptor)) {
        throw new TypeError(`Outlet ${name} must use a descriptor`);
      }
      assertKeys(descriptor, ["optional"], `outlet ${name}`);
      if (Object.hasOwn(descriptor, "optional") && typeof descriptor.optional !== "boolean") {
        throw new TypeError(`Outlet ${name} optional must be boolean`);
      }
      properties[name] = { defaultValue: () => null, outlet: true, optional: descriptor.optional === true };
      names2.add(name);
    }
    const prototypeDescriptors = Object.getOwnPropertyDescriptors(klass.prototype);
    for (const [name, descriptor] of Object.entries(prototypeDescriptors)) {
      if (name === "constructor" || descriptor.get === void 0) continue;
      if (descriptor.set !== void 0) throw new TypeError(`Computed property ${name} cannot have a setter`);
      if (names2.has(name)) throw new TypeError(`Duplicate declaration: ${name}`);
      properties[name] = { compute: descriptor.get };
      names2.add(name);
    }
    for (const [name, descriptor] of Object.entries(prototypeDescriptors)) {
      if (name === "constructor" || typeof descriptor.value !== "function" || names2.has(name)) continue;
      methods[name] = { arity: descriptor.value.length, js: name };
      const changed = /^(.+)DidChange$/.exec(name)?.[1];
      if (changed) {
        for (const property of /* @__PURE__ */ new Set([changed, snakeCase(changed)])) {
          methods[`${property}_did_change`] ??= { arity: descriptor.value.length, js: name };
        }
      }
    }
    const actions = ownDeclaration(klass, "actions", []);
    if (!Array.isArray(actions)) throw new TypeError("static actions must be an array");
    const actionNames = /* @__PURE__ */ new Set();
    for (const name of actions) {
      if (typeof name !== "string" || name.length === 0) throw new TypeError("Action names must be non-empty strings");
      if (actionNames.has(name)) throw new TypeError(`Duplicate action: ${name}`);
      if (names2.has(name)) throw new TypeError(`Action conflicts with property: ${name}`);
      const descriptor = prototypeDescriptors[name];
      if (!descriptor || typeof descriptor.value !== "function") {
        throw new TypeError(`Missing action method: ${name}`);
      }
      if (descriptor.value.length > 2) throw new TypeError(`Action ${name} accepts more than two arguments`);
      actionNames.add(name);
    }
    return { properties, methods, restorations: restorationsFor(klass, declared) };
  }
  var snakeCase = (name) => name.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
  function restorationsFor(klass, declared) {
    const restorable = ownDeclaration(klass, "restorable", []);
    const entries = Array.isArray(restorable) ? restorable.map((path) => [path, path]) : (assertDescriptorMap(restorable, "restorable"), Object.entries(restorable));
    return entries.map(([path, key]) => {
      if (typeof path !== "string" || !path || typeof key !== "string" || !key) {
        throw new TypeError("Restorable paths and keys must be non-empty strings");
      }
      const sample = declared[path.split(".")[0]]?.default;
      const value = typeof sample === "function" ? void 0 : sample;
      const type = typeof value === "number" ? "Integer" : typeof value === "boolean" ? "T::Boolean" : "String";
      return { path, key, type };
    });
  }
  var framework = null;
  function register(name, klass) {
    if (arguments.length === 1) {
      klass = name;
      name = klass?.name;
    }
    if (typeof name === "string" && name.includes(".") && !name.includes("::")) name = name.replaceAll(".", "::");
    if (typeof klass !== "function" || !klass.prototype) throw new TypeError("Swill.register requires a class");
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new TypeError("Registered classes need a name");
    }
    if (registered2.has(klass)) throw new Error(`Class already registered: ${name}`);
    const parent = Object.getPrototypeOf(klass);
    if (!framework.roots.has(parent) && !registered2.has(parent)) {
      throw new Error(`Register the parent class before ${name}`);
    }
    const { properties, methods, restorations: restorations2 } = declarationsFor(klass);
    framework.Runtime.aliasInstalledJavaScriptNames(framework.publicNames);
    framework.Runtime.install({ classes: { [name]: { constructor: klass, properties, methods, restorations: restorations2 } } });
    registered2.add(klass);
    return klass;
  }
  function registerBundle(name, options = {}) {
    if (typeof name !== "string" || name.trim().length === 0) throw new TypeError("Bundles need a name");
    if (!isObject(options) || Array.isArray(options)) throw new TypeError("Swill.registerBundle options must be an object");
    assertKeys(options, ["base", "manifest", "main"], "registerBundle");
    const manifest = options.manifest ?? [];
    if (!Array.isArray(manifest) || manifest.some((path) => typeof path !== "string")) {
      throw new TypeError("manifest must be an array of paths");
    }
    let base = options.base ?? defaultBase();
    if (base && !base.endsWith("/")) base += "/";
    return framework.Bundle.register(name, base, manifest, {}, options.main ?? true);
  }
  function defaultBase() {
    const document2 = globalThis.document;
    if (!document2) return "";
    const script = document2.currentScript;
    return new URL(".", script?.src || document2.baseURI).href;
  }
  function unloadedCatalogs() {
    const bundle = framework.Bundle.main();
    if (!bundle) return [];
    return bundle.manifest.filter((path) => path.endsWith(".html") && bundle.loadedPath(path) == null).map((path) => bundle.loadResource(path.replace(/\.html$/, ""), "html"));
  }
  var starting = false;
  function start(options = {}) {
    const { Application } = framework;
    if (!isObject(options) || Array.isArray(options)) throw new TypeError("Swill.start options must be an object");
    assertKeys(options, ["root", "application", "development"], "start");
    const root = options.root ?? globalThis.document?.body;
    const ApplicationClass = options.application ?? Application;
    if (!root) throw new Error("Swill.start requires a root element");
    if (Application.isRunning()) throw new Error("A Swill application is already running");
    if (typeof ApplicationClass !== "function" || ApplicationClass !== Application && !(ApplicationClass.prototype instanceof Application)) {
      throw new TypeError("application must extend Swill.Application");
    }
    if (ApplicationClass !== Application && !registered2.has(ApplicationClass)) {
      throw new Error("Register the application class before starting it");
    }
    if (starting) throw new Error("A Swill application is already running");
    const application = new ApplicationClass();
    if (options.development) application.development = true;
    const launch = () => {
      starting = false;
      application.launch(root);
      root.ownerDocument?.defaultView?.addEventListener("pagehide", (event) => {
        if (!event.persisted) application.terminate();
      });
    };
    const catalogs = unloadedCatalogs();
    if (catalogs.length === 0) {
      launch();
    } else {
      starting = true;
      Promise.all(catalogs).then(launch, (error) => {
        starting = false;
        console.error("Swill could not load the application's templates", error);
      });
    }
    return application;
  }
  function install2(meta2) {
    return framework.Runtime.install(meta2);
  }
  function browserAPI(definitions, Runtime, names2 = {}, roots = []) {
    const classes2 = {};
    for (const [name, identifier] of Object.entries(names2)) {
      const klass = definitions[identifier];
      if (!klass) continue;
      const [space, member] = name.split(".");
      if (member) (classes2[space] ??= {})[member] = klass;
      else classes2[space] = klass;
    }
    for (const [name, value] of Object.entries(classes2)) {
      if (typeof value !== "function") classes2[name] = Object.freeze(value);
    }
    framework = {
      Runtime,
      Application: definitions.Swill__Application,
      Bundle: definitions.Swill__Bundle,
      publicNames: Object.fromEntries(Object.entries(names2).filter(([, identifier]) => definitions[identifier]).map(([name, identifier]) => [`Swill::${name.replaceAll(".", "::")}`, definitions[identifier]])),
      roots: new Set(roots.map((name) => definitions[names2[name]]).filter(Boolean))
    };
    return Object.freeze({ ...definitions, Runtime, install: install2, ...classes2, register, registerBundle, start });
  }

  // build/ui/browser.mjs
  if (globalThis.Swill) throw new Error("Framework already loaded");
  globalThis.Swill = browserAPI(framework_exports, UIRuntime, { "Object": "Swill__Object", "Swell": "Swill__Swell", "ArrayController": "Swill__ArrayController", "Controller": "Swill__Controller", "Application": "Swill__Application", "View": "Swill__View", "List": "Swill__Controller__List", "SortableList": "Swill__Controller__SortableList", "Editor": "Swill__Controller__Editor", "InlineEditor": "Swill__Controller__InlineEditor", "EditableList": "Swill__Controller__EditableList", "Control": "Swill__Control", "TextField": "Swill__Control__TextField", "Button": "Swill__Control__Button", "Select": "Swill__Control__Select", "CustomSelect": "Swill__Control__CustomSelect", "Segmented": "Swill__Control__Segmented", "ImageView": "Swill__Control__ImageView", "Alert": "Swill__Alert", "Bundle": "Swill__Bundle", "Image": "Swill__Image", "NotificationCenter": "Swill__NotificationCenter", "Wire": "Swill__Wire", "ValueTransformer": "Swill__ValueTransformer", "Model.Base": "Swill__Model__Base", "Model.Editable": "Swill__Model__Editable", "Model.Resource": "Swill__Model__Resource", "Model.Store": "Swill__Model__Store", "Model.Codec": "Swill__Model__Codec", "Model.PlainJSON": "Swill__Model__PlainJSON", "Model.JSONAPI": "Swill__Model__JSONAPI", "Model.Dataset": "Swill__Model__Dataset", "Model.Collection": "Swill__Model__Collection", "Model.ResultSet": "Swill__Model__ResultSet", "Distant.Object": "Swill__Distant__Object", "Distant.Client": "Swill__Distant__Client" }, ["Object", "ArrayController", "Controller", "Application", "View", "List", "SortableList", "Editor", "InlineEditor", "EditableList", "Control", "TextField", "Button", "Select", "CustomSelect", "ValueTransformer", "Model.Base", "Model.Resource", "Distant.Object"]);
  {
    const script = typeof document === "undefined" ? null : document.currentScript;
    const base = script && script.src ? new URL(".", script.src).href : "";
    Swill__Bundle.register("swill", base, ["Info.png", "NetworkLost.png", "Note.png", "Stop.png", "Warning.png", "bioplastic.css", "controls.html", "fonts/AtkinsonHyperlegibleNext-Italic.woff2", "fonts/AtkinsonHyperlegibleNext.woff2", "fonts/OFL.txt", "linear.css"], { "controls.html": '<template name="custom_select">\n  <button type="button" class="custom-select-button" tabindex="-1" outlet="button" data-action="button_clicked">\n    <span class="custom-select-trigger-icon" outlet="icon"></span>\n    <span class="custom-select-label" outlet="label"></span>\n  </button>\n  <div class="custom-select-popup" outlet="popup"></div>\n  <template outlet="option_template">\n    <button type="button" class="custom-select-option" tabindex="-1">\n      <span class="custom-select-icon"></span>\n      <span class="custom-select-option-text">\n        <span class="custom-select-option-label"></span>\n        <span class="custom-select-option-description"></span>\n      </span>\n    </button>\n  </template>\n</template>\n\n<template name="segmented">\n  <div class="segmented-options" outlet="segments"></div>\n  <template outlet="segment_template">\n    <button type="button" class="segmented-option" tabindex="-1"></button>\n  </template>\n</template>\n\n<template name="alert">\n  <dialog class="window alert">\n    <img class="alert-icon" klass="Swill::Control::ImageView" bind="icon" alt="">\n    <div class="alert-text">\n      <h2 bind="message_text"></h2>\n      <p bind="informative_text" bind-hidden="informative_text.empty?"></p>\n    </div>\n    <div class="actions"></div>\n    <template outlet="button_template">\n      <button type="button" klass="Swill::Control::Button" data-action="choose"></button>\n    </template>\n  </dialog>\n</template>\n' }, false);
  }
  if (typeof document !== "undefined") new Swill__Launcher().install(document);
})();
//# sourceMappingURL=swill-ui.js.map
