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
      properties: new Map([...declarations(parent, "properties"), ...properties.map((item) => [item.name, item])]),
      methods: new Map([...declarations(parent, "methods"), ...methods.map((item) => [item.name, item])]),
      restorations: [...declarations(parent, "restorations"), ...restorations2]
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
  function isBlank(value) {
    if (value == null || value === false) return true;
    if (typeof value === "string") return stripString(value).length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }
  function isPresent(value) {
    return !isBlank(value);
  }
  function isEmpty(value) {
    if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
    throw new TypeError("empty? requires a string or array");
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
      case "strip":
        return strip(value);
      case "upcase":
        return upcase(value);
      case "downcase":
        return downcase(value);
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
  var NIL_READERS = ["nil?", "blank?", "present?"];
  var VALUE_READERS = ["nil?", "blank?", "present?", "empty?", "strip", "upcase", "downcase"];

  // lib/swill/runtime/properties.mjs
  var states = /* @__PURE__ */ new WeakMap();
  var captures = [];
  function state(object) {
    if (!states.has(object)) {
      states.set(object, { values: /* @__PURE__ */ new Map(), computed: /* @__PURE__ */ new Map(), observers: /* @__PURE__ */ new Map(), dependents: /* @__PURE__ */ new Map() });
    }
    return states.get(object);
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
      slot = { valid: false, running: false, value: void 0, disposers: [] };
      slots.set(descriptor.name, slot);
    }
    if (slot.valid) return slot.value;
    if (slot.running) throw new Error(`Computed cycle: ${descriptor.name}`);
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
      if (!isEqual(previous, value)) notify(object, descriptor.name, previous, value);
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
    if (isEqual(previous, value)) return value;
    object.property_will_change(descriptor.name, previous, value);
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
      classConfiguration.set(klass, { registries: /* @__PURE__ */ new Map(), settings: /* @__PURE__ */ new Map() });
    }
    return classConfiguration.get(klass);
  }
  function install(meta2) {
    const entries = Object.entries(meta2.classes ?? {});
    const mixins = Object.values(meta2.mixins ?? {});
    const incoming = new Map(mixins.map((item) => [item.factory, item]));
    for (const [name, descriptor] of entries) {
      if (classes.has(name)) throw new Error(`Duplicate class: ${name}`);
      if (!Object.hasOwn(descriptor, "constructor") || typeof descriptor.constructor !== "function") {
        throw new TypeError(`Missing constructor: ${name}`);
      }
      for (const mixin of descriptor.mixins ?? []) {
        if (!incoming.has(mixin) && !mixinMetadata.has(mixin)) throw new Error(`Unknown mixin for ${name}`);
      }
    }
    const pending = new Map(entries.map(([name, descriptor]) => [descriptor.constructor, { name, descriptor }]));
    if (pending.size !== entries.length) throw new Error("Duplicate constructor in meta");
    const methods = (descriptors) => Object.entries(descriptors ?? {}).map(([name, descriptor]) => ({ name, js: name, ...descriptor }));
    for (const mixin of mixins) {
      if (typeof mixin.factory !== "function") throw new Error("Mixin factory must be a function");
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
        const properties = Object.entries(descriptor.properties ?? {}).map(([name2, property]) => ({ name: name2, js: name2, ...property, computed: typeof property.compute === "function" }));
        installClass(klass, name, properties, methods(descriptor.methods), descriptor.registries, descriptor.restorations ?? []);
        pending.delete(klass);
        progress = true;
      }
      if (!progress) throw new Error("Unresolvable superclass order in meta");
    }
  }
  function include(klass, mixins, incoming = /* @__PURE__ */ new Map()) {
    if (hasMetadata(klass)) throw new Error("Mixins must be attached before class installation");
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
      if (values.length !== 1) throw new Error(`${name} expects zero or one argument`);
      own.set(name, values[0]);
      return values[0];
    }
    if (own.has(name)) return own.get(name);
    const parent = Object.getPrototypeOf(klass);
    return typeof parent?.[name] === "function" ? parent[name]() : null;
  }
  function installClass(klass, name, properties, methods, registries = {}, restorations2 = []) {
    if (classes.has(name)) throw new Error(`Duplicate class: ${name}`);
    installMetadata(klass, properties, methods, restorations2);
    const propertyByName = new Map(properties.map((property) => [property.name, property]));
    for (const [registryName, seeds] of Object.entries(registries)) {
      if (typeof klass[registryName] !== "function") {
        throw new Error(`Missing registry declaration: ${registryName}`);
      }
      const registry = klass[registryName]();
      for (const [name2, seed] of Object.entries(seeds)) {
        const property = propertyByName.get(seed.property);
        if (!property) throw new Error(`Unknown registry property: ${seed.property}`);
        registry[name2] = { ...seed, type: property.type, defaultValue: property.defaultValue };
      }
    }
    for (const descriptor of properties) {
      Object.defineProperty(klass.prototype, descriptor.js, {
        configurable: true,
        get() {
          record(this, descriptor.name);
          return descriptor.computed ? computedValue(this, descriptor) : storedValue(this, descriptor);
        },
        ...descriptor.computed ? {} : { set(value) {
          writeProperty(this, descriptor, value);
        } }
      });
    }
    classes.set(name, klass);
  }
  function resolve(name) {
    if (!classes.has(name)) throw new Error(`Unknown class: ${name}`);
    return classes.get(name);
  }

  // lib/swill/runtime/paths.mjs
  function read(object, name) {
    if (object == null) return NIL_READERS.includes(name) ? valueRead(object, name) : null;
    if (typeof object !== "object" && typeof object !== "function") return valueRead(object, name);
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
    if (object == null) throw new Error(`Cannot write ${name} on nil`);
    const property = declarations(object.constructor, "properties").get(name);
    if (property) {
      if (property.computed) throw new Error(`Read-only property: ${name}`);
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
    if (names.length === 0) throw new Error(`Read-only binding: ${path}`);
    const name = names.pop();
    const owner = names.reduce((target, segment) => read(target, segment), object);
    if (owner == null) return null;
    const descriptor = declarations(owner.constructor, "properties").get(name);
    if (!descriptor || descriptor.computed) throw new Error(`Read-only binding: ${path}`);
    return { owner, descriptor };
  }
  function assertWritablePath(object, path) {
    pathWriter(object, path);
  }
  function writePath(object, path, value) {
    const writer = pathWriter(object, path);
    if (!writer) return void 0;
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
          disposers.push(subscribe(owner, name, () => {
            if (!active) return;
            rehook();
            callback(readPath(object, path));
          }, "observers"));
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
    if (typeof object !== "object" && typeof object !== "function") return VALUE_READERS.includes(name);
    const properties = declarations(object.constructor, "properties");
    const methods = declarations(object.constructor, "methods");
    if (name.endsWith("=")) {
      const property = properties.get(name.slice(0, -1));
      return !!property && !property.computed || methods.has(name);
    }
    return properties.has(name) || methods.has(name);
  }
  function invoke(object, name, ...args) {
    const method = declarations(object.constructor, "methods").get(name);
    if (!method || method.arity !== args.length) throw new Error(`Unknown action or wrong arity: ${name}`);
    return object[method.js](...args);
  }
  function performAction(object, name, sender, event) {
    const method = declarations(object.constructor, "methods").get(name);
    if (!method || method.arity > 2) throw new Error(`Unknown action or wrong arity: ${name}`);
    return object[method.js](...[sender, event].slice(0, method.arity));
  }

  // lib/swill/runtime/attributes.mjs
  function isAttribute(object, name) {
    return !!declarations(object.constructor, "properties").get(name)?.attribute;
  }
  function validate_attribute(object, name, value, previous) {
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
  function collect_attributes(object) {
    const result = {};
    for (const descriptor of declarations(object.constructor, "properties").values()) {
      if (descriptor.attribute && !descriptor.computed) {
        result[descriptor.key] = object[descriptor.js];
      }
    }
    return result;
  }
  function apply_attributes(object, source) {
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
    // installation and class configuration
    install,
    include,
    installClass,
    inheritableRegistry,
    classSetting,
    resolve,
    // values
    isTruthy,
    logicalAnd,
    logicalOr,
    isEqual,
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
    // metadata-driven dispatch
    read,
    segments,
    readPath,
    write,
    assertWritablePath,
    writePath,
    respondsTo,
    invoke,
    performAction,
    // observation
    observe,
    observePath,
    dispose,
    // declarations
    isAttribute,
    validate_attribute,
    restorations,
    outlets,
    collect_attributes,
    apply_attributes,
    // The one console boundary: wrong untrusted URL input is reported, not raised.
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
      coerce_property_value(name, value, previous) {
        return value;
      }
      property_will_change(name, previous, value) {
        return null;
      }
    }
    return Swill__Observable_Layer;
  }
  var Swill__Object = class extends Object {
  };
  function Swill__Ownership(Superclass) {
    class Swill__Ownership_Layer extends Superclass {
      each_child(element, callback) {
        let children = element.children;
        let index = 0;
        while (index < children.length) {
          callback(children[index]);
          index++;
        }
      }
      // Visit root and its owned descendants. A nested controller root is a
      // boundary: neither it nor anything inside it belongs to this owner.
      each_owned(root, callback) {
        callback(root);
        return this.each_child(root, (child) => {
          if (!child.hasAttribute("controller")) return this.each_owned(child, callback);
        });
      }
      owned_matching(root, selector) {
        let found = [];
        this.each_owned(root, (element) => {
          if (element.matches(selector)) return found.push(element);
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
        this.object_bindings().push({
          target,
          dispose: Runtime.observePath(source, path, sync)
        });
        return this;
      }
      unbind(target) {
        let remaining = [];
        this.object_bindings().forEach((binding) => binding.target === target ? binding.dispose.call(null) : remaining.push(binding));
        this._object_bindings = remaining;
        return this;
      }
      unbind_all() {
        this.object_bindings().forEach((binding) => binding.dispose.call(null));
        this._object_bindings = [];
        return this;
      }
      object_bindings() {
        if (!this._object_bindings) this._object_bindings = [];
        return this._object_bindings;
      }
    }
    return Swill__ObjectBindings_Layer;
  }
  var Swill__Responder = class extends Swill__Object {
    next_responder() {
      return null;
    }
    // Target/action: the first responder in the chain that responds to the
    // name handles it, as respond_to? would decide in Ruby. A same-named
    // property or a method of the wrong arity is an error there, not a reason
    // to keep walking. An action nobody handles is also an error.
    perform_action(name, sender, event) {
      if (Runtime.respondsTo(this, name)) {
        return Runtime.performAction(this, name, sender, event);
      }
      ;
      let target = this.next_responder();
      if (!target) throw new Error(`Unhandled action: ${name}`);
      return target.perform_action(name, sender, event);
    }
    // ---- first responder ----
    //
    // The policy gate for being made first responder by focus or the key loop.
    // Views accept; a bare responder refuses.
    accepts_first_responder_predicate() {
      return false;
    }
    // Return false to refuse; set up state such as focus otherwise. Never
    // call directly; ask the application.
    become_first_responder() {
      return true;
    }
    // Return false to keep first responder status; the incoming responder is
    // passed so a refusal can be selective.
    resign_first_responder(next_responder) {
      return true;
    }
    // ---- key events ----
    //
    // Well-known keys route to named methods; everything else, and the named
    // methods themselves, continue up the chain.
    key_down(event) {
      switch (event.key) {
        case "Escape":
          return this.cancel_operation(event);
        case "Enter":
          return this.insert_newline(event);
        case "Tab":
          return this.complete(event);
        default:
          return this.next_responder()?.key_down(event);
      }
    }
    key_up(event) {
      return this.next_responder()?.key_up(event);
    }
    cancel_operation(event) {
      return this.next_responder()?.cancel_operation(event);
    }
    insert_newline(event) {
      return this.next_responder()?.insert_newline(event);
    }
    complete(event) {
      return this.next_responder()?.complete(event);
    }
  };
  var Swill__View = class extends Swill__Responder {
    constructor(element) {
      super();
      this._element = element;
      this._controller = null;
      this._superview = null;
      this._subviews = [];
      element.__swill_view__ = this;
    }
    element() {
      return this._element;
    }
    controller_value() {
      return this._controller;
    }
    set controller(controller) {
      this._controller = controller;
      return this._controller;
    }
    superview() {
      return this._superview;
    }
    // Adopted child views in adoption order, as a JavaScript array.
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
    adopt_subview(child) {
      let previous = child.superview();
      if (previous) previous.release_subview(child);
      child.assign_superview(this);
      this._subviews.push(child);
      return child;
    }
    release_subview(child) {
      this._subviews = this._subviews.filter((candidate) => candidate !== child);
      return child.assign_superview(null);
    }
    remove_from_superview() {
      let superview = this._superview;
      if (superview) return superview.release_subview(this);
    }
    // Tree-internal; adopt_subview and release_subview keep both sides consistent.
    assign_superview(superview) {
      this._superview = superview;
      return this._superview;
    }
    next_responder() {
      return this._controller ?? this._superview;
    }
    // ---- focus ----
    focusable_selector() {
      return "input, select, textarea, button, [tabindex]";
    }
    // This element when it is focusable, else its first focusable descendant.
    first_focusable_element() {
      return this._element.matches(this.focusable_selector()) ? this._element : this._element.querySelector(this.focusable_selector());
    }
    focus_element() {
      let target = this.first_focusable_element();
      if (target) return target.focus();
    }
    blur_element() {
      let target = this.first_focusable_element();
      if (target) return target.blur();
    }
    // A view wraps a focusable element, so it accepts by default; becoming
    // first responder focuses it.
    accepts_first_responder_predicate() {
      return true;
    }
    become_first_responder() {
      this.focus_element();
      return true;
    }
  };
  var Swill__Controller = class extends Swill__Responder {
    // The object a parent binding assigns through bind="path" on this
    // controller root. Editors resolve their own bindings under it.
    // Property under which bind paths in this region resolve; nil binds
    // against the controller itself. A leading @ in markup always ignores it.
    binding_root() {
      return null;
    }
    attach(element) {
      this._view = element.__swill_view__ ?? new Swill__View(element);
      this._view.controller = this;
      this._teardowns = [];
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
    // Direct child controllers in tree order, as a JavaScript array.
    child_controllers() {
      let found = [];
      this.collect_child_controllers(this._view, found);
      return found;
    }
    // The application whose root contains this controller, found through the
    // DOM so fragments awakened later and multiple applications both work.
    application() {
      return this.nearest_application(this._view.element());
    }
    // A nested controller answers to its parent; a root controller answers to
    // the application, which is the top of the responder chain.
    next_responder() {
      return this.parent() ?? this.application();
    }
    register_teardown(dispose2) {
      return this._teardowns.push(dispose2);
    }
    // Releases this controller's listeners and observers, then its descendants,
    // exactly once. The element keeps its View, so the region can be awakened
    // again later.
    // A controller can be first responder when its view has something to
    // focus; becoming and resigning move DOM focus accordingly.
    accepts_first_responder_predicate() {
      return this._view.first_focusable_element() != null;
    }
    become_first_responder() {
      if (!super.become_first_responder()) return false;
      this._view.focus_element();
      return true;
    }
    resign_first_responder(next_responder) {
      if (!super.resign_first_responder(next_responder)) return false;
      this._view.blur_element();
      return true;
    }
    teardown() {
      if (this._view.controller_value() !== this) return;
      this.view_will_disappear();
      let current_application = this.application();
      if (current_application) {
        current_application.release_first_responder(this._view.element());
      }
      ;
      this._teardowns.forEach((dispose2) => dispose2());
      this._teardowns = [];
      this.unbind_all();
      this.dispose();
      this.child_controllers().forEach((child) => child.teardown());
      this._view.subviews().forEach((subview) => this._view.release_subview(subview));
      this._view.remove_from_superview();
      this._view.controller = null;
      return this.view_did_disappear();
    }
    // Coercion hook for JSON outlets: turn parsed data into value objects
    // before the outlet is assigned. nil means the script was empty.
    decode_outlet_data(name, value) {
      return value;
    }
    view_did_load() {
      return null;
    }
    awake_from_dom() {
      return null;
    }
    // Runs on a window controller after fragment values were applied to its
    // restorable paths and before controller_did_load. restored is true
    // when at least one value was applied.
    controller_did_restore(restored) {
      return null;
    }
    controller_did_load() {
      return null;
    }
    view_will_appear() {
      return null;
    }
    view_did_appear() {
      return null;
    }
    view_will_disappear() {
      return null;
    }
    view_did_disappear() {
      return null;
    }
    nearest_application(element) {
      if (!element) return null;
      let found = element.__swill_application__;
      return found ? found : this.nearest_application(element.parentElement);
    }
    collect_child_controllers(view, found) {
      return view.subviews().forEach((subview) => {
        let controller = subview.controller_value();
        if (controller) {
          found.push(controller);
        } else {
          this.collect_child_controllers(subview, found);
        }
      });
    }
  };
  var Swill__Bindings = class extends Swill__Object {
    wire(controller) {
      let root = controller.view().element();
      let prefix = controller.binding_root();
      this.wire_properties(controller, prefix, root);
      this.wire_region(controller, prefix, root);
      return controller;
    }
    wire_region(controller, prefix, element) {
      return this.each_child(element, (child) => {
        if (child.hasAttribute("controller")) {
          if (child.hasAttribute("bind")) {
            return controller.register_teardown(this.wire_element(
              controller,
              child,
              prefix
            ));
          }
        } else {
          if (child.hasAttribute("bind")) {
            controller.register_teardown(this.wire_element(
              controller,
              child,
              prefix
            ));
          }
          ;
          this.wire_properties(controller, prefix, child);
          return this.wire_region(controller, prefix, child);
        }
      });
    }
    wire_properties(controller, prefix, element) {
      return element.getAttributeNames().forEach((name) => {
        if (name.slice(0, 5) === "bind-") {
          let property = name.slice(5, name.length);
          controller.register_teardown(this.wire_property(
            controller,
            prefix,
            element,
            property,
            element.getAttribute(name)
          ));
        }
      });
    }
    resolve_path(prefix, path) {
      if (path[0] === "@") return path.slice(1, path.length) ?? "";
      if (prefix == null) return path;
      return path.length === 0 ? `${prefix}` : `${prefix}.${path}`;
    }
    // A value binding. On a child controller's root the value becomes the
    // child's represented object; otherwise it renders into the element.
    wire_element(object, element, prefix) {
      let path = this.resolve_path(prefix, element.getAttribute("bind"));
      let view = element.__swill_view__;
      let child = view ? view.controller_value() : null;
      if (child) return this.wire_represented_object(object, child, path);
      let form_control = element.matches("input, textarea, select");
      let writable = form_control && !element.hasAttribute("readonly");
      let checkbox = element.type === "checkbox";
      if (writable) Runtime.assertWritablePath(object, path);
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
      if (writable) element.addEventListener(event_name, handler);
      return () => {
        dispose2();
        if (writable) return element.removeEventListener(event_name, handler);
      };
    }
    wire_represented_object(object, child, path) {
      let sync = (value) => child.represented_object = value;
      sync(Runtime.readPath(object, path));
      return Runtime.observePath(object, path, sync);
    }
    wire_property(object, prefix, element, property, path) {
      let resolved = this.resolve_path(prefix, path);
      let name = property === "readonly" ? "readOnly" : property;
      let render = (value) => this.write_property(element, name, value);
      render(Runtime.readPath(object, resolved));
      return Runtime.observePath(object, resolved, render);
    }
    write_property(element, property, value) {
      if (property.slice(0, 5) === "data-" || property.slice(0, 5) === "aria-") {
        if (value == null || value === "") {
          element.removeAttribute(property);
        } else {
          element.setAttribute(property, value);
        }
        ;
        return;
      }
      ;
      if ((property === "href" || property === "src") && value == null) {
        element.removeAttribute(property);
        element[property] = "";
        return;
      }
      ;
      return element[property] = this.boolean_property_predicate(property) ? Runtime.isTruthy(value) : value;
    }
    boolean_property_predicate(property) {
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
      this.owned_matching(controller.view().element(), "[data-action]").forEach((element) => controller.register_teardown(this.wire_element(controller, element)));
      return controller;
    }
    wire_element(controller, element) {
      let event_name, action_name;
      if (element.__swill_action__) return () => null;
      let specification = element.getAttribute("data-action").trim();
      if (specification.length === 0) return () => null;
      let separator = specification.indexOf(":");
      if (separator >= 0) {
        event_name = specification.slice(0, separator);
        action_name = specification.slice(separator + 1);
      } else {
        event_name = "click";
        action_name = specification;
      }
      ;
      let handler = (event) => controller.perform_action(action_name, element, event);
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
      let declared = Runtime.outlets(controller);
      if (declared.length === 0) return controller;
      let by_name = {};
      declared.forEach((descriptor) => by_name[descriptor.name] = descriptor);
      let connected = {};
      this.candidates(controller.view().element()).forEach((element) => {
        let name = element.getAttribute("outlet");
        if (!by_name[name]) throw new Error(`Undeclared outlet: ${name}`);
        if (connected[name]) throw new Error(`Duplicate outlet: ${name}`);
        connected[name] = true;
        Runtime.write(
          controller,
          name,
          this.value_for(controller, name, element)
        );
      });
      declared.forEach((descriptor) => {
        if (!descriptor.optional && !connected[descriptor.name]) {
          throw new Error(`Unresolved outlet: ${descriptor.name}`);
        }
      });
      return controller;
    }
    // Owned descendants carrying an outlet attribute, plus boundary elements
    // themselves. The root is never its own outlet.
    candidates(root) {
      let found = [];
      this.collect(root, found);
      return found;
    }
    collect(element, found) {
      return this.each_child(element, (child) => {
        if (child.hasAttribute("outlet")) found.push(child);
        if (!child.hasAttribute("controller")) return this.collect(child, found);
      });
    }
    value_for(controller, name, element) {
      if (element.tagName === "SCRIPT" && element.type === "application/json") {
        let text = element.textContent.trim();
        return controller.decode_outlet_data(
          name,
          text.length === 0 ? null : JSON.parse(text)
        );
      }
      ;
      if (element.tagName === "TEMPLATE") return element;
      let view = element.__swill_view__;
      if (!view) throw new Error(`Outlet ${name} is not a managed element`);
      let owner = view.controller_value();
      return owner ? owner : view;
    }
  };
  var Swill__Awakening = class extends Swill__Object {
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
      let controllers = [];
      this.walk(root, this.nearest_view(root.parentElement), controllers);
      this.each_reversed(controllers, (controller) => this.load(controller));
      return controllers;
    }
    // controller_did_load once per controller, then appearance.
    finish(controllers) {
      this.each_reversed(
        controllers,
        (controller) => controller.controller_did_load()
      );
      this.each_reversed(
        controllers,
        (controller) => controller.view_will_appear()
      );
      return this.each_reversed(
        controllers,
        (controller) => controller.view_did_appear()
      );
    }
    load(controller) {
      controller.view_did_load();
      new Swill__Outlets().connect(controller);
      new Swill__Bindings().wire(controller);
      new Swill__Actions().wire(controller);
      return controller.awake_from_dom();
    }
    walk(element, owner, controllers) {
      let view = null;
      if (this.managed_predicate(element)) {
        view = element.__swill_view__ ?? this.create_view(element);
        if (owner && !view.superview()) owner.adopt_subview(view);
        if (element.hasAttribute("controller") && !view.controller_value()) {
          let controller_class = Runtime.resolve(element.getAttribute("controller"));
          let controller = new controller_class();
          controller.attach(element);
          controllers.push(controller);
        }
      }
      ;
      let next_owner = view ?? owner;
      return this.each_child(
        element,
        (child) => this.walk(child, next_owner, controllers)
      );
    }
    // A live element with klass, controller, or outlet. Templates and JSON
    // scripts are inert content, never objects.
    managed_predicate(element) {
      if (element.nodeType !== 1) return false;
      if (element.tagName === "TEMPLATE" || element.tagName === "SCRIPT") {
        return false;
      }
      ;
      return element.hasAttribute("klass") || element.hasAttribute("controller") || element.hasAttribute("outlet");
    }
    // klass names a View subclass; a plain managed element gets a plain View.
    create_view(element) {
      let name = element.getAttribute("klass");
      if (!name) return new Swill__View(element);
      let view_class = Runtime.resolve(name);
      let view = new view_class(element);
      if (!(view instanceof Swill__View)) {
        throw new Error(`${name} is not a Swill::View`);
      }
      ;
      return view;
    }
    // Every controller in a subtree in document order, the node included.
    controllers_within(node) {
      let found = [];
      this.collect_controllers(node, found);
      return found;
    }
    collect_controllers(element, found) {
      let view = element.__swill_view__;
      let controller = view ? view.controller_value() : null;
      if (controller) found.push(controller);
      return this.each_child(
        element,
        (child) => this.collect_controllers(child, found)
      );
    }
    // The counterpart of wire for a subtree being removed. Teardown recurses
    // into descendants and is idempotent, so document order is fine.
    detach(node) {
      return this.controllers_within(node).forEach((controller) => controller.teardown());
    }
    nearest_view(element) {
      if (!element) return null;
      let view = element.__swill_view__;
      return view ? view : this.nearest_view(element.parentElement);
    }
    each_reversed(controllers, callback) {
      let index = controllers.length - 1;
      while (index >= 0) {
        callback(controllers[index]);
        index--;
      }
    }
  };
  var Swill__Fragments = class extends Swill__Object {
    constructor(browser) {
      super();
      this._browser = browser;
      this._suspended = false;
      this._on_change = null;
    }
    available_predicate() {
      return this._browser != null && this._browser.location != null && this._browser.history != null;
    }
    params() {
      let found = {};
      if (!this.available_predicate()) return found;
      let search = new URLSearchParams(this._browser.location.hash.replace(
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
      if (!this.available_predicate()) return;
      let location = this._browser.location;
      let search = new URLSearchParams(location.hash.replace(/^#/m, ""));
      if (value == null) {
        search.delete(key);
      } else {
        search.set(key, value);
      }
      ;
      let query = search.toString();
      let next_url = location.pathname + location.search + (query.length > 0 ? "#" + query : "");
      if (next_url === location.pathname + location.search + location.hash) return;
      return history === "push" ? this._browser.history.pushState(
        null,
        "",
        next_url
      ) : this._browser.history.replaceState(null, "", next_url);
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
      if (!this.available_predicate()) return;
      this._on_change = (_event) => callback();
      this._browser.addEventListener("popstate", this._on_change);
      return this._browser.addEventListener("hashchange", this._on_change);
    }
    release() {
      if (!this._on_change) return;
      this._browser.removeEventListener("popstate", this._on_change);
      this._browser.removeEventListener("hashchange", this._on_change);
      this._on_change = null;
      return this._on_change;
    }
  };
  var Swill__Window = class extends Swill__Object {
    constructor(name, root) {
      super();
      this._name = name;
      this._root = root;
      this._controller = null;
      this._content_name = null;
      this._saved_first_responder = null;
      this._restoration_disposers = [];
      this._restoration_keys = [];
      this._closed = new Promise((resolve2, _reject) => {
        this._resolve_closed = resolve2;
        return this._resolve_closed;
      });
    }
    // ---- fragment restoration ----
    //
    // The window's own fragment param is its bare name (main=farewell); its
    // controller's state params are scoped under it (main.n=3).
    scoped_key(key) {
      return `${this._name}.${key}`;
    }
    add_restoration(disposer, key) {
      this._restoration_disposers.push(disposer);
      return this._restoration_keys.push(key);
    }
    // Release the current restoration subscriptions; returns the scoped keys
    // they covered so a caller can prune ones the next controller will not own.
    dispose_restoration() {
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
    content_name() {
      return this._content_name;
    }
    // Resolves with nil when the window is dismissed.
    closed() {
      return this._closed;
    }
    saved_first_responder() {
      return this._saved_first_responder;
    }
    save_first_responder(responder) {
      this._saved_first_responder = responder;
      return this._saved_first_responder;
    }
    assign_content(content_name, controller) {
      this._content_name = content_name;
      this._controller = controller;
      return this._controller;
    }
    // A named [window] container, as opposed to a template-instantiated dialog.
    container_predicate() {
      return this._root.hasAttribute("window");
    }
    contains_controller_predicate(candidate) {
      return candidate === this._controller || this._root.contains(candidate.view().element());
    }
    // Tear down the subtree, close a dialog, remove the root, and resolve.
    dismiss() {
      this.dispose_restoration();
      new Swill__Awakening().detach(this._root);
      if (this._root.close) this._root.close();
      this._root.remove();
      return this._resolve_closed.call(null, null);
    }
  };
  var Swill__Application = class extends Swill__Responder {
    launch(root) {
      this._root = root;
      root.__swill_application__ = this;
      this._windows = [];
      this._templates = {};
      this._captured = {};
      this._on_focus = (event) => this.sync_first_responder(event.target, event.relatedTarget);
      this._on_focus_out = (event) => this.focus_left(event.relatedTarget);
      this._on_key_down = (event) => this.first_responder().key_down(event);
      this._on_key_up = (event) => this.first_responder().key_up(event);
      root.addEventListener("focusin", this._on_focus);
      root.addEventListener("focusout", this._on_focus_out);
      root.addEventListener("keydown", this._on_key_down);
      root.addEventListener("keyup", this._on_key_up);
      this._fragments = new Swill__Fragments(root.ownerDocument.defaultView);
      this.scan_templates();
      this.prepare_window_containers();
      let awakening = new Swill__Awakening();
      this._controllers = awakening.awaken(root);
      this.register_window_containers();
      this.restore_launched_windows();
      awakening.finish(this._controllers);
      this._fragments.observe(() => this.apply_fragment());
      this.watch(root);
      this.application_did_launch();
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
      if (this._root.__swill_application__ !== this) return;
      this.application_will_terminate();
      this._fragments.release();
      if (this._observer) this._observer.disconnect();
      this._windows.forEach((window) => this.release_window(window));
      this._windows = [];
      this._controllers.forEach((controller) => controller.teardown());
      this._controllers = [];
      this._root.removeEventListener("focusin", this._on_focus);
      this._root.removeEventListener("focusout", this._on_focus_out);
      this._root.removeEventListener("keydown", this._on_key_down);
      this._root.removeEventListener("keyup", this._on_key_up);
      this._first_responder = null;
      return this._root.__swill_application__ = null;
    }
    application_did_launch() {
      return null;
    }
    application_will_terminate() {
      return null;
    }
    // ---- windows ----
    // Replace a named container's content with a window template or captured
    // pre-rendered content, awaken it, record the content in the URL fragment
    // as a history entry, restore the new controller's state, and hand the
    // first responder to it. Returns that controller.
    load_window_content(window_name, content_name) {
      return this.load_window_content_with(
        window_name,
        content_name,
        "push"
      );
    }
    // history is :push for navigation, :replace to rewrite the entry, or :none
    // when the fragment itself asked for the content (Back/Forward).
    load_window_content_with(window_name, content_name, history) {
      let window = this.window_named(window_name);
      if (!window) throw new Error(`No window container: ${window_name}`);
      let container = window.root();
      let previous = this.first_responder();
      let awakening = new Swill__Awakening();
      this.each_child(container, (child) => awakening.detach(child));
      container.replaceChildren();
      container.appendChild(this.clone_window_content(content_name));
      container.setAttribute("name", content_name);
      let controllers = awakening.awaken(container);
      window.assign_content(
        content_name,
        this.top_controller_in(container)
      );
      this._fragments.write(window.name(), content_name, history);
      this.restore_window_state(
        window,
        history !== "none",
        history !== "none"
      );
      awakening.finish(controllers);
      let controller = window.controller();
      if (controller) {
        this.make_first_responder(controller);
      } else if (this.attached_predicate(previous)) {
        this.make_first_responder(previous);
      }
      ;
      return controller;
    }
    // Present a template as a window appended to the root. A <dialog> root is
    // shown. Dismiss it with dismiss(controller); the window's closed promise
    // resolves then.
    show_window(name) {
      return this.show_window_in(name, this._root);
    }
    show_window_in(name, into) {
      let node = this.clone_window_content(name);
      into.appendChild(node);
      let awakening = new Swill__Awakening();
      let controllers = awakening.awaken(node);
      let view = node.__swill_view__;
      let controller = view ? view.controller_value() : null;
      if (!controller) {
        awakening.detach(node);
        node.remove();
        throw new Error(`Window root has no controller: ${name}`);
      }
      ;
      if (node.show) node.show();
      let window = new Swill__Window(name, node);
      window.assign_content(name, controller);
      window.save_first_responder(this.first_responder());
      this._windows.push(window);
      this.restore_window_state(window, false, false);
      awakening.finish(controllers);
      this.make_first_responder(controller);
      return window;
    }
    dismiss(controller) {
      let window = this.window_containing(controller);
      if (!window) return false;
      this._windows = this._windows.filter((candidate) => candidate !== window);
      let saved = window.saved_first_responder();
      window.dismiss();
      if (saved && this.attached_predicate(saved)) this.make_first_responder(saved);
      return true;
    }
    window_named(name) {
      return this._windows.find((window) => this.matches_container_predicate(window, name));
    }
    window_content_predicate(name) {
      return (this._captured[name] ?? this.window_template(name)) != null;
    }
    // ---- first responder ----
    // The application itself when nothing more specific holds it.
    first_responder() {
      return this._first_responder ?? this;
    }
    // Cocoa's makeFirstResponder: a responder that does not accept is refused
    // up front; the current first responder may refuse to resign; a responder
    // that refuses to become leaves the application as first responder.
    make_first_responder(responder) {
      if (responder && !responder.accepts_first_responder_predicate()) return false;
      let current = this.first_responder();
      if (responder === current) return true;
      if (!current.resign_first_responder(responder)) return false;
      this._first_responder = null;
      if (responder && responder.become_first_responder()) {
        this._first_responder = responder;
      }
      ;
      return true;
    }
    // The browser already moved focus; reconcile the first responder without
    // re-running become. A resign refusal restores focus to the refuser.
    sync_first_responder(target, previous) {
      let responder = this.responder_for(target);
      let current = this.first_responder();
      if (responder === current) return;
      if (!current.resign_first_responder(responder)) {
        this.restore_focus(current, previous);
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
    focus_left(destination) {
      if (destination && !this._root.contains(destination)) {
        this._first_responder = null;
        return this._first_responder;
      }
    }
    // A first responder inside a region being torn down falls back here.
    release_first_responder(element) {
      let owner = this.responder_element(this.first_responder());
      if (owner && (owner === element || element.contains(owner))) {
        this._first_responder = null;
        return this._first_responder;
      }
    }
    // The responder for a DOM location: the first managed view above it,
    // which yields its controller for a controller root and itself otherwise.
    responder_for(element) {
      if (!element) return null;
      let view = element.__swill_view__;
      if (view) return view.controller_value() ?? view;
      return this.responder_for(element.parentElement);
    }
    responder_element(responder) {
      if (responder instanceof Swill__Controller) {
        return responder.view().element();
      }
      ;
      if (responder instanceof Swill__View) return responder.element();
      return null;
    }
    restore_focus(responder, previous) {
      let owner = this.responder_element(responder);
      if (!owner) return;
      let target = previous && owner.contains(previous) ? previous : owner.__swill_view__.first_focusable_element();
      if (target) return target.focus();
    }
    // ---- window templates, containers, and content ----
    // <template for="window" name="x"> anywhere, or <template name="x"> directly
    // under the root. Templates are inert; content is cloned from them.
    scan_templates() {
      return this._root.querySelectorAll("template[name]").forEach((template) => {
        let name = template.getAttribute("name");
        if (template.getAttribute("for") === "window" || template.parentElement === this._root) {
          this._templates[name] = template;
        }
      });
    }
    // Rescans once on a miss so templates inserted after launch are found.
    window_template(name) {
      let found = this._templates[name];
      if (found) return found;
      this.scan_templates();
      return this._templates[name];
    }
    clone_window_content(name) {
      let captured = this._captured[name];
      if (captured) return captured.cloneNode(true);
      let template = this.window_template(name);
      if (!template) throw new Error(`No window content template: ${name}`);
      let content = template.content;
      let node = content ? content.firstElementChild : template.firstElementChild;
      if (!node) throw new Error(`Empty window template: ${name}`);
      return node.cloneNode(true);
    }
    window_containers() {
      let found = [];
      if (this._root.hasAttribute("window")) found.push(this._root);
      this._root.querySelectorAll("[window]").forEach((container) => found.push(container));
      return found;
    }
    // Before awakening: capture pre-rendered content under the container's
    // name so it can be reloaded later, and fill empty containers from the
    // template their name attribute (or window name) selects.
    prepare_window_containers() {
      let params = this._fragments.params();
      return this.window_containers().forEach((container) => {
        let window_name = container.getAttribute("window");
        let default_name = container.getAttribute("name") ?? window_name;
        let first = container.firstElementChild;
        if (first && !this._captured[default_name]) {
          this._captured[default_name] = first.cloneNode(true);
        }
        ;
        let content_name = this.requested_content(
          window_name,
          default_name,
          params[window_name]
        );
        if (first && content_name === default_name) return;
        container.replaceChildren();
        container.appendChild(this.clone_window_content(content_name));
        container.setAttribute("name", content_name);
      });
    }
    // The fragment may name the content to show; unknown names are reported
    // and the default stands.
    requested_content(window_name, default_name, requested) {
      if (requested == null || requested === default_name) return default_name;
      if (this.window_content_predicate(requested)) return requested;
      Runtime.warn(`window "${window_name}" requested unknown content "${requested}"`);
      return default_name;
    }
    register_window_containers() {
      return this.window_containers().forEach((container) => {
        let window = new Swill__Window(container.getAttribute("window"), container);
        window.assign_content(
          container.getAttribute("name"),
          this.top_controller_in(container)
        );
        this._windows.push(window);
      });
    }
    // The first controller inside the container whose parent is outside it.
    top_controller_in(container) {
      return new Swill__Awakening().controllers_within(container).find((controller) => this.top_within_predicate(controller, container));
    }
    top_within_predicate(controller, container) {
      let parent = controller.parent();
      return parent == null || !container.contains(parent.view().element());
    }
    matches_container_predicate(window, name) {
      return window.container_predicate() && window.name() === name;
    }
    window_containing(controller) {
      return this._windows.find((window) => this.holds_predicate(window, controller));
    }
    holds_predicate(window, controller) {
      return window.contains_controller_predicate(controller);
    }
    attached_predicate(responder) {
      if (!responder) return false;
      let element = this.responder_element(responder);
      return element != null && this._root.contains(element);
    }
    // At terminate: a container's content is torn down in place; a dialog is
    // dismissed.
    release_window(window) {
      if (window.container_predicate()) {
        window.dispose_restoration();
        return new Swill__Awakening().detach(window.root());
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
    restore_window_state(window, prune_stale, write_content) {
      let stale = window.dispose_restoration();
      let controller = window.controller();
      let declarations2 = controller ? Runtime.restorations(controller) : [];
      let keys = declarations2.map((declaration) => window.scoped_key(declaration.key));
      let content = window.content_name();
      if (write_content && content) {
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
        let text = params[window.scoped_key(declaration.key)];
        if (text == null) return;
        let value = Runtime.decodeFragment(declaration.type, text);
        if (value == null) return;
        Runtime.writePath(controller, declaration.path, value);
        applied++;
      }));
      if (declarations2.length > 0) controller.controller_did_restore(applied > 0);
      return declarations2.forEach((declaration) => {
        let disposer = Runtime.observePath(
          controller,
          declaration.path,
          (_value) => this.write_window_state(window)
        );
        window.add_restoration(disposer, window.scoped_key(declaration.key));
      });
    }
    restore_launched_windows() {
      return this._windows.forEach((window) => this.restore_window_state(window, false, true));
    }
    // Push the controller's current restorable state into the fragment.
    write_window_state(window) {
      let controller = window.controller();
      if (!controller) return;
      return Runtime.restorations(controller).forEach((declaration) => {
        let value = Runtime.encodeFragment(Runtime.readPath(
          controller,
          declaration.path
        ));
        this._fragments.write(
          window.scoped_key(declaration.key),
          value,
          "replace"
        );
      });
    }
    // Back/Forward: a container whose fragment names other known content loads
    // it without touching history; otherwise its state is reapplied.
    apply_fragment() {
      let params = this._fragments.params();
      return this._windows.forEach((window) => this.apply_fragment_to(window, params));
    }
    apply_fragment_to(window, params) {
      if (!window.container_predicate()) return;
      let requested = params[window.name()];
      if (requested != null && requested !== window.content_name()) {
        return this.window_content_predicate(requested) ? this.load_window_content_with(
          window.name(),
          requested,
          "none"
        ) : Runtime.warn(`window "${window.name()}" requested unknown content "${requested}"`);
      } else {
        return this.restore_window_state(window, false, false);
      }
    }
    // Code-created content awakens through the same path as markup: the
    // observer wires added subtrees and detaches removed ones. Explicit wiring
    // before the observer runs is harmless, since both are idempotent.
    watch(root) {
      if (typeof MutationObserver === "undefined") return;
      let awakening = new Swill__Awakening();
      this._observer = new MutationObserver((records, _observer) => records.forEach((record2) => {
        record2.removedNodes.forEach((node) => {
          if (node.nodeType === 1) awakening.detach(node);
        });
        record2.addedNodes.forEach((node) => {
          if (node.nodeType === 1) awakening.wire(node);
        });
      }));
      return this._observer.observe(root, { childList: true, subtree: true });
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
    // unregistered class fails closed through Runtime.resolve.
    launch(document2) {
      let element = document2.querySelector("[application]");
      if (!element) return null;
      if (element.__swill_application__) return element.__swill_application__;
      let application_class = Runtime.resolve(element.getAttribute("application"));
      let application = new application_class();
      application.launch(element);
      document2.defaultView.addEventListener("pagehide", (event) => {
        if (!event.persisted) return application.terminate();
      });
      return application;
    }
  };
  function Swill__Model__Attributes(Superclass) {
    class Swill__Model__Attributes_Layer extends Superclass {
      collect_attributes() {
        return Runtime.collect_attributes(this);
      }
      apply_attributes(source) {
        return Runtime.apply_attributes(this, source);
      }
      // Declared attributes coerce through the validate_<name>(value, previous)
      // convention, resolved from metadata. A validator may raise to reject.
      coerce_property_value(name, value, previous) {
        value = super.coerce_property_value(name, value, previous);
        return Runtime.validate_attribute(this, name, value, previous);
      }
      property_will_change(name, previous, value) {
        return super.property_will_change(name, previous, value);
      }
    }
    return Swill__Model__Attributes_Layer;
  }
  function Swill__Model__Attributes_ClassMethods(Superclass) {
    class Swill__Model__Attributes_ClassMethods_Layer extends Object {
      model_attributes() {
        return Runtime.inheritableRegistry(this, "model_attributes", "hash");
      }
    }
    Object.setPrototypeOf(Swill__Model__Attributes_ClassMethods_Layer.prototype, Superclass);
    return Swill__Model__Attributes_ClassMethods_Layer.prototype;
  }
  function Swill__Model__DirtyTracking(Superclass) {
    class Swill__Model__DirtyTracking_Layer extends Superclass {
      dirty() {
        return this.dirty_attributes.slice();
      }
      mark_clean_bang() {
        this._dirty_baseline = {};
        this.dirty_attributes = [];
        return this;
      }
      // Server, codec, and draft application is clean; only user mutation
      // through setters marks attributes dirty.
      apply_attributes(source) {
        this._dirty_suspensions = Runtime.logicalOr(
          this._dirty_suspensions,
          () => 0
        ) + 1;
        try {
          super.apply_attributes(source);
        } finally {
          this._dirty_suspensions = this._dirty_suspensions - 1;
        }
        ;
        return this;
      }
      property_will_change(name, previous, value) {
        super.property_will_change(name, previous, value);
        if (Runtime.isTruthy(Runtime.logicalOr(
          this._dirty_suspensions,
          () => 0
        ) > 0)) return;
        if (!Runtime.isTruthy(Runtime.isAttribute(this, name))) return;
        return this.mark_attribute_dirty(name, previous, value);
      }
      mark_attribute_dirty(name, previous, value) {
        let baseline = this._dirty_baseline ||= {};
        let names = this.dirty_attributes;
        if (Runtime.isTruthy(names.includes(name))) {
          if (Runtime.isEqual(baseline[name], value)) {
            return this.dirty_attributes = names.filter((candidate) => !Runtime.isEqual(candidate, name));
          }
        } else {
          baseline[name] = previous;
          return this.dirty_attributes = [...names, name];
        }
      }
    }
    return Swill__Model__DirtyTracking_Layer;
  }
  function Swill__Model__Drafts(Superclass) {
    class Swill__Model__Drafts_Layer extends Superclass {
      draft() {
        let copy = new this.constructor();
        copy.apply_attributes(this.collect_attributes());
        return copy;
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
            "arity": 3
          },
          "property_will_change": {
            "arity": 3
          }
        }
      },
      "Swill::Ownership": {
        factory: Swill__Ownership,
        methods: {
          "each_child": {
            "arity": 2
          },
          "each_owned": {
            "arity": 2
          },
          "owned_matching": {
            "arity": 2
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
            "arity": 0
          },
          "object_bindings": {
            "arity": 0
          }
        }
      },
      "Swill::Model::Attributes": {
        factory: Swill__Model__Attributes,
        classFactory: Swill__Model__Attributes_ClassMethods,
        methods: {
          "collect_attributes": {
            "arity": 0
          },
          "apply_attributes": {
            "arity": 1
          },
          "coerce_property_value": {
            "arity": 3
          },
          "property_will_change": {
            "arity": 3
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
            "js": "mark_clean_bang"
          },
          "apply_attributes": {
            "arity": 1
          },
          "property_will_change": {
            "arity": 3
          },
          "mark_attribute_dirty": {
            "arity": 3
          }
        }
      },
      "Swill::Model::Drafts": {
        factory: Swill__Model__Drafts,
        methods: {
          "draft": {
            "arity": 0
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
            "arity": 0
          },
          "perform_action": {
            "arity": 3
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "accepts_first_responder_predicate"
          },
          "become_first_responder": {
            "arity": 0
          },
          "resign_first_responder": {
            "arity": 1
          },
          "key_down": {
            "arity": 1
          },
          "key_up": {
            "arity": 1
          },
          "cancel_operation": {
            "arity": 1
          },
          "insert_newline": {
            "arity": 1
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
            "arity": 0
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
            "arity": 1
          },
          "release_subview": {
            "arity": 1
          },
          "remove_from_superview": {
            "arity": 0
          },
          "assign_superview": {
            "arity": 1
          },
          "next_responder": {
            "arity": 0
          },
          "focusable_selector": {
            "arity": 0
          },
          "first_focusable_element": {
            "arity": 0
          },
          "focus_element": {
            "arity": 0
          },
          "blur_element": {
            "arity": 0
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "accepts_first_responder_predicate"
          },
          "become_first_responder": {
            "arity": 0
          }
        }
      },
      "Swill::Controller": {
        constructor: Swill__Controller,
        mixins: [Swill__ObjectBindings],
        properties: {
          "represented_object": {
            type: "T.untyped",
            attribute: false,
            defaultValue: function default_represented_object() {
              return null;
            }
          }
        },
        methods: {
          "binding_root": {
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
            "arity": 0
          },
          "application": {
            "arity": 0
          },
          "next_responder": {
            "arity": 0
          },
          "register_teardown": {
            "arity": 1
          },
          "accepts_first_responder?": {
            "arity": 0,
            "js": "accepts_first_responder_predicate"
          },
          "become_first_responder": {
            "arity": 0
          },
          "resign_first_responder": {
            "arity": 1
          },
          "teardown": {
            "arity": 0
          },
          "decode_outlet_data": {
            "arity": 2
          },
          "view_did_load": {
            "arity": 0
          },
          "awake_from_dom": {
            "arity": 0
          },
          "controller_did_restore": {
            "arity": 1
          },
          "controller_did_load": {
            "arity": 0
          },
          "view_will_appear": {
            "arity": 0
          },
          "view_did_appear": {
            "arity": 0
          },
          "view_will_disappear": {
            "arity": 0
          },
          "view_did_disappear": {
            "arity": 0
          },
          "nearest_application": {
            "arity": 1
          },
          "collect_child_controllers": {
            "arity": 2
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
          "wire_region": {
            "arity": 3
          },
          "wire_properties": {
            "arity": 3
          },
          "resolve_path": {
            "arity": 2
          },
          "wire_element": {
            "arity": 3
          },
          "wire_represented_object": {
            "arity": 3
          },
          "wire_property": {
            "arity": 5
          },
          "write_property": {
            "arity": 3
          },
          "boolean_property?": {
            "arity": 1,
            "js": "boolean_property_predicate"
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
          "wire_element": {
            "arity": 2
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
            "js": "managed_predicate"
          },
          "create_view": {
            "arity": 1
          },
          "controllers_within": {
            "arity": 1
          },
          "collect_controllers": {
            "arity": 2
          },
          "detach": {
            "arity": 1
          },
          "nearest_view": {
            "arity": 1
          },
          "each_reversed": {
            "arity": 2
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
            "js": "available_predicate"
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
            "arity": 1
          },
          "add_restoration": {
            "arity": 2
          },
          "dispose_restoration": {
            "arity": 0
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
            "arity": 0
          },
          "closed": {
            "arity": 0
          },
          "saved_first_responder": {
            "arity": 0
          },
          "save_first_responder": {
            "arity": 1
          },
          "assign_content": {
            "arity": 2
          },
          "container?": {
            "arity": 0,
            "js": "container_predicate"
          },
          "contains_controller?": {
            "arity": 1,
            "js": "contains_controller_predicate"
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
            "arity": 0
          },
          "application_will_terminate": {
            "arity": 0
          },
          "load_window_content": {
            "arity": 2
          },
          "load_window_content_with": {
            "arity": 3
          },
          "show_window": {
            "arity": 1
          },
          "show_window_in": {
            "arity": 2
          },
          "dismiss": {
            "arity": 1
          },
          "window_named": {
            "arity": 1
          },
          "window_content?": {
            "arity": 1,
            "js": "window_content_predicate"
          },
          "first_responder": {
            "arity": 0
          },
          "make_first_responder": {
            "arity": 1
          },
          "sync_first_responder": {
            "arity": 2
          },
          "focus_left": {
            "arity": 1
          },
          "release_first_responder": {
            "arity": 1
          },
          "responder_for": {
            "arity": 1
          },
          "responder_element": {
            "arity": 1
          },
          "restore_focus": {
            "arity": 2
          },
          "scan_templates": {
            "arity": 0
          },
          "window_template": {
            "arity": 1
          },
          "clone_window_content": {
            "arity": 1
          },
          "window_containers": {
            "arity": 0
          },
          "prepare_window_containers": {
            "arity": 0
          },
          "requested_content": {
            "arity": 3
          },
          "register_window_containers": {
            "arity": 0
          },
          "top_controller_in": {
            "arity": 1
          },
          "top_within?": {
            "arity": 2,
            "js": "top_within_predicate"
          },
          "matches_container?": {
            "arity": 2,
            "js": "matches_container_predicate"
          },
          "window_containing": {
            "arity": 1
          },
          "holds?": {
            "arity": 2,
            "js": "holds_predicate"
          },
          "attached?": {
            "arity": 1,
            "js": "attached_predicate"
          },
          "release_window": {
            "arity": 1
          },
          "restore_window_state": {
            "arity": 3
          },
          "restore_launched_windows": {
            "arity": 0
          },
          "write_window_state": {
            "arity": 1
          },
          "apply_fragment": {
            "arity": 0
          },
          "apply_fragment_to": {
            "arity": 2
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
      "Swill::Model::Base": {
        constructor: Swill__Model__Base,
        mixins: [Swill__Model__Attributes, Swill__Model__DirtyTracking, Swill__Model__Drafts],
        properties: {
          "dirty_attributes": {
            type: "T::Array[T.untyped]",
            attribute: false,
            defaultValue: function default_dirty_attributes() {
              return [];
            }
          },
          "dirty?": {
            js: "dirty_predicate",
            type: "T::Boolean",
            attribute: false,
            compute: function compute_dirty_predicate() {
              return !Runtime.isEmpty(this.dirty_attributes);
            }
          },
          "id": {
            type: "T.nilable(String)",
            attribute: true,
            key: "id",
            defaultValue: function default_id() {
              return null;
            }
          }
        },
        registries: { model_attributes: {
          "id": { property: "id", key: "id" }
        } },
        methods: {}
      }
    }
  };

  // build/framework.mjs
  Runtime.install(meta);

  // lib/swill/browser_api.mjs
  var registered = /* @__PURE__ */ new WeakSet();
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
  function bridge(prototype, internalName, publicName) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, internalName);
    if (!descriptor || typeof descriptor.value !== "function") {
      throw new Error(`Missing framework method: ${internalName}`);
    }
    const original = descriptor.value;
    Object.defineProperty(prototype, publicName, {
      configurable: true,
      writable: true,
      value: original
    });
    Object.defineProperty(prototype, internalName, {
      ...descriptor,
      value(...args) {
        return this[publicName](...args);
      }
    });
  }
  function browserAPI(definitions, Runtime2) {
    const Controller = definitions.Swill__Controller;
    const Application = definitions.Swill__Application;
    const View = definitions.Swill__View;
    const roots = /* @__PURE__ */ new Set([Controller, Application, View]);
    [
      ["binding_root", "bindingRoot"],
      ["decode_outlet_data", "decodeOutletData"],
      ["view_did_load", "viewDidLoad"],
      ["awake_from_dom", "awakeFromDOM"],
      ["controller_did_restore", "controllerDidRestore"],
      ["controller_did_load", "controllerDidLoad"],
      ["view_will_appear", "viewWillAppear"],
      ["view_did_appear", "viewDidAppear"],
      ["view_will_disappear", "viewWillDisappear"],
      ["view_did_disappear", "viewDidDisappear"]
    ].forEach(([internalName, publicName]) => bridge(Controller.prototype, internalName, publicName));
    bridge(Application.prototype, "application_did_launch", "applicationDidLaunch");
    bridge(Application.prototype, "application_will_terminate", "applicationWillTerminate");
    function register(name, klass) {
      if (arguments.length === 1) {
        klass = name;
        name = klass?.name;
      }
      if (typeof klass !== "function" || !klass.prototype) throw new TypeError("Swill.register requires a class");
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new TypeError("Registered classes need a name");
      }
      if (registered.has(klass)) throw new Error(`Class already registered: ${name}`);
      const parent = Object.getPrototypeOf(klass);
      if (!roots.has(parent) && !registered.has(parent)) {
        throw new Error(`Register the parent class before ${name}`);
      }
      const { properties, methods } = declarationsFor(klass);
      Runtime2.install({ classes: { [name]: { constructor: klass, properties, methods } } });
      registered.add(klass);
      return klass;
    }
    function start(options = {}) {
      if (!isObject(options) || Array.isArray(options)) throw new TypeError("Swill.start options must be an object");
      assertKeys(options, ["root", "application"], "start");
      const root = options.root ?? globalThis.document?.body;
      const ApplicationClass = options.application ?? Application;
      if (!root) throw new Error("Swill.start requires a root element");
      if (root.__swill_application__) throw new Error("A Swill application is already running on this root");
      if (typeof ApplicationClass !== "function" || ApplicationClass !== Application && !(ApplicationClass.prototype instanceof Application)) {
        throw new TypeError("application must extend Swill.Application");
      }
      if (ApplicationClass !== Application && !registered.has(ApplicationClass)) {
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
