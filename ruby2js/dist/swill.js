"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // lib/swill/runtime/metadata.mjs
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

  // lib/swill/runtime/values.mjs
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
  function isEqual(left, right) {
    if (left === right) return true;
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
  function slice(value, start, count) {
    if (typeof value !== "string") {
      throw new TypeError("slice requires a string");
    }
    const from = start < 0 ? value.length + start : start;
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
  function fetch(hash, key, ...fallback) {
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
  function compareValues(left, right) {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === "number" && typeof right === "number") return left - right;
    if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
    return String(left).localeCompare(String(right));
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
  function decodeFragment(type, text) {
    const inner = (type ?? "").replace(/^T\.nilable\((.+)\)$/, "$1");
    switch (inner) {
      case "Integer": {
        const number = Number.parseInt(text, 10);
        return Number.isNaN(number) ? void 0 : number;
      }
      case "T::Boolean":
        if (text === "true" || text === "1") return true;
        if (text === "false" || text === "0") return false;
        return void 0;
      default:
        return text;
    }
  }
  function encodeFragment(value) {
    return value == null || value === "" ? null : String(value);
  }
  var NIL_READERS = ["nil?", "blank?", "present?", "to_s", "to_i", "to_f"];
  var VALUE_READERS = [
    "nil?",
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

  // lib/swill/runtime/properties.mjs
  var states = /* @__PURE__ */ new WeakMap();
  var captures = [];
  function state(object) {
    let current = states.get(object);
    if (!current) {
      current = {
        values: /* @__PURE__ */ new Map(),
        computed: /* @__PURE__ */ new Map(),
        observers: /* @__PURE__ */ new Map(),
        dependents: /* @__PURE__ */ new Map()
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
  function subscribe(object, name, callback, kind) {
    const descriptor = declarations(object.constructor, "properties").get(name);
    if (!descriptor) {
      throw new Error(`Unknown observable property: ${name}`);
    }
    if (descriptor.computed) computedValue(object, descriptor);
    const set = listeners(object, name, kind);
    set.add(callback);
    return () => set.delete(callback);
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
    for (const [dependency, names] of frame) {
      for (const name of names) {
        slot.disposers.push(
          subscribe(
            dependency,
            name,
            () => invalidate(object, descriptor),
            "dependents"
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
  function dispose(object) {
    const current = states.get(object);
    if (!current) return;
    for (const slot of current.computed.values()) {
      slot.disposers.splice(0).forEach((dispose2) => dispose2());
    }
    current.computed.clear();
    current.observers.clear();
    current.dependents.clear();
  }

  // lib/swill/runtime/install.mjs
  var classes = /* @__PURE__ */ new Map();
  var mixinMetadata = /* @__PURE__ */ new WeakMap();
  var mixinClassFactories = /* @__PURE__ */ new WeakMap();
  var classConfiguration = /* @__PURE__ */ new WeakMap();
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
          descriptor.restorations ?? []
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
  function installClass(klass, name, properties, methods, registries = {}, restorations2 = []) {
    if (classes.has(name)) {
      throw new Error(`Duplicate class: ${name}`);
    }
    rejectProtocolConflicts(klass, properties, restorations2);
    installMetadata(klass, properties, methods, restorations2);
    const propertyByName = new Map(properties.map((property) => [property.name, property]));
    for (const [registryName, seeds] of Object.entries(registries)) {
      if (typeof klass[registryName] !== "function") {
        throw new Error(`Missing registry declaration: ${registryName}`);
      }
      const registry = klass[registryName]();
      for (const [name2, seed] of Object.entries(seeds)) {
        const property = propertyByName.get(seed.property);
        if (!property) {
          throw new Error(`Unknown registry property: ${seed.property}`);
        }
        registry[name2] = {
          ...seed,
          type: property.type,
          defaultValue: property.defaultValue
        };
      }
    }
    for (const descriptor of properties) {
      Object.defineProperty(klass.prototype, descriptor.js, {
        configurable: true,
        get() {
          record(this, descriptor.name);
          return descriptor.computed ? computedValue(this, descriptor) : storedValue(this, descriptor);
        },
        ...descriptor.computed ? {} : {
          set(value) {
            writeProperty(this, descriptor, value);
          }
        }
      });
    }
    classes.set(name, klass);
  }
  function registered(name) {
    return classes.get(name);
  }
  function resolve(name) {
    if (!classes.has(name)) {
      throw new Error(`Unknown class: ${name}`);
    }
    return classes.get(name);
  }

  // lib/swill/runtime/paths.mjs
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
    const method = declarations(object.constructor, "methods").get(name);
    if (method?.arity === 0) return object[method.js]();
    if (VALUE_READERS.includes(name)) return valueRead(object, name);
    throw new Error(`Unknown reader: ${name}`);
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
      if (property.computed) {
        throw new Error(`Read-only property: ${name}`);
      }
      return writeProperty(object, property, value);
    }
    const method = declarations(object.constructor, "methods").get(`${name}=`);
    if (method?.arity === 1) {
      object[name] = value;
      return value;
    }
    throw new Error(`Unknown writer: ${name}`);
  }
  function pathWriter(object, path) {
    const names = segments(path);
    if (names.length === 0) {
      throw new Error(`Read-only binding: ${path}`);
    }
    const name = names.pop();
    const owner = names.reduce((target, segment) => read(target, segment), object);
    if (owner == null) return null;
    if (isPlainObject(owner)) {
      if (!Object.hasOwn(owner, name)) throw new Error(`Unknown key: ${name}`);
      return { owner, key: name };
    }
    const descriptor = declarations(owner.constructor, "properties").get(name);
    if (!descriptor || descriptor.computed) {
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
    let disposers = [];
    let active = true;
    const rehook = () => {
      disposers.splice(0).forEach((dispose2) => dispose2());
      let owner = object;
      for (const name of segments(path)) {
        if (owner == null) break;
        if (declarations(owner.constructor, "properties").has(name)) {
          disposers.push(
            subscribe(owner, name, () => {
              if (!active) return;
              rehook();
              callback(readPath(object, path));
            }, "observers")
          );
        }
        owner = read(owner, name);
      }
    };
    rehook();
    return () => {
      active = false;
      disposers.splice(0).forEach((dispose2) => dispose2());
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
      return !!property && !property.computed || methods.has(name);
    }
    return properties.has(name) || methods.has(name);
  }
  function invoke(object, name, ...args) {
    if (object == null) {
      throw new Error(`Cannot call ${name} on nil`);
    }
    const method = declarations(object.constructor, "methods").get(name);
    if (!method && VALUE_METHODS.includes(name)) return valueInvoke(object, name, args);
    if (!method || method.arity !== args.length) {
      throw new Error(`Unknown method or wrong arity: ${name}`);
    }
    return object[method.js](...args);
  }
  function performAction(object, name, sender, event) {
    const method = declarations(object.constructor, "methods").get(name);
    if (!method || method.arity > 2) {
      throw new Error(`Unknown action or wrong arity: ${name}`);
    }
    return object[method.js](...[sender, event].slice(0, method.arity));
  }

  // lib/swill/runtime/types.mjs
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
    const nilable = /^T\.nilable\((.+)\)$/.exec(type);
    if (nilable) return value == null || conforms(value, nilable[1]);
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

  // lib/swill/runtime/attributes.mjs
  function isAttribute(object, name) {
    return !!declarations(object.constructor, "properties").get(name)?.attribute;
  }
  function validateAttribute(object, name, value, previous) {
    if (!isAttribute(object, name)) return value;
    const validator = declarations(object.constructor, "methods").get(`validate_${name}`);
    return validator && validator.arity === 2 ? object[validator.js](value, previous) : value;
  }
  function restorations(object) {
    return declarations(object.constructor, "restorations");
  }
  function outlets(object) {
    return [...declarations(object.constructor, "properties").values()].filter((descriptor) => descriptor.outlet);
  }
  function collectAttributes(object) {
    const result = {};
    for (const descriptor of declarations(object.constructor, "properties").values()) {
      if (descriptor.attribute && !descriptor.computed) {
        result[descriptor.key] = object[descriptor.js];
      }
    }
    return result;
  }
  function applyAttributes(object, source) {
    for (const descriptor of declarations(object.constructor, "properties").values()) {
      if (!descriptor.attribute || descriptor.computed) continue;
      if (Object.hasOwn(source, descriptor.key)) {
        object[descriptor.js] = source[descriptor.key];
      } else if (Object.hasOwn(source, descriptor.name)) {
        object[descriptor.js] = source[descriptor.name];
      }
    }
    return object;
  }

  // lib/swill/runtime.mjs
  var Runtime = {
    // Classes
    install,
    include,
    installClass,
    inheritableRegistry,
    classSetting,
    resolve,
    // Values
    isTruthy,
    logicalAnd,
    logicalOr,
    isEqual,
    duplicate,
    isBlank,
    isPresent,
    isEmpty,
    strip,
    upcase,
    downcase,
    valueRead,
    decodeFragment,
    encodeFragment,
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
    fetch,
    deleteKey,
    intDiv,
    modulo,
    between,
    clamp,
    compareValues,
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
    invoke,
    performAction,
    // Observation
    observe,
    observePath,
    dispose,
    // Declarations
    isAttribute,
    validateAttribute,
    restorations,
    outlets,
    collectAttributes,
    applyAttributes,
    // Invalid URL input is reported, not raised.
    warn(message) {
      console.warn(`[Swill] ${message}`);
    }
  };

  // build/framework.mjs
  var framework_exports = {};
  __export(framework_exports, {
    Swill__Actions: () => Swill__Actions,
    Swill__Application: () => Swill__Application,
    Swill__Awakening: () => Swill__Awakening,
    Swill__Bindings: () => Swill__Bindings,
    Swill__Controller: () => Swill__Controller,
    Swill__Controller__EditableList: () => Swill__Controller__EditableList,
    Swill__Controller__Editor: () => Swill__Controller__Editor,
    Swill__Controller__InlineEditor: () => Swill__Controller__InlineEditor,
    Swill__Controller__List: () => Swill__Controller__List,
    Swill__Controller__SortableList: () => Swill__Controller__SortableList,
    Swill__Fragments: () => Swill__Fragments,
    Swill__Launcher: () => Swill__Launcher,
    Swill__Model__Attributes: () => Swill__Model__Attributes,
    Swill__Model__Attributes_ClassMethods: () => Swill__Model__Attributes_ClassMethods,
    Swill__Model__Base: () => Swill__Model__Base,
    Swill__Model__DirtyTracking: () => Swill__Model__DirtyTracking,
    Swill__Model__Drafts: () => Swill__Model__Drafts,
    Swill__Object: () => Swill__Object,
    Swill__ObjectBindings: () => Swill__ObjectBindings,
    Swill__Observable: () => Swill__Observable,
    Swill__Outlets: () => Swill__Outlets,
    Swill__Ownership: () => Swill__Ownership,
    Swill__Responder: () => Swill__Responder,
    Swill__RowEdit: () => Swill__RowEdit,
    Swill__View: () => Swill__View,
    Swill__Window: () => Swill__Window
  });

  // build/framework.classes.mjs
  function Swill__Observable(Superclass) {
    class Swill__Observable_Layer extends Superclass {
      observe(name, callback) {
        return Runtime.observe(this, name, callback);
      }
      dispose() {
        return Runtime.dispose(this);
      }
      coercePropertyValue(name, value, previous) {
        return value;
      }
      propertyWillChange(name, previous, value) {
        return null;
      }
    }
    return Swill__Observable_Layer;
  }
  var Swill__Object = class extends Object {
  };
  function Swill__Ownership(Superclass) {
    class Swill__Ownership_Layer extends Superclass {
      eachChild(element, callback) {
        let children = element.children;
        let index = 0;
        while (index < children.length) {
          callback(children[index]);
          index++;
        }
      }
      // Visit root and its owned descendants. A nested controller root is a
      // boundary: neither it nor anything inside it belongs to this owner.
      eachOwned(root, callback) {
        callback(root);
        return this.eachChild(root, (child) => {
          if (!child.hasAttribute("controller")) return this.eachOwned(child, callback);
        });
      }
      ownedMatching(root, selector) {
        let found = Runtime.cast([], "T::Array[Element]");
        this.eachOwned(root, (element) => {
          if (element.matches(selector)) return Runtime.append(found, element);
        });
        return found;
      }
    }
    return Swill__Ownership_Layer;
  }
  function Swill__ObjectBindings(Superclass) {
    class Swill__ObjectBindings_Layer extends Superclass {
      bind(target, options) {
        this.unbind(target);
        let source = options.to;
        let path = options.key_path;
        let sync = (value) => Runtime.write(this, target, value);
        sync(Runtime.readPath(source, path));
        Runtime.append(
          this.objectBindings(),
          { target, dispose: Runtime.observePath(source, path, sync) }
        );
        return this;
      }
      unbind(target) {
        let remaining = Runtime.cast(
          [],
          "T::Array[T::Hash[Symbol, T.untyped]]"
        );
        this.objectBindings().forEach((binding) => binding.target === target ? binding.dispose.call(null) : Runtime.append(
          remaining,
          binding
        ));
        this._object_bindings = remaining;
        return this;
      }
      unbindAll() {
        this.objectBindings().forEach((binding) => binding.dispose.call(null));
        this._object_bindings = [];
        return this;
      }
      objectBindings() {
        if (!this._object_bindings) this._object_bindings = [];
        return this._object_bindings;
      }
    }
    return Swill__ObjectBindings_Layer;
  }
  var Swill__Responder = class extends Swill__Object {
    nextResponder() {
      return null;
    }
    performAction(name, sender, event) {
      let target = this.actionTarget(name);
      if (!target) throw new Error(`Unhandled action: ${name}`);
      return Runtime.performAction(target, name, sender, event);
    }
    // TODO: It's unclear to me that this is the right place to handle this bubbling.
    actionTarget(name) {
      if (Runtime.isTruthy(Runtime.respondsTo(this, name))) return this;
      let target = this.nextResponder();
      return target ? target.actionTarget(name) : null;
    }
    acceptsFirstResponder() {
      return false;
    }
    // Return false to refuse to become First Reponder.
    becomeFirstResponder() {
      return true;
    }
    // Return false to refuse to resign to the provided next Reaponder.
    resignFirstResponder(next_responder) {
      return true;
    }
    keyDown(event) {
      let target;
      switch (event.key) {
        case "Escape":
          return this.cancelOperation(event);
        case "Enter":
          return this.insertNewline(event);
        case "Tab":
          return this.complete(event);
        default:
          target = this.nextResponder();
          if (Runtime.isTruthy(target)) return Runtime.invoke(target, "key_down", event);
      }
    }
    keyUp(event) {
      let target = this.nextResponder();
      if (target) return target.keyUp(event);
    }
    cancelOperation(event) {
      let target = this.nextResponder();
      if (target) return target.cancelOperation(event);
    }
    insertNewline(event) {
      let target = this.nextResponder();
      if (target) return target.insertNewline(event);
    }
    complete(event) {
      let target = this.nextResponder();
      if (target) return target.complete(event);
    }
  };
  var Swill__View = class _Swill__View extends Swill__Responder {
    constructor(element) {
      super();
      this._element = element;
      this._controller = Runtime.cast(null, "T.nilable(Swill::Controller)");
      this._superview = Runtime.cast(null, "T.nilable(Swill::View)");
      this._subviews = Runtime.cast([], "T::Array[View]");
      element.__swill_view__ = this;
    }
    element() {
      return this._element;
    }
    controllerValue() {
      return this._controller;
    }
    set controller(controller) {
      this._controller = controller;
      return this._controller;
    }
    superview() {
      return this._superview;
    }
    // Adopted child views in adoption order.
    subviews() {
      return this._subviews;
    }
    // The nearest controller through the sparse tree: this view's own
    // controller when it is a controller root, else the superview's owner.
    owner() {
      let own = this._controller;
      if (own) return own;
      let superview = this._superview;
      return superview ? superview.owner() : null;
    }
    adoptSubview(child) {
      let previous = child.superview();
      if (previous) previous.releaseSubview(child);
      child.assignSuperview(this);
      Runtime.append(this._subviews, child);
      return child;
    }
    releaseSubview(child) {
      this._subviews = this._subviews.filter((candidate) => candidate !== child);
      return child.assignSuperview(null);
    }
    removeFromSuperview() {
      let superview = this._superview;
      if (superview) return superview.releaseSubview(this);
    }
    // Tree-internal; adopt_subview and release_subview keep both sides consistent.
    assignSuperview(superview) {
      this._superview = superview;
      return this._superview;
    }
    nextResponder() {
      return this._controller || this._superview;
    }
    static of(element) {
      return element.__swill_view__;
    }
    static controllerFor(element) {
      let view = _Swill__View.of(element);
      return view ? view.controllerValue() : null;
    }
    hasAttribute(name) {
      return this._element.hasAttribute(name);
    }
    contains(element) {
      return this._element.contains(element);
    }
    // A fresh element from an inert template's content, or nil when the
    // template has none.
    cloneTemplate(template) {
      let node = template.content.firstElementChild;
      return node ? node.cloneNode(true) : null;
    }
    append(element) {
      return this._element.appendChild(element);
    }
    insertAfter(anchor, element) {
      return anchor.after(element);
    }
    remove(element) {
      return element.remove();
    }
    // The direct child of this view's element that contains element, or nil.
    childContaining(element) {
      let node = element;
      while (node && node.parentElement !== this._element) {
        node = node.parentElement;
      }
      ;
      return node;
    }
    // A state class on a child element.
    mark(element, name, on) {
      return element.classList.toggle(name, on);
    }
    // The selected state, as a class and for assistive technology.
    markSelected(element, on) {
      this.mark(element, "selected", on);
      return element.setAttribute("aria-selected", on ? "true" : "false");
    }
    reveal(element) {
      return element.scrollIntoView({ block: "nearest" });
    }
    // Keyboard focus needs a tab stop.
    ensureFocusable() {
      if (!this._element.hasAttribute("tabindex")) {
        return this._element.setAttribute("tabindex", "0");
      }
    }
    // Drop the browser's text selection, as before a shift-click sweep.
    clearTextSelection() {
      let selection = this._element.ownerDocument.getSelection();
      if (selection) return selection.removeAllRanges();
    }
    // An event listener on this view's element; the returned callable
    // removes it.
    listen(type, handler, capture) {
      this._element.addEventListener(type, handler, capture);
      return () => this._element.removeEventListener(type, handler, capture);
    }
    // ---- focus ----
    focusableSelector() {
      return "input, select, textarea, button, [tabindex]";
    }
    // This element when it is focusable, else its first focusable descendant.
    firstFocusableElement() {
      return this._element.matches(this.focusableSelector()) ? this._element : this._element.querySelector(this.focusableSelector());
    }
    focusElement() {
      let target = this.firstFocusableElement();
      if (target) return target.focus();
    }
    blurElement() {
      let target = this.firstFocusableElement();
      if (target) return target.blur();
    }
    // A view wraps a focusable element, so it accepts by default; becoming
    // first responder focuses it.
    acceptsFirstResponder() {
      return true;
    }
    becomeFirstResponder() {
      this.focusElement();
      return true;
    }
  };
  var Swill__Controller = class extends Swill__Responder {
    // The object a parent binding assigns through bind="path" on this
    // controller root. Editors resolve their own bindings under it.
    // Property under which bind paths in this region resolve; nil binds
    // against the controller itself. A leading @ in markup always ignores it.
    bindingRoot() {
      return null;
    }
    constructor() {
      super();
      this._teardowns = Runtime.cast([], "T::Array[T.proc.void]");
    }
    attach(element) {
      this._view = Swill__View.of(element) || new Swill__View(element);
      this._view.controller = this;
      return this;
    }
    view() {
      return this._view;
    }
    // Ownership is derived from the sparse view tree and never stored twice.
    parent() {
      let superview = this._view.superview();
      return superview ? superview.owner() : null;
    }
    // Direct child controllers in tree order.
    childControllers() {
      let found = Runtime.cast([], "T::Array[Controller]");
      this.collectChildControllers(this._view, found);
      return found;
    }
    // The one application running on this page.
    application() {
      return Swill__Application.shared();
    }
    // A nested controller answers to its parent; a root controller answers to
    // the application, which is the top of the responder chain.
    nextResponder() {
      return this.parent() || this.application();
    }
    registerTeardown(dispose2) {
      return Runtime.append(this._teardowns, dispose2);
    }
    // Releases this controller's listeners and observers, then its descendants,
    // exactly once. The element keeps its View, so the region can be awakened
    // again later.
    // A controller can be first responder when its view has something to
    // focus; becoming and resigning move DOM focus accordingly.
    acceptsFirstResponder() {
      return this._view.firstFocusableElement() != null;
    }
    becomeFirstResponder() {
      if (!super.becomeFirstResponder()) return false;
      this._view.focusElement();
      return true;
    }
    resignFirstResponder(next_responder) {
      if (!super.resignFirstResponder(next_responder)) return false;
      this._view.blurElement();
      return true;
    }
    teardown() {
      if (this._view.controllerValue() !== this) return;
      this.viewWillDisappear();
      this.application().releaseFirstResponder(this._view.element());
      this._teardowns.forEach((dispose2) => dispose2());
      this._teardowns = [];
      this.unbindAll();
      this.dispose();
      this.childControllers().forEach((child) => child.teardown());
      this._view.subviews().forEach((subview) => this._view.releaseSubview(subview));
      this._view.removeFromSuperview();
      this._view.controller = null;
      return this.viewDidDisappear();
    }
    // Coercion hook for JSON outlets: turn parsed data into value objects
    // before the outlet is assigned. nil means the script was empty.
    decodeOutletData(name, value) {
      return value;
    }
    viewDidLoad() {
      return null;
    }
    awakeFromDOM() {
      return null;
    }
    // Runs on a window controller after fragment values were applied to its
    // restorable paths and before controller_did_load. restored is true
    // when at least one value was applied.
    controllerDidRestore(restored) {
      return null;
    }
    controllerDidLoad() {
      return null;
    }
    viewWillAppear() {
      return null;
    }
    viewDidAppear() {
      return null;
    }
    viewWillDisappear() {
      return null;
    }
    viewDidDisappear() {
      return null;
    }
    collectChildControllers(view, found) {
      return view.subviews().forEach((subview) => {
        let controller = subview.controllerValue();
        if (controller) {
          Runtime.append(found, controller);
        } else {
          this.collectChildControllers(subview, found);
        }
      });
    }
  };
  var Swill__Bindings = class extends Swill__Object {
    wire(controller) {
      let root = controller.view().element();
      let prefix = controller.bindingRoot();
      let disposers = Runtime.cast([], "T::Array[T.proc.void]");
      this.wireProperties(controller, prefix, root, disposers);
      this.wireRegion(controller, prefix, root, disposers);
      controller.registerTeardown(this.release(disposers));
      return controller;
    }
    // A region owned by an object rather than a controller: paths resolve
    // directly against the object, and the region's root may carry bind
    // itself (bind="@" is the object). When that root is a controller's,
    // only its represented object comes from here; the controller wires the
    // rest as its own region. Returns the disposer.
    wireObject(object, element) {
      let disposers = Runtime.cast([], "T::Array[T.proc.void]");
      if (element.hasAttribute("bind")) {
        Runtime.append(disposers, this.wireElement(object, element, null));
      }
      ;
      if (!element.hasAttribute("controller")) {
        this.wireProperties(object, null, element, disposers);
        this.wireRegion(object, null, element, disposers);
      }
      ;
      return this.release(disposers);
    }
    wireRegion(object, prefix, element, disposers) {
      return this.eachChild(element, (child) => {
        if (child.hasAttribute("bind")) {
          Runtime.append(disposers, this.wireElement(object, child, prefix));
        }
        ;
        if (!child.hasAttribute("controller")) {
          this.wireProperties(object, prefix, child, disposers);
          return this.wireRegion(object, prefix, child, disposers);
        }
      });
    }
    wireProperties(object, prefix, element, disposers) {
      return element.getAttributeNames().forEach((name) => {
        if (!name.startsWith("bind-")) return;
        let property = Runtime.must(Runtime.slice(name, 5, name.length));
        Runtime.append(disposers, this.wireProperty(
          object,
          prefix,
          element,
          property,
          Runtime.must(element.getAttribute(name))
        ));
      });
    }
    release(disposers) {
      return () => disposers.forEach((dispose2) => dispose2());
    }
    resolvePath(prefix, path) {
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
    // A value binding. On a child controller's root the value becomes the
    // child's represented object; otherwise it renders into the element.
    wireElement(object, element, prefix) {
      let path = this.resolvePath(
        prefix,
        Runtime.must(element.getAttribute("bind"))
      );
      let view = element.__swill_view__;
      let child = view ? view.controllerValue() : null;
      if (child) return this.wireRepresentedObject(object, child, path);
      let form_control = element.matches("input, textarea, select");
      let writable = form_control && !element.hasAttribute("readonly");
      let checkbox = element.type === "checkbox";
      if (Runtime.isTruthy(writable)) Runtime.assertWritablePath(object, path);
      let render = (_value) => {
        let value = Runtime.readPath(object, path);
        if (checkbox) {
          return element.checked = Runtime.isTruthy(value);
        } else if (form_control) {
          return element.value = value == null ? "" : value;
        } else {
          return element.textContent = value == null ? "" : value;
        }
      };
      render(null);
      let dispose2 = Runtime.observePath(object, path, render);
      let event_name = element.matches("select") || checkbox ? "change" : "input";
      let handler = (event) => {
        let value = checkbox ? element.checked : element.value;
        return Runtime.writePath(object, path, value);
      };
      if (Runtime.isTruthy(writable)) element.addEventListener(event_name, handler);
      return () => {
        dispose2();
        if (Runtime.isTruthy(writable)) {
          return element.removeEventListener(event_name, handler);
        }
      };
    }
    wireRepresentedObject(object, child, path) {
      let sync = (value) => child.representedObject = value;
      sync(Runtime.readPath(object, path));
      return Runtime.observePath(object, path, sync);
    }
    wireProperty(object, prefix, element, property, path) {
      let resolved = this.resolvePath(prefix, path);
      let name = property === "readonly" ? "readOnly" : property;
      let render = (value) => this.writeProperty(element, name, value);
      render(Runtime.readPath(object, resolved));
      return Runtime.observePath(object, resolved, render);
    }
    writeProperty(element, property, value) {
      if (property.startsWith("data-") || property.startsWith("aria-")) {
        if (value == null || value === "") {
          element.removeAttribute(property);
        } else {
          element.setAttribute(property, value);
        }
        ;
        return;
      }
      ;
      if (Runtime.isTruthy((property === "href" || property === "src") && value == null)) {
        element.removeAttribute(property);
        element[property] = "";
        return;
      }
      ;
      return element[property] = this.isBooleanProperty(property) ? Runtime.isTruthy(value) : value;
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
  };
  var Swill__Actions = class extends Swill__Object {
    wire(controller) {
      controller.registerTeardown(this.wireInto(
        controller,
        controller.view().element()
      ));
      return controller;
    }
    // Actions in element's owned region dispatch from controller, as a list
    // row's do from its list. Returns the disposer; elements already wired
    // are left to their owner.
    wireInto(controller, element) {
      let disposers = this.ownedMatching(element, "[data-action]").map((target) => this.wireElement(controller, target));
      return () => disposers.forEach((dispose2) => dispose2());
    }
    // data-action="name" on click, or "event:name".
    wireElement(controller, element) {
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
  var Swill__Outlets = class extends Swill__Object {
    connect(controller) {
      let declared = Runtime.cast(
        Runtime.outlets(controller),
        "T::Array[T.untyped]"
      );
      if (Runtime.isEmpty(declared)) return controller;
      let by_name = Runtime.cast({}, "T::Hash[String, T.untyped]");
      declared.forEach((descriptor) => by_name[Runtime.read(descriptor, "name")] = descriptor);
      let connected = Runtime.cast({}, "T::Hash[String, T::Boolean]");
      this.candidates(controller.view().element()).forEach((element) => {
        let name = Runtime.must(element.getAttribute("outlet"));
        if (!Runtime.isTruthy(by_name[name])) {
          throw new Error(`Undeclared outlet: ${name}`);
        }
        ;
        if (connected[name]) throw new Error(`Duplicate outlet: ${name}`);
        connected[name] = true;
        Runtime.write(
          controller,
          name,
          this.valueFor(controller, by_name[name], element)
        );
      });
      declared.forEach((descriptor) => {
        if (Runtime.isTruthy(!Runtime.isTruthy(Runtime.read(
          descriptor,
          "optional"
        )) && !connected[Runtime.read(descriptor, "name")])) {
          throw new Error(`Unresolved outlet: ${Runtime.read(
            descriptor,
            "name"
          )}`);
        }
      });
      return controller;
    }
    // Owned descendants carrying an outlet attribute, plus boundary elements
    // themselves. The root is never its own outlet.
    candidates(root) {
      let found = Runtime.cast([], "T::Array[Element]");
      this.collect(root, found);
      return found;
    }
    collect(element, found) {
      return this.eachChild(element, (child) => {
        if (child.hasAttribute("outlet")) Runtime.append(found, child);
        if (!child.hasAttribute("controller")) return this.collect(child, found);
      });
    }
    // The element decides what the value is: decoded JSON, the inert
    // template, a child controller, or a view. The declaration decides what it
    // must be: a typed outlet's value is checked against the declared type,
    // shallowly, as T.cast checks, so a mismatch fails here by outlet name
    // rather than at first use.
    valueFor(controller, descriptor, element) {
      let name = Runtime.read(descriptor, "name");
      let value = this.materialize(controller, name, element);
      let typed = Runtime.logicalAnd(
        Runtime.read(descriptor, "type"),
        () => Runtime.read(descriptor, "type") !== "T.untyped"
      );
      if (Runtime.isTruthy(Runtime.logicalAnd(typed, () => !Runtime.isTruthy(Runtime.conforms(
        value,
        Runtime.read(descriptor, "type")
      ))))) {
        throw new Error(`Outlet ${name} expects ${Runtime.read(
          descriptor,
          "type"
        )}`);
      }
      ;
      return value;
    }
    materialize(controller, name, element) {
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
    decode(controller, name, element) {
      let text = Runtime.strip(element.textContent);
      return controller.decodeOutletData(
        name,
        Runtime.isEmpty(text) ? null : JSON.parse(text)
      );
    }
  };
  var Swill__Awakening = class extends Swill__Object {
    static wire(root) {
      return Runtime.invoke(new this(), "wire", root);
    }
    static detach(node) {
      return Runtime.invoke(new this(), "detach", node);
    }
    // Returns the new controllers in document order. Awakening a fragment that
    // already sits under a live view adopts it into that view's tree.
    wire(root) {
      let controllers = this.awaken(root);
      this.finish(controllers);
      return controllers;
    }
    // The load phase only: view_did_load, outlets, bindings, actions, and
    // awake_from_dom, children first. The application restores window state
    // between this and finish.
    awaken(root) {
      let controllers = Runtime.cast([], "T::Array[Controller]");
      this.walk(root, this.nearestView(root.parentElement), controllers);
      Runtime.reverse(controllers).forEach((controller) => this.load(controller));
      return controllers;
    }
    // controller_did_load once per controller, then appearance.
    finish(controllers) {
      Runtime.reverse(controllers).forEach((controller) => controller.controllerDidLoad());
      Runtime.reverse(controllers).forEach((controller) => controller.viewWillAppear());
      return Runtime.reverse(controllers).forEach((controller) => controller.viewDidAppear());
    }
    load(controller) {
      controller.viewDidLoad();
      new Swill__Outlets().connect(controller);
      new Swill__Bindings().wire(controller);
      new Swill__Actions().wire(controller);
      return controller.awakeFromDOM();
    }
    // An element that already has a View, such as a list row created in code,
    // is part of the tree whatever its attributes say.
    walk(element, owner, controllers) {
      let view = element.__swill_view__;
      if (Runtime.isTruthy(!view && this.isManaged(element))) {
        view = this.createView(element);
      }
      ;
      if (view) {
        if (Runtime.isTruthy(owner && !view.superview())) owner.adoptSubview(view);
        if (Runtime.isTruthy(element.hasAttribute("controller") && !view.controllerValue())) {
          let controller = Runtime.cast(
            new (Runtime.resolve(Runtime.must(element.getAttribute("controller"))))(),
            "Swill::Controller"
          );
          Runtime.invoke(controller, "attach", element);
          Runtime.append(controllers, controller);
        }
      }
      ;
      let next_owner = view || owner;
      return this.eachChild(
        element,
        (child) => this.walk(child, next_owner, controllers)
      );
    }
    // A live element with klass, controller, or outlet. Templates and JSON
    // scripts are inert content, never objects.
    isManaged(element) {
      if (element.nodeType !== 1) return false;
      if (element.tagName === "TEMPLATE" || element.tagName === "SCRIPT") {
        return false;
      }
      ;
      return element.hasAttribute("klass") || element.hasAttribute("controller") || element.hasAttribute("outlet");
    }
    // klass names a View subclass; a plain managed element gets a plain View.
    createView(element) {
      let name = element.getAttribute("klass");
      if (name == null) return new Swill__View(element);
      let view = new (Runtime.resolve(name))(element);
      if (!(view instanceof Swill__View)) {
        throw new Error(`${name} is not a Swill::View`);
      }
      ;
      return view;
    }
    // Every controller in a subtree in document order, the node included.
    controllersWithin(node) {
      let found = Runtime.cast([], "T::Array[Controller]");
      this.collectControllers(node, found);
      return found;
    }
    collectControllers(element, found) {
      let view = element.__swill_view__;
      let controller = view ? view.controllerValue() : null;
      if (controller) Runtime.append(found, controller);
      return this.eachChild(
        element,
        (child) => this.collectControllers(child, found)
      );
    }
    // The counterpart of wire for a subtree being removed. Teardown recurses
    // into descendants and is idempotent, so document order is fine.
    detach(node) {
      return this.controllersWithin(node).forEach((controller) => controller.teardown());
    }
    nearestView(element) {
      if (!element) return null;
      let view = element.__swill_view__;
      return view ? view : this.nearestView(element.parentElement);
    }
  };
  var Swill__Fragments = class extends Swill__Object {
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
    write(key, value, history) {
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
      if (Runtime.isEqual(
        next_url,
        location.pathname + location.search + location.hash
      )) return;
      return history === "push" ? browser.history.pushState(
        null,
        "",
        next_url
      ) : browser.history.replaceState(null, "", next_url);
    }
    // Run callback with writes suppressed, so observers fired by applying
    // fragment values do not write back mid-application.
    suspended(callback) {
      this._suspended = true;
      try {
        return callback();
      } finally {
        this._suspended = false;
      }
    }
    observe(callback) {
      let browser = this._browser;
      if (!Runtime.isTruthy(browser && this.isAvailable())) return;
      let on_change = (_event) => callback();
      this._on_change = on_change;
      browser.addEventListener("popstate", on_change);
      return browser.addEventListener("hashchange", on_change);
    }
    release() {
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
    constructor(name, root) {
      super();
      this._name = name;
      this._root = root;
      this._controller = Runtime.cast(null, "T.nilable(Swill::Controller)");
      this._content_name = Runtime.cast(null, "T.nilable(String)");
      this._saved_first_responder = Runtime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
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
    name() {
      return this._name;
    }
    root() {
      return this._root;
    }
    controller() {
      return this._controller;
    }
    contentName() {
      return this._content_name;
    }
    // Resolves with nil when the window is dismissed.
    closed() {
      return this._closed;
    }
    savedFirstResponder() {
      return this._saved_first_responder;
    }
    saveFirstResponder(responder) {
      this._saved_first_responder = responder;
      return this._saved_first_responder;
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
      return candidate === this._controller || this._root.contains(candidate.view().element());
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
    constructor() {
      super();
      this._windows = Runtime.cast([], "T::Array[Window]");
      this._controllers = Runtime.cast([], "T::Array[Controller]");
      this._templates = Runtime.cast({}, "T::Hash[String, Element]");
      this._captured = Runtime.cast({}, "T::Hash[String, Element]");
      this._first_responder = Runtime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._observer = null;
    }
    launch(root) {
      if (_Swill__Application.isRunning()) {
        throw new Error("An application is already running");
      }
      ;
      _Swill__Application.launched(this);
      this._root = root;
      this._on_focus = (event) => this.focusIn(event);
      this._on_focus_out = (event) => this.focusOut(event);
      this._on_key_down = (event) => this.firstResponder().keyDown(event);
      this._on_key_up = (event) => this.firstResponder().keyUp(event);
      root.addEventListener("focusin", this._on_focus);
      root.addEventListener("focusout", this._on_focus_out);
      root.addEventListener("keydown", this._on_key_down);
      root.addEventListener("keyup", this._on_key_up);
      this._fragments = new Swill__Fragments(root.ownerDocument.defaultView);
      this.scanTemplates();
      this.prepareWindowContainers();
      let awakening = new Swill__Awakening();
      this._controllers = awakening.awaken(root);
      this.registerWindowContainers();
      this.restoreLaunchedWindows();
      awakening.finish(this._controllers);
      this._fragments.observe(() => this.applyFragment());
      this.watch(root);
      this.applicationDidLaunch();
      return this;
    }
    // Every controller awakened at launch, in document order.
    controllers() {
      return this._controllers;
    }
    root() {
      return this._root;
    }
    // Idempotent: a page may see more than one pagehide before it is unloaded.
    terminate() {
      if (!Runtime.isTruthy(_Swill__Application.isRunning() && _Swill__Application.shared() === this)) {
        return;
      }
      ;
      this.applicationWillTerminate();
      this._fragments.release();
      let observer = this._observer;
      if (observer) observer.disconnect();
      this._windows.forEach((window) => this.releaseWindow(window));
      this._windows = [];
      this._controllers.forEach((controller) => Runtime.read(controller, "teardown"));
      this._controllers = [];
      this._root.removeEventListener("focusin", this._on_focus);
      this._root.removeEventListener("focusout", this._on_focus_out);
      this._root.removeEventListener("keydown", this._on_key_down);
      this._root.removeEventListener("keyup", this._on_key_up);
      this._first_responder = null;
      return _Swill__Application.terminated(this);
    }
    applicationDidLaunch() {
      return null;
    }
    applicationWillTerminate() {
      return null;
    }
    // ---- windows ----
    // Replace a named container's content with a window template or captured
    // pre-rendered content, awaken it, record the content in the URL fragment
    // as a history entry, restore the new controller's state, and hand the
    // first responder to it. Returns that controller.
    loadWindowContent(window_name, content_name) {
      return this.loadWindowContentWith(window_name, content_name, "push");
    }
    // history is :push for navigation, :replace to rewrite the entry, or :none
    // when the fragment itself asked for the content (Back/Forward).
    loadWindowContentWith(window_name, content_name, history) {
      let window = this.windowNamed(window_name);
      if (!window) throw new Error(`No window container: ${window_name}`);
      let container = window.root();
      let previous = this.firstResponder();
      let awakening = new Swill__Awakening();
      this.eachChild(container, (child) => awakening.detach(child));
      container.replaceChildren();
      container.appendChild(this.cloneWindowContent(content_name));
      container.setAttribute("name", content_name);
      let controllers = awakening.awaken(container);
      window.assignContent(content_name, this.topControllerIn(container));
      this._fragments.write(window.name(), content_name, history);
      this.restoreWindowState(
        window,
        history !== "none",
        history !== "none"
      );
      awakening.finish(controllers);
      let controller = window.controller();
      if (controller) {
        this.makeFirstResponder(controller);
      } else if (this.isAttached(previous)) {
        this.makeFirstResponder(previous);
      }
      ;
      return controller;
    }
    // Present a template as a window appended to the root. A <dialog> root is
    // shown. Dismiss it with dismiss(controller); the window's closed promise
    // resolves then.
    showWindow(name) {
      return this.showWindowIn(name, this._root);
    }
    showWindowIn(name, into) {
      let node = this.cloneWindowContent(name);
      into.appendChild(node);
      let awakening = new Swill__Awakening();
      let controllers = awakening.awaken(node);
      let controller = Swill__View.controllerFor(node);
      if (!controller) {
        awakening.detach(node);
        node.remove();
        throw new Error(`Window root has no controller: ${name}`);
      }
      ;
      if (node.tagName === "DIALOG") node.show();
      let window = new Swill__Window(name, node);
      window.assignContent(name, controller);
      window.saveFirstResponder(this.firstResponder());
      Runtime.append(this._windows, window);
      this.restoreWindowState(window, false, false);
      awakening.finish(controllers);
      this.makeFirstResponder(controller);
      return window;
    }
    dismiss(controller) {
      let window = this.windowContaining(controller);
      if (!window) return false;
      this._windows = this._windows.filter((candidate) => candidate !== window);
      let saved = window.savedFirstResponder();
      window.dismiss();
      if (Runtime.isTruthy(saved && this.isAttached(saved))) {
        this.makeFirstResponder(saved);
      }
      ;
      return true;
    }
    windowNamed(name) {
      return this._windows.find((window) => this.matchesContainer(window, name));
    }
    isWindowContent(name) {
      return (this._captured[name] || this.windowTemplate(name)) != null;
    }
    // ---- first responder ----
    // The application itself when nothing more specific holds it.
    firstResponder() {
      return this._first_responder || this;
    }
    // Cocoa's makeFirstResponder: a responder that does not accept is refused
    // up front; the current first responder may refuse to resign; a responder
    // that refuses to become leaves the application as first responder.
    makeFirstResponder(responder) {
      if (Runtime.isTruthy(responder && !responder.acceptsFirstResponder())) {
        return false;
      }
      ;
      let current = this.firstResponder();
      if (responder === current) return true;
      if (!current.resignFirstResponder(responder)) return false;
      this._first_responder = null;
      if (Runtime.isTruthy(responder && responder.becomeFirstResponder())) {
        this._first_responder = responder;
      }
      ;
      return true;
    }
    focusIn(event) {
      return this.syncFirstResponder(event.target, event.relatedTarget);
    }
    focusOut(event) {
      return this.focusLeft(event.relatedTarget);
    }
    // The browser already moved focus; reconcile the first responder without
    // re-running become. A resign refusal restores focus to the refuser.
    syncFirstResponder(target, previous) {
      let responder = this.responderFor(target);
      let current = this.firstResponder();
      if (responder === current) return;
      if (!current.resignFirstResponder(responder)) {
        this.restoreFocus(current, previous);
        return;
      }
      ;
      this._first_responder = responder;
      return this._first_responder;
    }
    // Focus moved to another part of the page: the first responder falls
    // back here. A null destination (the browser's own chrome, or dead space
    // in the page) leaves it alone, as Cocoa does, so keys still reach it
    // when focus returns.
    focusLeft(destination) {
      if (Runtime.isTruthy(destination && !this._root.contains(destination))) {
        this._first_responder = null;
        return this._first_responder;
      }
    }
    // A first responder inside a region being torn down falls back here.
    releaseFirstResponder(element) {
      let owner = this.responderElement(this.firstResponder());
      if (Runtime.isTruthy(owner && (owner === element || element.contains(owner)))) {
        this._first_responder = null;
        return this._first_responder;
      }
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
      if (responder instanceof Swill__Controller) {
        return Runtime.cast(responder, "Swill::Controller").view().element();
      }
      ;
      if (responder instanceof Swill__View) {
        return Runtime.cast(responder, "Swill::View").element();
      }
      ;
      return null;
    }
    restoreFocus(responder, previous) {
      let owner = this.responderElement(responder);
      if (!owner) return;
      let target = Runtime.isTruthy(previous && owner.contains(previous)) ? previous : Runtime.must(owner.__swill_view__).firstFocusableElement();
      if (target) return target.focus();
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
        container.setAttribute("name", content_name);
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
        Runtime.append(this._windows, window);
      });
    }
    // The first controller inside the container whose parent is outside it.
    topControllerIn(container) {
      return new Swill__Awakening().controllersWithin(container).find((controller) => this.isTopWithin(controller, container));
    }
    isTopWithin(controller, container) {
      let parent = controller.parent();
      return parent == null || !container.contains(parent.view().element());
    }
    matchesContainer(window, name) {
      return window.isContainer() && window.name() === name;
    }
    windowContaining(controller) {
      return this._windows.find((window) => this.holds(window, controller));
    }
    holds(window, controller) {
      return window.containsController(controller);
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
        return Swill__Awakening.detach(window.root());
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
    restoreWindowState(window, prune_stale, write_content) {
      let stale = window.disposeRestoration();
      let controller = window.controller();
      let declarations2 = Runtime.cast(
        controller ? Runtime.restorations(controller) : [],
        "T::Array[T.untyped]"
      );
      let keys = declarations2.map((declaration) => window.scopedKey(Runtime.read(declaration, "key")));
      let content = window.contentName();
      if (Runtime.isTruthy(write_content && content)) {
        this._fragments.write(window.name(), content, "replace");
      }
      ;
      if (prune_stale) {
        stale.forEach((key) => {
          if (!keys.includes(key)) this._fragments.write(key, null, "replace");
        });
      }
      ;
      if (!controller) return;
      let params = this._fragments.params();
      let applied = 0;
      this._fragments.suspended(() => declarations2.forEach((declaration) => {
        let text = params[window.scopedKey(Runtime.read(declaration, "key"))];
        if (text == null) return;
        let value = Runtime.decodeFragment(
          Runtime.read(declaration, "type"),
          text
        );
        if (value == null) return;
        Runtime.writePath(
          controller,
          Runtime.read(declaration, "path"),
          value
        );
        applied++;
      }));
      if (!Runtime.isEmpty(declarations2)) {
        controller.controllerDidRestore(applied > 0);
      }
      ;
      return declarations2.forEach((declaration) => {
        let disposer = Runtime.observePath(
          controller,
          Runtime.read(declaration, "path"),
          (_value) => this.writeWindowState(window)
        );
        window.addRestoration(
          disposer,
          window.scopedKey(Runtime.read(declaration, "key"))
        );
      });
    }
    restoreLaunchedWindows() {
      return this._windows.forEach((window) => this.restoreWindowState(window, false, true));
    }
    // Push the controller's current restorable state into the fragment.
    writeWindowState(window) {
      let controller = window.controller();
      if (!controller) return;
      return Runtime.cast(
        Runtime.restorations(controller),
        "T::Array[T.untyped]"
      ).forEach((declaration) => {
        let value = Runtime.encodeFragment(Runtime.readPath(
          controller,
          Runtime.read(declaration, "path")
        ));
        this._fragments.write(
          window.scopedKey(Runtime.read(declaration, "key")),
          value,
          "replace"
        );
      });
    }
    // Back/Forward: a container whose fragment names other known content loads
    // it without touching history; otherwise its state is reapplied.
    applyFragment() {
      let params = this._fragments.params();
      return this._windows.forEach((window) => this.applyFragmentTo(window, params));
    }
    applyFragmentTo(window, params) {
      if (!window.isContainer()) return;
      let requested = params[window.name()];
      if (Runtime.isTruthy(requested != null && requested !== window.contentName())) {
        return this.isWindowContent(requested) ? this.loadWindowContentWith(
          window.name(),
          requested,
          "none"
        ) : Runtime.warn(`window "${window.name()}" requested unknown content "${requested}"`);
      } else {
        return this.restoreWindowState(window, false, false);
      }
    }
    // Code-created content awakens through the same path as markup: the
    // observer wires added subtrees and detaches removed ones. Explicit wiring
    // before the observer runs is harmless, since both are idempotent.
    watch(root) {
      if (!Runtime.isTruthy(typeof MutationObserver !== "undefined")) return;
      let awakening = new Swill__Awakening();
      let observer = new MutationObserver((records, _observer) => records.forEach((record2) => {
        record2.removedNodes.forEach((node) => {
          if (node.nodeType === 1) return awakening.detach(node);
        });
        record2.addedNodes.forEach((node) => {
          if (node.nodeType === 1) return awakening.wire(node);
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
  };
  var Swill__Controller__List = class extends Swill__Controller {
    // NSTableHeaderView analog; never a row.
    // Where rows mount; without it, rows go into the list's own element.
    // Shift-click extends the selection from the last plain click. A multiple
    // attribute on the root turns this on from markup.
    // Indexes of the selected objects among the arranged objects, ascending.
    // ---- selection ----
    selectIndexes(indexes) {
      let arranged = this.arrangedObjects();
      let objects = Runtime.cast([], "T::Array[T.untyped]");
      indexes.forEach((index) => {
        if (Runtime.isTruthy(index >= 0 && index < arranged.length)) {
          Runtime.append(objects, arranged[index]);
        }
      });
      return this.selectedObjects = objects;
    }
    selectObject(object) {
      return this.selectedObjects = object == null ? [] : [object];
    }
    deselectAll() {
      return this.selectedObjects = [];
    }
    selectFirstIfNothingSelected() {
      if (Runtime.isTruthy(Runtime.isEmpty(this.currentSelection()) && !Runtime.isEmpty(this.arrangedObjects()))) {
        return this.selectIndexes([0]);
      }
    }
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
    // The arranged object at index, or nil.
    objectAt(index) {
      let arranged = this.arrangedObjects();
      return Runtime.isTruthy(index >= 0 && index < arranged.length) ? arranged[index] : null;
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
      this._selection_anchor = null;
      if (this._awakened) this.renderAll();
      return this.reconcileSelection();
    }
    selectedObjectsDidChange(_previous, objects) {
      this.syncSelectedRows();
      if (this._syncing_selection) return;
      return this.syncingSelection(() => this.selectedObjectId = this.identifierFor(this.leading(objects)));
    }
    // An id nobody carries clears the selection and stays pending.
    selectedObjectIdDidChange(_previous, identifier) {
      if (this._syncing_selection) return;
      let object = this.objectWithId(identifier);
      return this.syncingSelection(() => this.selectedObjects = Runtime.isTruthy(object) ? [object] : []);
    }
    // ---- keyboard ----
    // Taking the keyboard selects the first row when nothing is selected.
    becomeFirstResponder() {
      if (!super.becomeFirstResponder()) return false;
      this.selectFirstIfNothingSelected();
      return true;
    }
    // Arrow keys move a single selection; everything else continues up.
    keyDown(event) {
      let indexes, current, index;
      let total = this.arrangedObjects().length;
      let key = event.key;
      if (Runtime.isTruthy(total > 0 && (key === "ArrowDown" || key === "ArrowUp"))) {
        event.preventDefault();
        indexes = this.currentIndexes();
        current = Runtime.read(indexes, "empty?") ? -1 : Runtime.must(indexes[0]);
        index = key === "ArrowDown" ? current + 1 : current - 1;
        if (index < 0) index = 0;
        if (index > total - 1) index = total - 1;
        this.selectIndexes([index]);
        this._selection_anchor = index;
        return this._selection_anchor;
      } else {
        return super.keyDown(event);
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
    // The objects the rows show, in order; subclasses may sort or filter.
    arrangedObjects() {
      return Runtime.cast(
        Runtime.logicalOr(this.representedObject, () => []),
        "T::Array[T.untyped]"
      );
    }
    // Where rows mount.
    container() {
      let mount = this.rows;
      return mount ? mount.element() : this._view.element();
    }
    containerView() {
      let mount = this.rows;
      return mount ? mount : this._view;
    }
    // Rows in order: the container's children other than templates and
    // whatever row_element? rejects.
    rowElements() {
      let found = Runtime.cast([], "T::Array[Element]");
      this.eachChild(this.container(), (child) => {
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
      return header == null || header.element() !== element;
    }
    // Real views per row, or bare elements when many rows must stay cheap.
    rowsAreViews() {
      return true;
    }
    rowTemplate() {
      let found = this.ownedMatching(
        this._view.element(),
        'template[for="row"]'
      );
      return Runtime.isEmpty(found) ? null : found[0];
    }
    // The element for item. Clones the row template; override to build rows
    // in code. Bindings, actions, selection, and configure_row still apply.
    makeRowElement(_item) {
      let template = this.rowTemplate();
      let node = template ? this.containerView().cloneTemplate(template) : null;
      if (!node) {
        throw new Error('List has no <template for="row"> and no make_row_element override');
      }
      ;
      return node;
    }
    // NSTableView willDisplayCell analog.
    configureRow(_element, _item) {
      return null;
    }
    renderAll() {
      this.clearRows();
      this.arrangedObjects().forEach((item) => this.attachRow(item));
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
      let awakening = new Swill__Awakening();
      let controllers = awakening.awaken(element);
      let release_bindings = new Swill__Bindings().wireObject(
        item,
        element
      );
      let release_actions = new Swill__Actions().wireInto(this, element);
      element.__swill_row__ = () => {
        release_bindings();
        return release_actions();
      };
      awakening.finish(controllers);
      return this.configureRow(element, item);
    }
    clearRows() {
      return this.rowElements().forEach((element) => this.releaseRow(element));
    }
    releaseRow(element) {
      Swill__Awakening.detach(element);
      let release = element.__swill_row__;
      if (release) {
        release.call();
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
        (event) => this.rowMouseDown(event),
        false
      );
      let stop_click = this._view.listen(
        "click",
        (event) => this.rowClicked(event),
        true
      );
      let stop_double_click = this._view.listen(
        "dblclick",
        (event) => this.rowDoubleClicked(event),
        false
      );
      return this.registerTeardown(() => {
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
    // ---- identity ----
    // The model id of object as a string, or nil when it has none.
    identifierFor(object) {
      if (!Runtime.isTruthy(Runtime.logicalAnd(
        object,
        () => Runtime.respondsTo(object, "id")
      ))) return null;
      let value = Runtime.read(object, "id");
      return value == null ? null : `${value}`;
    }
    objectWithId(identifier) {
      if (identifier == null || identifier === "") return null;
      return this.arrangedObjects().find((candidate) => this.identifierFor(candidate) === identifier);
    }
    // Selection survivors after the collection changed; when none remain, the
    // id that is still wanted may now resolve.
    reconcileSelection() {
      let arranged = this.arrangedObjects();
      let survivors = this.currentSelection().filter((object) => arranged.includes(object));
      if (Runtime.isEmpty(survivors)) {
        let requested = this.objectWithId(this.selectedObjectId);
        if (Runtime.isTruthy(requested)) survivors = [requested];
      }
      ;
      return this.syncingSelection(() => this.selectedObjects = survivors);
    }
    // A write from one side of the selection to the other is marked so the
    // other side's hook does not write back.
    syncingSelection(callback) {
      this._syncing_selection = true;
      try {
        return callback();
      } finally {
        this._syncing_selection = false;
      }
    }
    leading(objects) {
      return Runtime.isTruthy(Runtime.logicalAnd(
        objects,
        () => Runtime.read(objects, "length") > 0
      )) ? objects[0] : null;
    }
    currentSelection() {
      return this.selectedObjects;
    }
    currentIndexes() {
      return this.selectedIndexes;
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
    // The same key flips the direction; a new key sorts ascending.
    toggleSort(key) {
      return this.sortKey === key ? this.sortDirection = this.sortDirection === "ascending" ? "descending" : "ascending" : this.sort(
        key,
        "ascending"
      );
    }
    // Set the key and direction together, re-rendering once.
    sort(key, direction) {
      this._changing_sort = true;
      try {
        this.sortKey = key;
        this.sortDirection = direction;
      } finally {
        this._changing_sort = false;
      }
      ;
      return this.sortDidChange();
    }
    awakeFromDOM() {
      super.awakeFromDOM();
      return this.syncSortStates();
    }
    sortKeyDidChange(_previous, _key) {
      if (!this._changing_sort) return this.sortDidChange();
    }
    sortDirectionDidChange(_previous, _direction) {
      if (!this._changing_sort) return this.sortDidChange();
    }
    sortDidChange() {
      this.syncSortStates();
      if (this._awakened) return this.renderAll();
    }
    // The represented objects in sort order: nil values last when ascending,
    // numbers and booleans by value, everything else as text.
    arrangedObjects() {
      let objects = super.arrangedObjects();
      let key = this.sortKey;
      if (key == null) return objects;
      let sign = this.sortDirection === "descending" ? -1 : 1;
      return Runtime.sortWith(objects, (left, right) => Runtime.compareValues(
        Runtime.read(left, key),
        Runtime.read(right, key)
      ) * sign);
    }
    syncSortStates() {
      let key = this.sortKey;
      let states2 = Runtime.cast({}, "T::Hash[String, String]");
      if (key != null) states2[key] = this.sortDirection;
      return this.sortStates = states2;
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
      let element = this.responderElement(responder);
      if (Runtime.isTruthy(element && this._view.contains(element))) return true;
      let host = this.editingHost();
      return Runtime.isTruthy(host) ? Runtime.invoke(
        host,
        "editor_should_end_editing",
        this
      ) : true;
    }
    // The parent, when it hosts inline editing.
    editingHost() {
      let owner = this.parent();
      return Runtime.isTruthy(owner && Runtime.respondsTo(
        owner,
        "editor_should_end_editing"
      )) ? owner : null;
    }
    responderElement(responder) {
      if (responder instanceof Swill__Controller) {
        return Runtime.cast(responder, "Swill::Controller").view().element();
      }
      ;
      if (responder instanceof Swill__View) {
        return Runtime.cast(responder, "Swill::View").element();
      }
      ;
      return null;
    }
  };
  var Swill__RowEdit = class extends Swill__Object {
    constructor(editor, index, original) {
      super();
      this._editor = editor;
      this._index = index;
      this._original = original;
    }
    editor() {
      return this._editor;
    }
    index() {
      return this._index;
    }
    original() {
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
      return this.registerTeardown(() => this.closeEditor());
    }
    // Whether the editor opened. An edit in progress is committed first; a
    // refused commit keeps that editor.
    beginEditing(index) {
      let original = this.objectAt(index);
      if (!Runtime.isTruthy(original)) return false;
      if (Runtime.isTruthy(this.isEditing() && !this.endEditing(true))) return false;
      let copy = Runtime.isTruthy(Runtime.respondsTo(original, "draft")) ? Runtime.read(
        original,
        "draft"
      ) : Runtime.read(original, "dup");
      return this.openEditor(index, original, copy);
    }
    // False only when a commit was refused; the editor then stays open.
    endEditing(commit) {
      let edit = this._edit;
      if (!edit) return true;
      if (commit) {
        if (!edit.editor().commitEditing()) return false;
        let copy = this.editedObject;
        let error = this.validationError(copy);
        if (Runtime.isTruthy(error)) {
          this.editingDidFailValidation(error);
          return false;
        }
        ;
        this.closeEditor();
        this.commitEdit(copy, edit.original(), edit.index());
      } else {
        edit.editor().discardEditing();
        this.closeEditor();
        this.finishEdit(edit.index(), null);
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
      if (!this.editedObjectHasChanges(copy, edit.original())) {
        this.endEditing(false);
        return true;
      }
      ;
      if (!this.confirmEdit(copy, edit.original())) return false;
      return this.endEditing(true);
    }
    cancelOperation(event) {
      return this.isEditing() ? this.endEditing(false) : super.cancelOperation(event);
    }
    toggleSort(key) {
      if (this.commitEditingIfNeeded()) return super.toggleSort(key);
    }
    // A new collection ends an edit without committing: its row is gone.
    representedObjectDidChange(previous, objects) {
      if (this.isEditing()) this.endEditing(false);
      return super.representedObjectDidChange(previous, objects);
    }
    // ---- policy hooks ----
    commitEdit(copy, original, index) {
      return this.finishEdit(index, this.applyEdit(copy, original, index));
    }
    // A model takes its draft back and stays the row's object; a plain object
    // is replaced by the copy in a new collection. Returns the final object.
    applyEdit(copy, original, _index) {
      if (Runtime.isTruthy(Runtime.respondsTo(original, "apply_draft"))) {
        Runtime.invoke(original, "apply_draft", copy);
        return original;
      }
      ;
      let source = Runtime.cast(
        Runtime.logicalOr(this.representedObject, () => []),
        "T::Array[T.untyped]"
      );
      let source_index = Runtime.indexOf(source, original);
      let values = source.slice();
      if (source_index != null) values[source_index] = copy;
      this.representedObject = values;
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
      return Runtime.read(object, "validate");
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
      return Runtime.read(copy, "dirty?") === true;
    }
    // Override to show the error; the editor stays open.
    editingDidFailValidation(error) {
      return Runtime.warn(`Edit refused: ${Runtime.read(error, "message")}`);
    }
    // ---- rows and the editor ----
    // The editor sits among the rows while editing, but is not one.
    isRowElement(element) {
      if (!super.isRowElement(element)) return false;
      let edit = this._edit;
      return edit == null || edit.editor().view().element() !== element;
    }
    editorTemplate() {
      let found = this.ownedMatching(
        this._view.element(),
        'template[for="editor"]'
      );
      return Runtime.isEmpty(found) ? null : found[0];
    }
    // Mount an editor after the row, bind it to the copy, and give it the
    // keyboard.
    openEditor(index, original, copy) {
      let row = this.rowElements()[index];
      if (!row) return false;
      let node = this.instantiateEditor();
      this.editedObject = copy;
      this.containerView().mark(row, "being-edited", true);
      this.containerView().insertAfter(row, node);
      let editor = this.awakenEditor(node);
      editor.bind(
        "represented_object",
        { to: this, key_path: "edited_object" }
      );
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
      let node = this.containerView().cloneTemplate(template);
      if (!node) throw new Error("The editor template is empty");
      return node;
    }
    // The inline editor rooted at a mounted node; anything else is torn back
    // down before the mistake is reported.
    awakenEditor(node) {
      Swill__Awakening.wire(node);
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
      let element = edit.editor().view().element();
      Swill__Awakening.detach(element);
      return this.containerView().remove(element);
    }
    // The row is a row again, the final object is selected, and the list
    // takes the keyboard back.
    finishEdit(index, final) {
      let row = this.rowElements()[index];
      if (row) this.containerView().mark(row, "being-edited", false);
      if (Runtime.isTruthy(final)) this.selectObject(final);
      return this.application().makeFirstResponder(this);
    }
  };
  function Swill__Model__Attributes(Superclass) {
    class Swill__Model__Attributes_Layer extends Superclass {
      // On MRI the attribute macro below seeds the registry; the compiler
      // reads seeded_by to do the same from collected declarations.
      // Materialize an instance from a wire hash keyed by attribute keys,
      // as Opal's Base.new(values) does.
      collectAttributes() {
        return Runtime.collectAttributes(this);
      }
      applyAttributes(source) {
        return Runtime.applyAttributes(this, source);
      }
      // Declared attributes coerce through the validate_<name>(value, previous)
      // convention, resolved from metadata. A validator may raise to reject.
      coercePropertyValue(name, value, previous) {
        value = super.coercePropertyValue(name, value, previous);
        return Runtime.validateAttribute(this, name, value, previous);
      }
      propertyWillChange(name, previous, value) {
        return super.propertyWillChange(name, previous, value);
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
      markClean() {
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
        if (!Runtime.isTruthy(Runtime.isAttribute(this, name))) return;
        return this.markAttributeDirty(name, previous, value);
      }
      markAttributeDirty(name, previous, value) {
        let baseline = this._dirty_baseline ||= {};
        let names = this.dirtyAttributes;
        if (names.includes(name)) {
          if (Runtime.isEqual(baseline[name], value)) {
            return this.dirtyAttributes = names.filter((candidate) => !Runtime.isEqual(candidate, name));
          }
        } else {
          baseline[name] = previous;
          return this.dirtyAttributes = [...names, name];
        }
      }
    }
    return Swill__Model__DirtyTracking_Layer;
  }
  function Swill__Model__Drafts(Superclass) {
    class Swill__Model__Drafts_Layer extends Superclass {
      draft() {
        let copy = new this.constructor();
        Runtime.invoke(copy, "apply_attributes", this.collectAttributes());
        return copy;
      }
      // Take a draft's attributes back. Application is clean, as any
      // apply_attributes is; the values already passed the validators when
      // the draft was written.
      applyDraft(copy) {
        this.applyAttributes(Runtime.read(copy, "collect_attributes"));
        return this;
      }
    }
    return Swill__Model__Drafts_Layer;
  }
  var Swill__Model__Base = class extends Swill__Object {
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
          "dispose": {
            "arity": 0
          },
          "coerce_property_value": {
            "arity": 3,
            "js": "coercePropertyValue"
          },
          "property_will_change": {
            "arity": 3,
            "js": "propertyWillChange"
          }
        }
      },
      "Swill::Ownership": {
        factory: Swill__Ownership,
        methods: {
          "each_child": {
            "arity": 2,
            "js": "eachChild"
          },
          "each_owned": {
            "arity": 2,
            "js": "eachOwned"
          },
          "owned_matching": {
            "arity": 2,
            "js": "ownedMatching"
          }
        }
      },
      "Swill::ObjectBindings": {
        factory: Swill__ObjectBindings,
        methods: {
          "bind": {
            "arity": 2
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
      "Swill::Model::Attributes": {
        factory: Swill__Model__Attributes,
        classFactory: Swill__Model__Attributes_ClassMethods,
        methods: {
          "collect_attributes": {
            "arity": 0,
            "js": "collectAttributes"
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
          }
        }
      },
      "Swill::Model::DirtyTracking": {
        factory: Swill__Model__DirtyTracking,
        methods: {
          "dirty": {
            "arity": 0
          },
          "mark_clean!": {
            "arity": 0,
            "js": "markClean"
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
          }
        }
      }
    },
    classes: {
      "Swill::Object": {
        constructor: Swill__Object,
        mixins: [Swill__Observable],
        properties: {},
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
          "complete": {
            "arity": 1
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
          "element": {
            "arity": 0
          },
          "controller_value": {
            "arity": 0,
            "js": "controllerValue"
          },
          "controller=": {
            "arity": 1
          },
          "superview": {
            "arity": 0
          },
          "subviews": {
            "arity": 0
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
          "next_responder": {
            "arity": 0,
            "js": "nextResponder"
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
          "ensure_focusable": {
            "arity": 0,
            "js": "ensureFocusable"
          },
          "clear_text_selection": {
            "arity": 0,
            "js": "clearTextSelection"
          },
          "listen": {
            "arity": 3
          },
          "focusable_selector": {
            "arity": 0,
            "js": "focusableSelector"
          },
          "first_focusable_element": {
            "arity": 0,
            "js": "firstFocusableElement"
          },
          "focus_element": {
            "arity": 0,
            "js": "focusElement"
          },
          "blur_element": {
            "arity": 0,
            "js": "blurElement"
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "acceptsFirstResponder"
          },
          "become_first_responder": {
            "arity": 0,
            "js": "becomeFirstResponder"
          }
        }
      },
      "Swill::Controller": {
        constructor: Swill__Controller,
        mixins: [Swill__ObjectBindings],
        properties: {
          "represented_object": {
            js: "representedObject",
            type: "T.untyped",
            attribute: false,
            defaultValue: function default_representedObject() {
              return null;
            }
          }
        },
        methods: {
          "binding_root": {
            "arity": 0,
            "js": "bindingRoot"
          },
          "initialize": {
            "arity": 0
          },
          "attach": {
            "arity": 1
          },
          "view": {
            "arity": 0
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
          "register_teardown": {
            "arity": 1,
            "js": "registerTeardown"
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
          "teardown": {
            "arity": 0
          },
          "decode_outlet_data": {
            "arity": 2,
            "js": "decodeOutletData"
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
      "Swill::Bindings": {
        constructor: Swill__Bindings,
        mixins: [Swill__Ownership],
        properties: {},
        methods: {
          "wire": {
            "arity": 1
          },
          "wire_object": {
            "arity": 2,
            "js": "wireObject"
          },
          "wire_region": {
            "arity": 4,
            "js": "wireRegion"
          },
          "wire_properties": {
            "arity": 4,
            "js": "wireProperties"
          },
          "release": {
            "arity": 1
          },
          "resolve_path": {
            "arity": 2,
            "js": "resolvePath"
          },
          "wire_element": {
            "arity": 3,
            "js": "wireElement"
          },
          "wire_represented_object": {
            "arity": 3,
            "js": "wireRepresentedObject"
          },
          "wire_property": {
            "arity": 5,
            "js": "wireProperty"
          },
          "write_property": {
            "arity": 3,
            "js": "writeProperty"
          },
          "boolean_property?": {
            "arity": 1,
            "js": "isBooleanProperty"
          }
        }
      },
      "Swill::Actions": {
        constructor: Swill__Actions,
        mixins: [Swill__Ownership],
        properties: {},
        methods: {
          "wire": {
            "arity": 1
          },
          "wire_into": {
            "arity": 2,
            "js": "wireInto"
          },
          "wire_element": {
            "arity": 2,
            "js": "wireElement"
          }
        }
      },
      "Swill::Outlets": {
        constructor: Swill__Outlets,
        mixins: [Swill__Ownership],
        properties: {},
        methods: {
          "connect": {
            "arity": 1
          },
          "candidates": {
            "arity": 1
          },
          "collect": {
            "arity": 2
          },
          "value_for": {
            "arity": 3,
            "js": "valueFor"
          },
          "materialize": {
            "arity": 3
          },
          "decode": {
            "arity": 3
          }
        }
      },
      "Swill::Awakening": {
        constructor: Swill__Awakening,
        mixins: [Swill__Ownership],
        properties: {},
        methods: {
          "wire": {
            "arity": 1
          },
          "awaken": {
            "arity": 1
          },
          "finish": {
            "arity": 1
          },
          "load": {
            "arity": 1
          },
          "walk": {
            "arity": 3
          },
          "managed?": {
            "arity": 1,
            "js": "isManaged"
          },
          "create_view": {
            "arity": 1,
            "js": "createView"
          },
          "controllers_within": {
            "arity": 1,
            "js": "controllersWithin"
          },
          "collect_controllers": {
            "arity": 2,
            "js": "collectControllers"
          },
          "detach": {
            "arity": 1
          },
          "nearest_view": {
            "arity": 1,
            "js": "nearestView"
          }
        }
      },
      "Swill::Fragments": {
        constructor: Swill__Fragments,
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
            "arity": 3
          },
          "suspended": {
            "arity": 1
          },
          "observe": {
            "arity": 1
          },
          "release": {
            "arity": 0
          }
        }
      },
      "Swill::Window": {
        constructor: Swill__Window,
        properties: {},
        methods: {
          "initialize": {
            "arity": 2
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
            "arity": 0
          },
          "root": {
            "arity": 0
          },
          "controller": {
            "arity": 0
          },
          "content_name": {
            "arity": 0,
            "js": "contentName"
          },
          "closed": {
            "arity": 0
          },
          "saved_first_responder": {
            "arity": 0,
            "js": "savedFirstResponder"
          },
          "save_first_responder": {
            "arity": 1,
            "js": "saveFirstResponder"
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
          "dismiss": {
            "arity": 0
          }
        }
      },
      "Swill::Application": {
        constructor: Swill__Application,
        mixins: [Swill__Ownership],
        properties: {},
        methods: {
          "initialize": {
            "arity": 0
          },
          "launch": {
            "arity": 1
          },
          "controllers": {
            "arity": 0
          },
          "root": {
            "arity": 0
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
            "js": "loadWindowContent"
          },
          "load_window_content_with": {
            "arity": 3,
            "js": "loadWindowContentWith"
          },
          "show_window": {
            "arity": 1,
            "js": "showWindow"
          },
          "show_window_in": {
            "arity": 2,
            "js": "showWindowIn"
          },
          "dismiss": {
            "arity": 1
          },
          "window_named": {
            "arity": 1,
            "js": "windowNamed"
          },
          "window_content?": {
            "arity": 1,
            "js": "isWindowContent"
          },
          "first_responder": {
            "arity": 0,
            "js": "firstResponder"
          },
          "make_first_responder": {
            "arity": 1,
            "js": "makeFirstResponder"
          },
          "focus_in": {
            "arity": 1,
            "js": "focusIn"
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
          "attached?": {
            "arity": 1,
            "js": "isAttached"
          },
          "release_window": {
            "arity": 1,
            "js": "releaseWindow"
          },
          "restore_window_state": {
            "arity": 3,
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
          }
        }
      },
      "Swill::Controller::List": {
        constructor: Swill__Controller__List,
        mixins: [Swill__Ownership],
        properties: {
          "header_view": {
            js: "headerView",
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue: function default_headerView() {
              return null;
            }
          },
          "rows": {
            type: "T.nilable(Swill::View)",
            attribute: false,
            outlet: true,
            optional: true,
            defaultValue: function defaultRows() {
              return null;
            }
          },
          "allows_multiple_selection": {
            js: "allowsMultipleSelection",
            type: "T::Boolean",
            attribute: false,
            defaultValue: function default_allowsMultipleSelection() {
              return false;
            }
          },
          "selected_objects": {
            js: "selectedObjects",
            type: "T::Array[T.untyped]",
            attribute: false,
            defaultValue: function default_selectedObjects() {
              return [];
            }
          },
          "selected_object_id": {
            js: "selectedObjectId",
            type: "T.nilable(String)",
            attribute: false,
            defaultValue: function default_selectedObjectId() {
              return null;
            }
          },
          "selected_indexes": {
            js: "selectedIndexes",
            type: "T::Array[Integer]",
            attribute: false,
            compute: function compute_selectedIndexes() {
              let selection = this.currentSelection();
              let found = Runtime.cast([], "T::Array[Integer]");
              this.arrangedObjects().forEach((object, index) => {
                if (selection.includes(object)) Runtime.append(found, index);
              });
              return found;
            }
          },
          "selected_object": {
            js: "selectedObject",
            type: "T.untyped",
            attribute: false,
            compute: function compute_selectedObject() {
              return this.leading(this.currentSelection());
            }
          }
        },
        methods: {
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
          "activate_selection": {
            "arity": 0,
            "js": "activateSelection"
          },
          "selected_object_did_change": {
            "arity": 2,
            "js": "selectedObjectDidChange"
          },
          "object_at": {
            "arity": 1,
            "js": "objectAt"
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
          "selected_objects_did_change": {
            "arity": 2,
            "js": "selectedObjectsDidChange"
          },
          "selected_object_id_did_change": {
            "arity": 2,
            "js": "selectedObjectIdDidChange"
          },
          "become_first_responder": {
            "arity": 0,
            "js": "becomeFirstResponder"
          },
          "key_down": {
            "arity": 1,
            "js": "keyDown"
          },
          "insert_newline": {
            "arity": 1,
            "js": "insertNewline"
          },
          "arranged_objects": {
            "arity": 0,
            "js": "arrangedObjects"
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
          },
          "identifier_for": {
            "arity": 1,
            "js": "identifierFor"
          },
          "object_with_id": {
            "arity": 1,
            "js": "objectWithId"
          },
          "reconcile_selection": {
            "arity": 0,
            "js": "reconcileSelection"
          },
          "syncing_selection": {
            "arity": 1,
            "js": "syncingSelection"
          },
          "leading": {
            "arity": 1
          },
          "current_selection": {
            "arity": 0,
            "js": "currentSelection"
          },
          "current_indexes": {
            "arity": 0,
            "js": "currentIndexes"
          }
        }
      },
      "Swill::Controller::SortableList": {
        constructor: Swill__Controller__SortableList,
        properties: {
          "sort_key": {
            js: "sortKey",
            type: "T.nilable(String)",
            attribute: false,
            defaultValue: function default_sortKey() {
              return null;
            }
          },
          "sort_direction": {
            js: "sortDirection",
            type: "String",
            attribute: false,
            defaultValue: function default_sortDirection() {
              return "ascending";
            }
          },
          "sort_states": {
            js: "sortStates",
            type: "T::Hash[String, String]",
            attribute: false,
            defaultValue: function default_sortStates() {
              return {};
            }
          }
        },
        methods: {
          "sort_by": {
            "arity": 1,
            "js": "sortBy"
          },
          "sort_key_for": {
            "arity": 1,
            "js": "sortKeyFor"
          },
          "toggle_sort": {
            "arity": 1,
            "js": "toggleSort"
          },
          "sort": {
            "arity": 2
          },
          "awake_from_dom": {
            "arity": 0,
            "js": "awakeFromDOM"
          },
          "sort_key_did_change": {
            "arity": 2,
            "js": "sortKeyDidChange"
          },
          "sort_direction_did_change": {
            "arity": 2,
            "js": "sortDirectionDidChange"
          },
          "sort_did_change": {
            "arity": 0,
            "js": "sortDidChange"
          },
          "arranged_objects": {
            "arity": 0,
            "js": "arrangedObjects"
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
          "editing_host": {
            "arity": 0,
            "js": "editingHost"
          },
          "responder_element": {
            "arity": 1,
            "js": "responderElement"
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
            "arity": 0
          },
          "index": {
            "arity": 0
          },
          "original": {
            "arity": 0
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
            defaultValue: function default_editedObject() {
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
          "toggle_sort": {
            "arity": 1,
            "js": "toggleSort"
          },
          "represented_object_did_change": {
            "arity": 2,
            "js": "representedObjectDidChange"
          },
          "commit_edit": {
            "arity": 3,
            "js": "commitEdit"
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
      "Swill::Model::Base": {
        constructor: Swill__Model__Base,
        mixins: [Swill__Model__Attributes, Swill__Model__DirtyTracking, Swill__Model__Drafts],
        properties: {
          "dirty_attributes": {
            js: "dirtyAttributes",
            type: "T::Array[T.untyped]",
            attribute: false,
            defaultValue: function default_dirtyAttributes() {
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
          },
          "id": {
            type: "T.nilable(String)",
            attribute: true,
            key: "id",
            defaultValue: function defaultId() {
              return null;
            }
          }
        },
        registries: { modelAttributes: {
          "id": { property: "id", key: "id" }
        } },
        methods: {}
      }
    }
  };

  // build/framework.mjs
  Runtime.install(meta);

  // lib/swill/browser_api.mjs
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
    const names = /* @__PURE__ */ new Set();
    const declared = ownDeclaration(klass, "properties", {});
    assertDescriptorMap(declared, "properties");
    for (const [name, descriptor] of Object.entries(declared)) {
      if (name.length === 0) throw new TypeError("Property names must not be empty");
      properties[name] = { defaultValue: defaultValue(name, descriptor) };
      names.add(name);
    }
    const outlets2 = ownDeclaration(klass, "outlets", {});
    assertDescriptorMap(outlets2, "outlets");
    for (const [name, descriptor] of Object.entries(outlets2)) {
      if (name.length === 0) throw new TypeError("Outlet names must not be empty");
      if (names.has(name)) throw new TypeError(`Duplicate declaration: ${name}`);
      if (!isObject(descriptor) || Array.isArray(descriptor)) {
        throw new TypeError(`Outlet ${name} must use a descriptor`);
      }
      assertKeys(descriptor, ["optional"], `outlet ${name}`);
      if (Object.hasOwn(descriptor, "optional") && typeof descriptor.optional !== "boolean") {
        throw new TypeError(`Outlet ${name} optional must be boolean`);
      }
      properties[name] = { defaultValue: () => null, outlet: true, optional: descriptor.optional === true };
      names.add(name);
    }
    const prototypeDescriptors = Object.getOwnPropertyDescriptors(klass.prototype);
    for (const [name, descriptor] of Object.entries(prototypeDescriptors)) {
      if (name === "constructor" || descriptor.get === void 0) continue;
      if (descriptor.set !== void 0) throw new TypeError(`Computed property ${name} cannot have a setter`);
      if (names.has(name)) throw new TypeError(`Duplicate declaration: ${name}`);
      properties[name] = { compute: descriptor.get };
      names.add(name);
    }
    const actions = ownDeclaration(klass, "actions", []);
    if (!Array.isArray(actions)) throw new TypeError("static actions must be an array");
    const actionNames = /* @__PURE__ */ new Set();
    for (const name of actions) {
      if (typeof name !== "string" || name.length === 0) throw new TypeError("Action names must be non-empty strings");
      if (actionNames.has(name)) throw new TypeError(`Duplicate action: ${name}`);
      if (names.has(name)) throw new TypeError(`Action conflicts with property: ${name}`);
      const descriptor = prototypeDescriptors[name];
      if (!descriptor || typeof descriptor.value !== "function") {
        throw new TypeError(`Missing action method: ${name}`);
      }
      if (descriptor.value.length > 2) throw new TypeError(`Action ${name} accepts more than two arguments`);
      methods[name] = { arity: descriptor.value.length };
      actionNames.add(name);
    }
    return { properties, methods };
  }
  function browserAPI(definitions, Runtime2) {
    const Controller = definitions.Swill__Controller;
    const Application = definitions.Swill__Application;
    const View = definitions.Swill__View;
    const List = definitions.Swill__Controller__List;
    const SortableList = definitions.Swill__Controller__SortableList;
    const Editor = definitions.Swill__Controller__Editor;
    const InlineEditor = definitions.Swill__Controller__InlineEditor;
    const EditableList = definitions.Swill__Controller__EditableList;
    const roots = /* @__PURE__ */ new Set([Controller, Application, View, List, SortableList, Editor, InlineEditor, EditableList]);
    function register(name, klass) {
      if (arguments.length === 1) {
        klass = name;
        name = klass?.name;
      }
      if (typeof klass !== "function" || !klass.prototype) throw new TypeError("Swill.register requires a class");
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new TypeError("Registered classes need a name");
      }
      if (registered2.has(klass)) throw new Error(`Class already registered: ${name}`);
      const parent = Object.getPrototypeOf(klass);
      if (!roots.has(parent) && !registered2.has(parent)) {
        throw new Error(`Register the parent class before ${name}`);
      }
      const { properties, methods } = declarationsFor(klass);
      Runtime2.install({ classes: { [name]: { constructor: klass, properties, methods } } });
      registered2.add(klass);
      return klass;
    }
    function start(options = {}) {
      if (!isObject(options) || Array.isArray(options)) throw new TypeError("Swill.start options must be an object");
      assertKeys(options, ["root", "application"], "start");
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
      const application = new ApplicationClass();
      application.launch(root);
      root.ownerDocument?.defaultView?.addEventListener("pagehide", (event) => {
        if (!event.persisted) application.terminate();
      });
      return application;
    }
    return Object.freeze({
      ...definitions,
      Runtime: Runtime2,
      install: (meta2) => Runtime2.install(meta2),
      Controller,
      Application,
      View,
      List,
      SortableList,
      Editor,
      InlineEditor,
      EditableList,
      register,
      start
    });
  }

  // build/browser.mjs
  if (globalThis.Swill) throw new Error("Framework already loaded");
  globalThis.Swill = browserAPI(framework_exports, Runtime);
  if (typeof document !== "undefined") new Swill__Launcher().install(document);
})();
//# sourceMappingURL=swill.js.map
