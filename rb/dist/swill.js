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
    slot.disposers.splice(0).forEach((dispose2) => dispose2());
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
    slot.disposers.splice(0).forEach((dispose2) => dispose2());
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
      slot.disposers.splice(0).forEach((dispose2) => dispose2());
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
      const dispose2 = subscribe(object, name, () => {
        if (active) callback(read(object, name));
      }, "observers");
      return () => {
        active = false;
        dispose2();
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
      for (const dispose2 of disposers) dispose2?.();
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

  // rb/runtime/message_pack.mjs
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  var Writer = class {
    constructor() {
      this.bytes = [];
    }
    byte(value) {
      this.bytes.push(value & 255);
    }
    integer(value, bytes) {
      for (let shift = (bytes - 1) * 8; shift >= 0; shift -= 8) this.byte(value / 2 ** shift);
    }
    integer64(value) {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setBigInt64(0, BigInt(value));
      this.raw(bytes);
    }
    raw(values) {
      this.bytes.push(...values);
    }
    result() {
      return Uint8Array.from(this.bytes);
    }
  };
  function writeString(writer, value) {
    const bytes = encoder.encode(value);
    if (bytes.length < 32) writer.byte(160 | bytes.length);
    else if (bytes.length < 256) {
      writer.byte(217);
      writer.byte(bytes.length);
    } else if (bytes.length < 65536) {
      writer.byte(218);
      writer.integer(bytes.length, 2);
    } else {
      writer.byte(219);
      writer.integer(bytes.length, 4);
    }
    writer.raw(bytes);
  }
  function writeValue(writer, value) {
    if (value == null) return writer.byte(192);
    if (value === false) return writer.byte(194);
    if (value === true) return writer.byte(195);
    if (typeof value === "string") return writeString(writer, value);
    if (typeof value === "number" && Number.isInteger(value)) {
      if (value >= 0 && value < 128) return writer.byte(value);
      if (value >= -32 && value < 0) return writer.byte(256 + value);
      if (value >= 0 && value < 256) {
        writer.byte(204);
        return writer.byte(value);
      }
      if (value >= 0 && value < 65536) {
        writer.byte(205);
        return writer.integer(value, 2);
      }
      if (value >= 0 && value <= 4294967295) {
        writer.byte(206);
        return writer.integer(value, 4);
      }
      if (value >= -128 && value < 0) {
        writer.byte(208);
        return writer.byte(value);
      }
      if (value >= -32768 && value < 0) {
        writer.byte(209);
        return writer.integer(65536 + value, 2);
      }
      if (value >= -2147483648 && value < 0) {
        writer.byte(210);
        return writer.integer(4294967296 + value, 4);
      }
      if (Number.isSafeInteger(value)) {
        writer.byte(value >= 0 ? 207 : 211);
        return writer.integer64(value);
      }
    }
    if (typeof value === "number") {
      writer.byte(203);
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, value);
      return writer.raw(bytes);
    }
    if (Array.isArray(value)) {
      if (value.length < 16) writer.byte(144 | value.length);
      else {
        writer.byte(220);
        writer.integer(value.length, 2);
      }
      value.forEach((item) => writeValue(writer, item));
      return;
    }
    if (value instanceof Uint8Array) {
      writer.byte(198);
      writer.integer(value.length, 4);
      writer.raw(value);
      return;
    }
    const entries = Object.entries(value);
    if (entries.length < 16) writer.byte(128 | entries.length);
    else {
      writer.byte(222);
      writer.integer(entries.length, 2);
    }
    for (const [key, item] of entries) {
      writeString(writer, key);
      writeValue(writer, item);
    }
  }
  var Reader = class {
    constructor(bytes) {
      this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      this.offset = 0;
    }
    byte() {
      return this.bytes[this.offset++];
    }
    integer(length2) {
      let value = 0;
      for (let index = 0; index < length2; index += 1) value = value * 256 + this.byte();
      return value;
    }
    string(length2) {
      const value = decoder.decode(this.bytes.subarray(this.offset, this.offset + length2));
      this.offset += length2;
      return value;
    }
    value() {
      const tag = this.byte();
      if (tag <= 127) return tag;
      if (tag >= 224) return tag - 256;
      if ((tag & 224) === 160) return this.string(tag & 31);
      if ((tag & 240) === 144) return this.array(tag & 15);
      if ((tag & 240) === 128) return this.map(tag & 15);
      switch (tag) {
        case 192:
          return null;
        case 194:
          return false;
        case 195:
          return true;
        case 204:
          return this.byte();
        case 205:
          return this.integer(2);
        case 206:
          return this.integer(4);
        case 207:
          return this.bigInteger(false);
        case 208: {
          const value = this.byte();
          return value > 127 ? value - 256 : value;
        }
        case 209: {
          const value = this.integer(2);
          return value > 32767 ? value - 65536 : value;
        }
        case 210: {
          const value = this.integer(4);
          return value > 2147483647 ? value - 4294967296 : value;
        }
        case 211:
          return this.bigInteger(true);
        case 203: {
          const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
          this.offset += 8;
          return view.getFloat64(0);
        }
        case 217:
          return this.string(this.byte());
        case 218:
          return this.string(this.integer(2));
        case 219:
          return this.string(this.integer(4));
        case 220:
          return this.array(this.integer(2));
        case 221:
          return this.array(this.integer(4));
        case 222:
          return this.map(this.integer(2));
        case 223:
          return this.map(this.integer(4));
        case 196:
          return this.binary(this.byte());
        case 197:
          return this.binary(this.integer(2));
        case 198:
          return this.binary(this.integer(4));
        default:
          throw new Error(`Unsupported MessagePack tag: 0x${tag.toString(16)}`);
      }
    }
    array(length2) {
      return Array.from({ length: length2 }, () => this.value());
    }
    map(length2) {
      const value = {};
      for (let index = 0; index < length2; index += 1) {
        const key = this.value();
        const item = this.value();
        Object.defineProperty(value, key, { value: item, enumerable: true, configurable: true, writable: true });
      }
      return value;
    }
    bigInteger(signed) {
      const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
      const value = signed ? view.getBigInt64(0) : view.getBigUint64(0);
      this.offset += 8;
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error("MessagePack integer exceeds JavaScript's safe range");
      return number;
    }
    binary(length2) {
      const value = this.bytes.slice(this.offset, this.offset + length2);
      this.offset += length2;
      return value;
    }
  };
  function pack(value) {
    const writer = new Writer();
    writeValue(writer, value);
    return writer.result();
  }
  function unpack(bytes) {
    const reader = new Reader(bytes);
    const value = reader.value();
    if (reader.offset !== reader.bytes.length) throw new Error("Trailing MessagePack data");
    return value;
  }

  // rb/runtime/data_values.mjs
  var brand = /* @__PURE__ */ Symbol.for("swill.data.type");
  function checkDate(value) {
    if (!/^\d{4}-\d\d-\d\d$/.test(value)) throw new TypeError(`Invalid date: ${value}`);
    const [year, month, day] = value.split("-").map(Number);
    const date = /* @__PURE__ */ new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new TypeError(`Invalid date: ${value}`);
    }
    return [year, month, day];
  }
  var CalendarDate = class _CalendarDate {
    constructor(iso) {
      const [year, month, day] = checkDate(iso);
      this.iso = iso;
      this.year = year;
      this.month = month;
      this.day = day;
      Object.defineProperty(this, brand, { value: "Date" });
      Object.freeze(this);
    }
    iso8601() {
      return this.iso;
    }
    equals(other) {
      return other instanceof _CalendarDate && this.iso === other.iso;
    }
    toString() {
      return this.iso;
    }
    valueOf() {
      return this.year * 1e4 + this.month * 100 + this.day;
    }
  };
  var Instant = class _Instant {
    constructor(iso, type = "DateTime") {
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(iso)) {
        throw new TypeError(`Invalid timestamp: ${iso}`);
      }
      const millis = Date.parse(iso);
      if (!Number.isFinite(millis)) throw new TypeError(`Invalid timestamp: ${iso}`);
      const micros = BigInt(millis) * 1000n + BigInt((iso.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6) || "0");
      const fraction = (micros % 1000000n + 1000000n) % 1000000n;
      this.iso = new Date(millis).toISOString().replace(/\.\d{3}Z$/, `.${String(fraction).padStart(6, "0")}+00:00`);
      this.micros = micros;
      Object.defineProperty(this, brand, { value: type });
      Object.freeze(this);
    }
    iso8601() {
      return this.iso;
    }
    toISOString() {
      return this.iso.replace(/(\.\d{3})000\+00:00$/, "$1Z").replace(/\+00:00$/, "Z");
    }
    equals(other) {
      return other instanceof _Instant && this.micros === other.micros;
    }
    toString() {
      return this.iso;
    }
    valueOf() {
      return Number(this.micros / 1000n);
    }
  };
  function decimalParts(text) {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(text));
    if (!match) throw new TypeError(`Invalid decimal: ${text}`);
    const fraction = match[3] ?? "";
    const coefficient = BigInt(`${match[1]}${match[2]}${fraction}`);
    return [coefficient, fraction.length];
  }
  var Decimal = class _Decimal {
    constructor(text) {
      [this.coefficient, this.scale] = decimalParts(text);
      Object.defineProperty(this, brand, { value: "BigDecimal" });
      Object.freeze(this);
    }
    toString() {
      let digits = (this.coefficient < 0n ? -this.coefficient : this.coefficient).toString();
      if (this.scale) digits = digits.padStart(this.scale + 1, "0").slice(0, -this.scale) + "." + digits.padStart(this.scale + 1, "0").slice(-this.scale);
      return (this.coefficient < 0n ? "-" : "") + digits;
    }
    // Implicit Number conversion would silently round exact database numerics.
    [Symbol.toPrimitive](hint) {
      if (hint === "string") return this.toString();
      throw new TypeError("BigDecimal requires explicit conversion or exact comparison");
    }
    equals(other) {
      return other instanceof _Decimal && compareDecimal(this, other) === 0;
    }
  };
  function compareDecimal(left, right) {
    const scale = Math.max(left.scale, right.scale);
    const a = left.coefficient * 10n ** BigInt(scale - left.scale);
    const b = right.coefficient * 10n ** BigInt(scale - right.scale);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  var TimeOfDay = class _TimeOfDay {
    constructor(iso) {
      if (!/^\d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(iso)) throw new TypeError(`Invalid time of day: ${iso}`);
      this.iso = iso;
      Object.defineProperty(this, brand, { value: "TimeOfDay" });
      Object.freeze(this);
    }
    toString() {
      return this.iso;
    }
    equals(other) {
      return other instanceof _TimeOfDay && this.iso === other.iso;
    }
  };
  var DataRange = class _DataRange {
    constructor(dbType, empty, first, last, excludeFirst, excludeLast) {
      Object.assign(this, { dbType, empty, first, last, excludeFirst, excludeLast });
      Object.defineProperty(this, brand, { value: "RangeValue" });
      Object.freeze(this);
    }
    equals(other) {
      return other instanceof _DataRange && this.dbType === other.dbType && this.empty === other.empty && this.excludeFirst === other.excludeFirst && this.excludeLast === other.excludeLast && (this.first?.equals?.(other.first) ?? this.first === other.first) && (this.last?.equals?.(other.last) ?? this.last === other.last);
    }
  };
  var DataInterval = class _DataInterval {
    constructor(months, days, microseconds) {
      Object.assign(this, { months, days, microseconds: String(microseconds) });
      Object.defineProperty(this, brand, { value: "Interval" });
      Object.freeze(this);
    }
    equals(other) {
      return other instanceof _DataInterval && this.months === other.months && this.days === other.days && this.microseconds === other.microseconds;
    }
  };
  function dataValueType(value) {
    return value?.[brand] ?? null;
  }
  function dataValuePayload(value) {
    switch (dataValueType(value)) {
      case "Date":
      case "DateTime":
      case "Time":
      case "TimeOfDay":
      case "BigDecimal":
        return value.toString();
      case "RangeValue":
        return [value.dbType, value.empty, value.first, value.last, value.excludeFirst, value.excludeLast];
      case "Interval":
        return [value.months, value.days, value.microseconds];
      default:
        return null;
    }
  }
  function dataDateFromISO(value) {
    return new CalendarDate(value);
  }
  function dataDateISO(value) {
    if (!(value instanceof CalendarDate)) throw new TypeError("Expected a calendar date");
    return value.iso8601();
  }
  function dataDateTimeFromISO(value) {
    return new Instant(value);
  }
  function dataTimeFromISO(value) {
    return new Instant(value, "Time");
  }
  function dataDecimalFromString(value) {
    return new Decimal(value);
  }
  function dataTimeOfDayFromISO(value) {
    return new TimeOfDay(value);
  }
  function dataRange(dbType, empty, first, last, excludeFirst, excludeLast) {
    return new DataRange(dbType, empty, first, last, excludeFirst, excludeLast);
  }
  function dataInterval(months, days, microseconds) {
    return new DataInterval(months, days, microseconds);
  }

  // rb/runtime/data_client.mjs
  var HANDSHAKE_TIMEOUT = 1e4;
  var configuration2 = null;
  var connection = null;
  var actorScope = null;
  var terminalError = null;
  var sequence = 0;
  var resetCoordinator = () => {
  };
  var connectionOpened = () => {
  };
  var connectionChanged = () => {
  };
  function registerDataLifecycle(reset, opened, changed = () => {
  }) {
    resetCoordinator = reset;
    connectionOpened = opened;
    connectionChanged = changed;
  }
  function configureData(url, schemaHash, webSocketFactory = (value) => new WebSocket(value)) {
    url = websocketURL(url);
    if (configuration2 && (configuration2.url !== url || configuration2.schemaHash !== schemaHash)) closeData();
    configuration2 = { url, schemaHash, webSocketFactory };
  }
  function websocketURL(value) {
    const url = new URL(value, globalThis.location?.href ?? "http://localhost/");
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new TypeError(`Unsupported data URL protocol: ${url.protocol}`);
    }
    return url.href;
  }
  function closeData() {
    const previous = connection;
    connection = null;
    if (previous) dispose(previous, transportError("Swill data connection closed"));
    actorScope = null;
    terminalError = null;
    resetCoordinator();
    connectionChanged("idle", "");
  }
  function dataConnected() {
    return connection?.ready === true;
  }
  function connectData() {
    if (terminalError) return Promise.reject(terminalError);
    if (!configuration2) return Promise.reject(new Error("Swill data transport is not configured"));
    if (connection) return connection.promise;
    const attempt = { socket: null, ready: false, pending: /* @__PURE__ */ new Map(), timer: null };
    attempt.promise = new Promise((resolve2, reject) => {
      attempt.resolve = resolve2;
      attempt.reject = reject;
    });
    connection = attempt;
    connectionChanged("connecting", "");
    attempt.timer = setTimeout(() => fail(attempt, transportError("Swill data connection timed out")), HANDSHAKE_TIMEOUT);
    try {
      const next = configuration2.webSocketFactory(configuration2.url);
      attempt.socket = next;
      next.binaryType = "arraybuffer";
      next.addEventListener("open", () => {
        if (connection !== attempt) return;
        sendRaw(attempt, { type: "HELLO", protocol_version: 3, schema_hash: configuration2.schemaHash }).then((message) => {
          if (connection !== attempt) return;
          if (message.type !== "WELCOME" || message.protocol_version !== 3 || message.schema_hash !== configuration2.schemaHash) {
            throw remoteError({ code: "schema_mismatch", message: "The application has changed. Reload to continue." });
          }
          if (actorScope !== null && actorScope !== message.actor_scope) {
            resetCoordinator();
            throw remoteError({ code: "actor_scope_changed", message: "Your session has changed. Reload to continue." });
          }
          actorScope = message.actor_scope;
          clearTimeout(attempt.timer);
          attempt.ready = true;
          connectionChanged("connected", "");
          connectionOpened();
          attempt.resolve(attempt);
        }).catch((error) => fail(attempt, error));
      });
      next.addEventListener("message", async (event) => {
        try {
          const bytes = event.data instanceof Blob ? new Uint8Array(await event.data.arrayBuffer()) : new Uint8Array(event.data);
          if (connection !== attempt) return;
          const message = unpack(bytes);
          const key = message.request_id ?? "HELLO";
          const waiter = attempt.pending.get(key);
          if (!waiter) return;
          attempt.pending.delete(key);
          if (message.type === "ERROR") waiter.reject(remoteError(message.error));
          else waiter.resolve(message);
        } catch (error) {
          fail(attempt, transportError("Invalid data response", error));
        }
      });
      next.addEventListener("close", () => fail(attempt, transportError("Swill data connection closed")));
      next.addEventListener("error", () => fail(attempt, transportError("Swill data connection failed")));
    } catch (error) {
      fail(attempt, transportError("Swill data connection failed", error));
    }
    return attempt.promise;
  }
  async function dataRequest(type, contents) {
    const attempt = await connectData();
    if (connection !== attempt || !attempt.ready) throw terminalError ?? transportError("Swill data connection closed");
    const message = await sendRaw(attempt, { ...contents, type, request_id: ++sequence });
    return { message, actor_scope: actorScope };
  }
  function fail(attempt, error) {
    if (connection !== attempt) return;
    connection = null;
    const reload = ["schema_mismatch", "actor_scope_changed"].includes(error.code);
    if (reload) terminalError = error;
    dispose(attempt, error);
    connectionChanged(reload ? "reload_required" : "disconnected", error.message);
  }
  function dispose(attempt, error) {
    clearTimeout(attempt.timer);
    attempt.ready = false;
    attempt.reject(error);
    for (const waiter of attempt.pending.values()) {
      waiter.reject(waiter.write && waiter.sent ? transportError("The connection was lost. The operation may have completed; check its result before trying again.", error, "outcome_unknown") : error);
    }
    attempt.pending.clear();
    attempt.socket?.close();
  }
  function sendRaw(attempt, message) {
    const bytes = pack(message);
    const key = message.type === "HELLO" ? "HELLO" : message.request_id;
    return new Promise((resolve2, reject) => {
      const waiter = { resolve: resolve2, reject, sent: false, write: !["HELLO", "QUERY", "GET"].includes(message.type) };
      attempt.pending.set(key, waiter);
      try {
        attempt.socket.send(bytes);
        waiter.sent = true;
      } catch (error) {
        fail(attempt, transportError("Swill data connection failed", error));
      }
    });
  }
  function transportError(message, cause, code = "connection_lost") {
    return Object.assign(new Error(message, { cause }), { code });
  }
  function remoteError(error) {
    return Object.assign(new Error(error?.message ?? "Remote operation failed"), {
      code: error?.code,
      details: error?.details
    });
  }
  function dataTime(value) {
    return value instanceof Date;
  }
  function dataTimeISO(value) {
    return value.toISOString();
  }
  function dataRecord(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  // rb/runtime/runtime.mjs
  var Runtime = {
    ...UIRuntime,
    // Remote data
    configureData,
    closeData,
    registerDataLifecycle,
    connectData,
    dataConnected,
    dataRequest,
    dataTime,
    dataTimeISO,
    dataTimeFromISO,
    dataRecord,
    dataValueType,
    dataValuePayload,
    dataDateFromISO,
    dataDateISO,
    dataDateTimeFromISO,
    dataDecimalFromString,
    dataTimeOfDayFromISO,
    dataRange,
    dataInterval,
    compareDecimal
  };

  // build/framework.mjs
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
    Swill__Control__CustomSelect: () => Swill__Control__CustomSelect,
    Swill__Control__ImageView: () => Swill__Control__ImageView,
    Swill__Control__Segmented: () => Swill__Control__Segmented,
    Swill__Control__Select: () => Swill__Control__Select,
    Swill__Control__TextField: () => Swill__Control__TextField,
    Swill__Controller: () => Swill__Controller,
    Swill__Controller__EditableList: () => Swill__Controller__EditableList,
    Swill__Controller__Editor: () => Swill__Controller__Editor,
    Swill__Controller__InlineEditor: () => Swill__Controller__InlineEditor,
    Swill__Controller__List: () => Swill__Controller__List,
    Swill__Controller__SortableList: () => Swill__Controller__SortableList,
    Swill__DOM: () => Swill__DOM,
    Swill__DateTransformer: () => Swill__DateTransformer,
    Swill__DevelopmentMonitor: () => Swill__DevelopmentMonitor,
    Swill__Distant__Client: () => Swill__Distant__Client,
    Swill__Distant__Fields: () => Swill__Distant__Fields,
    Swill__Distant__Fields_ClassMethods: () => Swill__Distant__Fields_ClassMethods,
    Swill__Distant__Object: () => Swill__Distant__Object,
    Swill__Image: () => Swill__Image,
    Swill__Launcher: () => Swill__Launcher,
    Swill__Model__Association: () => Swill__Model__Association,
    Swill__Model__AssociationCollection: () => Swill__Model__AssociationCollection,
    Swill__Model__Associations: () => Swill__Model__Associations,
    Swill__Model__Associations_ClassMethods: () => Swill__Model__Associations_ClassMethods,
    Swill__Model__Attributes: () => Swill__Model__Attributes,
    Swill__Model__Attributes_ClassMethods: () => Swill__Model__Attributes_ClassMethods,
    Swill__Model__Base: () => Swill__Model__Base,
    Swill__Model__Codec: () => Swill__Model__Codec,
    Swill__Model__Collection: () => Swill__Model__Collection,
    Swill__Model__Dataset: () => Swill__Model__Dataset,
    Swill__Model__DirtyTracking: () => Swill__Model__DirtyTracking,
    Swill__Model__Drafts: () => Swill__Model__Drafts,
    Swill__Model__Editable: () => Swill__Model__Editable,
    Swill__Model__Identity: () => Swill__Model__Identity,
    Swill__Model__Identity_ClassMethods: () => Swill__Model__Identity_ClassMethods,
    Swill__Model__JSONAPI: () => Swill__Model__JSONAPI,
    Swill__Model__PlainJSON: () => Swill__Model__PlainJSON,
    Swill__Model__Resource: () => Swill__Model__Resource,
    Swill__Model__ResultSet: () => Swill__Model__ResultSet,
    Swill__Model__Store: () => Swill__Model__Store,
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
    Swill__RowEdit: () => Swill__RowEdit,
    Swill__Swell: () => Swill__Swell,
    Swill__SystemAlert: () => Swill__SystemAlert,
    Swill__Templates: () => Swill__Templates,
    Swill__URLFragment: () => Swill__URLFragment,
    Swill__ValueTransformer: () => Swill__ValueTransformer,
    Swill__View: () => Swill__View,
    Swill__Window: () => Swill__Window,
    Swill__Wire: () => Swill__Wire
  });

  // build/framework.classes.mjs
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
        return this.retain(Runtime.observe(
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
        return Runtime.retain(this, disposer);
      }
      // Gives up a disposer ahead of `dealloc`.
      release(disposer) {
        return Runtime.release(this, disposer);
      }
      // Releases everything retained and leaves the observation graph. End of
      // life for the object.
      dealloc() {
        return Runtime.dealloc(this);
      }
      // Leaves the observation graph without ending: stored values are kept and
      // computed properties resubscribe on the next read.
      disconnect() {
        return Runtime.disconnect(this);
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
        return Runtime.isTruthy(child.hasAttribute("controller") || view && view.isOwnsContent()) ? callback(
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
        return Runtime.logicalAnd(
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
          return Runtime.logicalAnd(
            key !== "Enter" && key !== "Escape",
            () => key !== "Tab"
          );
      }
    }
    static ownedMatching(root, selector) {
      let found = Runtime.cast([], "T::Array[Element]");
      Swill__DOM.eachOwned(root, true, (element, _controller_root) => {
        if (Runtime.isTruthy((element === root || !element.hasAttribute("controller")) && element.matches(selector))) {
          return Runtime.append(found, element);
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [{ name: "element", kind: "req" }],
        keywords: [],
        keywordRest: null,
        block: "block"
      });
      let element = Runtime.argument(__swill_bound, "element");
      let block = Runtime.argument(__swill_bound, "block");
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
          value === true ? "" : Runtime.send(value, "to_s")
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
        value == null ? null : Runtime.send(value, "to_s")
      );
    }
    // Sets `data-name` to the string form of `value` and returns the wrapper.
    // A nil value removes the attribute; false is written as "false".
    // Supply the suffix, such as "value", as `name`. See `#data_value`.
    data(name, value) {
      return this.attr(
        `data-${name}`,
        value == null ? null : Runtime.send(value, "to_s")
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
      this._element.textContent = Runtime.send(value, "to_s");
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "type", kind: "req" },
          { name: "handler", kind: "req" }
        ],
        keywords: [{ name: "capture", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let type = Runtime.argument(__swill_bound, "type");
      let handler = Runtime.argument(__swill_bound, "handler");
      let capture = Runtime.argument(__swill_bound, "capture");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(capture))) capture = false;
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
      this._default = Runtime.cast(
        new _Swill__NotificationCenter(),
        "T.nilable(Swill::NotificationCenter)"
      );
      return Runtime.must(this._default);
    }
    constructor() {
      super();
      this._observers = Runtime.cast(
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
      Runtime.append(list, callback);
      return () => {
        let current = this._observers[name];
        if (current) {
          return this._observers[name] = current.filter((candidate) => !Runtime.isEqual(candidate, callback));
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
  var Swill__Wire = class _Swill__Wire extends Swill__Object {
    static default() {
      let wire = this._default;
      if (wire) return wire;
      this._default = Runtime.cast(
        new _Swill__Wire(),
        "T.nilable(Swill::Wire)"
      );
      return Runtime.must(this._default);
    }
    async getJSON(...__swill_arguments) {
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [{ name: "url", kind: "req" }],
        keywords: [{ name: "params", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let url = Runtime.argument(__swill_bound, "url");
      let params = Runtime.argument(__swill_bound, "params");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(params))) params = {};
      return await this.request(
        "GET",
        _Swill__Wire.urlWithParams(url, params)
      );
    }
    async requestJSON(...__swill_arguments) {
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "method", kind: "req" },
          { name: "url", kind: "req" }
        ],
        keywords: [{ name: "body", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let method = Runtime.argument(__swill_bound, "method");
      let url = Runtime.argument(__swill_bound, "url");
      let body = Runtime.argument(__swill_bound, "body");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(body))) body = null;
      return await this.request(method, url, Runtime.keywordArguments({
        body,
        content_type: "application/vnd.api+json"
      }));
    }
    async requestFormJSON(...__swill_arguments) {
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "method", kind: "req" },
          { name: "url", kind: "req" }
        ],
        keywords: [{ name: "body", kind: "keyreq" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let method = Runtime.argument(__swill_bound, "method");
      let url = Runtime.argument(__swill_bound, "url");
      let body = Runtime.argument(__swill_bound, "body");
      return await this.request(method, url, Runtime.keywordArguments({
        body: _Swill__Wire.encodeParams(body),
        content_type: "application/x-www-form-urlencoded"
      }));
    }
    async request(...__swill_arguments) {
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "method", kind: "req" },
          { name: "url", kind: "req" }
        ],
        keywords: [
          { name: "body", kind: "key" },
          { name: "content_type", kind: "key" }
        ],
        keywordRest: null,
        block: "__swill_block"
      });
      let method = Runtime.argument(__swill_bound, "method");
      let url = Runtime.argument(__swill_bound, "url");
      let body = Runtime.argument(__swill_bound, "body");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(body))) body = null;
      let content_type = Runtime.argument(__swill_bound, "content_type");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(content_type))) {
        content_type = null;
      }
      ;
      let request_url = this.resolveURL(url);
      let headers = Runtime.cast(
        { Accept: "application/vnd.api+json, application/json" },
        "T::Hash[String, String]"
      );
      let init = Runtime.cast(
        { method, headers },
        "T::Hash[String, T.untyped]"
      );
      if (body != null) {
        if (content_type != null) headers["Content-Type"] = content_type;
        init.body = content_type === "application/x-www-form-urlencoded" ? body : JSON.stringify(body);
      }
      ;
      let response = await fetch(request_url, init);
      if (!response.ok) {
        throw new Error(`${method} ${request_url} -> ${response.status}`);
      }
      ;
      if (response.status === 204) return null;
      return await response.json();
    }
    resolveURL(url) {
      let prefix = this.baseURL;
      if (Runtime.isEmpty(prefix) || url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      ;
      return url.startsWith("/") ? `${prefix}${url}` : `${prefix}/${url}`;
    }
    static urlWithParams(url, params) {
      let query = this.encodeParams(params);
      if (Runtime.isEmpty(query)) return url;
      let separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}${query}`;
    }
    static encodeParams(values) {
      let search = new URLSearchParams();
      Object.entries(values).forEach(([key, value]) => {
        if (value != null) search.set(key, `${value}`);
      });
      return search.toString();
    }
    static resourceURL(collection_url, id) {
      return `${collection_url}/${encodeURIComponent(id)}`;
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
      this._registry = Runtime.cast(
        {
          string: new _Swill__ValueTransformer(),
          number: new Swill__NumberTransformer(),
          boolean: new Swill__BooleanTransformer(),
          date: new Swill__DateTransformer()
        },
        "T.nilable(T::Hash[String, ValueTransformer])"
      );
      return Runtime.must(this._registry);
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
      let stripped = Runtime.strip(text);
      return Runtime.isEmpty(stripped) ? null : Runtime.toFloat(stripped);
    }
  };
  var Swill__BooleanTransformer = class extends Swill__ValueTransformer {
    format(value) {
      return Runtime.isTruthy(value) ? "true" : "false";
    }
    parse(text) {
      return text === "true" || text === "1" || text === "on";
    }
  };
  var Swill__DateTransformer = class extends Swill__ValueTransformer {
    format(value) {
      return value == null ? "" : Runtime.dataDateISO(value);
    }
    parse(text) {
      return Runtime.isEmpty(text) ? null : Runtime.dataDateFromISO(text);
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
        if (element.type === "checkbox") return Runtime.must(this.shared().checkbox);
        return Runtime.must(this.shared().field);
      }
      ;
      if (tag === "TEXTAREA") return Runtime.must(this.shared().field);
      if (tag === "SELECT") return Runtime.must(this.shared().select);
      return Runtime.must(this.shared().text);
    }
    static elementProperty() {
      return Runtime.must(this.shared().property);
    }
    static objectProperty() {
      return Runtime.must(this.shared().object);
    }
    static shared() {
      let known = this._shared;
      if (known) return known;
      this._shared = Runtime.cast(
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
      return Runtime.must(this._shared);
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
      return receiver.checked = Runtime.isTruthy(value);
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
      let property = Runtime.must(binding);
      if (property.startsWith("data-") || property.startsWith("aria-")) {
        if (Runtime.isTruthy(value == null || value === "" || value === false && property.startsWith("data-"))) {
          receiver.removeAttribute(property);
        } else {
          receiver.setAttribute(property, value);
        }
        ;
        return;
      }
      ;
      if (Runtime.isTruthy((property === "href" || property === "src") && value == null)) {
        receiver.removeAttribute(property);
        receiver[property] = "";
        return;
      }
      ;
      return receiver[property] = this.isBooleanProperty(property) ? Runtime.isTruthy(value) : value;
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
      return Runtime.write(receiver, Runtime.must(binding), value);
    }
    read(receiver, binding) {
      return Runtime.read(receiver, Runtime.must(binding));
    }
    isTwoWay(receiver, binding) {
      return true;
    }
    // A property takes the nil. Substituting "" would store a different value.
    nullPlaceholder() {
      return null;
    }
    listen(receiver, binding, callback) {
      return Runtime.observe(
        receiver,
        Runtime.must(binding),
        (value) => callback(value)
      );
    }
  };
  var Swill__Binding = class extends Object {
    static establish(destination, receiver, binding, object, key_path, transformer, placeholder, one_way) {
      let transforms = transformer != null && destination.isTransforms();
      let two_way = !one_way && destination.isTwoWay(receiver, binding);
      if (Runtime.isTruthy(two_way)) Runtime.assertWritablePath(object, key_path);
      let push = (_value) => {
        let value = Runtime.readPath(object, key_path);
        value = Runtime.isTruthy(transforms) ? Runtime.must(transformer).format(value) : (() => {
          return value == null ? placeholder : value;
        })();
        return destination.write(receiver, binding, value);
      };
      push(null);
      let release_push = Runtime.observePath(object, key_path, push);
      if (!Runtime.isTruthy(two_way)) return release_push;
      let release_pull = destination.listen(receiver, binding, (value) => Runtime.writePath(
        object,
        key_path,
        Runtime.isTruthy(transforms) ? Runtime.must(transformer).parse(value) : value
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
        let __swill_bound = Runtime.bindArguments(__swill_arguments, {
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
        let binding = Runtime.argument(__swill_bound, "binding");
        let to = Runtime.argument(__swill_bound, "to");
        let key_path = Runtime.argument(__swill_bound, "key_path");
        let null_placeholder = Runtime.argument(
          __swill_bound,
          "null_placeholder"
        );
        if (Runtime.isTruthy(Runtime.isOmittedArgument(null_placeholder))) {
          null_placeholder = null;
        }
        ;
        let transform = Runtime.argument(__swill_bound, "transform");
        if (Runtime.isTruthy(Runtime.isOmittedArgument(transform))) transform = null;
        this.unbind(binding);
        let transformer = transform != null ? Swill__ValueTransformer.named(transform) : null;
        if (Runtime.isTruthy(transform != null ? !transformer : transform)) {
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
        let dispose2 = this.objectBindings()[binding];
        if (!Runtime.isTruthy(dispose2)) return this;
        dispose2();
        Runtime.deleteKey(this.objectBindings(), binding);
        return this;
      }
      // Releases every binding on the object and returns it. A controller
      // calls this as it unloads.
      unbindAll() {
        Object.entries(this.objectBindings()).forEach(([_binding, dispose2]) => dispose2());
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
        if (Runtime.isTruthy(Runtime.logicalAnd(
          name === "content" && value != null,
          () => this.arrayController
        ))) throw new Error("Use either content or array_controller, not both");
        if (Runtime.isTruthy(name === "array_controller" && value)) {
          if (this.content != null) {
            throw new Error("Use either content or array_controller, not both");
          }
          ;
          let cursor = Runtime.cast(
            Runtime.cast(value, "T.nilable(Swill::ArrayController)"),
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
        if (this.isCollection(source)) source = Runtime.send(source, "records");
        let objects = Runtime.cast(
          Runtime.cast(
            Runtime.logicalOr(source, () => []),
            "T::Array[T.untyped]"
          ),
          "T::Array[T.untyped]"
        );
        let options = this.arrangementOptions;
        let leading = Runtime.isEqual(options.source, this.content) ? Runtime.cast(
          Runtime.logicalOr(options.leading, () => []),
          "T::Array[T.untyped]"
        ) : [];
        leading = leading.filter((object) => this.includesObject(object));
        objects = objects.filter((object) => Runtime.isTruthy(!leading.includes(object) && this.includesObject(object)));
        let key = Runtime.cast(options.key, "T.nilable(String)");
        if (key != null) {
          let direction = options.direction === "descending" ? -1 : 1;
          let values = Runtime.cast(
            objects.map((object) => [Runtime.read(object, key), object]),
            "T::Array[T::Array[T.untyped]]"
          );
          values = Runtime.sortWith(
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
        return Runtime.logicalAnd(
          objects != null && !Array.isArray(objects),
          () => Runtime.respondsTo(objects, "records")
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
        let records = this.isCollection(source) ? Runtime.send(
          source,
          "records"
        ) : source;
        let values = Runtime.cast(
          Runtime.logicalOr(records, () => []),
          "T::Array[T.untyped]"
        ).map((object) => Runtime.isEqual(object, original) ? replacement : object);
        return this.isCollection(source) ? Runtime.invoke(
          source,
          "replace",
          values
        ) : this.content = values;
      }
      compareSortValues(left, right) {
        if (Runtime.isTruthy(left == null && right == null)) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        if (Runtime.isTruthy(Runtime.dataValueType(left) === "BigDecimal" && Runtime.dataValueType(right) === "BigDecimal")) {
          return Runtime.compareDecimal(left, right);
        }
        ;
        if (Runtime.isTruthy(Runtime.logicalAnd(
          Runtime.isNumber(left),
          () => Runtime.isNumber(right)
        ))) return left - right;
        if (Runtime.isTruthy(Runtime.logicalAnd(
          Runtime.isBoolean(left),
          () => Runtime.isBoolean(right)
        ))) {
          return (Runtime.isTruthy(left) ? 1 : 0) - (Runtime.isTruthy(right) ? 1 : 0);
        }
        ;
        return Runtime.compareText(
          Runtime.send(left, "to_s"),
          Runtime.send(right, "to_s")
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
        let direction = Runtime.isTruthy(this.sortKey === key && this.sortDirection === "ascending") ? "descending" : "ascending";
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
        let requested = Runtime.cast(
          Runtime.logicalOr(this.selectionState.objects, () => []),
          "T::Array[T.untyped]"
        );
        let selected = requested.filter((object) => objects.includes(object));
        if (Runtime.isEmpty(selected)) {
          let identifier = Runtime.cast(
            Runtime.logicalOr(this.selectionState.id, () => null),
            "T.nilable(String)"
          );
          let found = identifier != null ? objects.find((object) => this.identifierFor(object) === identifier) : null;
          if (Runtime.isTruthy(found)) selected = [found];
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
        let objects = Runtime.cast([], "T::Array[T.untyped]");
        indexes.forEach((index) => {
          if (Runtime.isTruthy(index >= 0 && index < arranged.length)) {
            Runtime.append(objects, arranged[index]);
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
        if (Runtime.isTruthy(Runtime.isEmpty(this.selectedObjects) && !Runtime.isEmpty(this.arrangedObjects))) {
          return this.selectIndexes([0]);
        }
      }
      // Returns the arranged object at `index`, or nil when `index` is outside
      // the arranged content.
      objectAt(index) {
        let objects = this.arrangedObjects;
        return Runtime.isTruthy(index >= 0 && index < objects.length) ? objects[index] : null;
      }
      // Returns `object`'s `id` as a string, or nil when `object` is nil, has
      // no `id`, or its id is nil.
      identifierFor(object) {
        if (!Runtime.isTruthy(object)) return null;
        if (!Runtime.isTruthy(Runtime.respondsTo(object, "id"))) return null;
        let value = Runtime.send(object, "id");
        if (value == null) return null;
        return Runtime.send(value, "to_s");
      }
      // Returns the arranged object whose id is `identifier`, or nil when none
      // has it or `identifier` is nil or empty.
      objectWithId(identifier) {
        if (identifier == null || Runtime.isEmpty(identifier)) return null;
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
      return Runtime.performAction(target, name, sender, event);
    }
    // TODO: It's unclear to me that this is the right place to handle this bubbling.
    // The responder that would handle +name+, or nil.
    actionTarget(name) {
      if (Runtime.isTruthy(Runtime.respondsTo(this, name))) return this;
      return Runtime.nilable(this.nextResponder()?.actionTarget(name));
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
      this._bundles = Runtime.cast(
        bundles,
        "T.nilable(T::Hash[String, Bundle])"
      );
      bundles[name] = bundle;
      if (main) this._main = Runtime.cast(bundle, "T.nilable(Swill::Bundle)");
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
      return Runtime.uniq(Runtime.compact([this.main(), this.framework()]));
    }
    // Creates a bundle; a bundle's script calls Bundle.register instead.
    // +embedded+ holds contents already loaded, by path.
    constructor(name, base_url, manifest, embedded) {
      super();
      this._name = name;
      this._base_url = base_url;
      this._manifest = manifest;
      this._contents = Runtime.cast(
        Object.assign({}, embedded),
        "T::Hash[String, String]"
      );
      this._stems = Runtime.cast({}, "T::Hash[String, T::Array[String]]");
      manifest.forEach((path) => {
        let stem = _Swill__Bundle.stem(path);
        let paths = this._stems[stem];
        return paths ? Runtime.append(paths, path) : this._stems[stem] = [path];
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
      if (Runtime.send(paths, "length") > 1) {
        throw new Error(`Ambiguous resource ${name} in bundle ${this._name}: ${Runtime.invoke(
          paths,
          "join",
          ", "
        )}`);
      }
      ;
      return Runtime.send(paths, "first");
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
      let encoded = Runtime.split(path, "/").map((segment) => encodeURIComponent(segment)).join("/");
      return `${this._base_url}resources/${encodeURIComponent(this._name)}/${encoded}`;
    }
    async loadResource(name, extension) {
      let path = this.pathForResourceWithExtension(name, extension);
      if (path == null) {
        throw new Error(`No resource ${name} in bundle ${this._name}`);
      }
      ;
      let loaded = Runtime.fetch(this._contents, path, null);
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
      return path != null ? Runtime.fetch(this._contents, path, null) : null;
    }
    // The loaded text of the resource at +path+, or nil.
    loadedPath(path) {
      return Runtime.fetch(this._contents, path, null);
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
      let segments2 = Runtime.split(path, "/");
      let file = Runtime.must(segments2.pop());
      let parts = Runtime.split(file, ".");
      let name = Runtime.isTruthy(parts.length > 1 && !Runtime.isEmpty(Runtime.must(parts[0]))) ? parts.slice(
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
      let unloaded = Runtime.cast([], "T::Array[String]");
      let found = null;
      Swill__Bundle.searchOrder().forEach((bundle) => bundle.manifest.filter((path) => path.endsWith(".html")).forEach((path) => {
        if (Runtime.isTruthy(found)) return;
        let source = bundle.loadedPath(path);
        if (source != null) {
          found = Swill__Templates.find(
            Swill__Templates.catalog(document2, bundle, path, source),
            name
          );
          return found;
        } else {
          return Runtime.append(unloaded, `${bundle.name}/${path}`);
        }
      }));
      if (found) return found;
      let hint = Runtime.isEmpty(unloaded) ? "" : ` (not loaded yet: ${unloaded.join(", ")}; await Bundle#load_resource first)`;
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
        let template = Runtime.must(templates[index]);
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
      let url = Runtime.compact(urls)[0];
      return Runtime.isTruthy(url) ? new _Swill__Image(url) : null;
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
      this._owns_content = Runtime.cast(false, "T::Boolean");
      this._element = element;
      this._controller = Runtime.cast(null, "T.nilable(Swill::Controller)");
      this._superview = Runtime.cast(null, "T.nilable(Swill::View)");
      this._subviews = Runtime.cast([], "T::Array[View]");
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
      return Runtime.nilable(this._superview?.owner());
    }
    // Adopts `child` as a subview, releasing it from any previous superview,
    // and returns it. Adoption changes the view tree only; it does not move
    // or awaken elements.
    adoptSubview(child) {
      let previous = child.superview;
      Runtime.nilable(previous?.releaseSubview(child));
      child.assignSuperview(this);
      Runtime.append(this._subviews, child);
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
      return Runtime.nilable(superview?.releaseSubview(this));
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
      return Runtime.nilable(view?.controllerValue());
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "type", kind: "req" },
          { name: "handler", kind: "req" }
        ],
        keywords: [{ name: "capture", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let type = Runtime.argument(__swill_bound, "type");
      let handler = Runtime.argument(__swill_bound, "handler");
      let capture = Runtime.argument(__swill_bound, "capture");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(capture))) capture = false;
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
      if (!Runtime.isTruthy(active && this._element.contains(active))) return;
      let region = next_responder ? next_responder.focusRegion() : null;
      if (!Runtime.isTruthy(region && region.contains(active))) return active.blur();
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
      if (!Runtime.isTruthy(header && header.classList.contains("window-title"))) {
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
      if (Runtime.isTruthy(Runtime.logicalAnd(
        current,
        () => Runtime.respondsTo(current, "control_should_resign_first_responder")
      ))) {
        if (!Runtime.isTruthy(Runtime.invoke(
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
  var Swill__Control__TextField = class extends Swill__Control {
    // The text displayed by the input. Typing updates this property; assigning
    // it updates the input. The declaration default is ""; construction reads
    // the input's initial value.
    // Creates a control for `element`, reads its input's value, and listens for
    // input events. If the value is empty and a value attribute exists, uses
    // that attribute. With no input, leaves `value` at its default and registers
    // no listener. See `#input_element`.
    constructor(element) {
      super(element);
      let input = this.inputElement();
      if (!input) return;
      let initial = input.value;
      if (Runtime.isTruthy(Runtime.isEmpty(initial) && input.hasAttribute("value"))) {
        initial = Runtime.stringify(input.getAttribute("value"));
      }
      ;
      this.value = initial;
      let handler = (event) => this.inputDidChange(event);
      input.addEventListener("input", handler);
      this.retain(() => input.removeEventListener("input", handler));
    }
    // Invoked after `value` changes to update the input when one is present.
    // An override should call `super` to preserve the display update.
    valueDidChange(_previous, value) {
      let input = this.inputElement();
      if (Runtime.isTruthy(input && input.value !== value)) {
        return input.value = value;
      }
    }
    // Copies the input's value to `value` when `event` originated at that input.
    // Events from other elements leave the value unchanged.
    inputDidChange(event) {
      let input = this.inputElement();
      if (Runtime.isTruthy(input && event.target === input)) {
        return this.value = input.value;
      }
    }
    // Returns the wrapped element when it is an input, otherwise its first
    // input descendant. Returns nil when neither is present.
    inputElement() {
      return this._element.tagName === "INPUT" ? this._element : this._element.querySelector("input");
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
      if (!Runtime.isTruthy(name === "value" && Runtime.conforms(
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
  var Swill__Control__Select = class extends Swill__Control {
    // The strings used to create options after those present at construction.
    // Each string supplies an option's label and value. Assigning a new array
    // replaces the generated options and reapplies `value`. The default is [].
    // The selected value. User changes update it; assignment writes the
    // select's value. Replacing `options` preserves this property even when
    // no option matches. The declaration default is ""; construction reads
    // the element's initial value.
    // Creates a control for the select `element`, preserves its initial child
    // options, and reads its value. If the value is empty and a value attribute
    // exists, uses that attribute. Listens for selection changes until unload.
    constructor(element) {
      super(element);
      this._template_option_count = element.children.length;
      let initial = element.value;
      if (Runtime.isTruthy(Runtime.isEmpty(initial) && element.hasAttribute("value"))) {
        initial = Runtime.stringify(element.getAttribute("value"));
      }
      ;
      this.value = initial;
      let handler = (_event) => this.value = element.value;
      element.addEventListener("change", handler);
      this.retain(() => element.removeEventListener("change", handler));
    }
    // Removes generated options and releases the control's connections.
    // Options present at construction remain for a subsequent awakening.
    // An override should call `super` to preserve cleanup.
    unload() {
      let children = this._element.children;
      while (children.length > this._template_option_count) {
        children[this._template_option_count].remove();
      }
      ;
      return super.unload();
    }
    // Invoked after `options` changes to replace generated options and reapply
    // `value`. An override should call `super` to preserve rendering.
    optionsDidChange(_previous, values) {
      let children = this._element.children;
      while (children.length > this._template_option_count) {
        children[this._template_option_count].remove();
      }
      ;
      values.forEach((value) => {
        let option = this._element.ownerDocument.createElement("option");
        option.value = value;
        option.textContent = value;
        return this._element.appendChild(option);
      });
      return this.syncValue();
    }
    // Invoked after `value` changes to update the select element.
    // An override should call `super` to preserve the display update.
    valueDidChange(_previous, _value) {
      return this.syncValue();
    }
    // Assigns `value` to the select element when it differs from the displayed
    // value. The browser determines the selection when no option matches.
    syncValue() {
      if (this._element.value !== this.value) {
        return this._element.value = this.value;
      }
    }
  };
  var Swill__Control__CustomSelect = class extends Swill__Control {
    // :section: Configuring the Choice
    // Options, selection, and the elements supplied by the template.
    // The option hashes, with "value" and "label" entries and optional
    // "description" and "icon" entries. Values are compared as strings.
    // Assigning the array rebuilds the list and preserves `value`.
    // The default is [].
    // The chosen option's value as a string. Assignment updates the label,
    // icon, and selected state without dispatching input or change events.
    // An unmatched value leaves the button label empty. The default is "".
    // See `#selected_option` and `#choose`.
    // The view wrapping the button that opens and closes the popup.
    // Connected during template loading; nil before it is connected.
    // The view displaying the selected option's icon in the button.
    // Connected during template loading; nil before it is connected.
    // The view displaying the selected option's label in the button.
    // Connected during template loading; nil before it is connected.
    // The view containing the option list. Connected during template loading;
    // nil before it is connected. See `#open` and `#close`.
    // The template cloned for each option. Connected during template loading;
    // nil before it is connected.
    // Creates the control, loads its template, and installs its event handlers.
    // The popup is initially closed.
    constructor(element) {
      super(element);
      this._open = Runtime.cast(false, "T::Boolean");
      this._document_pointer_down = (event) => this.documentPointerDown(event);
      this.installChrome();
      let choices = Runtime.must(this.popup).element;
      let handler = (event) => this.optionClicked(event);
      this.retain(Swill__Swell.$index(choices).listen("click", handler));
      this.renderOptions();
      this.applyOpen(false);
    }
    // :section: Handling Changes and Events
    // Responding to property changes, keys, and pointer events.
    // Invoked after `options` changes to rebuild the popup and update the
    // button. An override should call `super` to preserve rendering.
    optionsDidChange(_previous, _options) {
      return this.renderOptions();
    }
    // Invoked after `value` changes to update the button and selected option.
    // An override should call `super` to preserve these updates.
    valueDidChange(_previous, _value) {
      this.syncButton();
      return this.syncSelectedOption();
    }
    // Invoked for Escape. Closes an open popup and prevents the default event
    // behavior. With the popup closed, passes the event to `super`.
    cancelOperation(event) {
      if (!this._open) return super.cancelOperation(event);
      event.preventDefault();
      return this.close();
    }
    // Enter toggles the popup.
    insertNewline(event) {
      event.preventDefault();
      return this.toggle();
    }
    // Down chooses the next option while the popup is open; choosing closes
    // it. With the popup closed, Down goes up the responder chain.
    moveDown(event) {
      if (!this._open) return super.moveDown(event);
      event.preventDefault();
      return this.moveSelection(1);
    }
    // Up chooses the previous option while the popup is open, and otherwise
    // goes up the responder chain.
    moveUp(event) {
      if (!this._open) return super.moveUp(event);
      event.preventDefault();
      return this.moveSelection(-1);
    }
    // Space toggles the popup, as Enter does. Other keys pass to `super`.
    keyDown(event) {
      if (event.key !== " ") return super.keyDown(event);
      event.preventDefault();
      return this.toggle();
    }
    // Loads the custom select template and makes the root focusable.
    // Installs handlers for closing the popup when focus or a pointer
    // press moves outside the control. Called during construction.
    installChrome() {
      let root = this._element;
      Swill__Swell.$index(this._element).addClass("custom-select");
      this.ensureFocusable();
      this.loadTemplate("custom_select");
      let focus_handler = (event) => this.focusOut(event);
      this.retain(Swill__Swell.$index(root).listen(
        "focusout",
        focus_handler
      ));
      return this.retain(() => root.ownerDocument.removeEventListener(
        "pointerdown",
        this._document_pointer_down
      ));
    }
    // Toggles the popup for a pointer click. Ignores clicks with event detail
    // zero; keyboard activation is handled by `#insert_newline` and `#key_down`.
    buttonClicked(_sender, event) {
      if (event.detail !== 0) return this.toggle();
    }
    // Closes the popup when focus leaves the control or has no next element.
    focusOut(event) {
      let next_element = event.relatedTarget;
      if (next_element == null || !this._element.contains(next_element)) {
        return this.close();
      }
    }
    // Closes the popup when the pointer press occurs outside the control.
    documentPointerDown(event) {
      if (!this._element.contains(event.target)) return this.close();
    }
    // :section: Presenting Options
    // Displaying labels, icons, descriptions, and selected state.
    // Rebuilds the option rows and updates the button and selected state.
    // An icon name adds the class "icon-name". A nil description or icon hides
    // its corresponding element.
    renderOptions() {
      let container = Runtime.must(this.popup).element;
      container.replaceChildren();
      this.options.forEach((option) => {
        let row = this.cloneTemplate(Runtime.must(this.optionTemplate));
        Swill__Swell.$index(row).data("value", this.optionValue(option)).toggleClassWithOn(
          "has-icon",
          option.icon != null
        );
        let icon_name = option.icon;
        let icon_element = Runtime.must(row.querySelector(".custom-select-icon"));
        icon_element.hidden = icon_name == null;
        if (Runtime.isTruthy(icon_name)) {
          icon_element.classList.add(`icon-${icon_name}`);
        }
        ;
        Swill__Swell.$index(row).findBang(".custom-select-option-label").text(option.label);
        Swill__Swell.$index(row).findBang(".custom-select-option-description").text(option.description).prop(
          "hidden",
          option.description == null
        );
        return container.appendChild(row);
      });
      this.syncButton();
      return this.syncSelectedOption();
    }
    // Chooses the value of the clicked option within the popup.
    // Clicks outside an option leave the value unchanged. See `#choose`.
    optionClicked(event) {
      let row = event.target.closest(".custom-select-option");
      if (Runtime.isTruthy(row && Runtime.must(this.popup).element.contains(row))) {
        return this.choose(Runtime.must(Swill__Swell.$index(row).dataValue("value")));
      }
    }
    // Returns the first option whose string value equals `value`, or nil
    // when none matches.
    selectedOption() {
      return this.options.find((option) => this.optionValue(option) === this.value);
    }
    // Updates the button label and icon from `#selected_option`. With no
    // matching option, clears the label and hides the icon.
    syncButton() {
      let option = this.selectedOption();
      let icon_name = option ? option.icon : null;
      Runtime.must(this.icon).element.setAttribute(
        "class",
        Runtime.isTruthy(icon_name) ? `custom-select-trigger-icon icon-${icon_name}` : "custom-select-trigger-icon"
      );
      Runtime.must(this.icon).element.hidden = icon_name == null;
      Runtime.must(this.button).element.classList.toggle(
        "has-icon",
        icon_name != null
      );
      return Runtime.must(this.label).element.textContent = option ? Runtime.send(
        option.label,
        "to_s"
      ) : "";
    }
    // Marks the option row matching `value` with the `selected` class.
    syncSelectedOption() {
      Runtime.must(this.popup).element.querySelectorAll(".custom-select-option").forEach((row) => {
        let dom = Swill__Swell.$index(row);
        return dom.toggleClassWithOn(
          "selected",
          dom.dataValue("value") === this.value
        );
      });
      return this.updateAccessibility();
    }
    // A combobox whose popup is a list box of options, one of them selected.
    // The icons are decoration.
    updateAccessibility() {
      super.updateAccessibility();
      Swill__Swell.$index(this._element).attr("role", "combobox").aria(
        "haspopup",
        "listbox"
      ).aria("expanded", this._open);
      Swill__Swell.$index(Runtime.must(this.button).element).aria(
        "expanded",
        this._open
      );
      Swill__Swell.$index(Runtime.must(this.icon).element).aria(
        "hidden",
        true
      );
      let list = Runtime.must(this.popup).element;
      list.setAttribute("role", "listbox");
      return list.querySelectorAll(".custom-select-option").forEach((row) => {
        let dom = Swill__Swell.$index(row);
        dom.attr("role", "option").aria(
          "selected",
          row.classList.contains("selected")
        );
        return dom.findBang(".custom-select-icon").aria("hidden", true);
      });
    }
    // :section: Opening and Choosing
    // Controlling popup visibility and choosing a value.
    // Opens a closed popup or closes an open popup. See `#open` and `#close`.
    toggle() {
      return this._open ? this.close() : this.open();
    }
    // Opens the popup and begins listening for pointer presses outside the
    // control. Does nothing when already open. See `#close`.
    open() {
      if (!this._open) return this.applyOpen(true);
    }
    // Closes the popup and stops listening for outside pointer presses.
    // Does nothing when already closed. See `#open`.
    close() {
      if (this._open) return this.applyOpen(false);
    }
    // Sets popup visibility and the root's open class from `open`. Updates the document listener for outside pointer presses.
    applyOpen(open) {
      this._open = open;
      Swill__Swell.$index(this._element).toggleClassWithOn("open", open);
      Swill__Swell.$index(Runtime.must(this.popup).element).prop(
        "hidden",
        !open
      );
      this.updateAccessibility();
      let document2 = this._element.ownerDocument;
      return open ? document2.addEventListener(
        "pointerdown",
        this._document_pointer_down
      ) : document2.removeEventListener(
        "pointerdown",
        this._document_pointer_down
      );
    }
    // Chooses the option `delta` positions from the current selection,
    // wrapping at either end. Chooses the first option when no value matches,
    // and does nothing when there are no options. See `#choose`.
    moveSelection(delta) {
      if (Runtime.isEmpty(this.options)) return;
      let current = -1;
      this.options.forEach((option, index2) => {
        if (this.optionValue(option) === this.value) current = index2;
      });
      let index = current < 0 ? 0 : Runtime.modulo(
        current + delta,
        this.options.length
      );
      return this.choose(this.optionValue(Runtime.must(this.options[index])));
    }
    // Closes the popup and assigns `next_value`. If the value changes,
    // dispatches bubbling input and change events. Accepts a string even when
    // no option matches; assign `value` directly to update selection without
    // dispatching DOM events.
    choose(next_value) {
      this.close();
      if (this.value === next_value) return;
      this.value = next_value;
      this._element.dispatchEvent(new Event("input", { bubbles: true }));
      return this._element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Returns the string form of the option's "value" entry, or an empty
    // string when it is nil.
    optionValue(option) {
      return Runtime.send(option.value, "to_s");
    }
  };
  var Swill__Control__Segmented = class extends Swill__Control {
    // :section: Configuring the Choice
    // Options, selection, and availability.
    // The option hashes, with "value" and "label" entries. Values are compared
    // as strings. Assigning the array rebuilds the buttons and preserves
    // `value`. The default is [].
    // The chosen option's value as a string. Assignment updates selection and
    // focusability without dispatching input or change events. An unmatched
    // value leaves all buttons unchecked. The default is "". See `#choose`.
    // Whether the control rejects choices and keyboard input. When true, its
    // buttons are disabled and removed from the tab order. The default is false.
    // The view containing the option buttons, connected by the segmented
    // template during construction. It is nil until the template is loaded.
    // The template cloned for each option button, connected during
    // construction. It is nil until the segmented template is loaded.
    // Creates the control, loads the segmented template, and listens for clicks.
    // Sets the root's class to include "segmented".
    constructor(element) {
      super(element);
      Swill__Swell.$index(element).addClass("segmented");
      this.loadTemplate("segmented");
      let handler = (event) => this.segmentClicked(event);
      this.retain(Swill__Swell.$index(element).listen("click", handler));
      this.renderOptions();
    }
    // :section: Updating the Presentation
    // Rebuilding buttons and reflecting changes in control state.
    // Invoked after `options` changes to rebuild the buttons. An override
    // should call `super` to preserve rendering.
    optionsDidChange(_previous, _options) {
      return this.renderOptions();
    }
    // Invoked after `value` changes to update checked state and the tab order.
    // An override should call `super` to preserve these updates.
    valueDidChange(_previous, _value) {
      return this.syncSelection();
    }
    // Invoked after `disabled` changes to update button availability and the
    // tab order. An override should call `super` to preserve these updates.
    disabledDidChange(_previous, _disabled) {
      return this.syncSelection();
    }
    // Replaces the buttons with one per option and updates their selection
    // state. If focus was inside the buttons, moves it to the selected button
    // or the first button when no option matches.
    renderOptions() {
      let container = Runtime.must(this.segments).element;
      let focused = container.contains(this._element.ownerDocument.activeElement);
      container.replaceChildren();
      this.options.forEach((option) => {
        let button = this.cloneTemplate(Runtime.must(this.segmentTemplate));
        Swill__Swell.$index(button).text(option.label).data(
          "value",
          Runtime.send(option.value, "to_s")
        );
        return container.appendChild(button);
      });
      this.syncSelection();
      if (focused) return this.focusSelection();
    }
    // Updates each button's checked state, as the `checked` class, its
    // disabled state, and its tabindex. The selected button, or the first when
    // no option matches, gets tabindex zero when enabled.
    syncSelection() {
      let buttons = Runtime.must(this.segments).element.children;
      let selected = this.options.find((option) => Runtime.send(option.value, "to_s") === this.value);
      let index = 0;
      while (index < buttons.length) {
        let button = Runtime.must(buttons[index]);
        let dom = Swill__Swell.$index(button);
        let checked = dom.dataValue("value") === this.value;
        dom.toggleClassWithOn("checked", checked);
        button.setAttribute(
          "tabindex",
          Runtime.isTruthy(!this.disabled && (checked || !selected && index === 0)) ? "0" : "-1"
        );
        button.disabled = this.disabled;
        index++;
      }
      ;
      return this.updateAccessibility();
    }
    // A radio group of radio buttons, each checked or not.
    updateAccessibility() {
      super.updateAccessibility();
      Swill__Swell.$index(this._element).attr("role", "radiogroup").aria(
        "disabled",
        this.disabled
      );
      let buttons = Runtime.must(this.segments).element.children;
      let index = 0;
      while (index < buttons.length) {
        let button = Runtime.must(buttons[index]);
        Swill__Swell.$index(button).attr("role", "radio").aria(
          "checked",
          button.classList.contains("checked")
        );
        index++;
      }
    }
    // :section: Choosing and Focusing
    // Selecting an option from a click, a key event, or an explicit call.
    // Chooses the value of the clicked radio button within this control.
    // Clicks outside a radio button leave the value unchanged. See `#choose`.
    segmentClicked(event) {
      let button = event.target.closest(".segmented-option");
      if (Runtime.isTruthy(button && this._element.contains(button))) {
        return this.choose(Runtime.must(Swill__Swell.$index(button).dataValue("value")));
      }
    }
    // Left and Right move focus to the previous and next segment, wrapping at
    // either end, without choosing it; Space and Enter press the focused
    // native button, which chooses. Up and Down are not the control's, and
    // go up the responder chain. A disabled or empty control passes these
    // keys on too.
    moveLeft(event) {
      if (!this.isMovable()) return super.moveLeft(event);
      return this.focusAdjacent(event, -1);
    }
    // Right moves focus to the next segment.
    moveRight(event) {
      if (!this.isMovable()) return super.moveRight(event);
      return this.focusAdjacent(event, 1);
    }
    // Home moves focus to the first segment.
    moveToBeginningOfDocument(event) {
      if (!this.isMovable()) return super.moveToBeginningOfDocument(event);
      return this.focusSegmentAt(event, 0);
    }
    // End moves focus to the last segment.
    moveToEndOfDocument(event) {
      if (!this.isMovable()) return super.moveToEndOfDocument(event);
      return this.focusSegmentAt(
        event,
        Runtime.must(this.segments).element.children.length - 1
      );
    }
    // Whether the arrows, Home and End move among the segments: the control
    // is enabled and has some.
    isMovable() {
      return !this.disabled && Runtime.must(this.segments).element.children.length > 0;
    }
    // Moves focus +delta+ segments from the focused one, or from the
    // chosen one when focus is elsewhere, wrapping.
    focusAdjacent(event, delta) {
      let buttons = Runtime.must(this.segments).element.children;
      let active = this._element.ownerDocument.activeElement;
      let current = Runtime.cast(-1, "Integer");
      let chosen = Runtime.cast(0, "Integer");
      let index = 0;
      while (index < buttons.length) {
        let button = Runtime.must(buttons[index]);
        if (button === active) current = index;
        if (button.classList.contains("checked")) chosen = index;
        index++;
      }
      ;
      return this.focusSegmentAt(event, Runtime.modulo(
        (current < 0 ? chosen : current) + delta,
        buttons.length
      ));
    }
    // Focuses the segment at +index+ and gives it the control's tab stop,
    // leaving the choice alone.
    focusSegmentAt(event, index) {
      let buttons = Runtime.must(this.segments).element.children;
      event.preventDefault();
      let position = 0;
      while (position < buttons.length) {
        Runtime.must(buttons[position]).setAttribute(
          "tabindex",
          position === index ? "0" : "-1"
        );
        position++;
      }
      ;
      return Swill__DOM.focus(Runtime.must(buttons[index]));
    }
    // Returns the button with tabindex zero, or nil when no button has a tab
    // stop. See `#focus_selection`.
    firstFocusableElement() {
      return Runtime.must(this.segments).element.querySelector('[tabindex="0"]');
    }
    // Returns whether the control is enabled and has at least one option.
    acceptsFirstResponder() {
      return !this.disabled && !Runtime.isEmpty(this.options);
    }
    // Focuses the button returned by `#first_focusable_element` without
    // scrolling. Does nothing when there is no such button.
    focusSelection() {
      let button = this.firstFocusableElement();
      if (button) return Swill__DOM.focus(button);
    }
    // Assigns `next_value` and dispatches bubbling input and change events.
    // Does nothing when disabled or when the value is unchanged. Accepts a
    // string even when no option matches; assign `value` directly to update
    // selection without dispatching DOM events.
    choose(next_value) {
      if (this.disabled || this.value === next_value) return;
      this.value = next_value;
      this._element.dispatchEvent(new Event("input", { bubbles: true }));
      return this._element.dispatchEvent(new Event("change", { bubbles: true }));
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
      return Runtime.nilable(this._view.superview?.owner());
    }
    // Returns the controllers rooted directly within this region, in document
    // order; an empty array when there are none.
    childControllers() {
      let found = Runtime.cast([], "T::Array[Controller]");
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
        return controller ? Runtime.append(found, controller) : this.collectChildControllers(
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
      let disposers = Runtime.cast([], "T::Array[T.proc.void]");
      this.propertiesIn(controller, prefix, root, disposers);
      this.regionIn(controller, prefix, root, disposers);
      controller.retain(this.releasing(disposers));
      return controller;
    }
    static establishIn(element, object) {
      let disposers = Runtime.cast([], "T::Array[T.proc.void]");
      if (element.hasAttribute("bind")) {
        Runtime.append(disposers, this.connect(object, element, null));
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
            Runtime.append(disposers, this.connect(object, child, prefix));
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
        let property = Runtime.must(Runtime.slice(name, 5, name.length));
        return Runtime.append(disposers, this.connectProperty(
          object,
          prefix,
          element,
          property,
          Runtime.must(element.getAttribute(name))
        ));
      });
    }
    static releasing(disposers) {
      return () => disposers.forEach((dispose2) => dispose2());
    }
    static resolvePath(prefix, path) {
      if (path[0] === "@") {
        return Runtime.logicalOr(
          Runtime.slice(path, 1, path.length),
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
        Runtime.must(element.getAttribute("bind"))
      );
      let transformer = this.transformerFor(element);
      let view = element.__swill_view__;
      let child = view ? view.controllerValue() : null;
      if (child) return this.connectRepresentedObject(object, child, path);
      if (view instanceof Swill__Control) {
        return this.connectControl(
          object,
          Runtime.cast(view, "Swill::Control"),
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "element", kind: "req" },
          { name: "controller", kind: "req" }
        ],
        keywords: [{ name: "include_root", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let element = Runtime.argument(__swill_bound, "element");
      let controller = Runtime.argument(__swill_bound, "controller");
      let include_root = Runtime.argument(__swill_bound, "include_root");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(include_root))) {
        include_root = true;
      }
      ;
      let disposers = Swill__DOM.ownedMatching(element, "[data-action]").map((target) => Runtime.isTruthy(target === element && !include_root) ? () => null : this.connect(
        target,
        controller
      ));
      return () => disposers.forEach((dispose2) => dispose2());
    }
    static connect(element, controller) {
      let event_name, action_name;
      if (element.__swill_action__) return () => null;
      let attribute = element.getAttribute("data-action");
      let specification = attribute != null ? Runtime.strip(attribute) : "";
      if (Runtime.isEmpty(specification)) return () => null;
      if (specification.includes(":")) {
        let parts = Runtime.split(specification, ":");
        event_name = Runtime.must(parts[0]);
        action_name = Runtime.must(parts[1]);
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
      let declared = Runtime.cast(
        Runtime.outlets(controller),
        "T::Array[T.untyped]"
      );
      if (Runtime.isEmpty(declared)) return controller;
      let by_name = Runtime.cast({}, "T::Hash[String, T.untyped]");
      declared.forEach((descriptor) => by_name[Runtime.send(descriptor, "name")] = descriptor);
      let connected = Runtime.cast({}, "T::Hash[String, Element]");
      this.candidates(root).forEach((element) => {
        let name = Runtime.must(element.getAttribute("outlet"));
        if (!Runtime.isTruthy(by_name[name])) {
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
        return Runtime.write(
          controller,
          name,
          this.valueFor(controller, by_name[name], element)
        );
      });
      declared.forEach((descriptor) => {
        let name = Runtime.send(descriptor, "name");
        if (Runtime.isTruthy(!Runtime.isTruthy(Runtime.send(
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
      if (!Runtime.isEmpty(similar)) {
        message += `. Did you mean ${similar.join(" or ")}?`;
      }
      ;
      let known = Runtime.isEmpty(declared) ? "none" : declared.join(", ");
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
      return Runtime.logicalOr(
        Runtime.cast(Runtime.nameOf(controller), "T.nilable(String)"),
        () => "the application"
      );
    }
    static describe(element) {
      let attributes = ["controller", "klass", "outlet", "id"].filter((name) => element.hasAttribute(name)).map((name) => ` ${name}="${element.getAttribute(name)}"`);
      return `<${Runtime.downcase(element.tagName)}${attributes.join("")}>`;
    }
    static regionOwner(element, root) {
      let current = element.parentElement;
      while (current && current !== root) {
        let view = current.__swill_view__;
        if (Runtime.isTruthy(current.hasAttribute("controller") || view && view.isOwnsContent())) {
          return `${this.describe(current)}'s region`;
        }
        ;
        current = current.parentElement;
      }
      ;
      return "another region";
    }
    static similarNames(name, declared) {
      let folded = Runtime.split(Runtime.downcase(name), "_").join("");
      let limit = name.length > 3 ? 2 : 1;
      return declared.filter((candidate) => Runtime.split(Runtime.downcase(candidate), "_").join("") === folded || this.editDistance(
        name,
        candidate
      ) <= limit);
    }
    static editDistance(a, b) {
      let previous = Runtime.cast([], "T::Array[Integer]");
      let column = 0;
      while (column <= b.length) {
        Runtime.append(previous, column);
        column++;
      }
      ;
      let row = 1;
      while (row <= a.length) {
        let current = Runtime.cast([row], "T::Array[Integer]");
        column = 1;
        while (column <= b.length) {
          let cost = Runtime.isEqual(a[row - 1], b[column - 1]) ? 0 : 1;
          let deletion = Runtime.must(previous[column]) + 1;
          let insertion = Runtime.must(current[column - 1]) + 1;
          let substitution = Runtime.must(previous[column - 1]) + cost;
          let nearer = deletion < insertion ? deletion : insertion;
          Runtime.append(
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
      return Runtime.must(previous[b.length]);
    }
    static candidates(root) {
      let found = Runtime.cast([], "T::Array[Element]");
      Swill__DOM.eachOwned(root, false, (element, _controller_root) => {
        if (element.hasAttribute("outlet")) return Runtime.append(found, element);
      });
      return found;
    }
    static valueFor(controller, descriptor, element) {
      let name = Runtime.send(descriptor, "name");
      let value = this.materialize(controller, name, element);
      let typed = Runtime.logicalAnd(
        Runtime.send(descriptor, "type"),
        () => Runtime.send(descriptor, "type") !== "T.untyped"
      );
      if (Runtime.isTruthy(Runtime.logicalAnd(typed, () => !Runtime.isTruthy(Runtime.conforms(
        value,
        Runtime.send(descriptor, "type")
      ))))) {
        throw new Error(`Outlet ${name} expects ${Runtime.send(
          descriptor,
          "type"
        )}`);
      }
      ;
      return value;
    }
    static materialize(controller, name, element) {
      if (Runtime.isTruthy(element.tagName === "SCRIPT" && element.type === "application/json")) {
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
      let text = Runtime.strip(element.textContent);
      return controller.decodeOutletData(
        name,
        Runtime.isEmpty(text) ? null : JSON.parse(text)
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
      Runtime.reverse(controllers).forEach((controller) => this.load(controller));
      return controllers;
    }
    static prepare(root) {
      let controllers = Runtime.cast([], "T::Array[Controller]");
      this.walk(root, this.nearestView(root.parentElement), controllers);
      return controllers;
    }
    static awakenOwned(root, owner) {
      let controllers = Runtime.cast([], "T::Array[Controller]");
      Swill__DOM.eachChild(
        root,
        (child) => this.walk(child, owner, controllers)
      );
      Swill__Connections__Outlets.establish(owner, root);
      let disposers = Runtime.cast([], "T::Array[T.proc.void]");
      Swill__Connections__Bindings.regionIn(owner, null, root, disposers);
      owner.retain(Swill__Connections__Bindings.releasing(disposers));
      owner.retain(Swill__Connections__Actions.establishIn(
        root,
        owner,
        Runtime.keywordArguments({ include_root: false })
      ));
      Runtime.reverse(controllers).forEach((controller) => this.load(controller));
      return this.finish(controllers);
    }
    static finish(controllers) {
      Runtime.reverse(controllers).forEach((controller) => controller.controllerDidLoad());
      Runtime.reverse(controllers).forEach((controller) => controller.viewWillAppear());
      return Runtime.reverse(controllers).forEach((controller) => controller.viewDidAppear());
    }
    static load(controller) {
      let root = controller.view.element;
      Swill__Connections__Outlets.establish(controller, root);
      controller.viewDidLoad();
      let added = Runtime.cast([], "T::Array[Controller]");
      Swill__DOM.eachChild(
        root,
        (child) => this.walk(child, controller.view, added)
      );
      Runtime.reverse(added).forEach((child) => this.load(child));
      this.finish(added);
      Swill__Connections__Bindings.establish(controller);
      Swill__Connections__Actions.establish(controller);
      return controller.awakeFromDOM();
    }
    static walk(element, owner, controllers) {
      let view = element.__swill_view__;
      if (element.hasAttribute("klass")) this.classify(element);
      if (Runtime.isTruthy(!view && this.isManaged(element))) {
        view = this.createView(element);
      }
      ;
      if (view) {
        if (Runtime.isTruthy(owner && !view.superview)) owner.adoptSubview(view);
        if (Runtime.isTruthy(element.hasAttribute("controller") && !view.controllerValue())) {
          let controller = Runtime.cast(
            new (Runtime.resolve(Runtime.must(element.getAttribute("controller"))))(),
            "Swill::Controller"
          );
          controller.attach(element);
          Runtime.append(controllers, controller);
        }
      }
      ;
      if (Runtime.isTruthy(view && view.isOwnsContent())) return;
      let next_owner = view || owner;
      return Swill__DOM.eachChild(
        element,
        (child) => this.walk(child, next_owner, controllers)
      );
    }
    static classify(element) {
      let name = Runtime.must(element.getAttribute("klass"));
      if (Runtime.isTruthy(Runtime.classIsA(name, "Swill::Controller"))) {
        if (element.hasAttribute("controller")) {
          throw new Error(`${name} conflicts with controller on the same element`);
        }
        ;
        element.removeAttribute("klass");
        return element.setAttribute("controller", name);
      } else if (!Runtime.isTruthy(Runtime.classIsA(name, "Swill::View"))) {
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
      let view = new (Runtime.resolve(name))(element);
      if (!(view instanceof Swill__View)) {
        throw new Error(`${name} is not a Swill::View`);
      }
      ;
      return view;
    }
    static controllersWithin(node) {
      let found = Runtime.cast([], "T::Array[Controller]");
      this.collectControllers(node, found);
      return found;
    }
    static collectControllers(element, found) {
      let view = element.__swill_view__;
      let controller = view ? view.controllerValue() : null;
      if (controller) Runtime.append(found, controller);
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
      this._on_change = Runtime.cast(
        null,
        "T.nilable(T.proc.params(event:Event).void)"
      );
    }
    isAvailable() {
      let browser = this._browser;
      return Runtime.logicalAnd(
        browser != null && browser.location != null,
        () => browser.history != null
      );
    }
    params() {
      let found = Runtime.cast({}, "T::Hash[String, String]");
      let browser = this._browser;
      if (!Runtime.isTruthy(browser && this.isAvailable())) return found;
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "key", kind: "req" },
          { name: "value", kind: "req" }
        ],
        keywords: [{ name: "history", kind: "keyreq" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let key = Runtime.argument(__swill_bound, "key");
      let value = Runtime.argument(__swill_bound, "value");
      let history = Runtime.argument(__swill_bound, "history");
      if (history === "none" || this._suspended) return;
      let browser = this._browser;
      if (!Runtime.isTruthy(browser && this.isAvailable())) return;
      let location = browser.location;
      let search = new URLSearchParams(location.hash.replace(/^#/m, ""));
      if (value == null) {
        search.delete(key);
      } else {
        search.set(key, value);
      }
      ;
      let query = search.toString();
      let next_url = location.pathname + location.search + (Runtime.isEmpty(query) ? "" : "#" + query);
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
      let __swill_bound = Runtime.bindArguments(
        __swill_arguments,
        { positional: [], keywords: [], keywordRest: null, block: "block" }
      );
      let block = Runtime.argument(__swill_bound, "block");
      let _implicitBlockYield = block;
      this._suspended = true;
      try {
        return Runtime.yieldBlock(_implicitBlockYield);
      } finally {
        this._suspended = false;
      }
    }
    startObserving(callback) {
      let browser = this._browser;
      if (!Runtime.isTruthy(browser && this.isAvailable())) return;
      let on_change = (_event) => callback();
      this._on_change = on_change;
      browser.addEventListener("popstate", on_change);
      return browser.addEventListener("hashchange", on_change);
    }
    stopObserving() {
      let on_change = this._on_change;
      let browser = this._browser;
      if (!Runtime.isTruthy(Runtime.logicalAnd(on_change, () => browser))) return;
      browser.removeEventListener("popstate", on_change);
      browser.removeEventListener("hashchange", on_change);
      this._on_change = null;
      return this._on_change;
    }
  };
  var Swill__Window = class extends Swill__Object {
    constructor(...__swill_arguments) {
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "name", kind: "req" },
          { name: "root", kind: "req" }
        ],
        keywords: [{ name: "modal", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let name = Runtime.argument(__swill_bound, "name");
      let root = Runtime.argument(__swill_bound, "root");
      let modal = Runtime.argument(__swill_bound, "modal");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(modal))) modal = false;
      super();
      this._name = name;
      this._root = root;
      this._modal = modal;
      this._controller = Runtime.cast(null, "T.nilable(Swill::Controller)");
      this._content_name = Runtime.cast(null, "T.nilable(String)");
      this._first_responder = Runtime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._focused_element = null;
      this._restoration_disposers = Runtime.cast(
        [],
        "T::Array[T.proc.void]"
      );
      this._restoration_keys = Runtime.cast([], "T::Array[String]");
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
      Runtime.append(this._restoration_disposers, disposer);
      return Runtime.append(this._restoration_keys, key);
    }
    // Release the current restoration subscriptions; returns the scoped keys
    // they covered so a caller can prune ones the next controller will not own.
    disposeRestoration() {
      let disposers = this._restoration_disposers;
      let keys = this._restoration_keys;
      this._restoration_disposers = [];
      this._restoration_keys = [];
      disposers.forEach((dispose2) => dispose2());
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
      let views = Runtime.cast([], "T::Array[Element]");
      this._root.querySelectorAll("button, input, select, textarea, [tabindex]").forEach((element) => {
        if (this.isKeyView(element, excluded)) return Runtime.append(views, element);
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
        if (Runtime.isTruthy(found == null && this.isKeyView(
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
      this._running = Runtime.cast(
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
      this._windows = Runtime.cast([], "T::Array[Window]");
      this._controllers = Runtime.cast([], "T::Array[Controller]");
      this._templates = Runtime.cast({}, "T::Hash[String, Element]");
      this._captured = Runtime.cast({}, "T::Hash[String, Element]");
      this._page = Runtime.cast(null, "T.nilable(Swill::Window)");
      this._key_windows = Runtime.cast([], "T::Array[Window]");
      this._changing_windows = Runtime.cast(false, "T::Boolean");
      this._posted_first_responder = Runtime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._observer = null;
      this._unrestored = Runtime.cast([], "T::Array[String]");
      this._unrestorable_paths = Runtime.cast([], "T::Array[String]");
      this._problems = Runtime.cast(
        null,
        "T.nilable(Swill::ProblemReporter)"
      );
      this._development_monitor = Runtime.cast(
        null,
        "T.nilable(Swill::DevelopmentMonitor)"
      );
      this._connection_state = Runtime.cast("idle", "String");
      this._reconnect = Runtime.cast(null, "T.nilable(T.proc.void)");
      this._on_online = (_event) => {
        if (this._connection_state === "disconnected") {
          return this._reconnect?.call(null);
        }
      };
      this._window_titles = Runtime.cast(0, "Integer");
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
      return Runtime.setDevelopment(development2);
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
      Runtime.reverse(this._controllers).forEach((controller) => Swill__Awakening.load(controller));
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
      return Runtime.nilable(this._problems?.connectionChanged(state2, detail, retry_action));
    }
    // Reports a recoverable operation problem, including in production.
    reportProblem(message, detail) {
      return Runtime.nilable(this._problems?.report("Warning", message, detail));
    }
    // The browser window the application runs in, for what only it offers:
    // a prompt, printing.
    browser() {
      return Runtime.must(this.root.ownerDocument.defaultView);
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
      if (!Runtime.isTruthy(_Swill__Application.isRunning() && _Swill__Application.shared() === this)) {
        return;
      }
      ;
      this.applicationWillTerminate();
      this.root.ownerDocument.defaultView?.removeEventListener("online", this._on_online);
      this._reconnect = null;
      Runtime.nilable(this._development_monitor?.stop());
      this._development_monitor = null;
      Runtime.nilable(this._problems?.stop());
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
      this._controllers.forEach((controller) => Runtime.send(controller, "unload"));
      Swill__Awakening.detach(this._root);
      this._controllers = [];
      this._root.removeEventListener("focusin", this._on_focus, true);
      this._root.removeEventListener("focusout", this._on_focus_out, true);
      this._root.removeEventListener("keydown", this._on_key_down);
      this._root.removeEventListener("keyup", this._on_key_up);
      this.assignFirstResponder(null);
      this._key_windows = [];
      this._page = null;
      Runtime.setDevelopment(false);
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "window_name", kind: "req" },
          { name: "content_name", kind: "req" }
        ],
        keywords: [{ name: "history", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let window_name = Runtime.argument(__swill_bound, "window_name");
      let content_name = Runtime.argument(__swill_bound, "content_name");
      let history = Runtime.argument(__swill_bound, "history");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(history))) history = "push";
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
        Runtime.keywordArguments({ history })
      );
      this.restoreWindowState(window, Runtime.keywordArguments({
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [{ name: "name", kind: "req" }],
        keywords: [{ name: "into", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let name = Runtime.argument(__swill_bound, "name");
      let into = Runtime.argument(__swill_bound, "into");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(into))) into = this._root;
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [
          { name: "controller", kind: "req" },
          { name: "name", kind: "req" }
        ],
        keywords: [{ name: "into", kind: "key" }, { name: "modal", kind: "key" }],
        keywordRest: null,
        block: "__swill_block"
      });
      let controller = Runtime.argument(__swill_bound, "controller");
      let name = Runtime.argument(__swill_bound, "name");
      let into = Runtime.argument(__swill_bound, "into");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(into))) into = this._root;
      let modal = Runtime.argument(__swill_bound, "modal");
      if (Runtime.isTruthy(Runtime.isOmittedArgument(modal))) modal = false;
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
      let window = new Swill__Window(name, node, Runtime.keywordArguments({ modal }));
      Runtime.append(this._key_windows, window);
      return window;
    }
    openWindow(window, controller, controllers) {
      let node = window.root;
      if (Runtime.isTruthy(node.tagName === "DIALOG" && node.classList.contains("window"))) {
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
        this.changingWindows(Runtime.blockArgument(() => {
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
      Runtime.append(this._windows, window);
      this.restoreWindowState(
        window,
        Runtime.keywordArguments({ prune_stale: false, write_content: false })
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
      if (globalThis.__SWILL_DEV__ !== false && Runtime.isDevelopment()) {
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
      let __swill_bound = Runtime.bindArguments(
        __swill_arguments,
        { positional: [], keywords: [], keywordRest: null, block: "block" }
      );
      let block = Runtime.argument(__swill_bound, "block");
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
      let file = Runtime.stringify(Runtime.split(
        Runtime.must(Runtime.split(
          Runtime.must(link.getAttribute("href")),
          "?"
        )[0]),
        "/"
      ).at(-1));
      return this.theme = Runtime.split(file, ".")[0];
    }
    themeDidChange(_previous, theme) {
      let root = this._root;
      if (!Runtime.isTruthy(theme != null ? root : theme)) return;
      let link = this.themeLink(root.ownerDocument);
      if (!link) return;
      let framework2 = Swill__Bundle.framework();
      let url = framework2 ? framework2.urlForResourceWithExtension(
        theme,
        "css"
      ) : null;
      if (url == null) throw new Error(`Unknown theme: ${theme}`);
      let current = Runtime.stringify(link.getAttribute("href"));
      if (current.endsWith(`/${theme}.css`) || current === `${theme}.css`) return;
      return link.setAttribute("href", url);
    }
    // Only a window's content controller is restored, so restorable paths
    // declared on any other controller would be silently ignored. Warns once
    // per class, naming the paths. A class that is some window's content as
    // well is declaring for that use, so it is not warned about.
    warnUnrestored(controllers) {
      let contents = Runtime.compact(this._windows.map((window) => Runtime.send(window, "controller"))).map((content) => Runtime.nameOf(content));
      return controllers.forEach((controller) => {
        if (this._windows.some((window) => Runtime.send(window, "controller") === controller)) return;
        let declarations2 = Runtime.cast(
          Runtime.restorations(controller),
          "T::Array[T.untyped]"
        );
        if (Runtime.isEmpty(declarations2)) return;
        let name = Runtime.logicalOr(
          Runtime.cast(Runtime.nameOf(controller), "T.nilable(String)"),
          () => "a controller"
        );
        if (contents.includes(name) || this._unrestored.includes(name)) return;
        Runtime.append(this._unrestored, name);
        let paths = declarations2.map((declaration) => Runtime.send(declaration, "path")).join(", ");
        return Runtime.warn(`${`${name} declares restorable ${paths}, but only a window's content controller is restored; `}declare it there as a path through this controller`);
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
      this.changingWindows(Runtime.blockArgument(() => window.dismiss()));
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
      let element = Runtime.isTruthy(Runtime.logicalAnd(
        Runtime.logicalAnd(last && owner, () => owner.contains(last)),
        () => this._root.contains(last)
      )) ? last : responder.keyElement();
      if (Runtime.isTruthy(element && this._root.contains(element))) {
        this.focusInWindow(element);
      }
      ;
      this.postFirstResponderChange();
      if (globalThis.__SWILL_DEV__ !== false && Runtime.isDevelopment()) {
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
      if (Runtime.isTruthy(responder && !responder.acceptsFirstResponder())) {
        return false;
      }
      ;
      let window = responder ? this.windowOf(responder) : this.keyWindow();
      if (!window) return false;
      let current = Runtime.cast(
        window.firstResponder || this,
        "Swill::Responder"
      );
      if (responder === current) return true;
      if (!current.resignFirstResponder(responder)) return false;
      window.firstResponder = null;
      if (window !== this.keyWindow()) {
        window.firstResponder = responder;
      } else if (Runtime.isTruthy(responder && responder.becomeFirstResponder())) {
        if (window.firstResponder == null) window.firstResponder = responder;
      }
      ;
      this.postFirstResponderChange();
      if (globalThis.__SWILL_DEV__ !== false && Runtime.isDevelopment()) {
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
      let name = Runtime.logicalOr(
        Runtime.cast(Runtime.nameOf(responder), "T.nilable(String)"),
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
      return Runtime.reverse(this.keyWindows()).find((window) => window.root.contains(element));
    }
    // The roots of the presented windows other than +window+. The page's
    // root holds them all, but their controls are not the page's key views.
    excludedRoots(window) {
      return this.keyWindows().filter((other) => Runtime.isTruthy(other !== window && other !== this._page)).map((__swill_item) => __swill_item.root);
    }
    keyDownInWindow(event) {
      if (globalThis.__SWILL_DEV__ !== false && Runtime.isDevelopment()) {
        this.verifyFocus("a key");
      }
      ;
      return this.firstResponder().keyDown(event);
    }
    // Focus the browser gave before launch, as to an `autofocus` field,
    // makes its responder first, as later focus does.
    adoptFocus(root) {
      let active = root.ownerDocument.activeElement;
      if (Runtime.isTruthy(Runtime.logicalAnd(
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
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        Runtime.logicalAnd(
          window && active,
          () => this._root.contains(active)
        ),
        () => active !== this._root
      ))) return;
      let responder = this.firstResponder();
      let owner = this.responderElement(responder);
      let problem = this.windowHolding(active) !== window ? `focus is in another window than the key window ${this.windowLabel(window)}` : Runtime.isTruthy(responder !== this && !this.isAttached(responder)) ? "the first responder is no longer in the page" : Runtime.isTruthy(responder !== this && !responder.acceptsFirstResponder()) ? "the first responder does not accept being first responder" : Runtime.isTruthy(owner && !owner.contains(active)) ? "the focused element is outside the first responder" : null;
      if (!Runtime.isTruthy(problem)) return;
      let focused = this.describeElement(active);
      return Runtime.warn(`Focus check after ${moment}: ${problem}. First responder: ${this.describeResponder(responder)}; focused: ${focused}.`);
    }
    windowLabel(window) {
      return window === this._page ? "(the page)" : `"${window.name}"`;
    }
    describeElement(element) {
      let tag = Runtime.downcase(element.tagName);
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
      if (Runtime.isTruthy(Runtime.logicalAnd(
        window && window !== this._page,
        () => window.root === target
      ))) {
        let previous = event.relatedTarget;
        let back = Runtime.isTruthy(Runtime.logicalAnd(
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
      if (Runtime.isEmpty(views)) return false;
      event.preventDefault();
      let found = Runtime.indexOf(views, event.target);
      let index = Runtime.cast(
        found != null ? found : (() => {
          return delta > 0 ? -1 : 0;
        })(),
        "Integer"
      );
      let attempts = 0;
      while (attempts < views.length) {
        index = Runtime.modulo(index + delta, views.length);
        let candidate = Runtime.must(views[index]);
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
      let current = Runtime.cast(
        window.firstResponder || this,
        "Swill::Responder"
      );
      if (responder === current) return;
      if (Runtime.isTruthy(responder && !responder.acceptsFirstResponder())) {
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
      if (globalThis.__SWILL_DEV__ !== false && Runtime.isDevelopment()) {
        return this.verifyFocus("focus moved");
      }
    }
    // Focus moved to another part of the page: the first responder falls
    // back here. A null destination (the browser's own chrome, or dead space
    // in the page) leaves it alone, as Cocoa does, so keys still reach it
    // when focus returns.
    focusLeft(destination) {
      if (Runtime.isTruthy(destination && !this._root.contains(destination))) {
        return this.assignFirstResponder(null);
      }
    }
    // A window's first responder inside a region being torn down falls back
    // to the window, so the application holds it.
    releaseFirstResponder(element) {
      this.keyWindows().forEach((window) => {
        let responder = window.firstResponder;
        let owner = responder ? this.responderElement(responder) : null;
        if (Runtime.isTruthy(owner && (owner === element || element.contains(owner)))) {
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
      let target = Runtime.isTruthy(previous && owner.contains(previous)) ? previous : responder.keyElement();
      if (target) return Swill__DOM.focus(target);
    }
    // ---- window templates, containers, and content ----
    // <template for="window" name="x"> anywhere, or <template name="x"> directly
    // under the root. Templates are inert; content is cloned from them.
    scanTemplates() {
      return this._root.querySelectorAll("template[name]").forEach((template) => {
        let name = Runtime.must(template.getAttribute("name"));
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
      let found = Runtime.cast([], "T::Array[Element]");
      if (this._root.hasAttribute("window")) Runtime.append(found, this._root);
      this._root.querySelectorAll("[window]").forEach((container) => Runtime.append(found, container));
      return found;
    }
    // Before awakening: capture pre-rendered content under the container's
    // name so it can be reloaded later, and fill empty containers from the
    // template their name attribute (or window name) selects.
    prepareWindowContainers() {
      let params = this._fragments.params();
      return this.windowContainers().forEach((container) => {
        let window_name = Runtime.must(container.getAttribute("window"));
        let default_name = Runtime.logicalOr(
          container.getAttribute("name"),
          () => window_name
        );
        let first = container.firstElementChild;
        if (Runtime.isTruthy(first && !this._captured[default_name])) {
          this._captured[default_name] = first.cloneNode(true);
        }
        ;
        let content_name = this.requestedContent(
          window_name,
          default_name,
          params[window_name]
        );
        if (Runtime.isTruthy(first && content_name === default_name)) return;
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
      Runtime.warn(`window "${window_name}" requested unknown content "${requested}"`);
      return default_name;
    }
    registerWindowContainers() {
      return this.windowContainers().forEach((container) => {
        let window = new Swill__Window(Runtime.must(container.getAttribute("window")), container);
        window.assignContent(
          container.getAttribute("name"),
          this.topControllerIn(container)
        );
        return Runtime.append(this._windows, window);
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
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [{ name: "window", kind: "req" }],
        keywords: [
          { name: "prune_stale", kind: "keyreq" },
          { name: "write_content", kind: "keyreq" }
        ],
        keywordRest: null,
        block: "__swill_block"
      });
      let window = Runtime.argument(__swill_bound, "window");
      let prune_stale = Runtime.argument(__swill_bound, "prune_stale");
      let write_content = Runtime.argument(__swill_bound, "write_content");
      let stale = window.disposeRestoration();
      let controller = window.controller;
      let declarations2 = Runtime.cast(
        controller ? Runtime.restorations(controller) : [],
        "T::Array[T.untyped]"
      );
      let keys = declarations2.map((declaration) => window.scopedKey(Runtime.send(declaration, "key")));
      let content = window.contentName;
      if (Runtime.isTruthy(write_content && content)) {
        this._fragments.write(
          window.name,
          content,
          Runtime.keywordArguments({ history: "replace" })
        );
      }
      ;
      if (prune_stale) {
        stale.forEach((key) => {
          if (!keys.includes(key)) {
            this._fragments.write(
              key,
              null,
              Runtime.keywordArguments({ history: "replace" })
            );
          }
        });
      }
      ;
      if (!controller) return;
      let params = this._fragments.params();
      let applied = 0;
      let unrestorable = Runtime.cast([], "T::Array[String]");
      this._fragments.suspended(Runtime.blockArgument(() => declarations2.forEach((declaration) => {
        let key = window.scopedKey(Runtime.send(declaration, "key"));
        let text = params[key];
        if (text == null) return;
        let value = this.decodeFragmentValue(
          Runtime.send(declaration, "type"),
          text
        );
        if (value == null) return;
        return this.restorePath(
          controller,
          Runtime.send(declaration, "path"),
          value
        ) ? ++applied : Runtime.append(unrestorable, key);
      })));
      unrestorable.forEach((key) => this._fragments.write(
        key,
        null,
        Runtime.keywordArguments({ history: "replace" })
      ));
      if (!Runtime.isEmpty(declarations2)) {
        controller.controllerDidRestore(applied > 0);
      }
      ;
      return declarations2.forEach((declaration) => {
        let disposer = Runtime.observePath(
          controller,
          Runtime.send(declaration, "path"),
          (_value) => this.writeWindowState(window)
        );
        return window.addRestoration(
          disposer,
          window.scopedKey(Runtime.send(declaration, "key"))
        );
      });
    }
    restoreLaunchedWindows() {
      return this._windows.forEach((window) => this.restoreWindowState(
        window,
        Runtime.keywordArguments({ prune_stale: false, write_content: true })
      ));
    }
    // Push the controller's current restorable state into the fragment.
    writeWindowState(window) {
      let controller = window.controller;
      if (!controller) return;
      return Runtime.cast(
        Runtime.restorations(controller),
        "T::Array[T.untyped]"
      ).forEach((declaration) => {
        let path = Runtime.send(declaration, "path");
        let value = this.isWritablePath(controller, path) ? this.encodeFragmentValue(
          controller,
          Runtime.readPath(controller, path),
          path
        ) : null;
        return this._fragments.write(
          window.scopedKey(Runtime.send(declaration, "key")),
          value,
          Runtime.keywordArguments({ history: "replace" })
        );
      });
    }
    // Typed URL leaves; nil rejects invalid values.
    decodeFragmentValue(type, text) {
      if (type === "Integer" || type === "T.nilable(Integer)") {
        let stripped = Runtime.strip(text);
        if (!Runtime.isTruthy(/^[+-]?\d/.test(stripped))) return null;
        return Runtime.toInteger(stripped);
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
      if (Runtime.conforms(value, "String")) return value;
      if (Runtime.conforms(value, "Integer") || Runtime.conforms(
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
        Runtime.writePath(controller, path, value);
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
        Runtime.assertWritablePath(controller, path);
        return true;
      } catch (error) {
        this.warnUnrestorable(controller, path, error.message);
        return false;
      }
    }
    // Warns once per class and path.
    warnUnrestorable(controller, path, reason) {
      let name = Runtime.logicalOr(
        Runtime.cast(Runtime.nameOf(controller), "T.nilable(String)"),
        () => "a controller"
      );
      if (this._unrestorable_paths.includes(`${name} ${path}`)) return;
      Runtime.append(this._unrestorable_paths, `${name} ${path}`);
      return Runtime.warn(`${name}: restorable ${path} is left out of the URL: ${reason}`);
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
      if (Runtime.isTruthy(requested != null && requested !== window.contentName)) {
        return this.isWindowContent(requested) ? this.loadWindowContent(
          window.name,
          requested,
          Runtime.keywordArguments({ history: "none" })
        ) : Runtime.warn(`window "${window.name}" requested unknown content "${requested}"`);
      } else {
        return this.restoreWindowState(
          window,
          Runtime.keywordArguments({ prune_stale: false, write_content: false })
        );
      }
    }
    // Code-created content awakens through the same path as markup: the
    // observer wires added subtrees and detaches removed ones. Explicit wiring
    // before the observer runs is harmless, since both are idempotent.
    watch(root) {
      if (!Runtime.isTruthy(typeof MutationObserver !== "undefined")) return;
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
      let failure = Runtime.cast(
        Runtime.buildFailure(),
        "T.nilable(String)"
      );
      if (failure != null) {
        this.showBuildFailure(element, failure);
        return null;
      }
      ;
      if (Swill__Application.isRunning()) return Swill__Application.shared();
      let application = Runtime.cast(
        new (Runtime.resolve(Runtime.must(element.getAttribute("application"))))(),
        "Swill::Application"
      );
      application.launch(element);
      Runtime.must(document2.defaultView).addEventListener(
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
      let dialog = Runtime.must(Swill__Templates.named(
        "alert",
        root.ownerDocument
      ).content.firstElementChild).cloneNode(true);
      let alert = Swill__Swell.$index(dialog);
      alert.findBang("h2").text("The application failed to build");
      Swill__Swell.$index(Runtime.must(alert.findBang(".alert-text").element.querySelector("p"))).text(message);
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
      if (Runtime.isEqual(this.representedObject, objects)) return;
      this._setting_content = true;
      try {
        if (objects instanceof Swill__ArrayController) {
          this.content = null;
          this.arrayController = Runtime.cast(
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
        return Runtime.performAction(
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
      let index = row ? Runtime.indexOf(this.rowElements(), row) : null;
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
      if (Runtime.isTruthy(this._awakened && !this._setting_content)) {
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
      let current = Runtime.isEmpty(indexes) ? -1 : Runtime.must(indexes[0]);
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
      let current = Runtime.isEmpty(indexes) ? -1 : Runtime.must(indexes[0]);
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
      if (!Runtime.isEmpty(this.currentSelection())) {
        event.preventDefault();
        return this.activateSelection();
      } else {
        return super.insertNewline(event);
      }
    }
    // ---- rows ----
    // Where rows mount.
    container() {
      return Runtime.nilable(this.rows?.element) || this._view.element;
    }
    containerView() {
      let mount = this.rows;
      return mount ? mount : this._view;
    }
    // Rows in order: the container's children other than templates and
    // whatever row_element? rejects.
    rowElements() {
      let found = Runtime.cast([], "T::Array[Element]");
      Swill__DOM.eachChild(this.container(), (child) => {
        if (Runtime.isTruthy(child.tagName !== "TEMPLATE" && this.isRowElement(child))) {
          return Runtime.append(found, child);
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
      return Runtime.isEmpty(found) ? null : found[0];
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
      let first = Runtime.isEmpty(indexes) ? null : elements[Runtime.must(indexes[0])];
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
        Runtime.keywordArguments({ capture: true })
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
      if (!Runtime.isTruthy(this.allowsMultipleSelection && event.shiftKey)) return;
      if (this.rowFor(event.target) < 0) return;
      event.preventDefault();
      return this._view.clearTextSelection();
    }
    rowClicked(event) {
      let index = this.rowFor(event.target);
      if (index < 0) return;
      let anchor = this._selection_anchor;
      if (Runtime.isTruthy(Runtime.logicalAnd(
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
      let indexes = Runtime.cast([], "T::Array[Integer]");
      let current = low;
      while (current <= high) {
        Runtime.append(indexes, current);
        current++;
      }
      ;
      return this.selectIndexes(indexes);
    }
  };
  var Swill__Controller__SortableList = class extends Swill__Controller__List {
    // The sort_by action: the sender's column names the key.
    sortBy(sender) {
      let key = this.sortKeyFor(sender);
      if (key != null) return this.toggleSort(key);
    }
    // Override when the column name lives elsewhere than data-column.
    sortKeyFor(sender) {
      return sender.getAttribute("data-column");
    }
    // Compatibility for subclasses; sort state is now derived from arrangement.
    syncSortStates() {
      return this.sortStates;
    }
  };
  var Swill__Controller__Editor = class extends Swill__Controller {
    bindingRoot() {
      return "represented_object";
    }
    // Two-way bindings have already written into the object, so nothing is
    // pending and the answer is yes. A subclass whose control holds a value
    // it cannot push back returns false.
    commitEditing() {
      return true;
    }
    discardEditing() {
      return null;
    }
    insertNewline(event) {
      event.preventDefault();
      return this.commitEditing();
    }
    cancelOperation(event) {
      return this.discardEditing();
    }
  };
  var Swill__Controller__InlineEditor = class extends Swill__Controller__Editor {
    insertNewline(event) {
      event.preventDefault();
      let host = this.editingHost();
      return Runtime.isTruthy(host) ? Runtime.invoke(
        host,
        "end_editing",
        true
      ) : this.commitEditing();
    }
    cancelOperation(event) {
      let host = this.editingHost();
      return Runtime.isTruthy(host) ? Runtime.invoke(
        host,
        "end_editing",
        false
      ) : this.discardEditing();
    }
    resignFirstResponder(next_responder) {
      if (!this.allowResignationTo(next_responder)) return false;
      return super.resignFirstResponder(next_responder);
    }
    // Focus moving within the editor is free; leaving it asks the host. No
    // host means the editor is already released.
    allowResignationTo(responder) {
      let element = responder ? responder.focusRegion() : null;
      if (Runtime.isTruthy(element && this._view.contains(element))) return true;
      let host = this.editingHost();
      return Runtime.isTruthy(host) ? Runtime.invoke(
        host,
        "editor_should_end_editing",
        this
      ) : true;
    }
    // NSControlTextEditingDelegate analog: the controls inside the editor
    // delegate resignation here, so leaving one of them asks the host.
    controlShouldResignFirstResponder(_control, next_responder) {
      return this.allowResignationTo(next_responder);
    }
    // The parent, when it hosts inline editing.
    editingHost() {
      let owner = this.parent();
      return Runtime.isTruthy(owner && Runtime.respondsTo(
        owner,
        "editor_should_end_editing"
      )) ? owner : null;
    }
  };
  var Swill__RowEdit = class extends Swill__Object {
    constructor(editor, index, original) {
      super();
      this._editor = editor;
      this._index = index;
      this._original = original;
    }
    get editor() {
      return this._editor;
    }
    get index() {
      return this._index;
    }
    get original() {
      return this._original;
    }
  };
  var Swill__Controller__EditableList = class extends Swill__Controller__SortableList {
    // Activation edits the selected row instead of telling the owner.
    activateSelection() {
      let indexes = this.currentIndexes();
      return Runtime.isEmpty(indexes) ? super.activateSelection() : this.beginEditing(Runtime.must(indexes[0]));
    }
    isEditing() {
      return this._edit != null;
    }
    // Teardown closes an open editor without committing.
    awakeFromDOM() {
      super.awakeFromDOM();
      return this.retain(() => this.closeEditor());
    }
    // Whether the editor opened. An edit in progress is committed first; a
    // refused commit keeps that editor.
    beginEditing(index) {
      let original = this.objectAt(index);
      if (!Runtime.isTruthy(original)) return false;
      if (Runtime.isTruthy(this.isEditing() && !this.endEditing(true))) return false;
      let copy = Runtime.isTruthy(Runtime.respondsTo(original, "draft")) ? Runtime.send(
        original,
        "draft"
      ) : Runtime.send(original, "dup");
      return this.openEditor(index, original, copy);
    }
    // False only when a commit was refused; the editor then stays open.
    endEditing(commit) {
      let edit = this._edit;
      if (!edit) return true;
      if (commit) {
        if (!edit.editor.commitEditing()) return false;
        let copy = this.editedObject;
        let error = this.validationError(copy);
        if (Runtime.isTruthy(error)) {
          this.editingDidFailValidation(error);
          return false;
        }
        ;
        this.closeEditor();
        this.commitEdit(copy, edit.original, edit.index);
      } else {
        edit.editor.discardEditing();
        this.closeEditor();
        this.finishEdit(edit.index, null);
      }
      ;
      return true;
    }
    // NSEditor commitEditing: ask before anything that cannot proceed past an
    // edit in progress.
    commitEditingIfNeeded() {
      return !this.isEditing() || this.endEditing(true);
    }
    // Asked by the inline editor when focus is leaving it. An unchanged copy
    // is discarded; otherwise the edit commits when confirm_edit? agrees.
    // Return false to keep focus in the editor.
    editorShouldEndEditing(_editor) {
      let edit = this._edit;
      if (!edit) return true;
      let copy = this.editedObject;
      if (!this.editedObjectHasChanges(copy, edit.original)) {
        this.endEditing(false);
        return true;
      }
      ;
      if (!this.confirmEdit(copy, edit.original)) return false;
      return this.endEditing(true);
    }
    cancelOperation(event) {
      return this.isEditing() ? this.endEditing(false) : super.cancelOperation(event);
    }
    // Up and Down from a field in the editor belong to the edit, not to the
    // selection it is editing.
    moveUp(event) {
      if (!this.isEditing()) return super.moveUp(event);
    }
    moveDown(event) {
      if (!this.isEditing()) return super.moveDown(event);
    }
    toggleSort(key) {
      if (this.commitEditingIfNeeded()) return super.toggleSort(key);
    }
    // A new collection ends an edit without committing: its row is gone.
    representedObjectDidChange(previous, objects) {
      this._edit_generation = Runtime.logicalOr(
        this._edit_generation,
        () => 0
      ) + 1;
      if (this.isEditing()) this.endEditing(false);
      return super.representedObjectDidChange(previous, objects);
    }
    // An external arrangement or background refresh can also remove the row.
    arrangedObjectsDidChange(previous, objects) {
      if (this.isEditing()) this.endEditing(false);
      return super.arrangedObjectsDidChange(previous, objects);
    }
    // ---- policy hooks ----
    commitEdit(copy, original, index) {
      if (original instanceof Swill__Distant__Object) {
        this.commitDistantEdit(copy, original, index);
        return;
      }
      ;
      return this.finishEdit(index, this.applyEdit(copy, original, index));
    }
    async commitDistantEdit(copy, original, _index) {
      let generation = this._edit_generation;
      try {
        await original.applyDraft(copy);
      } catch (error) {
        if (!Runtime.isTruthy(this._awakened && Runtime.isEqual(
          generation,
          this._edit_generation
        ))) return;
        this.editingDidFailSave(error);
        let index2 = Runtime.indexOf(this.arrangedObjects, original);
        if (index2 != null) this.openEditor(index2, original, copy);
        return;
      }
      ;
      if (!Runtime.isTruthy(this._awakened && Runtime.isEqual(
        generation,
        this._edit_generation
      ))) {
        return;
      }
      ;
      let index = Runtime.indexOf(this.arrangedObjects, original);
      if (index != null) return this.finishEdit(index, original);
    }
    // A model takes its draft back and stays the row's object; a plain object
    // is replaced by the copy in a new collection. Returns the final object.
    applyEdit(copy, original, _index) {
      if (Runtime.isTruthy(Runtime.respondsTo(original, "apply_draft"))) {
        Runtime.invoke(original, "apply_draft", copy);
        return original;
      }
      ;
      this.replaceObject(original, copy);
      return copy;
    }
    // An error that refuses the commit, or nil. Attribute validators already
    // ran when the draft was written; a model's own validate, when it has
    // one, is asked here.
    validationError(object) {
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        object,
        () => Runtime.respondsTo(object, "validate")
      ))) return null;
      return Runtime.send(object, "validate");
    }
    // Whether a focus-out commit should proceed. Override to confirm.
    confirmEdit(_copy, _original) {
      return true;
    }
    // Dirty tracking decides for a model; a plain copy counts as changed.
    editedObjectHasChanges(copy, _original) {
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        copy,
        () => Runtime.respondsTo(copy, "dirty?")
      ))) return true;
      return Runtime.send(copy, "dirty?") === true;
    }
    // Override to show the error; the editor stays open.
    editingDidFailValidation(error) {
      return Runtime.warn(`Edit refused: ${Runtime.send(error, "message")}`);
    }
    // Override to present a persistence error. The same draft is remounted.
    editingDidFailSave(error) {
      return Runtime.warn(`Edit did not save: ${Runtime.send(
        error,
        "message"
      )}`);
    }
    // ---- rows and the editor ----
    // The editor sits among the rows while editing, but is not one.
    isRowElement(element) {
      if (!super.isRowElement(element)) return false;
      let edit = this._edit;
      return edit == null || edit.editor.view.element !== element;
    }
    editorTemplate() {
      let found = Swill__DOM.ownedMatching(
        this._view.element,
        'template[for="editor"]'
      );
      return Runtime.isEmpty(found) ? null : found[0];
    }
    // Mount an editor after the row, bind it to the copy, and give it the
    // keyboard.
    openEditor(index, original, copy) {
      let row = this.rowElements()[index];
      if (!row) return false;
      this._edit_generation = Runtime.logicalOr(
        this._edit_generation,
        () => 0
      ) + 1;
      let node = this.instantiateEditor();
      this.editedObject = copy;
      this.containerView().mark(row, "being-edited", true);
      this.containerView().insertAfter(row, node);
      let editor = this.awakenEditor(node);
      editor.bind(
        "represented_object",
        Runtime.keywordArguments({ to: this, key_path: "edited_object" })
      );
      editor.view.subviews.forEach((subview) => {
        if (subview instanceof Swill__Control) {
          Runtime.cast(subview, "Swill::Control").delegate = editor;
        }
      });
      this._edit = new Swill__RowEdit(editor, index, original);
      this.application().makeFirstResponder(editor);
      return true;
    }
    // A fresh element from the editor template.
    instantiateEditor() {
      let template = this.editorTemplate();
      if (!template) {
        throw new Error('EditableList has no <template for="editor">');
      }
      ;
      return this.containerView().cloneTemplate(template);
    }
    // The inline editor rooted at a mounted node; anything else is torn back
    // down before the mistake is reported.
    awakenEditor(node) {
      Swill__Awakening.instantiate(node);
      let editor = Swill__View.controllerFor(node);
      if (editor instanceof Swill__Controller__InlineEditor) {
        return Runtime.cast(editor, "Swill::Controller::InlineEditor");
      }
      ;
      Swill__Awakening.detach(node);
      this.containerView().remove(node);
      return (() => {
        throw new Error("The editor template root must be a Swill::Controller::InlineEditor");
      })();
    }
    closeEditor() {
      let edit = this._edit;
      this._edit = null;
      this.editedObject = null;
      if (!edit) return;
      let row = this.rowElements()[edit.index];
      if (row) this.containerView().mark(row, "being-edited", false);
      let element = edit.editor.view.element;
      Swill__Awakening.detach(element);
      return this.containerView().remove(element);
    }
    // Select the final object and give the list the keyboard back.
    finishEdit(_index, final) {
      if (Runtime.isTruthy(final)) this.selectObject(final);
      return this.application().makeFirstResponder(this);
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
      this._button_titles = Runtime.cast([], "T::Array[String]");
      this._choice = Runtime.cast(null, "T.nilable(String)");
    }
    // Adds a button titled +title+ after those already added. An alert with
    // none shows OK.
    addButton(title) {
      return Runtime.append(this._button_titles, title);
    }
    async run() {
      let document2 = this.application().root.ownerDocument;
      let template = Swill__Templates.named("alert", document2);
      let dialog = Runtime.must(template.content.firstElementChild).cloneNode(true);
      this.attach(dialog);
      if (this.title == null) this.title = document2.title;
      let window = this.application().presentWindow(
        this,
        "alert",
        Runtime.keywordArguments({ modal: true })
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
      return (Runtime.isEmpty(this._button_titles) ? ["OK"] : this._button_titles).forEach((label, index) => {
        let button = Swill__Swell.$index(this.view.cloneTemplate(Runtime.must(this.buttonTemplate))).text(label);
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
      this._retry_action = Runtime.cast(null, "T.nilable(T.proc.void)");
      this._required = Runtime.cast(false, "T::Boolean");
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
      if (Runtime.isTruthy(sender.textContent === _Swill__SystemAlert.RETRY_TITLE && action)) {
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
      this._endpoint = Runtime.cast("", "String");
      this._loaded_revision = Runtime.cast("", "String");
      this._timer = Runtime.cast(null, "T.nilable(Integer)");
      this._request = null;
      this._stopped = Runtime.cast(true, "T::Boolean");
      this._on_visibility = (_event) => {
        if (this._document.visibilityState === "visible") return this.poll();
      };
    }
    start() {
      let metadata2 = this._document.querySelector('meta[name="swill-development"]');
      if (!metadata2) return;
      this._endpoint = Runtime.stringify(metadata2.getAttribute("data-endpoint"));
      this._loaded_revision = Runtime.stringify(metadata2.getAttribute("content"));
      if (Runtime.isEmpty(this._endpoint)) return;
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
      if (Runtime.isTruthy(this._stopped || this._request)) {
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
          state2 = Runtime.cast(
            await response.json(),
            "T::Hash[String, T.untyped]"
          );
          revision = Runtime.send(state2.revision, "to_s");
          if (Runtime.isTruthy(Runtime.logicalAnd(
            Runtime.logicalAnd(
              this.isRunning() && state2.ready === true,
              () => !Runtime.send(revision, "empty?")
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
      this._pending = Runtime.cast([], "T::Array[T::Hash[Symbol, String]]");
      this._current = Runtime.cast(null, "T.nilable(String)");
      this._active = Runtime.cast(null, "T.nilable(Swill::SystemAlert)");
      this._kind = "";
      this._state = "idle";
      this._stopped = false;
      this._retry = Runtime.cast(null, "T.nilable(T.proc.void)");
      this._revision = "";
      this._dismissed = false;
      this._acknowledged_revision = "";
      this._on_error = (event) => this.reportError(event);
      this._on_rejection = (event) => this.reportRejection(event);
      this._stop_warnings = Runtime.cast(null, "T.nilable(T.proc.void)");
    }
    // Starts reporting uncaught errors, rejected promises and warnings.
    start() {
      let window = this._window;
      if (window) {
        window.addEventListener("error", this._on_error);
        window.addEventListener("unhandledrejection", this._on_rejection);
      }
      ;
      this._stop_warnings = Runtime.observeWarnings((message) => this.report("Warning", message, ""));
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
      return Runtime.nilable(this._active?.finish(null));
    }
    reportError(event) {
      let error = event.error;
      let message = error == null ? event.message : _Swill__ProblemReporter.messageOf(error);
      let origin = error == null ? "" : _Swill__ProblemReporter.originOf(error);
      if (Runtime.isTruthy(Runtime.isEmpty(origin) && !Runtime.isEmpty(event.filename))) {
        origin = `at ${event.filename}:${event.lineno}:${event.colno}`;
      }
      ;
      return this.report("Stop", message, origin);
    }
    reportRejection(event) {
      let reason = event.reason;
      if (Runtime.isTruthy(reason instanceof Error && [
        "connection_lost",
        "schema_mismatch",
        "actor_scope_changed",
        "outcome_unknown"
      ].includes(Runtime.stringify(reason.code)))) {
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
      Runtime.append(this._pending, { kind: "", icon, message, detail });
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
      Runtime.prepend(this._pending, { kind, icon, message, detail });
      if (this._current == null) return this.showNext();
    }
    async showNext() {
      if (this._stopped) {
        return;
      }
      ;
      let first = this._pending[0];
      if (Runtime.isTruthy(Runtime.logicalAnd(
        first && first.kind === _Swill__ProblemReporter.REVISION,
        () => ["disconnected", "connecting"].includes(this._state)
      ))) return;
      let problem = this._pending.shift();
      if (!problem) return;
      this._current = Runtime.fetch(problem, "message");
      this._kind = Runtime.fetch(problem, "kind");
      let kind = this._kind;
      try {
        let alert = new Swill__SystemAlert();
        alert.retryAction = kind === _Swill__ProblemReporter.CONNECTION ? this._retry : null;
        alert.required = kind === _Swill__ProblemReporter.RELOAD;
        this._active = alert;
        alert.icon = Runtime.fetch(problem, "icon");
        alert.title = Runtime.isEmpty(kind) ? (() => {
          return alert.icon === "Stop" ? "Error" : "Warning";
        })() : "Application";
        alert.messageText = Runtime.fetch(problem, "message");
        alert.informativeText = Runtime.fetch(problem, "detail");
        this.buttonTitles(kind).forEach((label) => alert.addButton(label));
        await alert.run();
        if (Runtime.isTruthy(kind === _Swill__ProblemReporter.CONNECTION && [
          "disconnected",
          "connecting"
        ].includes(this._state))) this._dismissed = true;
        if (Runtime.isTruthy(kind === _Swill__ProblemReporter.REVISION && [
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
      if (!Runtime.isEmpty(this._pending)) return this.showNext();
    }
    connectionRestored() {
      this._dismissed = false;
      this._pending = this._pending.filter((item) => ![_Swill__ProblemReporter.CONNECTION, _Swill__ProblemReporter.RELOAD].includes(item.kind));
      if ([
        _Swill__ProblemReporter.CONNECTION,
        _Swill__ProblemReporter.RELOAD
      ].includes(this._kind)) Runtime.nilable(this._active?.finish(null));
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
        return Runtime.nilable(this._active?.finish(null));
      }
    }
    connectionLost() {
      if (this._kind === _Swill__ProblemReporter.REVISION) {
        Runtime.append(this._pending, {
          kind: _Swill__ProblemReporter.REVISION,
          icon: "Warning",
          message: _Swill__ProblemReporter.REVISION_MESSAGE,
          detail: _Swill__ProblemReporter.REVISION_DETAIL
        });
        Runtime.nilable(this._active?.finish(null));
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
      return Runtime.send(value, "to_s");
    }
    static originOf(value) {
      if (!(value instanceof Error)) return "";
      let stack = Runtime.logicalOr(value.stack, () => "");
      let found = Runtime.split(stack, "\n").find((line) => Runtime.isTruthy(/:\d+:\d+\)?$/m.test(Runtime.strip(line))));
      if (found == null) return "";
      let frame = Runtime.cast(Runtime.strip(found), "String");
      if (frame.startsWith("at ")) return frame;
      let parts = Runtime.cast(
        Runtime.split(frame, "@"),
        "T::Array[String]"
      );
      if (parts.length < 2) return `at ${frame}`;
      let $function = Runtime.must(parts[0]);
      let location = parts.slice(1).join("@");
      return Runtime.isEmpty($function) ? `at ${location}` : `at ${$function} (${location})`;
    }
  };
  function Swill__Model__Attributes(Superclass) {
    class Swill__Model__Attributes_Layer extends Superclass {
      // An attribute is a property that carries a wire key and an attribute
      // mark: the validation, dirty tracking, and codec paths all read those
      // marks off the property descriptor. The registry is the same
      // declaration as data, for code that asks the class rather than an
      // instance.
      // Materialize an instance from a wire hash keyed by attribute keys.
      // Attribute values by wire key.
      collectAttributes() {
        return this.collectSelectedAttributes(null);
      }
      collectSelectedAttributes(only) {
        let selected = only ? Runtime.cast(only, "T::Array[T.untyped]").map((name) => Runtime.send(name, "to_s")) : null;
        let result = Runtime.cast({}, "T::Hash[T.untyped, T.untyped]");
        Object.entries(this.constructor.modelAttributes()).forEach(([name, descriptor]) => {
          let declared_name = Runtime.cast(name, "String");
          let declared = Runtime.cast(descriptor, "T::Hash[String, T.untyped]");
          if (Runtime.isTruthy(selected && !selected.includes(declared_name))) return;
          return result[declared.key] = Runtime.read(this, declared_name);
        });
        return result;
      }
      applyAttributes(source) {
        let values = Runtime.cast(source, "T::Hash[T.untyped, T.untyped]");
        Object.entries(this.constructor.modelAttributes()).forEach(([name, descriptor]) => {
          let declared_name = Runtime.cast(name, "String");
          let declared = Runtime.cast(descriptor, "T::Hash[String, T.untyped]");
          let key = Runtime.cast(declared.key, "String");
          let candidates = [key, key, declared_name, declared_name];
          let found = candidates.find((candidate) => Object.hasOwn(values, candidate));
          if (!Runtime.isTruthy(found)) return;
          let value = this.appliedAttributeValue(declared, values[found]);
          return Runtime.write(this, declared_name, value);
        });
        return this;
      }
      // Declared attributes coerce through the validate_<name>(value, previous)
      // convention, resolved from metadata. A validator may raise to reject.
      coercePropertyValue(name, value, previous) {
        value = super.coercePropertyValue(name, value, previous);
        if (!Object.hasOwn(this.constructor.modelAttributes(), name)) return value;
        let validator = `validate_${name}`;
        if (!Runtime.isTruthy(Runtime.respondsTo(this, validator))) return value;
        if (!Runtime.isTruthy(Runtime.methodAccepts(this, validator, 2))) {
          throw new Error(`Validator must take a value and a previous value: ${validator}`);
        }
        ;
        return Runtime.invoke(this, validator, value, previous);
      }
      propertyWillChange(name, previous, value) {
        return super.propertyWillChange(name, previous, value);
      }
      appliedAttributeValue(descriptor, value) {
        if (value != null) return value;
        let type = Runtime.cast(descriptor.type, "String");
        if (type === "T.untyped" || type === "NilClass" || type.startsWith("T.nilable(")) {
          return value;
        }
        ;
        return Runtime.duplicate(descriptor.default);
      }
    }
    return Swill__Model__Attributes_Layer;
  }
  function Swill__Model__Attributes_ClassMethods(Superclass) {
    class Swill__Model__Attributes_ClassMethods_Layer extends Object {
      fromAttributes(source) {
        return Runtime.invoke(new this(), "apply_attributes", source);
      }
      modelAttributes() {
        return Runtime.inheritableRegistry(this, "modelAttributes", "hash");
      }
    }
    Object.setPrototypeOf(Swill__Model__Attributes_ClassMethods_Layer.prototype, Superclass);
    return Swill__Model__Attributes_ClassMethods_Layer.prototype;
  }
  function Swill__Model__DirtyTracking(Superclass) {
    class Swill__Model__DirtyTracking_Layer extends Superclass {
      dirty() {
        return this.dirtyAttributes.slice();
      }
      // The dirty attributes' values by wire key: what a PATCH carries.
      collectDirtyAttributes() {
        return this.collectSelectedAttributes(this.dirtyAttributes);
      }
      markCleanBang() {
        this._dirty_baseline = {};
        this.dirtyAttributes = [];
        return this;
      }
      // Server, codec, and draft application is clean; only user mutation
      // through setters marks attributes dirty.
      applyAttributes(source) {
        this._dirty_suspensions = Runtime.logicalOr(
          this._dirty_suspensions,
          () => 0
        ) + 1;
        try {
          super.applyAttributes(source);
        } finally {
          this._dirty_suspensions = this._dirty_suspensions - 1;
        }
        ;
        return this;
      }
      propertyWillChange(name, previous, value) {
        super.propertyWillChange(name, previous, value);
        if (Runtime.logicalOr(this._dirty_suspensions, () => 0) > 0) return;
        let attributes = Runtime.cast(
          this.constructor.modelAttributes(),
          "T::Hash[String, T.untyped]"
        );
        if (!Object.hasOwn(attributes, `${name}`)) return;
        return this.markAttributeDirty(name, previous, value);
      }
      markAttributeDirty(name, previous, value) {
        let baseline = this._dirty_baseline ||= {};
        let names2 = this.dirtyAttributes;
        if (names2.includes(name)) {
          if (Runtime.isEqual(baseline[name], value)) {
            return this.dirtyAttributes = names2.filter((candidate) => !Runtime.isEqual(candidate, name));
          }
        } else {
          baseline[name] = previous;
          return this.dirtyAttributes = [...names2, name];
        }
      }
    }
    return Swill__Model__DirtyTracking_Layer;
  }
  function Swill__Model__Drafts(Superclass) {
    class Swill__Model__Drafts_Layer extends Superclass {
      // Returns a new instance of the model's class holding every attribute
      // of this object, made from this object: `draft?` is true on the copy
      // and `draft_of?` names this object. The copy is clean.
      draft() {
        let copy = new this.constructor();
        Runtime.invoke(copy, "apply_attributes", this.collectAttributes());
        copy.draftOriginal = this;
        return copy;
      }
      // Applies the attributes of `copy`, a draft made by this object, to
      // this object and returns it. The application is clean, as any
      // `apply_attributes` is; the values passed the validators when the
      // draft was written. Raises when `copy` was not drafted from this
      // object.
      applyDraft(copy) {
        if (!Runtime.isTruthy(Runtime.invoke(copy, "draft_of?", this))) {
          throw new Error("apply_draft requires a draft made from this object");
        }
        ;
        this.applyAttributes(Runtime.send(copy, "collect_attributes"));
        return this;
      }
      // Whether this object is a draft made by `draft`.
      isDraft() {
        return !!Runtime.isTruthy(this._draft_original);
      }
      // Whether this object is a draft made from `original`.
      isDraftOf(original) {
        return Runtime.isEqual(this._draft_original, original);
      }
      // Records `original` as the object this copy was drafted from. `draft`
      // sets it on the copy it makes; protected so that a subclass's own
      // `draft` can do the same and nothing else can.
      set draftOriginal(original) {
        this._draft_original = original;
        return this._draft_original;
      }
    }
    return Swill__Model__Drafts_Layer;
  }
  var Swill__Model__Base = class extends Swill__Object {
  };
  var Swill__Model__Editable = class extends Swill__Model__Base {
  };
  function Swill__Model__Associations(Superclass) {
    class Swill__Model__Associations_Layer extends Superclass {
    }
    return Swill__Model__Associations_Layer;
  }
  function Swill__Model__Associations_ClassMethods(Superclass) {
    class Swill__Model__Associations_ClassMethods_Layer extends Object {
      modelAssociations() {
        return Runtime.inheritableRegistry(this, "modelAssociations", "hash");
      }
    }
    Object.setPrototypeOf(Swill__Model__Associations_ClassMethods_Layer.prototype, Superclass);
    return Swill__Model__Associations_ClassMethods_Layer.prototype;
  }
  var Swill__Model__Store = class extends Swill__Object {
    constructor() {
      super();
      this._instances = Runtime.cast({}, "T::Hash[String, Resource]");
    }
    get(id) {
      return Object.hasOwn(this._instances, id) ? this._instances[id] : null;
    }
    isInclude(id) {
      return Object.hasOwn(this._instances, id);
    }
    put(instance) {
      let id = instance.id;
      if (id == null) throw new Error("Store#put requires an id");
      let existing = this._instances[id];
      if (Runtime.isTruthy(existing && existing !== instance)) {
        existing.applyAttributes(instance.collectAttributes());
        return existing;
      }
      ;
      this._instances[id] = instance;
      return instance;
    }
    remove(id) {
      return Runtime.deleteKey(this._instances, id);
    }
    clear() {
      this._instances = {};
      return this._instances;
    }
    values() {
      return Object.values(this._instances);
    }
  };
  function Swill__Model__Identity(Superclass) {
    class Swill__Model__Identity_Layer extends Superclass {
    }
    return Swill__Model__Identity_Layer;
  }
  function Swill__Model__Identity_ClassMethods(Superclass) {
    class Swill__Model__Identity_ClassMethods_Layer extends Object {
      store() {
        return Runtime.identityStore(this);
      }
      get(id) {
        return this.store().get(id);
      }
      isPooled(id) {
        return this.store().isInclude(id);
      }
      put(instance) {
        return this.store().put(instance);
      }
      remove(id) {
        return this.store().remove(id);
      }
      clear() {
        return this.store().clear();
      }
      values() {
        return this.store().values();
      }
      endpoint(...values) {
        return Runtime.classSetting(this, "endpoint", values);
      }
      resourceType(...values) {
        return Runtime.classSetting(this, "resource_type", values);
      }
      codec(...values) {
        return Runtime.classSetting(this, "codec", values);
      }
    }
    Object.setPrototypeOf(Swill__Model__Identity_ClassMethods_Layer.prototype, Superclass);
    return Swill__Model__Identity_ClassMethods_Layer.prototype;
  }
  var Swill__Model__Collection = class extends Swill__Object {
    replace(records) {
      this.records = records;
      this.error = null;
      this.loaded = true;
      this.loading = false;
      return this;
    }
    first() {
      return this.records[0];
    }
    last() {
      return this.records.at(-1);
    }
    size() {
      return this.records.length;
    }
    isEmpty() {
      return Runtime.isEmpty(this.records);
    }
    isLoaded() {
      return this.loaded;
    }
    isLoading() {
      return this.loading;
    }
    at(index) {
      return this.records[index];
    }
  };
  var Swill__Model__AssociationCollection = class extends Swill__Model__Collection {
    // The records the server last sent, frozen. Reading them on a saved
    // owner requests the association when it is unloaded or stale.
    // Whether the owner holds a membership the server sent, nil included.
    // Whether the server has invalidated the membership since it was sent.
    // A stale collection keeps its records until it refreshes.
    // Whether a request for the membership is in flight.
    // The message of the last failed request for the membership, or nil.
    // `stale`, as a predicate.
    isStale() {
      return this.stale;
    }
    // Makes this collection the value of the association `name` on
    // `owner`. `Distant::Object` calls this as it creates the collection;
    // from then on the collection's state is read from the owner.
    attachAssociation(owner, name) {
      this._association_owner = owner;
      this._association_name = name;
      return this._association_name;
    }
    // The owner's `<name>_<state>` property, or nil before an owner is
    // attached. Reading it inside a computed property makes that property
    // follow the owner's.
    associationState(state2) {
      let owner = this._association_owner;
      if (!owner) return null;
      return Runtime.read(owner, `${this._association_name}_${state2}`);
    }
    propertyWillAccess(name) {
      super.propertyWillAccess(name);
      let owner = this._association_owner;
      if (Runtime.isTruthy(owner && name === "records")) {
        return owner.propertyWillAccess(this._association_name);
      }
    }
    constructor() {
      super();
      this._applying_membership = Runtime.cast(false, "T::Boolean");
      this._association_owner = Runtime.cast(
        null,
        "T.nilable(Swill::Distant::Object)"
      );
      this._association_name = Runtime.cast("", "String");
      Object.freeze(this.records);
    }
    // Raises: association membership is read-only and changes through a
    // server operation.
    replace(_records) {
      return (() => {
        throw new Error("Association membership is read-only; use a server operation");
      })();
    }
    coercePropertyValue(name, value, previous) {
      if (Runtime.isTruthy(name === "records" && !this._applying_membership)) {
        throw new Error("Association membership is read-only; use a server operation");
      }
      ;
      return super.coercePropertyValue(name, value, previous);
    }
    // Replaces the membership with a frozen copy of `records`. The owner
    // calls this as it applies the server's value for the association.
    applyMembership(records) {
      this._applying_membership = true;
      try {
        return this.records = Object.freeze(records.slice());
      } finally {
        this._applying_membership = false;
      }
    }
  };
  var Swill__Model__ResultSet = class extends Swill__Model__Collection {
  };
  var Swill__Model__Association = class extends Swill__Object {
    constructor(descriptor) {
      super();
      this._name = Runtime.cast(descriptor.name, "String");
      this._key = Runtime.cast(descriptor.key, "String");
      this._kind = Runtime.cast(descriptor.kind, "String");
      this._type = Runtime.cast(descriptor.type, "String");
      this._url = Runtime.cast(descriptor.url, "T.nilable(String)");
    }
    get name() {
      return this._name;
    }
    get key() {
      return this._key;
    }
    isMany() {
      return this._kind === "many";
    }
    // The declared class, by its installed name: an association may name a
    // class defined later, so the descriptor carries the name.
    modelClass() {
      return Runtime.resolve(this._type);
    }
    // Where an owner's related records are: the declared pattern with the
    // owner's id, or the owner's own URL followed by the key.
    urlFor(owner) {
      let id = Runtime.must(owner.id);
      let pattern = this._url;
      if (pattern != null) return pattern.replace(":id", encodeURIComponent(id));
      return `${owner.constructor.resourceURL(id)}/${this._key}`;
    }
  };
  var Swill__Model__Codec = class extends Swill__Object {
    static parseOne(model_class, payload) {
      return (() => {
        throw new Error("codec does not parse");
      })();
    }
    static parseMany(model_class, payload) {
      return (() => {
        throw new Error("codec does not parse");
      })();
    }
    static serialize(model, dirty_only) {
      return (() => {
        throw new Error("codec does not serialize");
      })();
    }
    static attributesOf(model, dirty_only) {
      let attributes = dirty_only ? model.collectDirtyAttributes() : model.collectAttributes();
      Runtime.deleteKey(attributes, "id");
      return attributes;
    }
  };
  var Swill__Model__PlainJSON = class extends Swill__Model__Codec {
    static parseOne(model_class, payload) {
      if (payload == null) return null;
      return this.materialize(
        model_class,
        Runtime.cast(payload, "T::Hash[String, T.untyped]")
      );
    }
    static parseMany(model_class, payload) {
      return Runtime.cast(payload, "T::Array[T.untyped]").map((item) => this.materialize(
        model_class,
        Runtime.cast(item, "T::Hash[String, T.untyped]")
      ));
    }
    static serialize(model, dirty_only) {
      return Swill__Model__Codec.attributesOf(model, dirty_only);
    }
    static materialize(model_class, values) {
      let raw = values.id;
      let id = raw == null ? null : `${raw}`;
      let instance = (id != null ? model_class.get(id) : null) || new model_class();
      instance.applyAttributes(values);
      instance.applyAttributes({ id });
      if (id != null) model_class.put(instance);
      return instance;
    }
  };
  var Swill__Model__JSONAPI = class extends Swill__Model__Codec {
    static parseOne(model_class, payload) {
      let document2 = Runtime.cast(payload, "T::Hash[String, T.untyped]");
      let data = document2.data;
      if (Array.isArray(data)) {
        throw new Error("expected a single JSON:API resource");
      }
      ;
      this.pool(document2);
      return data == null ? null : this.pooled(Runtime.cast(
        data,
        "T::Hash[String, T.untyped]"
      ));
    }
    static parseMany(model_class, payload) {
      let document2 = Runtime.cast(payload, "T::Hash[String, T.untyped]");
      let data = document2.data;
      if (!Array.isArray(data)) throw new Error("expected a JSON:API collection");
      this.pool(document2);
      return Runtime.compact(this.resourcesIn(data).map((resource) => this.pooled(resource)));
    }
    static serialize(model, dirty_only) {
      let attributes = Swill__Model__Codec.attributesOf(model, dirty_only);
      let resource = Runtime.cast(
        { type: model.constructor.resourceType(), attributes },
        "T::Hash[String, T.untyped]"
      );
      let id = model.id;
      if (id != null) resource.id = id;
      return { data: resource };
    }
    static pool(document2) {
      let resources = this.resourcesIn(document2.included).concat(this.resourcesIn(document2.data));
      resources.forEach((resource) => this.materialize(resource));
      return resources.forEach((resource) => this.hydrate(resource));
    }
    static resourcesIn(value) {
      if (value == null) return [];
      if (Array.isArray(value)) {
        return Runtime.cast(value, "T::Array[T::Hash[String, T.untyped]]");
      }
      ;
      return [Runtime.cast(value, "T::Hash[String, T.untyped]")];
    }
    static materialize(resource) {
      let raw_type = resource.type;
      let type = `${raw_type}`;
      let model_class = Swill__Model__Resource.classForType(type);
      if (!model_class) {
        Runtime.warn(`no model class declares resource_type ${type}`);
        return null;
      }
      ;
      let raw_id = resource.id;
      if (raw_id == null) {
        Runtime.warn(`a JSON:API resource of type ${type} has no id`);
        return null;
      }
      ;
      let id = `${raw_id}`;
      let instance = model_class.get(id) || new model_class();
      let attributes = resource.attributes;
      if (Runtime.isTruthy(attributes)) instance.applyAttributes(attributes);
      instance.applyAttributes({ id });
      return model_class.put(instance);
    }
    static pooled(resource) {
      let raw_type = resource.type;
      let model_class = Swill__Model__Resource.classForType(`${raw_type}`);
      let id = resource.id;
      if (!Runtime.isTruthy(model_class && id != null)) return null;
      return model_class.get(`${id}`);
    }
    static hydrate(resource) {
      let instance = this.pooled(resource);
      let linkages = resource.relationships;
      if (!Runtime.isTruthy(instance && linkages)) return;
      return instance.associations().forEach((association) => {
        let related, related_one;
        let linkage = Runtime.logicalOr(
          linkages[association.key],
          () => linkages[association.name]
        );
        if (!Runtime.isTruthy(linkage)) return;
        let data = linkage.data;
        if (association.isMany()) {
          if (!Array.isArray(data)) return;
          related = this.resourcesIn(data).map((item) => this.pooled(item));
          if (related.includes(null)) return;
          return instance.assignAssociation(association.name, related);
        } else if (data == null) {
          return instance.assignAssociation(association.name, null);
        } else if (!Array.isArray(data)) {
          related_one = this.pooled(Runtime.cast(
            data,
            "T::Hash[String, T.untyped]"
          ));
          if (related_one) {
            return instance.assignAssociation(association.name, related_one);
          }
        }
      });
    }
  };
  var Swill__Model__Dataset = class extends Swill__Object {
    constructor(model_class, url, params) {
      super();
      this._model_class = model_class;
      this._url = url;
      this._params = params;
    }
    get url() {
      return this._url;
    }
    get params() {
      return this._params;
    }
    async reload() {
      this.loading = true;
      this.error = null;
      try {
        this.records = this._model_class.parseMany(await Swill__Wire.default().getJSON(
          this._url,
          Runtime.keywordArguments({ params: this._params })
        ));
      } catch (failure) {
        this.error = failure.message;
      } finally {
        this.loading = false;
      }
      ;
      return this;
    }
  };
  var Swill__Model__Resource = class extends Swill__Model__Editable {
    // Creates an empty, unsaved resource with no association requests in
    // flight.
    constructor() {
      super();
      this._association_requests = Runtime.cast(
        {},
        "T::Hash[String, T.untyped]"
      );
    }
    static classForType(type) {
      return Runtime.classWithSetting("resource_type", type);
    }
    static activeCodec() {
      return Runtime.logicalOr(this.codec(), () => Swill__Model__JSONAPI);
    }
    static parseOne(payload) {
      return this.activeCodec().parseOne(this, payload);
    }
    static parseMany(payload) {
      return this.activeCodec().parseMany(this, payload);
    }
    // Returns this resource encoded by the active codec for a request: every
    // attribute, or only the dirty ones when `dirty_only` is true.
    serialize(dirty_only) {
      return this.constructor.activeCodec().serialize(this, dirty_only);
    }
    static endpointURL() {
      let url = this.endpoint();
      if (!Runtime.isTruthy(url)) throw new Error("no endpoint declared");
      return `${url}`;
    }
    static resourceURL(id) {
      return Swill__Wire.resourceURL(this.endpointURL(), id);
    }
    static async find(id) {
      let cached = this.get(id);
      if (cached) return cached;
      return await this.fetch(id);
    }
    static async fetch(id) {
      let url = this.resourceURL(id);
      let record2 = this.parseOne(await Swill__Wire.default().getJSON(url));
      if (!record2) throw new Error(`no record at ${url}`);
      return record2;
    }
    static async findAll() {
      return await this.fetchAll(this.endpointURL(), {});
    }
    static async where(params) {
      return await this.fetchAll(this.endpointURL(), params);
    }
    static async fetchAll(url, params) {
      return this.parseMany(await Swill__Wire.default().getJSON(
        url,
        Runtime.keywordArguments({ params })
      ));
    }
    static dataset(url, params) {
      return new Swill__Model__Dataset(this, url, params);
    }
    // :section: Persisting
    // Writing this resource to its endpoint, and reading it back.
    // Returns a message describing why this resource cannot be saved, or
    // nil when it can. The default implementation returns nil. Override it
    // to validate before `save` sends a request.
    validate() {
      return null;
    }
    async save() {
      let problem = this.validate();
      if (problem != null) throw new Error(`${problem}`);
      let creating = this.id == null;
      if (Runtime.isTruthy(!creating && !this.isDirty)) return this;
      let method = creating ? "POST" : "PATCH";
      let url = creating ? this.constructor.endpointURL() : this.constructor.resourceURL(Runtime.must(this.id));
      let response = await Swill__Wire.default().requestJSON(
        method,
        url,
        Runtime.keywordArguments({ body: this.serialize(!creating) })
      );
      let persisted = this.constructor.parseOne(response);
      if (!persisted) throw new Error(`${method} ${url} returned no record`);
      this.id = persisted.id;
      this.applyAttributes(persisted.collectAttributes());
      this.markCleanBang();
      if (Runtime.isTruthy(creating && persisted !== this)) {
        this.constructor.remove(Runtime.must(this.id));
      }
      ;
      this.constructor.put(this);
      return this;
    }
    async delete() {
      let identifier = this.id;
      if (identifier == null) return this;
      await Swill__Wire.default().requestJSON(
        "DELETE",
        this.constructor.resourceURL(identifier)
      );
      this.constructor.remove(identifier);
      return this;
    }
    async reload() {
      let identifier = this.id;
      if (identifier == null) throw new Error("reload requires an id");
      await this.constructor.fetch(identifier);
      this.markCleanBang();
      return this;
    }
    // :section: Loading Associations
    // Associations declared with `has_many` and `has_one`. Each is a value
    // property with `_loading`, `_loaded` and `_error` properties beside it;
    // reading the value of a saved resource starts its request.
    // Returns an `Association` for each association this class declares,
    // in declaration order.
    associations() {
      let descriptors = Runtime.cast(
        Object.values(this.constructor.modelAssociations()),
        "T::Array[T::Hash[String, T.untyped]]"
      );
      return descriptors.map((descriptor) => new Swill__Model__Association(descriptor));
    }
    // Returns the `Association` declared as `name`. Raises when the class
    // declares no such association.
    association(name) {
      let descriptor = this.constructor.modelAssociations()[name];
      if (!Runtime.isTruthy(descriptor)) {
        throw new Error(`${name} is not an association`);
      }
      ;
      return new Swill__Model__Association(Runtime.cast(
        descriptor,
        "T::Hash[String, T.untyped]"
      ));
    }
    // Returns whether the association `name` holds a loaded value.
    isAssociationLoaded(name) {
      return Runtime.read(this, `${name}_loaded`) === true;
    }
    // Sets the association `name` to `value` as though it had loaded:
    // marks it loaded and clears its error. No request is sent.
    assignAssociation(name, value) {
      Runtime.write(this, name, value);
      Runtime.write(this, `${name}_error`, null);
      return Runtime.write(this, `${name}_loaded`, true);
    }
    async loadAssociation(name) {
      if (this.isAssociationLoaded(name)) return Runtime.read(this, name);
      let pending = this._association_requests[name];
      if (Runtime.isTruthy(pending)) {
        await pending;
        return Runtime.read(this, name);
      }
      ;
      return await this.reloadAssociation(name);
    }
    propertyWillAccess(name) {
      super.propertyWillAccess(name);
      if (this.id == null) return;
      if (!Runtime.isTruthy(this.constructor.modelAssociations()[name])) return;
      if (this.isAssociationLoaded(name)) return;
      if (Runtime.read(this, `${name}_loading`) === true) return;
      if (Runtime.read(this, `${name}_error`) != null) return;
      return this.loadAssociationInBackground(name);
    }
    async loadAssociationInBackground(name) {
      try {
        return await this.loadAssociation(name);
      } catch (failure) {
        return Runtime.warn(`${name} did not load: ${failure.message}`);
      }
    }
    async reloadAssociation(name) {
      let pending = this._association_requests[name];
      if (Runtime.isTruthy(pending)) {
        await pending;
        return Runtime.read(this, name);
      }
      ;
      Runtime.write(this, `${name}_loading`, true);
      Runtime.write(this, `${name}_error`, null);
      let request = null;
      try {
        let descriptor = this.association(name);
        let model_class = descriptor.modelClass();
        request = Swill__Wire.default().getJSON(descriptor.urlFor(this));
        this._association_requests[name] = request;
        let payload = await request;
        let value = descriptor.isMany() ? model_class.parseMany(payload) : model_class.parseOne(payload);
        this.assignAssociation(name, value);
      } catch (failure) {
        Runtime.write(this, `${name}_error`, failure.message);
        throw new Error(`${failure.message}`);
      } finally {
        if (Runtime.isEqual(this._association_requests[name], request)) {
          Runtime.deleteKey(this._association_requests, name);
        }
        ;
        Runtime.write(this, `${name}_loading`, false);
      }
      ;
      return Runtime.read(this, name);
    }
  };
  function Swill__Distant__Fields(Superclass) {
    class Swill__Distant__Fields_Layer extends Superclass {
    }
    return Swill__Distant__Fields_Layer;
  }
  function Swill__Distant__Fields_ClassMethods(Superclass) {
    class Swill__Distant__Fields_ClassMethods_Layer extends Object {
      dataFields() {
        return Runtime.inheritableRegistry(this, "dataFields", "hash");
      }
      dataModelName(...values) {
        return Runtime.classSetting(this, "data_model_name", values);
      }
    }
    Object.setPrototypeOf(Swill__Distant__Fields_ClassMethods_Layer.prototype, Superclass);
    return Swill__Distant__Fields_ClassMethods_Layer.prototype;
  }
  var Swill__Distant__Object = class _Swill__Distant__Object extends Swill__Model__Editable {
    // Whether the server has deleted this record. A deleted object stays as
    // a tombstone: it cannot be saved, drafted or loaded.
    // `deleted`, as a predicate.
    // Creates an object with no loaded fields and a stable, empty
    // `AssociationCollection` for each to-many association.
    constructor() {
      super();
      this._data_generations = Runtime.cast(
        {},
        "T::Hash[String, T::Hash[String, Integer]]"
      );
      this._data_controllers = Runtime.cast(
        {},
        "T::Hash[String, ArrayController]"
      );
      Object.entries(this.constructor.dataFields()).forEach(([name, descriptor]) => {
        if (descriptor.kind !== "many") return;
        let collection = new Swill__Model__AssociationCollection();
        collection.attachAssociation(this, name);
        return Runtime.write(this, `data_${name}`, collection);
      });
    }
    // :section: Field State
    // What the client knows about each field. Each predicate reads the
    // field's state property, so a binding may read the property instead.
    // Whether the field `name` holds a value the server sent, nil included.
    // Reads `<name>_loaded`.
    isFieldLoaded(name) {
      return this.readDataState(name, "loaded") === true;
    }
    // Whether the server has invalidated the association `name` since it
    // was loaded. A stale association keeps its records readable until it
    // refreshes. Reads `<name>_stale`; false for a scalar field.
    isFieldStale(name) {
      return this.readDataState(name, "stale") === true;
    }
    // Whether a request for the field `name` is in flight. Reads
    // `<name>_loading`.
    isFieldLoading(name) {
      return this.readDataState(name, "loading") === true;
    }
    // The message of the last failed request for the field `name`, or nil
    // when its last request succeeded or none was made. Reads
    // `<name>_error`.
    fieldError(name) {
      return Runtime.cast(
        this.readDataState(name, "error"),
        "T.nilable(String)"
      );
    }
    // :section: Associations
    // To-many associations as collections and controllers.
    // Returns the `ArrayController` that arranges the to-many association
    // `name`, creating it on first call and keeping it for the object's
    // lifetime, so views that bind to it share one sort and selection. The
    // generated `<name>_controller` accessor calls this. Constructing the
    // controller loads nothing. The controller is released when the object
    // deallocs, which the client does when it forgets the object. Raises
    // when `name` is not a to-many association.
    associationController(name) {
      let existing = this._data_controllers[name];
      if (existing) return existing;
      let descriptor = this.constructor.dataFields()[name];
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        descriptor,
        () => descriptor.kind === "many"
      ))) throw new Error(`Unknown to-many association ${name}`);
      let controller = new Swill__ArrayController();
      controller.content = this.dataCollection(name);
      this._data_controllers[name] = controller;
      this.retain(() => {
        controller.content = null;
        controller.dealloc();
        return Runtime.deleteKey(this._data_controllers, name);
      });
      return controller;
    }
    async loadField(name) {
      if (this.isDraft()) throw new Error("A distant draft cannot hydrate fields");
      if (this.isDeleted) {
        throw new Error("A deleted distant object cannot hydrate fields");
      }
      ;
      if (this.id == null) {
        throw new Error("An unsaved distant object cannot hydrate fields");
      }
      ;
      return await Swill__Distant__Client.default().loadField(
        this,
        name,
        false
      );
    }
    async reloadField(name) {
      if (this.isDraft()) throw new Error("A distant draft cannot hydrate fields");
      if (this.isDeleted) {
        throw new Error("A deleted distant object cannot hydrate fields");
      }
      ;
      if (this.id == null) {
        throw new Error("An unsaved distant object cannot hydrate fields");
      }
      ;
      return await Swill__Distant__Client.default().loadField(
        this,
        name,
        true
      );
    }
    async save() {
      if (this.isDeleted) throw new Error("Cannot persist a deleted distant object");
      if (this.isDraft()) {
        throw new Error("Save a distant draft with original.apply_draft(draft)");
      }
      ;
      let attributes = this.collectDirtyAttributes();
      if (Runtime.isTruthy(Runtime.logicalAnd(
        this.id,
        () => Runtime.isEmpty(attributes)
      ))) return this;
      if (this.id != null) {
        await Swill__Distant__Client.default().update(this, attributes);
      } else {
        await Swill__Distant__Client.default().create(this, attributes);
      }
      ;
      this.markCleanBang();
      return this;
    }
    async applyDraft(copy) {
      if (this.isDeleted) throw new Error("Cannot persist a deleted distant object");
      if (!copy.isDraftOf(this)) {
        throw new Error("apply_draft requires a draft created from this distant object");
      }
      ;
      let attributes = copy.collectDirtyAttributes();
      if (Runtime.isEmpty(attributes)) return this;
      await Swill__Distant__Client.default().update(this, attributes);
      copy.markCleanBang();
      return this;
    }
    async delete() {
      if (this.isDeleted) throw new Error("Cannot persist a deleted distant object");
      if (this.isDraft()) {
        throw new Error("Save a distant draft with original.apply_draft(draft)");
      }
      ;
      if (this.id == null) {
        throw new Error("Cannot delete an unsaved distant object");
      }
      ;
      await Swill__Distant__Client.default().delete(this);
      return this;
    }
    // :section: Drafting
    // Editing a copy and applying it.
    // Returns a detached copy of this object holding its id and every loaded
    // scalar field, marked loaded on the copy, for editing without touching
    // the original. A draft never loads fields on its own; `apply_draft` on
    // the original saves it, and `draft?` and `draft_of?` name the lineage.
    // Raises for a deleted or unsaved object.
    draft() {
      if (this.isDeleted) throw new Error("Cannot draft a deleted distant object");
      if (this.id == null) {
        throw new Error("Save a distant object before drafting it");
      }
      ;
      let copy = new this.constructor();
      copy.applyDataField("id", this.id, 0, true);
      Object.entries(this.constructor.dataFields()).forEach(([name, descriptor]) => {
        if (!Runtime.isTruthy(descriptor.kind === "field" && this.readDataState(
          name,
          "loaded"
        ) === true)) return;
        return copy.applyDataField(name, Runtime.read(this, name), 0, true);
      });
      copy.markCleanBang();
      copy.draftOriginal = this;
      return copy;
    }
    // :section: Driven by the Client
    // The protocol between `Client` and the objects it holds. The client
    // calls these as responses, invalidations and failures arrive; an
    // application reads the field state they leave behind and does not
    // call them.
    //
    // Responses arrive out of order, so each field keeps two generation
    // watermarks: the generation of the response last applied to it, and
    // of the request last sent for it. A response older than what a field
    // already holds is ignored, and a failure older than either is ignored,
    // so a slow reply cannot undo a newer value or a newer invalidation.
    // Requests the field `name` from the client when it is read on a saved
    // object that is neither a draft nor deleted. The property system
    // invokes this before resolving a property declared `will_access:`,
    // and an `AssociationCollection` invokes it on its owner when its
    // records are read. Public because the collection calls it.
    propertyWillAccess(name) {
      super.propertyWillAccess(name);
      if (this.isDraft() || this.isDeleted) return;
      if (Object.hasOwn(this.constructor.dataFields(), name)) {
        return Swill__Distant__Client.default().demand(this, name);
      }
    }
    // Applies `value` as the server's value for the field `name` from a
    // response of `generation`, and marks the field loaded, current and
    // without error. Ignored when a newer response already applied. A
    // to-many association's collection replaces its membership; a scalar
    // field and `id` apply as attributes, cleanly; a to-one association is
    // written to its stored property. The value is left alone, and only
    // the state marked, when the field is dirty and `overwrite_dirty` is
    // false: a background patch does not replace a local edit.
    applyDataField(name, value, generation, overwrite_dirty) {
      let descriptor;
      let generations = this.dataGeneration(name);
      if (generation < Runtime.must(generations.applied)) return;
      generations.applied = generation;
      if (!Runtime.isTruthy(!overwrite_dirty && this.dirtyAttributes.includes(name))) {
        descriptor = this.constructor.dataFields()[name];
        if (Runtime.isTruthy(Runtime.logicalAnd(
          descriptor,
          () => descriptor.kind === "many"
        ))) {
          this.dataCollection(name).applyMembership(Runtime.cast(
            Runtime.logicalOr(value, () => []),
            "T::Array[T.untyped]"
          ));
        } else if (Runtime.isTruthy(Runtime.logicalOr(
          Runtime.logicalAnd(descriptor, () => descriptor.kind === "field"),
          () => name === "id"
        ))) {
          this.applyAttributes({ [name]: value });
        } else {
          Runtime.write(this, `data_${name}`, value);
        }
      }
      ;
      return this.presentDataField(name);
    }
    // Marks the association `name` stale from an invalidation of
    // `generation`, clearing its error and its loading flag; its records
    // stay readable. Ignored for a scalar field, and when a newer response
    // already applied. The client then requests the association again if
    // something observes it (`data_field_observed`), or when it is next
    // read.
    invalidateDataField(name, generation) {
      let descriptor = this.constructor.dataFields()[name];
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        descriptor,
        () => descriptor.kind !== "field"
      ))) return;
      let generations = this.dataGeneration(name);
      if (generation < Runtime.must(generations.applied)) return;
      generations.applied = generation;
      this.writeDataState(name, "stale", true);
      this.writeDataState(name, "loading", false);
      return this.writeDataState(name, "error", null);
    }
    // Whether something observes the field `name`: an observer or a live
    // computed property on the property itself, or on the `records` of a
    // to-many association's collection, as `Runtime.observed` reports.
    // The client refreshes an invalidated association only when this is
    // true; otherwise the next read requests it.
    dataFieldObserved(name) {
      if (Runtime.isTruthy(Runtime.observed(this, name))) return true;
      let descriptor = this.constructor.dataFields()[name];
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        descriptor,
        () => descriptor.kind === "many"
      ))) return false;
      return Runtime.observed(this.dataCollection(name), "records");
    }
    // Records that a request of `generation` for the field `name` was sent,
    // so that `fail_data_field` can ignore the failure of an older one.
    dataRequestStarted(name, generation) {
      return this.dataGeneration(name).requested = generation;
    }
    // Marks the field `name` loading and clears its error, and returns
    // whether a request should be made: false, with nothing changed, when
    // the field is already loading, or is loaded and not stale — unless
    // `reload` is true, which always requests.
    beginDataFieldLoad(name, reload) {
      if (Runtime.isTruthy(Runtime.logicalAnd(
        !reload && this.readDataState(name, "loaded") === true,
        () => this.readDataState(name, "stale") !== true
      ))) return false;
      if (Runtime.isTruthy(!reload && this.readDataState(name, "loading") === true)) {
        return false;
      }
      ;
      this.writeDataState(name, "loading", true);
      this.writeDataState(name, "error", null);
      return true;
    }
    // Records `message` as the error of the field `name` and clears its
    // loading flag; its value and its loaded and stale state are kept. With
    // a `generation`, ignored when a newer response has applied or a newer
    // request has started, so an old failure cannot mark a field that has
    // since moved on.
    failDataFieldWithGeneration(name, message, generation) {
      let generations = this.dataGeneration(name);
      if (Runtime.isTruthy(generation != null ? (() => {
        return generation < Runtime.must(generations.applied) || generation < Runtime.must(generations.requested);
      })() : generation)) return;
      this.writeDataState(name, "loading", false);
      return this.writeDataState(name, "error", message);
    }
    // Returns every field to unloaded: not loaded, not stale, not loading,
    // without error, and with its generations forgotten. Values are kept.
    // The client calls this on each object it forgets when the connection
    // is reset, before the object deallocs.
    resetDataFields() {
      this._data_generations = {};
      return Object.entries(this.constructor.dataFields()).forEach(([name, _descriptor]) => {
        this.writeDataState(name, "loaded", false);
        this.writeDataState(name, "stale", false);
        this.writeDataState(name, "loading", false);
        return this.writeDataState(name, "error", null);
      });
    }
    // The two generation watermarks of the field `name`, created at -1 so
    // the first response of any generation applies. `id` has an entry
    // too; it is the one field with a generation and no state.
    dataGeneration(name) {
      return this._data_generations[name] ||= { applied: -1, requested: -1 };
    }
    // Marks the field `name` loaded, current, not loading and without
    // error, as a response for it leaves it.
    presentDataField(name) {
      this.writeDataState(name, "loaded", true);
      this.writeDataState(name, "stale", false);
      this.writeDataState(name, "loading", false);
      return this.writeDataState(name, "error", null);
    }
    // Writes `value` to the state property `<name>_<state>`, an ordinary
    // observable write. Nothing is written for a name that is not a
    // declared field, such as `id`, or for `stale` on a scalar field,
    // which declares no such property.
    writeDataState(name, state2, value) {
      let descriptor = this.constructor.dataFields()[name];
      if (!Runtime.isTruthy(descriptor)) return;
      if (Runtime.isTruthy(state2 === "stale" && descriptor.kind === "field")) return;
      return Runtime.write(this, `${name}_${state2}`, value);
    }
    // Reads the state property `<name>_<state>`; nil where
    // `write_data_state` would write nothing.
    readDataState(name, state2) {
      let descriptor = this.constructor.dataFields()[name];
      if (!Runtime.isTruthy(descriptor)) return null;
      if (Runtime.isTruthy(state2 === "stale" && descriptor.kind === "field")) {
        return null;
      }
      ;
      return Runtime.read(this, `${name}_${state2}`);
    }
    // The stable collection of the to-many association `name`, held by
    // its stored `data_<name>` property.
    dataCollection(name) {
      return Runtime.cast(
        Runtime.read(this, `data_${name}`),
        "Swill::Model::AssociationCollection"
      );
    }
    failDataField(name, message) {
      return _Swill__Distant__Object.prototype.failDataFieldWithGeneration.call(
        this,
        name,
        message,
        null
      );
    }
  };
  var Swill__Distant__Client = class _Swill__Distant__Client extends Swill__Object {
    // Milliseconds between failed attempts, capped during prolonged outages.
    static RETRY_DELAYS = Object.freeze([
      1e3,
      2e3,
      4e3,
      8e3,
      15e3,
      3e4
    ]);
    // Spread simultaneous reconnects by ten percent in either direction.
    static RETRY_JITTER = 0.1;
    static default() {
      return this._default ||= new this();
    }
    static configure(...__swill_arguments) {
      let __swill_bound = Runtime.bindArguments(__swill_arguments, {
        positional: [],
        keywords: [
          { name: "url", kind: "keyreq" },
          { name: "schema_hash", kind: "keyreq" }
        ],
        keywordRest: null,
        block: "__swill_block"
      });
      let url = Runtime.argument(__swill_bound, "url");
      let schema_hash = Runtime.argument(__swill_bound, "schema_hash");
      this.default();
      return Runtime.configureData(url, schema_hash);
    }
    // Creates the identity store and observes the transport. Transient loss
    // leaves local objects intact; only an intentional reset forgets them.
    constructor() {
      super();
      this._stores = Runtime.cast(
        {},
        "T::Hash[String, T::Hash[String, T.untyped]]"
      );
      this._tombstones = Runtime.cast(
        {},
        "T::Hash[String, T::Hash[String, T.untyped]]"
      );
      this._queued_demands = Runtime.cast({}, "T::Hash[String, T.untyped]");
      this._demand_scheduled = Runtime.cast(false, "T::Boolean");
      this._actor_scope = Runtime.cast(null, "T.nilable(String)");
      this._generation = Runtime.cast(0, "Integer");
      this._active_generations = Runtime.cast([], "T::Array[Integer]");
      this._retry_timer = Runtime.cast(null, "T.nilable(Integer)");
      this._retry_attempt = Runtime.cast(0, "Integer");
      this._connection_detail = Runtime.cast("", "String");
      Swill__NotificationCenter.default().addObserver(
        "application_did_launch",
        (_note) => this.presentConnection()
      );
      Swill__NotificationCenter.default().addObserver(
        "application_will_terminate",
        (_note) => Runtime.closeData()
      );
      Runtime.registerDataLifecycle(
        () => this.reset(),
        () => this.connectionOpened(),
        (state2, detail) => this.connectionChanged(state2, detail)
      );
    }
    async reconnect() {
      if (this.connectionState === "reload_required") {
        return false;
      }
      ;
      this.cancelRetry();
      try {
        await Runtime.connectData();
        return true;
      } catch (_error) {
        return false;
      }
    }
    connectionChanged(state2, detail) {
      this.cancelRetry();
      this.connectionState = state2;
      this._connection_detail = detail;
      if (state2 === "connected" || state2 === "idle") this._retry_attempt = 0;
      if (state2 === "disconnected") {
        let delays = Runtime.cast(
          _Swill__Distant__Client.RETRY_DELAYS,
          "T::Array[Integer]"
        );
        let delay = Runtime.must(delays[Runtime.min([
          this._retry_attempt,
          delays.length - 1
        ])]);
        this._retry_attempt++;
        let jittered = Runtime.cast(
          delay * (1 - _Swill__Distant__Client.RETRY_JITTER + Math.random() * _Swill__Distant__Client.RETRY_JITTER * 2),
          "Float"
        );
        this._retry_timer = setTimeout(
          () => this.reconnect(),
          Math.round(jittered)
        );
      }
      ;
      return this.presentConnection();
    }
    presentConnection() {
      if (!Swill__Application.isRunning()) {
        return;
      }
      ;
      let app = Swill__Application.shared();
      return app.connectionChanged(
        this.connectionState,
        this._connection_detail,
        () => this.reconnect()
      );
    }
    cancelRetry() {
      let timer = this._retry_timer;
      if (timer != null) clearTimeout(timer);
      this._retry_timer = null;
      return this._retry_timer;
    }
    async query(model, name, positional, keywords, result_kind) {
      let value = await this.request(
        "QUERY",
        this.operation(model, name, positional, keywords),
        null,
        false
      );
      return this.wrapResult(value, result_kind);
    }
    async resolve(model, name, positional, keywords, result_kind) {
      let value = await this.request(
        "RESOLVE",
        this.operation(model, name, positional, keywords),
        null,
        false
      );
      return this.wrapResult(value, result_kind);
    }
    async command(object, name, positional, keywords, result_kind) {
      let contents = this.operation(
        object.constructor.dataModelName(),
        name,
        positional,
        keywords
      );
      contents.id = object.id;
      let value = await this.request("COMMAND", contents, null, true);
      return this.wrapResult(value, result_kind);
    }
    async classCommand(model, name, positional, keywords, result_kind) {
      let value = await this.request(
        "COMMAND",
        this.operation(model, name, positional, keywords),
        null,
        true
      );
      return this.wrapResult(value, result_kind);
    }
    async create(object, attributes) {
      await this.request(
        "CREATE",
        {
          model: object.constructor.dataModelName(),
          attributes: this.encodeValue(attributes)
        },
        object,
        true
      );
      return object;
    }
    async update(object, attributes) {
      await this.request(
        "UPDATE",
        {
          model: object.constructor.dataModelName(),
          id: object.id,
          attributes: this.encodeValue(attributes)
        },
        null,
        true
      );
      return object;
    }
    async delete(object) {
      let model = object.constructor.dataModelName();
      let id = Runtime.stringify(object.id);
      let [_value, removed_generation] = await this.requestWithGeneration(
        "DELETE",
        { model, id },
        null,
        true
      );
      Runtime.deleteKey(this.modelStore(model), id);
      this.modelTombstones(model)[id] = {
        object,
        generation: removed_generation
      };
      object.deleted = true;
      Runtime.deleteKey(this._queued_demands, `${model}:${id}`);
      object.dealloc();
      this.pruneTombstones();
      return object;
    }
    // :section: Called by Distant Objects
    // What a distant object asks for when a field is read or loaded.
    // Queues a load of the field `name` on `object`, joining every other
    // field demanded in this JavaScript turn into one `GET`. Does nothing
    // for an unsaved object, or for a field already loaded or loading;
    // `Object#begin_data_field_load` decides, and marks the field loading.
    // `Object#property_will_access` calls this when an unloaded field of a
    // saved object is read.
    demand(object, name) {
      if (object.id == null) return;
      if (!object.beginDataFieldLoad(name, false)) return;
      let model = object.constructor.dataModelName();
      let key = `${model}:${object.id}`;
      let item = this._queued_demands[key];
      if (!Runtime.isTruthy(item)) {
        item = { object, fields: [] };
        this._queued_demands[key] = item;
      }
      ;
      let fields = Runtime.cast(item.fields, "T::Array[String]");
      if (!fields.includes(name)) Runtime.append(fields, name);
      return this.scheduleDemands();
    }
    async loadField(object, name, reload) {
      if (Runtime.isTruthy(Runtime.logicalAnd(
        !reload && Runtime.read(object, `${name}_loaded`) === true,
        () => Runtime.read(object, `${name}_stale`) !== true
      ))) return Runtime.read(object, name);
      object.beginDataFieldLoad(name, true);
      await this.request(
        "GET",
        { demands: [this.demandHash(object, [name])] },
        null,
        false
      );
      return Runtime.read(object, name);
    }
    // :section: Called by the Runtime
    // The connection's lifecycle, as the runtime reports it.
    // Forgets every object the client holds: each has its fields reset to
    // unloaded and deallocs, which releases its association controllers, and
    // queued demands and tombstones are dropped. The runtime calls this when
    // the connection is intentionally closed or the handshake changes actor
    // scope: another actor's records are another identity.
    reset() {
      Object.entries(this._stores).forEach(([_model, store]) => {
        let typed_store = Runtime.cast(store, "T::Hash[String, T.untyped]");
        return Object.entries(typed_store).forEach(([_id, object]) => {
          let distant = Runtime.cast(object, "Swill::Distant::Object");
          distant.resetDataFields();
          return distant.dealloc();
        });
      });
      this._stores = {};
      this._tombstones = {};
      this._queued_demands = {};
      this._actor_scope = null;
      return this._actor_scope;
    }
    // Sends the demands queued while the connection was down. The runtime
    // calls this when the connection opens.
    connectionOpened() {
      if (!Runtime.isEmpty(this._queued_demands)) return this.scheduleDemands();
    }
    // The body of a `QUERY`, `RESOLVE` or `COMMAND` message: the model
    // and remote method named, with the arguments encoded for the wire.
    operation(model, name, positional, keywords) {
      return {
        model,
        name,
        arguments: this.encodeArguments(positional),
        keywords: this.encodeKeywords(keywords)
      };
    }
    // A remote method's decoded value as the generated method returns it:
    // a `ResultSet` over the array when the schema says `result_set`, the
    // value itself otherwise.
    wrapResult(value, result_kind) {
      if (result_kind !== "result_set") return value;
      return new Swill__Model__ResultSet().replace(Runtime.cast(
        value,
        "T::Array[T.untyped]"
      ));
    }
    // Positional arguments for the wire, an omitted optional dropped.
    encodeArguments(values) {
      return values.filter((value) => !Runtime.isTruthy(Runtime.isOmittedArgument(value))).map((value) => this.encodeValue(value));
    }
    // Keyword arguments for the wire, an omitted optional dropped.
    encodeKeywords(values) {
      let result = Runtime.cast({}, "T::Hash[T.untyped, T.untyped]");
      Object.entries(values).forEach(([name, value]) => {
        if (!Runtime.isTruthy(Runtime.isOmittedArgument(value))) {
          result[name] = this.encodeValue(value);
        }
      });
      return result;
    }
    // One value as the protocol carries it: a saved distant object as a
    // `$ref` of its model and id, a time as an ISO `$time`, and arrays
    // and records element by element. Anything else is sent as it is.
    encodeValue(value) {
      if (Runtime.isTruthy(value instanceof Swill__Distant__Object && Runtime.send(
        value,
        "id"
      ))) {
        let distant = Runtime.cast(value, "Swill::Distant::Object");
        return { $ref: [
          distant.constructor.dataModelName(),
          Runtime.stringify(distant.id)
        ] };
      }
      ;
      let parts;
      switch (Runtime.dataValueType(value)) {
        case "Time":
          return { $time: Runtime.dataValuePayload(value) };
        case "Date":
          return { $date: Runtime.dataValuePayload(value) };
        case "DateTime":
          return { $datetime: Runtime.dataValuePayload(value) };
        case "BigDecimal":
          return { $decimal: Runtime.dataValuePayload(value) };
        case "TimeOfDay":
          return { $time_of_day: Runtime.dataValuePayload(value) };
        case "RangeValue":
          parts = Runtime.cast(
            Runtime.dataValuePayload(value),
            "T::Array[T.untyped]"
          );
          return { $range: [
            parts[0],
            parts[1],
            this.encodeValue(parts[2]),
            this.encodeValue(parts[3]),
            parts[4],
            parts[5]
          ] };
        case "Interval":
          return { $interval: Runtime.dataValuePayload(value) };
      }
      ;
      if (Runtime.isTruthy(Runtime.dataTime(value))) {
        return { $time: Runtime.dataTimeISO(value) };
      }
      ;
      if (Array.isArray(value)) {
        return Runtime.cast(value, "T::Array[T.untyped]").map((item) => this.encodeValue(item));
      }
      ;
      if (Runtime.isTruthy(Runtime.dataRecord(value))) {
        let result = Runtime.cast({}, "T::Hash[T.untyped, T.untyped]");
        Object.entries(Runtime.cast(value, "T::Hash[T.untyped, T.untyped]")).forEach(([name, item]) => result[name] = this.encodeValue(item));
        return result;
      }
      ;
      return value;
    }
    // One value from the protocol: a `$ref` resolves to the canonical
    // object for its model and id, created if the client holds none — or
    // to `preferred`, an unsaved object of that model awaiting its id; a
    // `$time` and a `$date` become the runtime's time values; a `$value`
    // becomes an instance of the value class it names with its fields
    // written; arrays and records decode element by element.
    // `response_generation` is the generation a new object's id is applied
    // under, so a tombstone of a newer deletion is not brought back.
    decodeValueWithPreferred(value, response_generation, preferred) {
      let parts;
      if (Array.isArray(value)) {
        return Runtime.cast(value, "T::Array[T.untyped]").map((item) => this.decodeValueWithPreferred(item, response_generation, preferred));
      }
      ;
      if (!Runtime.isTruthy(Runtime.dataRecord(value))) return value;
      let record2 = Runtime.cast(value, "T::Hash[String, T.untyped]");
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$ref"
      ))) {
        let reference = Runtime.cast(record2["$ref"], "T::Array[T.untyped]");
        let use_preferred = Runtime.logicalAnd(
          preferred && Runtime.isEqual(
            preferred.constructor.dataModelName(),
            reference[0]
          ),
          () => preferred.id == null
        );
        return this.canonicalWithPreferred(
          Runtime.send(reference[0], "to_s"),
          Runtime.send(reference[1], "to_s"),
          response_generation,
          Runtime.isTruthy(use_preferred) ? preferred : null
        );
      }
      ;
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$time"
      ))) return Runtime.dataTimeFromISO(Runtime.send(record2["$time"], "to_s"));
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$date"
      ))) return Runtime.dataDateFromISO(Runtime.send(record2["$date"], "to_s"));
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$datetime"
      ))) {
        return Runtime.dataDateTimeFromISO(Runtime.send(
          record2["$datetime"],
          "to_s"
        ));
      }
      ;
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$decimal"
      ))) {
        return Runtime.dataDecimalFromString(Runtime.send(
          record2["$decimal"],
          "to_s"
        ));
      }
      ;
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$time_of_day"
      ))) {
        return Runtime.dataTimeOfDayFromISO(Runtime.send(
          record2["$time_of_day"],
          "to_s"
        ));
      }
      ;
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$range"
      ))) {
        parts = Runtime.cast(record2["$range"], "T::Array[T.untyped]");
        return Runtime.dataRange(
          parts[0],
          parts[1],
          this.decodeValue(parts[2], response_generation),
          this.decodeValue(parts[3], response_generation),
          parts[4],
          parts[5]
        );
      }
      ;
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$interval"
      ))) {
        parts = Runtime.cast(record2["$interval"], "T::Array[T.untyped]");
        return Runtime.dataInterval(parts[0], parts[1], parts[2]);
      }
      ;
      if (Runtime.isTruthy(Object.keys(record2).length === 1 && Object.hasOwn(
        record2,
        "$value"
      ))) {
        let tagged = Runtime.cast(record2["$value"], "T::Array[T.untyped]");
        let klass = Runtime.resolve(Runtime.send(tagged[0], "to_s"));
        let attributes = Runtime.cast(
          this.decodeValue(tagged[1], response_generation),
          "T::Hash[String, T.untyped]"
        );
        let object = new klass();
        Object.entries(attributes).forEach(([name, item]) => Runtime.write(object, name, item));
        return object;
      }
      ;
      let result = Runtime.cast({}, "T::Hash[String, T.untyped]");
      Object.entries(record2).forEach(([name, item]) => result[name] = this.decodeValueWithPreferred(
        item,
        response_generation,
        preferred
      ));
      return result;
    }
    // The one object for `model` and `id`: the held object when there is
    // one; the tombstone when the record was deleted at a generation no
    // older than `response_generation`, so an old response cannot revive
    // it; otherwise a new object — `preferred` when given — with its id
    // applied under `response_generation`, held from now on.
    canonicalWithPreferred(model, id, response_generation, preferred) {
      let store = this.modelStore(model);
      let existing = store[id];
      if (Runtime.isTruthy(existing)) {
        return Runtime.cast(existing, "Swill::Distant::Object");
      }
      ;
      let removed = this.modelTombstones(model)[id];
      if (Runtime.isTruthy(Runtime.logicalAnd(
        removed,
        () => response_generation <= removed.generation
      ))) return Runtime.cast(removed.object, "Swill::Distant::Object");
      if (Runtime.isTruthy(removed)) {
        Runtime.deleteKey(this.modelTombstones(model), id);
      }
      ;
      let object = preferred || new (Runtime.resolve(model))();
      Runtime.invoke(
        object,
        "apply_data_field",
        "id",
        id,
        response_generation,
        true
      );
      store[id] = object;
      return object;
    }
    // Applies one patch — a record's model, id, generation and fields —
    // to its canonical object through `Object#apply_data_field`, which
    // ignores a field a newer response already applied. A patch for a
    // record deleted at a newer generation is dropped. `overwrite_dirty`
    // says whether the patch replaces a dirty field: true for the
    // application's own writes, false for what arrives alongside a query.
    applyPatch(patch, preferred, overwrite_dirty) {
      let model = Runtime.send(patch.model, "to_s");
      let id = Runtime.send(patch.id, "to_s");
      let patch_generation = Runtime.cast(patch.generation, "Integer");
      let use_preferred = Runtime.logicalAnd(
        preferred && Runtime.isEqual(
          preferred.constructor.dataModelName(),
          model
        ),
        () => preferred.id == null
      );
      let object = this.canonicalWithPreferred(
        model,
        id,
        patch_generation,
        Runtime.isTruthy(use_preferred) ? preferred : null
      );
      let removed = this.modelTombstones(model)[id];
      if (Runtime.isTruthy(Runtime.logicalAnd(
        removed,
        () => patch_generation <= removed.generation
      ))) return object;
      let fields = Runtime.cast(
        Runtime.logicalOr(patch.fields, () => ({})),
        "T::Hash[String, T.untyped]"
      );
      Object.entries(fields).forEach(([name, encoded]) => {
        let value = this.decodeValue(encoded, patch_generation);
        return object.applyDataField(
          name,
          value,
          patch_generation,
          overwrite_dirty
        );
      });
      return object;
    }
    // Marks the fields an invalidation names stale on the object it
    // names, through `Object#invalidate_data_field`. An invalidation of an
    // object the client does not hold, or has deleted, does nothing: it
    // never creates an object.
    applyInvalidation(effect) {
      let object = this.modelStore(Runtime.send(effect.model, "to_s"))[Runtime.send(
        effect.id,
        "to_s"
      )];
      if (!Runtime.isTruthy(object)) return;
      let distant = Runtime.cast(object, "Swill::Distant::Object");
      if (distant.isDeleted) return;
      return Runtime.cast(effect.fields, "T::Array[String]").forEach((name) => distant.invalidateDataField(
        name,
        Runtime.cast(effect.generation, "Integer")
      ));
    }
    // Demands each field an invalidation left stale that something
    // observes (`Object#data_field_observed`), so a bound view refreshes
    // without a read; an unobserved stale field waits for its next read.
    refreshObserved(effect) {
      let object = this.modelStore(Runtime.send(effect.model, "to_s"))[Runtime.send(
        effect.id,
        "to_s"
      )];
      if (!Runtime.isTruthy(object)) return;
      let distant = Runtime.cast(object, "Swill::Distant::Object");
      if (distant.isDeleted) return;
      return Runtime.cast(effect.fields, "T::Array[String]").forEach((name) => {
        if (Runtime.isTruthy(Runtime.read(distant, `${name}_stale`) === true && distant.dataFieldObserved(name))) {
          this.demand(distant, name);
        }
      });
    }
    // Applies a response message in order — its invalidations, then its
    // patches, then a demand for each invalidated field that is observed
    // — and returns its decoded value. Patches follow invalidations so a
    // patch carrying the invalidated field satisfies it without a request.
    applyEnvelope(message, response_generation, preferred, overwrite_dirty) {
      let invalidations = Runtime.cast(
        Runtime.logicalOr(message.invalidations, () => []),
        "T::Array[T::Hash[String, T.untyped]]"
      );
      invalidations.forEach((effect) => this.applyInvalidation(effect));
      let patches = Runtime.cast(
        Runtime.logicalOr(message.patches, () => []),
        "T::Array[T::Hash[String, T.untyped]]"
      );
      patches.forEach((patch) => this.applyPatch(patch, preferred, overwrite_dirty));
      invalidations.forEach((effect) => this.refreshObserved(effect));
      return this.decodeValueWithPreferred(
        message.value,
        response_generation,
        preferred
      );
    }
    async request(type, contents, preferred, overwrite_dirty) {
      let [value, _operation_generation] = await this.requestWithGeneration(
        type,
        contents,
        preferred,
        overwrite_dirty
      );
      return value;
    }
    async requestWithGeneration(type, contents, preferred, overwrite_dirty) {
      this._generation++;
      let operation_generation = this._generation;
      Runtime.append(this._active_generations, operation_generation);
      let payload = Object.assign(
        {},
        contents,
        { generation: operation_generation }
      );
      if (type === "GET") {
        this.updateDemandState(contents, operation_generation, null);
      }
      ;
      try {
        let raw = await Runtime.dataRequest(type, payload);
        let received = Runtime.cast(raw, "T::Hash[String, T.untyped]");
        let scope = Runtime.send(received.actor_scope, "to_s");
        this._actor_scope = scope;
        let message = Runtime.cast(
          received.message,
          "T::Hash[String, T.untyped]"
        );
        return [
          this.applyEnvelope(
            message,
            operation_generation,
            preferred,
            overwrite_dirty
          ),
          operation_generation
        ];
      } catch (error) {
        if (error instanceof Error) {
          if (Runtime.isTruthy(error.code === "outcome_unknown" && Swill__Application.isRunning())) {
            Swill__Application.shared().reportProblem(
              "Operation outcome unknown",
              error.message
            );
          }
          ;
          if (type === "GET") {
            this.updateDemandState(contents, operation_generation, error.message);
          }
          ;
          return (() => {
            throw error;
          })();
        } else {
          throw error;
        }
      } finally {
        this._active_generations = this._active_generations.filter((item) => !(item === operation_generation));
        this.pruneTombstones();
      }
    }
    // Tells each object a `GET`'s demands name what became of the request
    // of `generation`: with no `error`, that it started
    // (`Object#data_request_started`); with one, that it failed
    // (`Object#fail_data_field`). An object the client no longer holds is
    // skipped.
    updateDemandState(contents, generation, error) {
      return Runtime.cast(
        contents.demands,
        "T::Array[T::Hash[String, T.untyped]]"
      ).forEach((item) => {
        let object = this.modelStore(Runtime.send(item.model, "to_s"))[Runtime.send(
          item.id,
          "to_s"
        )];
        if (!Runtime.isTruthy(object)) return;
        let distant = Runtime.cast(object, "Swill::Distant::Object");
        return Runtime.cast(item.fields, "T::Array[String]").forEach((name) => error != null ? distant.failDataFieldWithGeneration(
          name,
          error,
          generation
        ) : distant.dataRequestStarted(name, generation));
      });
    }
    // The held objects of `model` by id, created empty on first use.
    modelStore(model) {
      return this._stores[model] ||= {};
    }
    // The deleted objects of `model` by id, each with the generation of
    // its deletion, created empty on first use.
    modelTombstones(model) {
      return this._tombstones[model] ||= {};
    }
    // Drops every tombstone older than the oldest request still in
    // flight: no response can arrive that predates it. Runs after every
    // response and every deletion.
    pruneTombstones() {
      let oldest = Runtime.logicalOr(
        Runtime.min(this._active_generations),
        () => this._generation + 1
      );
      Object.entries(this._tombstones).forEach(([_model, removed_objects]) => {
        let typed_removed = Runtime.cast(
          removed_objects,
          "T::Hash[String, T.untyped]"
        );
        return Object.keys(typed_removed).forEach((id) => {
          let removed = typed_removed[id];
          if (removed.generation < oldest) return Runtime.deleteKey(typed_removed, id);
        });
      });
      return Object.keys(this._tombstones).forEach((model) => {
        if (Runtime.isEmpty(Runtime.must(this._tombstones[model]))) {
          Runtime.deleteKey(this._tombstones, model);
        }
      });
    }
    // One demand of a `GET`: the model and id of `object` and the
    // `fields` wanted from it.
    demandHash(object, fields) {
      return {
        model: object.constructor.dataModelName(),
        id: object.id,
        fields
      };
    }
    // Arranges for `flush_demands` to run in a microtask, once, however
    // many fields are demanded before it does: every field read in one
    // JavaScript turn goes in one `GET`.
    scheduleDemands() {
      if (this._demand_scheduled) return;
      this._demand_scheduled = true;
      return queueMicrotask(() => this.flushDemands());
    }
    async flushDemands() {
      this._demand_scheduled = false;
      let batch = Object.values(this._queued_demands);
      this._queued_demands = {};
      if (Runtime.isEmpty(batch)) return;
      let demands = batch.map((item) => this.demandHash(
        Runtime.cast(item.object, "Swill::Distant::Object"),
        Runtime.cast(item.fields, "T::Array[String]")
      ));
      try {
        return await this.request("GET", { demands }, null, false);
      } catch (error) {
        if (this.connectionState === "disconnected" || this.connectionState === "connecting") {
          batch.forEach((item) => {
            let object = Runtime.cast(item.object, "Swill::Distant::Object");
            let fields = Runtime.cast(item.fields, "T::Array[String]");
            let key = `${object.constructor.dataModelName()}:${object.id}`;
            let queued = this._queued_demands[key] ||= {
              object,
              fields: []
            };
            let target = Runtime.cast(queued.fields, "T::Array[String]");
            return fields.forEach((name) => {
              if (!target.includes(name)) Runtime.append(target, name);
            });
          });
        }
        ;
        if (this.connectionState === "connected") {
          return Runtime.warn(`data did not load: ${error.message}`);
        }
      }
    }
    decodeValue(value, response_generation) {
      return _Swill__Distant__Client.prototype.decodeValueWithPreferred.call(
        this,
        value,
        response_generation,
        null
      );
    }
    canonical(model, id, response_generation) {
      return _Swill__Distant__Client.prototype.canonicalWithPreferred.call(
        this,
        model,
        id,
        response_generation,
        null
      );
    }
  };

  // build/framework.meta.mjs
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
      },
      "Swill::Model::Attributes": {
        factory: Swill__Model__Attributes,
        classFactory: Swill__Model__Attributes_ClassMethods,
        methods: {
          "collect_attributes": {
            "arity": 0,
            "js": "collectAttributes"
          },
          "collect_selected_attributes": {
            "arity": 1,
            "js": "collectSelectedAttributes"
          },
          "apply_attributes": {
            "arity": 1,
            "js": "applyAttributes"
          },
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "property_will_change": {
            "arity": 3,
            "js": "propertyWillChange"
          },
          "applied_attribute_value": {
            "arity": 2,
            "js": "appliedAttributeValue"
          }
        }
      },
      "Swill::Model::DirtyTracking": {
        factory: Swill__Model__DirtyTracking,
        methods: {
          "dirty": {
            "arity": 0
          },
          "collect_dirty_attributes": {
            "arity": 0,
            "js": "collectDirtyAttributes"
          },
          "mark_clean!": {
            "arity": 0,
            "js": "markCleanBang"
          },
          "apply_attributes": {
            "arity": 1,
            "js": "applyAttributes"
          },
          "property_will_change": {
            "arity": 3,
            "js": "propertyWillChange"
          },
          "mark_attribute_dirty": {
            "arity": 3,
            "js": "markAttributeDirty"
          }
        }
      },
      "Swill::Model::Drafts": {
        factory: Swill__Model__Drafts,
        methods: {
          "draft": {
            "arity": 0
          },
          "apply_draft": {
            "arity": 1,
            "js": "applyDraft"
          },
          "draft?": {
            "arity": 0,
            "js": "isDraft"
          },
          "draft_of?": {
            "arity": 1,
            "js": "isDraftOf"
          },
          "draft_original=": {
            "arity": 1,
            "js": "draftOriginal=",
            "visibility": "protected"
          }
        }
      },
      "Swill::Model::Associations": {
        factory: Swill__Model__Associations,
        classFactory: Swill__Model__Associations_ClassMethods,
        methods: {}
      },
      "Swill::Model::Identity": {
        factory: Swill__Model__Identity,
        classFactory: Swill__Model__Identity_ClassMethods,
        methods: {}
      },
      "Swill::Distant::Fields": {
        factory: Swill__Distant__Fields,
        classFactory: Swill__Distant__Fields_ClassMethods,
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
      "Swill::Wire": {
        constructor: Swill__Wire,
        properties: {
          "base_url": {
            js: "baseURL",
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {
          "get_json": {
            "arity": 1,
            "minimum": 1,
            "maximum": 1,
            "js": "getJSON"
          },
          "request_json": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2,
            "js": "requestJSON"
          },
          "request_form_json": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2,
            "js": "requestFormJSON"
          },
          "request": {
            "arity": 2,
            "minimum": 2,
            "maximum": 2
          },
          "resolve_url": {
            "arity": 1,
            "js": "resolveURL"
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
              return controller ? controller.sortKey : Runtime.cast(
                Runtime.logicalOr(this.arrangementOptions.key, () => null),
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
              return controller ? controller.sortDirection : Runtime.cast(
                Runtime.logicalOr(
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
              return controller ? controller.selectedObjectId : Runtime.cast(
                Runtime.logicalOr(this.selectionState.id, () => null),
                "T.nilable(String)"
              );
            }
          },
          "selected_object": {
            js: "selectedObject",
            type: "T.untyped",
            attribute: false,
            compute: function compute_selectedObject() {
              return Runtime.isEmpty(this.selectedObjects) ? null : this.selectedObjects[0];
            }
          },
          "selected_indexes": {
            js: "selectedIndexes",
            type: "T::Array[Integer]",
            attribute: false,
            compute: function compute_selectedIndexes() {
              let selected = this.selectedObjects;
              let indexes = Runtime.cast([], "T::Array[Integer]");
              this.arrangedObjects.forEach((object, index) => {
                if (selected.includes(object)) Runtime.append(indexes, index);
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
      "Swill::Control::TextField": {
        constructor: Swill__Control__TextField,
        properties: {
          "value": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 1
          },
          "value_did_change": {
            "arity": 2,
            "js": "valueDidChange"
          },
          "input_did_change": {
            "arity": 1,
            "js": "inputDidChange"
          },
          "input_element": {
            "arity": 0,
            "js": "inputElement"
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
      "Swill::Control::Select": {
        constructor: Swill__Control__Select,
        properties: {
          "options": {
            type: "T::Array[String]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "value": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 1
          },
          "unload": {
            "arity": 0
          },
          "options_did_change": {
            "arity": 2,
            "js": "optionsDidChange"
          },
          "value_did_change": {
            "arity": 2,
            "js": "valueDidChange"
          },
          "sync_value": {
            "arity": 0,
            "js": "syncValue"
          }
        }
      },
      "Swill::Control::CustomSelect": {
        constructor: Swill__Control__CustomSelect,
        properties: {
          "options": {
            type: "T::Array[T::Hash[String, T.untyped]]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "value": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          },
          "button": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "icon": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "label": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "popup": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "option_template": {
            js: "optionTemplate",
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
            "arity": 1
          },
          "options_did_change": {
            "arity": 2,
            "js": "optionsDidChange"
          },
          "value_did_change": {
            "arity": 2,
            "js": "valueDidChange"
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          },
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "move_down": {
            "arity": 1,
            "js": "moveDown"
          },
          "move_up": {
            "arity": 1,
            "js": "moveUp"
          },
          "key_down": {
            "arity": 1,
            "js": "keyDown"
          },
          "install_chrome": {
            "arity": 0,
            "js": "installChrome"
          },
          "button_clicked": {
            "arity": 2,
            "js": "buttonClicked"
          },
          "focus_out": {
            "arity": 1,
            "js": "focusOut"
          },
          "document_pointer_down": {
            "arity": 1,
            "js": "documentPointerDown"
          },
          "render_options": {
            "arity": 0,
            "js": "renderOptions"
          },
          "option_clicked": {
            "arity": 1,
            "js": "optionClicked"
          },
          "selected_option": {
            "arity": 0,
            "js": "selectedOption"
          },
          "sync_button": {
            "arity": 0,
            "js": "syncButton"
          },
          "sync_selected_option": {
            "arity": 0,
            "js": "syncSelectedOption"
          },
          "update_accessibility": {
            "arity": 0,
            "js": "updateAccessibility"
          },
          "toggle": {
            "arity": 0
          },
          "open": {
            "arity": 0
          },
          "close": {
            "arity": 0
          },
          "apply_open": {
            "arity": 1,
            "js": "applyOpen"
          },
          "move_selection": {
            "arity": 1,
            "js": "moveSelection"
          },
          "choose": {
            "arity": 1
          },
          "option_value": {
            "arity": 1,
            "js": "optionValue"
          }
        }
      },
      "Swill::Control::Segmented": {
        constructor: Swill__Control__Segmented,
        properties: {
          "options": {
            type: "T::Array[T::Hash[String, T.untyped]]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "value": {
            type: "String",
            attribute: false,
            defaultValue() {
              return "";
            }
          },
          "disabled": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "segments": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: false,
            defaultValue() {
              return null;
            }
          },
          "segment_template": {
            js: "segmentTemplate",
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
            "arity": 1
          },
          "options_did_change": {
            "arity": 2,
            "js": "optionsDidChange"
          },
          "value_did_change": {
            "arity": 2,
            "js": "valueDidChange"
          },
          "disabled_did_change": {
            "arity": 2,
            "js": "disabledDidChange"
          },
          "render_options": {
            "arity": 0,
            "js": "renderOptions"
          },
          "sync_selection": {
            "arity": 0,
            "js": "syncSelection"
          },
          "update_accessibility": {
            "arity": 0,
            "js": "updateAccessibility"
          },
          "segment_clicked": {
            "arity": 1,
            "js": "segmentClicked"
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
          },
          "movable?": {
            "arity": 0,
            "js": "isMovable"
          },
          "focus_adjacent": {
            "arity": 2,
            "js": "focusAdjacent"
          },
          "focus_segment_at": {
            "arity": 2,
            "js": "focusSegmentAt"
          },
          "first_focusable_element": {
            "arity": 0,
            "js": "firstFocusableElement"
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "acceptsFirstResponder"
          },
          "focus_selection": {
            "arity": 0,
            "js": "focusSelection"
          },
          "choose": {
            "arity": 1
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
              return controller ? controller.sortKey : Runtime.cast(
                Runtime.logicalOr(this.arrangementOptions.key, () => null),
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
              return controller ? controller.sortDirection : Runtime.cast(
                Runtime.logicalOr(
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
              return controller ? controller.selectedObjectId : Runtime.cast(
                Runtime.logicalOr(this.selectionState.id, () => null),
                "T.nilable(String)"
              );
            }
          },
          "selected_object": {
            js: "selectedObject",
            type: "T.untyped",
            attribute: false,
            compute: function compute_selectedObject2() {
              return Runtime.isEmpty(this.selectedObjects) ? null : this.selectedObjects[0];
            }
          },
          "selected_indexes": {
            js: "selectedIndexes",
            type: "T::Array[Integer]",
            attribute: false,
            compute: function compute_selectedIndexes2() {
              let selected = this.selectedObjects;
              let indexes = Runtime.cast([], "T::Array[Integer]");
              this.arrangedObjects.forEach((object, index) => {
                if (selected.includes(object)) Runtime.append(indexes, index);
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
      "Swill::Controller::SortableList": {
        constructor: Swill__Controller__SortableList,
        properties: {},
        methods: {
          "sort_by": {
            "arity": 1,
            "js": "sortBy"
          },
          "sort_key_for": {
            "arity": 1,
            "js": "sortKeyFor"
          },
          "sync_sort_states": {
            "arity": 0,
            "js": "syncSortStates"
          }
        }
      },
      "Swill::Controller::Editor": {
        constructor: Swill__Controller__Editor,
        properties: {},
        methods: {
          "binding_root": {
            "arity": 0,
            "js": "bindingRoot"
          },
          "commit_editing": {
            "arity": 0,
            "js": "commitEditing"
          },
          "discard_editing": {
            "arity": 0,
            "js": "discardEditing"
          },
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          }
        }
      },
      "Swill::Controller::InlineEditor": {
        constructor: Swill__Controller__InlineEditor,
        properties: {},
        methods: {
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          },
          "resign_first_responder": {
            "arity": 1,
            "js": "resignFirstResponder"
          },
          "allow_resignation_to?": {
            "arity": 1,
            "js": "allowResignationTo"
          },
          "control_should_resign_first_responder": {
            "arity": 2,
            "js": "controlShouldResignFirstResponder"
          },
          "editing_host": {
            "arity": 0,
            "js": "editingHost"
          }
        }
      },
      "Swill::RowEdit": {
        constructor: Swill__RowEdit,
        properties: {},
        methods: {
          "initialize": {
            "arity": 3
          },
          "editor": {
            "arity": 0,
            "accessor": true
          },
          "index": {
            "arity": 0,
            "accessor": true
          },
          "original": {
            "arity": 0,
            "accessor": true
          }
        }
      },
      "Swill::Controller::EditableList": {
        constructor: Swill__Controller__EditableList,
        properties: {
          "edited_object": {
            js: "editedObject",
            type: "T.untyped",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "activate_selection": {
            "arity": 0,
            "js": "activateSelection"
          },
          "editing?": {
            "arity": 0,
            "js": "isEditing"
          },
          "awake_from_dom": {
            "arity": 0,
            "js": "awakeFromDOM"
          },
          "begin_editing": {
            "arity": 1,
            "js": "beginEditing"
          },
          "end_editing": {
            "arity": 1,
            "js": "endEditing"
          },
          "commit_editing_if_needed": {
            "arity": 0,
            "js": "commitEditingIfNeeded"
          },
          "editor_should_end_editing": {
            "arity": 1,
            "js": "editorShouldEndEditing"
          },
          "cancel_operation": {
            "arity": 1,
            "js": "cancelOperation"
          },
          "move_up": {
            "arity": 1,
            "js": "moveUp"
          },
          "move_down": {
            "arity": 1,
            "js": "moveDown"
          },
          "toggle_sort": {
            "arity": 1,
            "js": "toggleSort"
          },
          "represented_object_did_change": {
            "arity": 2,
            "js": "representedObjectDidChange"
          },
          "arranged_objects_did_change": {
            "arity": 2,
            "js": "arrangedObjectsDidChange"
          },
          "commit_edit": {
            "arity": 3,
            "js": "commitEdit"
          },
          "commit_distant_edit": {
            "arity": 3,
            "js": "commitDistantEdit"
          },
          "apply_edit": {
            "arity": 3,
            "js": "applyEdit"
          },
          "validation_error": {
            "arity": 1,
            "js": "validationError"
          },
          "confirm_edit?": {
            "arity": 2,
            "js": "confirmEdit"
          },
          "edited_object_has_changes?": {
            "arity": 2,
            "js": "editedObjectHasChanges"
          },
          "editing_did_fail_validation": {
            "arity": 1,
            "js": "editingDidFailValidation"
          },
          "editing_did_fail_save": {
            "arity": 1,
            "js": "editingDidFailSave"
          },
          "row_element?": {
            "arity": 1,
            "js": "isRowElement"
          },
          "editor_template": {
            "arity": 0,
            "js": "editorTemplate"
          },
          "open_editor": {
            "arity": 3,
            "js": "openEditor"
          },
          "instantiate_editor": {
            "arity": 0,
            "js": "instantiateEditor"
          },
          "awaken_editor": {
            "arity": 1,
            "js": "awakenEditor"
          },
          "close_editor": {
            "arity": 0,
            "js": "closeEditor"
          },
          "finish_edit": {
            "arity": 2,
            "js": "finishEdit"
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
      },
      "Swill::Model::Base": {
        constructor: Swill__Model__Base,
        mixins: [Swill__Model__Attributes],
        properties: {
          "id": {
            type: "T.nilable(String)",
            attribute: true,
            key: "id",
            defaultValue() {
              return null;
            }
          }
        },
        registries: {
          modelAttributes: { "id": { "name": "id", "key": "id", "type": "T.nilable(String)", "default": null } }
        },
        methods: {}
      },
      "Swill::Model::Editable": {
        constructor: Swill__Model__Editable,
        mixins: [Swill__Model__DirtyTracking, Swill__Model__Drafts],
        properties: {
          "dirty_attributes": {
            js: "dirtyAttributes",
            type: "T::Array[T.untyped]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "dirty?": {
            js: "isDirty",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isDirty() {
              return !Runtime.isEmpty(this.dirtyAttributes);
            }
          }
        },
        methods: {}
      },
      "Swill::Model::Store": {
        constructor: Swill__Model__Store,
        properties: {},
        methods: {
          "initialize": {
            "arity": 0
          },
          "get": {
            "arity": 1
          },
          "include?": {
            "arity": 1,
            "js": "isInclude"
          },
          "put": {
            "arity": 1
          },
          "remove": {
            "arity": 1
          },
          "clear": {
            "arity": 0
          },
          "values": {
            "arity": 0
          }
        }
      },
      "Swill::Model::Collection": {
        constructor: Swill__Model__Collection,
        properties: {
          "records": {
            type: "T::Array[T.untyped]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "loading": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "loaded": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "error": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "replace": {
            "arity": 1
          },
          "first": {
            "arity": 0
          },
          "last": {
            "arity": 0
          },
          "size": {
            "arity": 0
          },
          "empty?": {
            "arity": 0,
            "js": "isEmpty"
          },
          "loaded?": {
            "arity": 0,
            "js": "isLoaded"
          },
          "loading?": {
            "arity": 0,
            "js": "isLoading"
          },
          "at": {
            "arity": 1
          }
        }
      },
      "Swill::Model::AssociationCollection": {
        constructor: Swill__Model__AssociationCollection,
        properties: {
          "records": {
            type: "T::Array[T.untyped]",
            attribute: false,
            willAccess: true,
            defaultValue() {
              return [];
            }
          },
          "loaded": {
            type: "T::Boolean",
            attribute: false,
            compute: function computeLoaded() {
              return this.associationState("loaded") === true;
            }
          },
          "stale": {
            type: "T::Boolean",
            attribute: false,
            compute: function computeStale() {
              return this.associationState("stale") === true;
            }
          },
          "loading": {
            type: "T::Boolean",
            attribute: false,
            compute: function computeLoading() {
              return this.associationState("loading") === true;
            }
          },
          "error": {
            type: "T.nilable(String)",
            attribute: false,
            compute: function computeError() {
              return Runtime.cast(
                this.associationState("error"),
                "T.nilable(String)"
              );
            }
          }
        },
        methods: {
          "stale?": {
            "arity": 0,
            "js": "isStale"
          },
          "attach_association": {
            "arity": 2,
            "js": "attachAssociation"
          },
          "association_state": {
            "arity": 1,
            "js": "associationState"
          },
          "property_will_access": {
            "arity": 1,
            "js": "propertyWillAccess"
          },
          "initialize": {
            "arity": 0
          },
          "replace": {
            "arity": 1
          },
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "apply_membership": {
            "arity": 1,
            "js": "applyMembership"
          }
        }
      },
      "Swill::Model::ResultSet": {
        constructor: Swill__Model__ResultSet,
        properties: {},
        methods: {}
      },
      "Swill::Model::Association": {
        constructor: Swill__Model__Association,
        properties: {},
        methods: {
          "initialize": {
            "arity": 1
          },
          "name": {
            "arity": 0,
            "accessor": true
          },
          "key": {
            "arity": 0,
            "accessor": true
          },
          "many?": {
            "arity": 0,
            "js": "isMany"
          },
          "model_class": {
            "arity": 0,
            "js": "modelClass"
          },
          "url_for": {
            "arity": 1,
            "js": "urlFor"
          }
        }
      },
      "Swill::Model::Codec": {
        constructor: Swill__Model__Codec,
        properties: {},
        methods: {}
      },
      "Swill::Model::PlainJSON": {
        constructor: Swill__Model__PlainJSON,
        properties: {},
        methods: {}
      },
      "Swill::Model::JSONAPI": {
        constructor: Swill__Model__JSONAPI,
        properties: {},
        methods: {}
      },
      "Swill::Model::Dataset": {
        constructor: Swill__Model__Dataset,
        properties: {
          "records": {
            type: "T::Array[T.untyped]",
            attribute: false,
            defaultValue() {
              return [];
            }
          },
          "loading": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "error": {
            type: "T.nilable(String)",
            attribute: false,
            defaultValue() {
              return null;
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 3
          },
          "url": {
            "arity": 0,
            "accessor": true
          },
          "params": {
            "arity": 0,
            "accessor": true
          },
          "reload": {
            "arity": 0
          }
        }
      },
      "Swill::Model::Resource": {
        constructor: Swill__Model__Resource,
        mixins: [Swill__Model__Associations, Swill__Model__Identity],
        properties: {},
        methods: {
          "initialize": {
            "arity": 0
          },
          "serialize": {
            "arity": 1
          },
          "validate": {
            "arity": 0
          },
          "save": {
            "arity": 0
          },
          "delete": {
            "arity": 0
          },
          "reload": {
            "arity": 0
          },
          "associations": {
            "arity": 0
          },
          "association": {
            "arity": 1
          },
          "association_loaded?": {
            "arity": 1,
            "js": "isAssociationLoaded"
          },
          "assign_association": {
            "arity": 2,
            "js": "assignAssociation"
          },
          "load_association": {
            "arity": 1,
            "js": "loadAssociation"
          },
          "property_will_access": {
            "arity": 1,
            "js": "propertyWillAccess"
          },
          "load_association_in_background": {
            "arity": 1,
            "js": "loadAssociationInBackground"
          },
          "reload_association": {
            "arity": 1,
            "js": "reloadAssociation"
          }
        }
      },
      "Swill::Distant::Object": {
        constructor: Swill__Distant__Object,
        mixins: [Swill__Distant__Fields],
        properties: {
          "deleted": {
            type: "T::Boolean",
            attribute: false,
            defaultValue() {
              return false;
            }
          },
          "deleted?": {
            js: "isDeleted",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_isDeleted() {
              return this.deleted;
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 0
          },
          "field_loaded?": {
            "arity": 1,
            "js": "isFieldLoaded"
          },
          "field_stale?": {
            "arity": 1,
            "js": "isFieldStale"
          },
          "field_loading?": {
            "arity": 1,
            "js": "isFieldLoading"
          },
          "field_error": {
            "arity": 1,
            "js": "fieldError"
          },
          "association_controller": {
            "arity": 1,
            "js": "associationController"
          },
          "load_field": {
            "arity": 1,
            "js": "loadField"
          },
          "reload_field": {
            "arity": 1,
            "js": "reloadField"
          },
          "save": {
            "arity": 0
          },
          "apply_draft": {
            "arity": 1,
            "js": "applyDraft"
          },
          "delete": {
            "arity": 0
          },
          "draft": {
            "arity": 0
          },
          "property_will_access": {
            "arity": 1,
            "js": "propertyWillAccess"
          },
          "apply_data_field": {
            "arity": 4,
            "js": "applyDataField"
          },
          "invalidate_data_field": {
            "arity": 2,
            "js": "invalidateDataField"
          },
          "data_field_observed": {
            "arity": 1,
            "js": "dataFieldObserved"
          },
          "data_request_started": {
            "arity": 2,
            "js": "dataRequestStarted"
          },
          "begin_data_field_load": {
            "arity": 2,
            "js": "beginDataFieldLoad"
          },
          "fail_data_field": {
            "arity": 2,
            "js": "failDataField"
          },
          "fail_data_field_with_generation": {
            "arity": 3,
            "js": "failDataFieldWithGeneration",
            "family": "fail_data_field"
          },
          "reset_data_fields": {
            "arity": 0,
            "js": "resetDataFields"
          },
          "data_generation": {
            "arity": 1,
            "js": "dataGeneration",
            "visibility": "private"
          },
          "present_data_field": {
            "arity": 1,
            "js": "presentDataField",
            "visibility": "private"
          },
          "write_data_state": {
            "arity": 3,
            "js": "writeDataState",
            "visibility": "private"
          },
          "read_data_state": {
            "arity": 2,
            "js": "readDataState",
            "visibility": "private"
          },
          "data_collection": {
            "arity": 1,
            "js": "dataCollection",
            "visibility": "private"
          }
        }
      },
      "Swill::Distant::Client": {
        constructor: Swill__Distant__Client,
        properties: {
          "connection_state": {
            js: "connectionState",
            type: "String",
            attribute: false,
            defaultValue() {
              return "idle";
            }
          }
        },
        methods: {
          "initialize": {
            "arity": 0
          },
          "reconnect": {
            "arity": 0
          },
          "connection_changed": {
            "arity": 2,
            "js": "connectionChanged"
          },
          "present_connection": {
            "arity": 0,
            "js": "presentConnection"
          },
          "cancel_retry": {
            "arity": 0,
            "js": "cancelRetry"
          },
          "query": {
            "arity": 5
          },
          "resolve": {
            "arity": 5
          },
          "command": {
            "arity": 5
          },
          "class_command": {
            "arity": 5,
            "js": "classCommand"
          },
          "create": {
            "arity": 2
          },
          "update": {
            "arity": 2
          },
          "delete": {
            "arity": 1
          },
          "demand": {
            "arity": 2
          },
          "load_field": {
            "arity": 3,
            "js": "loadField"
          },
          "reset": {
            "arity": 0
          },
          "connection_opened": {
            "arity": 0,
            "js": "connectionOpened"
          },
          "operation": {
            "arity": 4,
            "visibility": "private"
          },
          "wrap_result": {
            "arity": 2,
            "js": "wrapResult",
            "visibility": "private"
          },
          "encode_arguments": {
            "arity": 1,
            "js": "encodeArguments",
            "visibility": "private"
          },
          "encode_keywords": {
            "arity": 1,
            "js": "encodeKeywords",
            "visibility": "private"
          },
          "encode_value": {
            "arity": 1,
            "js": "encodeValue",
            "visibility": "private"
          },
          "decode_value": {
            "arity": 2,
            "js": "decodeValue",
            "visibility": "private"
          },
          "decode_value_with_preferred": {
            "arity": 3,
            "js": "decodeValueWithPreferred",
            "family": "decode_value",
            "visibility": "private"
          },
          "canonical": {
            "arity": 3,
            "visibility": "private"
          },
          "canonical_with_preferred": {
            "arity": 4,
            "js": "canonicalWithPreferred",
            "family": "canonical",
            "visibility": "private"
          },
          "apply_patch": {
            "arity": 3,
            "js": "applyPatch",
            "visibility": "private"
          },
          "apply_invalidation": {
            "arity": 1,
            "js": "applyInvalidation",
            "visibility": "private"
          },
          "refresh_observed": {
            "arity": 1,
            "js": "refreshObserved",
            "visibility": "private"
          },
          "apply_envelope": {
            "arity": 4,
            "js": "applyEnvelope",
            "visibility": "private"
          },
          "request": {
            "arity": 4,
            "visibility": "private"
          },
          "request_with_generation": {
            "arity": 4,
            "js": "requestWithGeneration",
            "visibility": "private"
          },
          "update_demand_state": {
            "arity": 3,
            "js": "updateDemandState",
            "visibility": "private"
          },
          "model_store": {
            "arity": 1,
            "js": "modelStore",
            "visibility": "private"
          },
          "model_tombstones": {
            "arity": 1,
            "js": "modelTombstones",
            "visibility": "private"
          },
          "prune_tombstones": {
            "arity": 0,
            "js": "pruneTombstones",
            "visibility": "private"
          },
          "demand_hash": {
            "arity": 2,
            "js": "demandHash",
            "visibility": "private"
          },
          "schedule_demands": {
            "arity": 0,
            "js": "scheduleDemands",
            "visibility": "private"
          },
          "flush_demands": {
            "arity": 0,
            "js": "flushDemands",
            "visibility": "private"
          }
        }
      }
    }
  };

  // build/framework.mjs
  Runtime.install(meta);

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
  function browserAPI(definitions, Runtime2, names2 = {}, roots = []) {
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
      Runtime: Runtime2,
      Application: definitions.Swill__Application,
      Bundle: definitions.Swill__Bundle,
      publicNames: Object.fromEntries(Object.entries(names2).filter(([, identifier]) => definitions[identifier]).map(([name, identifier]) => [`Swill::${name.replaceAll(".", "::")}`, definitions[identifier]])),
      roots: new Set(roots.map((name) => definitions[names2[name]]).filter(Boolean))
    };
    return Object.freeze({ ...definitions, Runtime: Runtime2, install: install2, ...classes2, register, registerBundle, start });
  }

  // build/browser.mjs
  if (globalThis.Swill) throw new Error("Framework already loaded");
  globalThis.Swill = browserAPI(framework_exports, Runtime, { "Object": "Swill__Object", "Swell": "Swill__Swell", "ArrayController": "Swill__ArrayController", "Controller": "Swill__Controller", "Application": "Swill__Application", "View": "Swill__View", "List": "Swill__Controller__List", "SortableList": "Swill__Controller__SortableList", "Editor": "Swill__Controller__Editor", "InlineEditor": "Swill__Controller__InlineEditor", "EditableList": "Swill__Controller__EditableList", "Control": "Swill__Control", "TextField": "Swill__Control__TextField", "Button": "Swill__Control__Button", "Select": "Swill__Control__Select", "CustomSelect": "Swill__Control__CustomSelect", "Segmented": "Swill__Control__Segmented", "ImageView": "Swill__Control__ImageView", "Alert": "Swill__Alert", "Bundle": "Swill__Bundle", "Image": "Swill__Image", "NotificationCenter": "Swill__NotificationCenter", "Wire": "Swill__Wire", "ValueTransformer": "Swill__ValueTransformer", "Model.Base": "Swill__Model__Base", "Model.Editable": "Swill__Model__Editable", "Model.Resource": "Swill__Model__Resource", "Model.Store": "Swill__Model__Store", "Model.Codec": "Swill__Model__Codec", "Model.PlainJSON": "Swill__Model__PlainJSON", "Model.JSONAPI": "Swill__Model__JSONAPI", "Model.Dataset": "Swill__Model__Dataset", "Model.Collection": "Swill__Model__Collection", "Model.ResultSet": "Swill__Model__ResultSet", "Distant.Object": "Swill__Distant__Object", "Distant.Client": "Swill__Distant__Client" }, ["Object", "ArrayController", "Controller", "Application", "View", "List", "SortableList", "Editor", "InlineEditor", "EditableList", "Control", "TextField", "Button", "Select", "CustomSelect", "ValueTransformer", "Model.Base", "Model.Resource", "Distant.Object"]);
  {
    const script = typeof document === "undefined" ? null : document.currentScript;
    const base = script && script.src ? new URL(".", script.src).href : "";
    Swill__Bundle.register("swill", base, ["Info.png", "NetworkLost.png", "Note.png", "Stop.png", "Warning.png", "bioplastic.css", "controls.html", "fonts/AtkinsonHyperlegibleNext-Italic.woff2", "fonts/AtkinsonHyperlegibleNext.woff2", "fonts/OFL.txt", "linear.css"], { "controls.html": '<template name="custom_select">\n  <button type="button" class="custom-select-button" tabindex="-1" outlet="button" data-action="button_clicked">\n    <span class="custom-select-trigger-icon" outlet="icon"></span>\n    <span class="custom-select-label" outlet="label"></span>\n  </button>\n  <div class="custom-select-popup" outlet="popup"></div>\n  <template outlet="option_template">\n    <button type="button" class="custom-select-option" tabindex="-1">\n      <span class="custom-select-icon"></span>\n      <span class="custom-select-option-text">\n        <span class="custom-select-option-label"></span>\n        <span class="custom-select-option-description"></span>\n      </span>\n    </button>\n  </template>\n</template>\n\n<template name="segmented">\n  <div class="segmented-options" outlet="segments"></div>\n  <template outlet="segment_template">\n    <button type="button" class="segmented-option" tabindex="-1"></button>\n  </template>\n</template>\n\n<template name="alert">\n  <dialog class="window alert">\n    <img class="alert-icon" klass="Swill::Control::ImageView" bind="icon" alt="">\n    <div class="alert-text">\n      <h2 bind="message_text"></h2>\n      <p bind="informative_text" bind-hidden="informative_text.empty?"></p>\n    </div>\n    <div class="actions"></div>\n    <template outlet="button_template">\n      <button type="button" klass="Swill::Control::Button" data-action="choose"></button>\n    </template>\n  </dialog>\n</template>\n' }, false);
  }
  if (typeof document !== "undefined") new Swill__Launcher().install(document);
})();
//# sourceMappingURL=swill.js.map
