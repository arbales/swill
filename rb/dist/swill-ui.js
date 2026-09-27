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
    const set = listeners(object, name, kind);
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
        ...descriptor.computed && !descriptor.writer ? {} : {
          set(value) {
            writeProperty(this, descriptor, value);
          }
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
    if (!classes.has(name)) {
      throw new Error(`Unknown class: ${name}`);
    }
    return classes.get(name);
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
      object[name] = value;
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
  }
  var Runtime = {
    // Classes
    install,
    include,
    installClass,
    inheritableRegistry,
    classSetting,
    classWithSetting,
    identityStore,
    resolve,
    nameOf,
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
    fetch,
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
    warn
  };

  // build/ui/framework.mjs
  var framework_exports = {};
  __export(framework_exports, {
    Swill__Application: () => Swill__Application,
    Swill__ArrayController: () => Swill__ArrayController,
    Swill__Awakening: () => Swill__Awakening,
    Swill__Binding: () => Swill__Binding,
    Swill__BindingDestination: () => Swill__BindingDestination,
    Swill__BooleanTransformer: () => Swill__BooleanTransformer,
    Swill__CheckboxBindingDestination: () => Swill__CheckboxBindingDestination,
    Swill__CollectionArrangement: () => Swill__CollectionArrangement,
    Swill__Connections__Actions: () => Swill__Connections__Actions,
    Swill__Connections__Bindings: () => Swill__Connections__Bindings,
    Swill__Connections__Outlets: () => Swill__Connections__Outlets,
    Swill__Control: () => Swill__Control,
    Swill__Controller: () => Swill__Controller,
    Swill__Controller__List: () => Swill__Controller__List,
    Swill__DOM: () => Swill__DOM,
    Swill__ElementPropertyBindingDestination: () => Swill__ElementPropertyBindingDestination,
    Swill__FieldBindingDestination: () => Swill__FieldBindingDestination,
    Swill__Launcher: () => Swill__Launcher,
    Swill__Notification: () => Swill__Notification,
    Swill__NotificationCenter: () => Swill__NotificationCenter,
    Swill__NumberTransformer: () => Swill__NumberTransformer,
    Swill__Object: () => Swill__Object,
    Swill__ObjectBindings: () => Swill__ObjectBindings,
    Swill__ObjectPropertyBindingDestination: () => Swill__ObjectPropertyBindingDestination,
    Swill__Observable: () => Swill__Observable,
    Swill__Responder: () => Swill__Responder,
    Swill__SelectBindingDestination: () => Swill__SelectBindingDestination,
    Swill__TextBindingDestination: () => Swill__TextBindingDestination,
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
    static eachOwned(root, include_root, callback) {
      if (include_root) callback(root, false);
      return Swill__DOM.eachChild(root, (child) => child.hasAttribute("controller") ? callback(child, true) : Swill__DOM.eachOwned(
        child,
        true,
        callback
      ));
    }
    static ownedMatching(root, selector) {
      let found = Runtime.cast([], "T::Array[Element]");
      Swill__DOM.eachOwned(root, true, (element, controller_root) => {
        if (Runtime.isTruthy(!controller_root && element.matches(selector))) {
          return Runtime.append(found, element);
        }
      });
      return found;
    }
  };
  Swill__DOM.eachChild = Swill__DOM_Functions.eachChild;
  Swill__DOM.eachOwned = Swill__DOM_Functions.eachOwned;
  Swill__DOM.ownedMatching = Swill__DOM_Functions.ownedMatching;
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
          boolean: new Swill__BooleanTransformer()
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
          text: new Swill__TextBindingDestination(),
          field: new Swill__FieldBindingDestination(),
          select: new Swill__SelectBindingDestination(),
          checkbox: new Swill__CheckboxBindingDestination(),
          property: new Swill__ElementPropertyBindingDestination(),
          object: new Swill__ObjectPropertyBindingDestination()
        },
        "T.nilable(T::Hash[String, BindingDestination])"
      );
      return Runtime.must(this._shared);
    }
  };
  var Swill__TextBindingDestination = class extends Swill__BindingDestination {
    write(receiver, binding, value) {
      return receiver.textContent = value;
    }
    read(receiver, binding) {
      return receiver.textContent;
    }
  };
  var Swill__FieldBindingDestination = class extends Swill__BindingDestination {
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
  var Swill__SelectBindingDestination = class extends Swill__FieldBindingDestination {
    eventName() {
      return "change";
    }
  };
  var Swill__CheckboxBindingDestination = class extends Swill__FieldBindingDestination {
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
  var Swill__ElementPropertyBindingDestination = class extends Swill__BindingDestination {
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
  var Swill__ObjectPropertyBindingDestination = class extends Swill__BindingDestination {
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
      // Keeps the property named by **binding** equal to **key_path** on **to**,
      // writing **null_placeholder** whenever the path has no value. Replaces any
      // existing binding of that name.
      //
      // Returns self.
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
      // Releases the binding named **binding,** if any.
      //
      // Returns self.
      unbind(binding) {
        let dispose = this.objectBindings()[binding];
        if (!Runtime.isTruthy(dispose)) return this;
        dispose();
        Runtime.deleteKey(this.objectBindings(), binding);
        return this;
      }
      // Releases every binding, as a controller does when it unloads.
      unbindAll() {
        Object.entries(this.objectBindings()).forEach(([_binding, dispose]) => dispose());
        this._object_bindings = {};
        return this;
      }
      // Keyed by binding name: binding a name replaces whatever was bound there.
      objectBindings() {
        if (!this._object_bindings) this._object_bindings = {};
        return this._object_bindings;
      }
    }
    return Swill__ObjectBindings_Layer;
  }
  function Swill__CollectionArrangement(Superclass) {
    class Swill__CollectionArrangement_Layer extends Superclass {
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
      // Keep the existing overridable method; the underlying computation is cached.
      arrangedObjects() {
        return this.arrangedContent;
      }
      arrangeContent() {
        let controller = this.arrayController;
        if (controller) return controller.arrangedObjects();
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
      // Property reads in this hook become arrangement dependencies automatically.
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
      toggleSort(key) {
        let direction = Runtime.isTruthy(this.sortKey === key && this.sortDirection === "ascending") ? "descending" : "ascending";
        return this.sort(key, direction);
      }
      changeSortKey(key) {
        return this.sort(key, this.sortDirection);
      }
      changeSortDirection(direction) {
        return this.sort(this.sortKey, direction);
      }
      // Temporary presentation inclusion, cleared by new content or explicit sorting.
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
      // Editing a plain row replaces its source object; read-only sources reject it.
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
      arrangedSelection() {
        let controller = this.arrayController;
        if (controller) return controller.selectedObjects;
        let objects = this.arrangedObjects();
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
      selectObjects(objects) {
        let controller = this.arrayController;
        return controller ? controller.selectedObjects = objects : this.selectionState = {
          objects: objects.slice(),
          id: this.identifierFor(objects[0])
        };
      }
      selectIdentifier(identifier) {
        let controller = this.arrayController;
        return controller ? controller.selectedObjectId = identifier : this.selectionState = {
          objects: [],
          id: identifier
        };
      }
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
        if (Runtime.isTruthy(Runtime.isEmpty(this.selectedObjects) && !Runtime.isEmpty(this.arrangedObjects()))) {
          return this.selectIndexes([0]);
        }
      }
      objectAt(index) {
        let objects = this.arrangedObjects();
        return Runtime.isTruthy(index >= 0 && index < objects.length) ? objects[index] : null;
      }
      identifierFor(object) {
        if (!Runtime.isTruthy(object)) return null;
        if (!Runtime.isTruthy(Runtime.respondsTo(object, "id"))) return null;
        let value = Runtime.send(object, "id");
        if (value == null) return null;
        return Runtime.send(value, "to_s");
      }
      objectWithId(identifier) {
        if (identifier == null || Runtime.isEmpty(identifier)) return null;
        return this.arrangedObjects().find((object) => this.identifierFor(object) === identifier);
      }
      currentSelection() {
        return this.selectedObjects;
      }
      currentIndexes() {
        return this.selectedIndexes;
      }
      // Compatibility for subclasses that previously reconciled after arranging.
      reconcileSelection() {
        return this.selectedObjects;
      }
    }
    return Swill__CollectionArrangement_Layer;
  }
  var Swill__ArrayController = class extends Swill__Object {
  };
  var Swill__Responder = class extends Swill__Object {
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
    // Called as this responder takes focus. Answer false to refuse it.
    becomeFirstResponder() {
      return true;
    }
    // Called as focus moves to +next_responder+. Answer false to keep it.
    resignFirstResponder(next_responder) {
      return true;
    }
    // Routes Escape, Enter and Tab to their own hooks; anything else passes
    // to the next responder.
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
          if (target) return target.keyDown(event);
      }
    }
    // Passes to the next responder.
    keyUp(event) {
      let target = this.nextResponder();
      if (target) return target.keyUp(event);
    }
    // Escape. Dismiss what is open, or pass it along.
    cancelOperation(event) {
      let target = this.nextResponder();
      if (target) return target.cancelOperation(event);
    }
    // Enter. Commit what is being edited, or pass it along.
    insertNewline(event) {
      let target = this.nextResponder();
      if (target) return target.insertNewline(event);
    }
    // Tab. Complete what is being edited, or pass it along.
    complete(event) {
      let target = this.nextResponder();
      if (target) return target.complete(event);
    }
  };
  var Swill__View = class _Swill__View extends Swill__Responder {
    // Wraps +element+, marking it managed.
    constructor(element) {
      super();
      this._element = element;
      this._controller = Runtime.cast(null, "T.nilable(Swill::Controller)");
      this._superview = Runtime.cast(null, "T.nilable(Swill::View)");
      this._subviews = Runtime.cast([], "T::Array[View]");
      element.__swill_view__ = this;
    }
    // The element this view wraps.
    get element() {
      return this._element;
    }
    // The controller rooted here, or nil when this view is not a controller
    // root. Use #owner to find the controller a view belongs to.
    controllerValue() {
      return this._controller;
    }
    set controller(controller) {
      this._controller = controller;
      return this._controller;
    }
    // The view that adopted this one, or nil.
    get superview() {
      return this._superview;
    }
    // Adopted child views in adoption order.
    get subviews() {
      return this._subviews;
    }
    // The nearest controller through the sparse tree: this view's own
    // controller when it is a controller root, else the superview's owner.
    owner() {
      let own = this._controller;
      if (own) return own;
      return Runtime.nilable(this._superview?.owner());
    }
    // Takes +child+ into this view, releasing it from any previous superview.
    // Structural only: it does not awaken or lay anything out.
    adoptSubview(child) {
      let previous = child.superview;
      if (previous) previous.releaseSubview(child);
      child.assignSuperview(this);
      Runtime.append(this._subviews, child);
      return child;
    }
    // Drops +child+ from this view.
    releaseSubview(child) {
      this._subviews = this._subviews.filter((candidate) => candidate !== child);
      return child.assignSuperview(null);
    }
    // Drops this view from its superview, if it has one.
    removeFromSuperview() {
      let superview = this._superview;
      if (superview) return superview.releaseSubview(this);
    }
    // Tree-internal; adopt_subview and release_subview keep both sides consistent.
    assignSuperview(superview) {
      this._superview = superview;
      return this._superview;
    }
    // The controller rooted here, else the superview.
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
    // Whether the element carries +name+.
    hasAttribute(name) {
      return this._element.hasAttribute(name);
    }
    // Whether +element+ lies within this view's element.
    contains(element) {
      return this._element.contains(element);
    }
    // A fresh element from an inert template's content, or nil when the
    // template has none.
    cloneTemplate(template) {
      let node = template.content.firstElementChild;
      return node ? node.cloneNode(true) : null;
    }
    // Appends +element+ to this view's element.
    append(element) {
      return this._element.appendChild(element);
    }
    // Inserts +element+ after +anchor+.
    insertAfter(anchor, element) {
      return anchor.after(element);
    }
    // Removes +element+ from the document.
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
    // Scrolls the nearest ancestor just far enough to bring +element+ into view.
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
    // ---- focus ----
    // The selector deciding what counts as focusable. Override to widen it.
    focusableSelector() {
      return "input, select, textarea, button, [tabindex]";
    }
    // This element when it is focusable, else its first focusable descendant.
    firstFocusableElement() {
      return this._element.matches(this.focusableSelector()) ? this._element : this._element.querySelector(this.focusableSelector());
    }
    // Focuses the first focusable element, if there is one.
    focusElement() {
      let target = this.firstFocusableElement();
      if (target) return target.focus({ preventScroll: true });
    }
    // Blurs the first focusable element, if there is one.
    blurElement() {
      let target = this.firstFocusableElement();
      if (target) return target.blur();
    }
    // A view wraps a focusable element, so it accepts by default; becoming
    // first responder focuses it.
    acceptsFirstResponder() {
      return true;
    }
    // Focuses the element.
    becomeFirstResponder() {
      this.focusElement();
      return true;
    }
  };
  var Swill__Control = class extends Swill__View {
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
  var Swill__Controller = class extends Swill__Responder {
    // An outlet is a property connected, at awakening, to the element in this
    // controller's owned region that carries a matching outlet attribute.
    // Unconnected until then, so its reader is nilable. Declared here rather
    // than on Swill::Object because only a controller owns a region.
    // restorable :query, key: :q — a bindable path whose value the
    // application keeps in the URL fragment. The leaf type is derived when the
    // class is compiled; the runtime checks the path at installation.
    // The object a parent binding assigns through bind="path" on this
    // controller root. Editors resolve their own bindings under it.
    // Property under which bind paths in this region resolve; nil binds
    // against the controller itself. A leading @ in markup always ignores it.
    bindingRoot() {
      return null;
    }
    // Adopts +element+ as this controller's root view. Answers self.
    attach(element) {
      this._view = Swill__View.of(element) || new Swill__View(element);
      this._view.controller = this;
      return this;
    }
    // The root view of this controller's region.
    get view() {
      return this._view;
    }
    // Ownership is derived from the sparse view tree and never stored twice.
    parent() {
      return Runtime.nilable(this._view.superview?.owner());
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
    // Observe a notification for as long as this controller is loaded.
    observeNotification(name, callback) {
      return this.retain(Swill__NotificationCenter.default().addObserver(
        name,
        callback
      ));
    }
    // True when the region holds something focusable.
    acceptsFirstResponder() {
      return this._view.firstFocusableElement() != null;
    }
    // Focuses the first focusable element in the region.
    becomeFirstResponder() {
      if (!super.becomeFirstResponder()) return false;
      this._view.focusElement();
      return true;
    }
    // Blurs the focused element. Answers false to refuse the change.
    resignFirstResponder(next_responder) {
      if (!super.resignFirstResponder(next_responder)) return false;
      this._view.blurElement();
      return true;
    }
    // Releases this controller's bindings, everything it retained, and its own
    // observation state, then its descendants, exactly once. The element keeps
    // its View, so the region can be awakened again later. Calling it twice is
    // harmless.
    unload() {
      if (this._view.controllerValue() !== this) return;
      this.viewWillDisappear();
      this.application().releaseFirstResponder(this._view.element);
      this.unbindAll();
      this.dealloc();
      this.childControllers().forEach((child) => child.unload());
      this._view.subviews.forEach((subview) => this._view.releaseSubview(subview));
      this._view.removeFromSuperview();
      this._view.controller = null;
      return this.viewDidDisappear();
    }
    // Coercion hook for JSON outlets: turn parsed data into value objects
    // before the outlet is assigned. nil means the script was empty.
    decodeOutletData(name, value) {
      return value;
    }
    // Outlets are connected, and no binding has fired yet: state set here is
    // what bindings push first.
    viewDidLoad() {
      return null;
    }
    // Bindings have pushed their initial values, actions are live, and child
    // controllers are wired.
    awakeFromDOM() {
      return null;
    }
    // Runs on a window controller after fragment values were applied to its
    // restorable paths and before controller_did_load. restored is true
    // when at least one value was applied.
    controllerDidRestore(restored) {
      return null;
    }
    // The whole region, including any restored values, is in place. Runs once
    // per controller instance.
    controllerDidLoad() {
      return null;
    }
    // The region is about to appear. Runs each time it is awakened.
    viewWillAppear() {
      return null;
    }
    // The region has appeared.
    viewDidAppear() {
      return null;
    }
    // The region is about to go away, before anything it owns is released.
    viewWillDisappear() {
      return null;
    }
    // The region is gone and everything it owned has been released.
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
        (child, controller_root) => {
          if (child.hasAttribute("bind")) {
            Runtime.append(disposers, this.connect(object, child, prefix));
          }
          ;
          if (!controller_root) {
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
      return () => disposers.forEach((dispose) => dispose());
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
    static establishIn(element, controller) {
      let disposers = Swill__DOM.ownedMatching(element, "[data-action]").map((target) => this.connect(target, controller));
      return () => disposers.forEach((dispose) => dispose());
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
    static establish(controller) {
      let declared = Runtime.cast(
        Runtime.outlets(controller),
        "T::Array[T.untyped]"
      );
      if (Runtime.isEmpty(declared)) return controller;
      let by_name = Runtime.cast({}, "T::Hash[String, T.untyped]");
      declared.forEach((descriptor) => by_name[Runtime.send(descriptor, "name")] = descriptor);
      let connected = Runtime.cast({}, "T::Hash[String, T::Boolean]");
      this.candidates(controller.view.element).forEach((element) => {
        let name = Runtime.must(element.getAttribute("outlet"));
        if (!Runtime.isTruthy(by_name[name])) {
          throw new Error(`Undeclared outlet: ${name}`);
        }
        ;
        if (connected[name]) throw new Error(`Duplicate outlet: ${name}`);
        connected[name] = true;
        return Runtime.write(
          controller,
          name,
          this.valueFor(controller, by_name[name], element)
        );
      });
      declared.forEach((descriptor) => {
        if (Runtime.isTruthy(!Runtime.isTruthy(Runtime.send(
          descriptor,
          "optional"
        )) && !connected[Runtime.send(descriptor, "name")])) {
          throw new Error(`Unresolved outlet: ${Runtime.send(
            descriptor,
            "name"
          )}`);
        }
      });
      return controller;
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
      let controllers = Runtime.cast([], "T::Array[Controller]");
      this.walk(root, this.nearestView(root.parentElement), controllers);
      Runtime.reverse(controllers).forEach((controller) => this.load(controller));
      return controllers;
    }
    static finish(controllers) {
      Runtime.reverse(controllers).forEach((controller) => controller.controllerDidLoad());
      Runtime.reverse(controllers).forEach((controller) => controller.viewWillAppear());
      return Runtime.reverse(controllers).forEach((controller) => controller.viewDidAppear());
    }
    static load(controller) {
      Swill__Connections__Outlets.establish(controller);
      controller.viewDidLoad();
      Swill__Connections__Bindings.establish(controller);
      Swill__Connections__Actions.establish(controller);
      return controller.awakeFromDOM();
    }
    static walk(element, owner, controllers) {
      let view = element.__swill_view__;
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
      let next_owner = view || owner;
      return Swill__DOM.eachChild(
        element,
        (child) => this.walk(child, next_owner, controllers)
      );
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
      return this.controllersWithin(node).forEach((controller) => controller.unload());
    }
    static nearestView(element) {
      if (!element) return null;
      let view = element.__swill_view__;
      return view ? view : this.nearestView(element.parentElement);
    }
  };
  Swill__Awakening.instantiate = Swill__Awakening_Functions.instantiate;
  Swill__Awakening.awaken = Swill__Awakening_Functions.awaken;
  Swill__Awakening.finish = Swill__Awakening_Functions.finish;
  Swill__Awakening.load = Swill__Awakening_Functions.load;
  Swill__Awakening.walk = Swill__Awakening_Functions.walk;
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
    get contentName() {
      return this._content_name;
    }
    // Resolves with nil when the window is dismissed.
    get closed() {
      return this._closed;
    }
    get savedFirstResponder() {
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
      return candidate === this._controller || this._root.contains(candidate.view.element);
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
      this._first_responder = Runtime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._posted_first_responder = Runtime.cast(
        null,
        "T.nilable(Swill::Responder)"
      );
      this._observer = null;
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
      this._on_focus = (event) => this.focusIn(event);
      this._on_focus_out = (event) => this.focusOut(event);
      this._on_key_down = (event) => this.firstResponder().keyDown(event);
      this._on_key_up = (event) => this.firstResponder().keyUp(event);
      root.addEventListener("focusin", this._on_focus);
      root.addEventListener("focusout", this._on_focus_out);
      root.addEventListener("keydown", this._on_key_down);
      root.addEventListener("keyup", this._on_key_up);
      this._fragments = new Swill__URLFragment(root.ownerDocument.defaultView);
      this.scanTemplates();
      this.prepareWindowContainers();
      this._controllers = Swill__Awakening.awaken(root);
      this.registerWindowContainers();
      this.restoreLaunchedWindows();
      Swill__Awakening.finish(this._controllers);
      this._fragments.startObserving(() => this.applyFragment());
      this.watch(root);
      this.applicationDidLaunch();
      return this;
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
      this._fragments.stopObserving();
      let observer = this._observer;
      if (observer) observer.disconnect();
      this._windows.forEach((window) => this.releaseWindow(window));
      this._windows = [];
      this._controllers.forEach((controller) => Runtime.send(controller, "unload"));
      this._controllers = [];
      this._root.removeEventListener("focusin", this._on_focus);
      this._root.removeEventListener("focusout", this._on_focus_out);
      this._root.removeEventListener("keydown", this._on_key_down);
      this._root.removeEventListener("keyup", this._on_key_up);
      this.assignFirstResponder(null);
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
    // as a history entry, restore the new controller's state, and hand the
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
    // shown. Dismiss it with dismiss(controller); the window's closed promise
    // resolves then.
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
      let controllers = Swill__Awakening.awaken(node);
      let controller = Swill__View.controllerFor(node);
      if (!controller) {
        Swill__Awakening.detach(node);
        node.remove();
        throw new Error(`Window root has no controller: ${name}`);
      }
      ;
      if (node.tagName === "DIALOG") node.show();
      let window = new Swill__Window(name, node);
      window.assignContent(name, controller);
      window.saveFirstResponder(this.firstResponder());
      Runtime.append(this._windows, window);
      this.restoreWindowState(
        window,
        Runtime.keywordArguments({ prune_stale: false, write_content: false })
      );
      Swill__Awakening.finish(controllers);
      if (!this.isResponderWithin(this.firstResponder(), node)) {
        this.makeFirstResponder(controller);
      }
      ;
      return window;
    }
    // Closes the window +controller+ belongs to, restoring the first responder
    // it displaced.
    dismiss(controller) {
      let window = this.windowContaining(controller);
      if (!window) return false;
      this._windows = this._windows.filter((candidate) => candidate !== window);
      let saved = window.savedFirstResponder;
      window.dismiss();
      if (Runtime.isTruthy(saved && this.isAttached(saved))) {
        this.makeFirstResponder(saved);
      }
      ;
      return true;
    }
    // The window with +name+, or nil.
    windowNamed(name) {
      return this._windows.find((window) => this.matchesContainer(window, name));
    }
    // Whether content named +name+ exists to be loaded into a window.
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
        if (this._first_responder == null) this._first_responder = responder;
      }
      ;
      this.postFirstResponderChange();
      return true;
    }
    assignFirstResponder(responder) {
      this._first_responder = responder;
      return this.postFirstResponderChange();
    }
    // Every change of first responder is posted once as
    // first_responder_did_change, with the application as the object and the
    // responder as user info, so a debugging view or a toolbar can follow it
    // without polling. Focus moving during become may already have posted
    // the same responder; the last one posted is remembered for that.
    postFirstResponderChange() {
      if (this._first_responder === this._posted_first_responder) return;
      this._posted_first_responder = this._first_responder;
      return Swill__NotificationCenter.default().post(
        "first_responder_did_change",
        this,
        this._first_responder
      );
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
      return this.assignFirstResponder(responder);
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
    // A first responder inside a region being torn down falls back here.
    releaseFirstResponder(element) {
      let owner = this.responderElement(this.firstResponder());
      if (Runtime.isTruthy(owner && (owner === element || element.contains(owner)))) {
        return this.assignFirstResponder(null);
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
        return Runtime.cast(responder, "Swill::Controller").view.element;
      }
      ;
      if (responder instanceof Swill__View) {
        return Runtime.cast(responder, "Swill::View").element;
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
      this._fragments.suspended(Runtime.blockArgument(() => declarations2.forEach((declaration) => {
        let text = params[window.scopedKey(Runtime.send(declaration, "key"))];
        if (text == null) return;
        let value = this.decodeFragmentValue(
          Runtime.send(declaration, "type"),
          text
        );
        if (value == null) return;
        Runtime.writePath(
          controller,
          Runtime.send(declaration, "path"),
          value
        );
        return ++applied;
      })));
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
        let value = this.encodeFragmentValue(Runtime.readPath(
          controller,
          Runtime.send(declaration, "path")
        ));
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
    encodeFragmentValue(value) {
      if (value == null || value === "") return null;
      return `${value}`;
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
    arrangedContentDidChange(_previous, _objects) {
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
    // Arrow keys move a single selection; everything else continues up.
    keyDown(event) {
      let index;
      let total = this.arrangedObjects().length;
      if (total === 0) return super.keyDown(event);
      let indexes = this.currentIndexes();
      let current = Runtime.isEmpty(indexes) ? -1 : Runtime.must(indexes[0]);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        index = current < 0 ? 0 : current + 1;
        if (index > total - 1) index = total - 1;
        this.selectIndexes([index]);
        this._selection_anchor = index;
        return this._selection_anchor;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (current <= 0) {
          return this.cancelOperation(event);
        } else {
          this.selectIndexes([current - 1]);
          this._selection_anchor = current - 1;
          return this._selection_anchor;
        }
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
        release2.call();
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
          "arranged_objects": {
            "arity": 0,
            "js": "arrangedObjects"
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
      "Swill::TextBindingDestination": {
        constructor: Swill__TextBindingDestination,
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
      "Swill::FieldBindingDestination": {
        constructor: Swill__FieldBindingDestination,
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
      "Swill::SelectBindingDestination": {
        constructor: Swill__SelectBindingDestination,
        properties: {},
        methods: {
          "event_name": {
            "arity": 0,
            "js": "eventName"
          }
        }
      },
      "Swill::CheckboxBindingDestination": {
        constructor: Swill__CheckboxBindingDestination,
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
      "Swill::ElementPropertyBindingDestination": {
        constructor: Swill__ElementPropertyBindingDestination,
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
      "Swill::ObjectPropertyBindingDestination": {
        constructor: Swill__ObjectPropertyBindingDestination,
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
          "selection_state": {
            js: "selectionState",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "arranged_content": {
            js: "arrangedContent",
            type: "T::Array[T.untyped]",
            attribute: false,
            compute: function compute_arrangedContent() {
              return this.arrangeContent();
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
              this.arrangedObjects().forEach((object, index) => {
                if (selected.includes(object)) Runtime.append(indexes, index);
              });
              return indexes;
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
            "arity": 2,
            "minimum": 2,
            "maximum": 2
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
      "Swill::Control": {
        constructor: Swill__Control,
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
          "resign_first_responder": {
            "arity": 1,
            "js": "resignFirstResponder"
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
          "content_name": {
            "arity": 0,
            "js": "contentName",
            "accessor": true
          },
          "closed": {
            "arity": 0,
            "accessor": true
          },
          "saved_first_responder": {
            "arity": 0,
            "js": "savedFirstResponder",
            "accessor": true
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
        properties: {},
        methods: {
          "initialize": {
            "arity": 0
          },
          "launch": {
            "arity": 1
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
          "assign_first_responder": {
            "arity": 1,
            "js": "assignFirstResponder"
          },
          "post_first_responder_change": {
            "arity": 0,
            "js": "postFirstResponderChange"
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
            "arity": 1,
            "js": "encodeFragmentValue"
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
          "selection_state": {
            js: "selectionState",
            type: "T::Hash[String, T.untyped]",
            attribute: false,
            defaultValue() {
              return {};
            }
          },
          "arranged_content": {
            js: "arrangedContent",
            type: "T::Array[T.untyped]",
            attribute: false,
            compute: function compute_arrangedContent2() {
              return this.arrangeContent();
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
              this.arrangedObjects().forEach((object, index) => {
                if (selected.includes(object)) Runtime.append(indexes, index);
              });
              return indexes;
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
          "arranged_content_did_change": {
            "arity": 2,
            "js": "arrangedContentDidChange"
          },
          "selected_objects_did_change": {
            "arity": 2,
            "js": "selectedObjectsDidChange"
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
      }
    }
  };

  // build/ui/framework.mjs
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
      methods[name] = { arity: descriptor.value.length };
      actionNames.add(name);
    }
    return { properties, methods };
  }
  var framework = null;
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
    if (!framework.roots.has(parent) && !registered2.has(parent)) {
      throw new Error(`Register the parent class before ${name}`);
    }
    const { properties, methods } = declarationsFor(klass);
    framework.Runtime.install({ classes: { [name]: { constructor: klass, properties, methods } } });
    registered2.add(klass);
    return klass;
  }
  function start(options = {}) {
    const { Application } = framework;
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
      roots: new Set(roots.map((name) => definitions[names2[name]]).filter(Boolean))
    };
    return Object.freeze({ ...definitions, Runtime: Runtime2, install: install2, ...classes2, register, start });
  }

  // build/ui/browser.mjs
  if (globalThis.Swill) throw new Error("Framework already loaded");
  globalThis.Swill = browserAPI(framework_exports, Runtime, { "Object": "Swill__Object", "ArrayController": "Swill__ArrayController", "Controller": "Swill__Controller", "Application": "Swill__Application", "View": "Swill__View", "List": "Swill__Controller__List", "SortableList": "Swill__Controller__SortableList", "Editor": "Swill__Controller__Editor", "InlineEditor": "Swill__Controller__InlineEditor", "EditableList": "Swill__Controller__EditableList", "Control": "Swill__Control", "TextField": "Swill__Control__TextField", "Button": "Swill__Control__Button", "Select": "Swill__Control__Select", "CustomSelect": "Swill__Control__CustomSelect", "NotificationCenter": "Swill__NotificationCenter", "Wire": "Swill__Wire", "ValueTransformer": "Swill__ValueTransformer", "Model.Base": "Swill__Model__Base", "Model.Editable": "Swill__Model__Editable", "Model.Resource": "Swill__Model__Resource", "Model.DistantObject": "Swill__Model__DistantObject", "Model.DistantClient": "Swill__Model__DistantClient", "Model.Store": "Swill__Model__Store", "Model.Codec": "Swill__Model__Codec", "Model.PlainJSON": "Swill__Model__PlainJSON", "Model.JSONAPI": "Swill__Model__JSONAPI", "Model.Dataset": "Swill__Model__Dataset", "Model.Collection": "Swill__Model__Collection", "Model.ResultSet": "Swill__Model__ResultSet" }, ["Object", "ArrayController", "Controller", "Application", "View", "List", "SortableList", "Editor", "InlineEditor", "EditableList", "Control", "TextField", "Button", "Select", "CustomSelect", "ValueTransformer", "Model.Base", "Model.Resource", "Model.DistantObject"]);
  if (typeof document !== "undefined") new Swill__Launcher().install(document);
})();
//# sourceMappingURL=swill-ui.js.map
