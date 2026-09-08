"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // lib/swill/runtime.mjs
  var classes = /* @__PURE__ */ new Map();
  var metadata = /* @__PURE__ */ new WeakMap();
  var mixinMetadata = /* @__PURE__ */ new WeakMap();
  var mixinClassFactories = /* @__PURE__ */ new WeakMap();
  var classConfiguration = /* @__PURE__ */ new WeakMap();
  var states = /* @__PURE__ */ new WeakMap();
  var captures = [];
  function strip(value) {
    return value.replace(/^[\x00\t\n\v\f\r ]+|[\x00\t\n\v\f\r ]+$/g, "");
  }
  function state(object) {
    if (!states.has(object)) {
      states.set(object, { values: /* @__PURE__ */ new Map(), computed: /* @__PURE__ */ new Map(), observers: /* @__PURE__ */ new Map(), dependents: /* @__PURE__ */ new Map() });
    }
    return states.get(object);
  }
  function declarations(klass, kind) {
    for (let current = klass; current; current = Object.getPrototypeOf(current)) {
      const known = metadata.get(current);
      if (known) return known[kind];
    }
    return /* @__PURE__ */ new Map();
  }
  function installMetadata(klass, properties, methods) {
    const parent = Object.getPrototypeOf(klass);
    metadata.set(klass, {
      properties: new Map([...declarations(parent, "properties"), ...properties.map((item) => [item.name, item])]),
      methods: new Map([...declarations(parent, "methods"), ...methods.map((item) => [item.name, item])])
    });
  }
  function configuration(klass) {
    if (!classConfiguration.has(klass)) {
      classConfiguration.set(klass, { registries: /* @__PURE__ */ new Map(), settings: /* @__PURE__ */ new Map() });
    }
    return classConfiguration.get(klass);
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
      if (!Runtime.isEqual(previous, value)) notify(object, descriptor.name, previous, value);
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
    if (Runtime.isEqual(previous, value)) return value;
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
    return { owner, descriptor };
  }
  var Runtime = {
    // One load-time operation over generated data. Definitions are inert until
    // here; install parents before children regardless of object key order.
    install(meta2) {
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
          if (descriptor.mixins?.length) this.include(klass, descriptor.mixins, incoming);
          const properties = Object.entries(descriptor.properties ?? {}).map(([name2, property]) => ({ name: name2, js: name2, ...property, computed: typeof property.compute === "function" }));
          this.installClass(klass, name, properties, methods(descriptor.methods), descriptor.registries);
          pending.delete(klass);
          progress = true;
        }
        if (!progress) throw new Error("Unresolvable superclass order in meta");
      }
    },
    include(klass, mixins, incoming = /* @__PURE__ */ new Map()) {
      if (metadata.has(klass)) throw new Error("Mixins must be attached before class installation");
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
    },
    inheritableRegistry(klass, name, initial = "hash") {
      const own = configuration(klass).registries;
      if (own.has(name)) return own.get(name);
      const parent = Object.getPrototypeOf(klass);
      const inherited = typeof parent?.[name] === "function" ? parent[name]() : void 0;
      const value = inherited === void 0 ? initial === "array" ? [] : {} : Array.isArray(inherited) ? [...inherited] : { ...inherited };
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
    },
    // Fail closed: markup cannot traverse globals or instantiate arbitrary values.
    resolve(name) {
      if (!classes.has(name)) throw new Error(`Unknown class: ${name}`);
      return classes.get(name);
    },
    isTruthy(value) {
      return value !== false && value !== null && value !== void 0;
    },
    logicalAnd(left, right) {
      return this.isTruthy(left) ? right() : left;
    },
    logicalOr(left, right) {
      return this.isTruthy(left) ? left : right();
    },
    // Spike contract: scalar values and acyclic arrays have Ruby value equality;
    // framework objects retain identity. General Hash/custom == is not implemented.
    isEqual(left, right) {
      if (left === right) return true;
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => this.isEqual(value, right[index]));
    },
    isBlank(value) {
      if (value == null || value === false) return true;
      if (typeof value === "string") return strip(value).length === 0;
      if (Array.isArray(value)) return value.length === 0;
      return false;
    },
    strip(value) {
      if (typeof value !== "string") throw new TypeError("strip requires a string");
      return strip(value);
    },
    upcase(value) {
      if (typeof value !== "string") throw new TypeError("upcase requires a string");
      return value.toUpperCase();
    },
    downcase(value) {
      if (typeof value !== "string") throw new TypeError("downcase requires a string");
      return value.toLowerCase();
    },
    valueRead(value, name) {
      switch (name) {
        case "blank?":
          return this.isBlank(value);
        case "strip":
          return this.strip(value);
        case "upcase":
          return this.upcase(value);
        case "downcase":
          return this.downcase(value);
        default:
          throw new Error(`Unknown value reader: ${name}`);
      }
    },
    read(object, name) {
      if (object == null) return null;
      if (typeof object !== "object" && typeof object !== "function") return this.valueRead(object, name);
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
    // The dynamic writer counterpart of read: a declared property or a generated
    // `name=` accessor, chosen by metadata rather than by the receiver's shape.
    write(object, name, value) {
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
    },
    assertWritablePath(object, path) {
      if (!pathWriter(object, path)) throw new Error(`Unavailable binding owner: ${path}`);
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
    hasAction(object, name) {
      const method = declarations(object.constructor, "methods").get(name);
      return !!method && method.arity <= 2;
    },
    performAction(object, name, sender, event) {
      const method = declarations(object.constructor, "methods").get(name);
      if (!method || method.arity > 2) throw new Error(`Unknown action or wrong arity: ${name}`);
      return object[method.js](...[sender, event].slice(0, method.arity));
    },
    observePath(object, path, callback) {
      let disposers = [];
      let active = true;
      const rehook = () => {
        disposers.splice(0).forEach((dispose) => dispose());
        let owner = object;
        for (const name of path.split(".")) {
          if (owner == null) break;
          if (declarations(owner.constructor, "properties").has(name)) {
            disposers.push(subscribe(owner, name, () => {
              if (!active) return;
              rehook();
              callback(this.readPath(object, path));
            }, "observers"));
          }
          owner = this.read(owner, name);
        }
      };
      rehook();
      return () => {
        active = false;
        disposers.splice(0).forEach((dispose) => dispose());
      };
    },
    observe(object, name, callback) {
      return subscribe(object, name, callback, "observers");
    },
    dispose(object) {
      const current = states.get(object);
      if (!current) return;
      for (const slot of current.computed.values()) {
        slot.disposers.splice(0).forEach((dispose) => dispose());
      }
      current.computed.clear();
      current.observers.clear();
      current.dependents.clear();
    },
    outlets(object) {
      return [...declarations(object.constructor, "properties").values()].filter((descriptor) => descriptor.outlet);
    },
    collect_attributes(object) {
      const result = {};
      for (const descriptor of declarations(object.constructor, "properties").values()) {
        if (descriptor.attribute && !descriptor.computed) {
          result[descriptor.key] = object[descriptor.js];
        }
      }
      return result;
    },
    apply_attributes(object, source) {
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
  };

  // build/framework.classes.mjs
  var framework_classes_exports = {};
  __export(framework_classes_exports, {
    Swill__Actions: () => Swill__Actions,
    Swill__Application: () => Swill__Application,
    Swill__Awakening: () => Swill__Awakening,
    Swill__Bindings: () => Swill__Bindings,
    Swill__Controller: () => Swill__Controller,
    Swill__Launcher: () => Swill__Launcher,
    Swill__Model__Attributes: () => Swill__Model__Attributes,
    Swill__Model__Attributes_ClassMethods: () => Swill__Model__Attributes_ClassMethods,
    Swill__Model__Base: () => Swill__Model__Base,
    Swill__Model__Drafts: () => Swill__Model__Drafts,
    Swill__Object: () => Swill__Object,
    Swill__Observable: () => Swill__Observable,
    Swill__Outlets: () => Swill__Outlets,
    Swill__Ownership: () => Swill__Ownership,
    Swill__Responder: () => Swill__Responder,
    Swill__View: () => Swill__View
  });
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
  var Swill__Responder = class extends Swill__Object {
    next_responder() {
      return null;
    }
    // Target/action: handle the action here when a generated method with a
    // compatible arity exists, otherwise continue up the responder chain. An
    // action nobody handles is an error, not a silent no-op.
    perform_action(name, sender, event) {
      if (Runtime.hasAction(this, name)) {
        return Runtime.performAction(this, name, sender, event);
      }
      ;
      let target = this.next_responder();
      if (!target) throw new Error(`Unhandled action: ${name}`);
      return target.perform_action(name, sender, event);
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
  };
  var Swill__Controller = class extends Swill__Responder {
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
    register_teardown(dispose) {
      return this._teardowns.push(dispose);
    }
    // Releases this controller's listeners and observers, then its descendants,
    // exactly once. The element keeps its View, so the region can be awakened
    // again later.
    teardown() {
      if (this._view.controller_value() !== this) return;
      this.view_will_disappear();
      this._teardowns.forEach((dispose) => dispose());
      this._teardowns = [];
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
      this.owned_matching(controller.view().element(), "[bind]").forEach((element) => controller.register_teardown(this.wire_element(controller, element)));
      return controller;
    }
    wire_element(object, element) {
      let path = element.getAttribute("bind");
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
      let dispose = Runtime.observePath(object, path, render);
      let event_name = element.matches("select") || checkbox ? "change" : "input";
      let handler = (event) => {
        let value = checkbox ? element.checked : element.value;
        return Runtime.writePath(object, path, value);
      };
      if (writable) element.addEventListener(event_name, handler);
      return () => {
        dispose();
        if (writable) return element.removeEventListener(event_name, handler);
      };
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
      let controllers = [];
      this.walk(root, this.nearest_view(root.parentElement), controllers);
      this.each_reversed(controllers, (controller) => this.load(controller));
      this.each_reversed(
        controllers,
        (controller) => controller.controller_did_load()
      );
      this.each_reversed(
        controllers,
        (controller) => controller.view_will_appear()
      );
      this.each_reversed(
        controllers,
        (controller) => controller.view_did_appear()
      );
      return controllers;
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
  var Swill__Application = class extends Swill__Responder {
    launch(root) {
      this._root = root;
      root.__swill_application__ = this;
      this._controllers = new Swill__Awakening().wire(root);
      this.application_did_launch();
      return this;
    }
    // Every controller awakened at launch, in document order, as a JavaScript array.
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
      this._controllers.forEach((controller) => controller.teardown());
      this._controllers = [];
      return this._root.__swill_application__ = null;
    }
    application_did_launch() {
      return null;
    }
    application_will_terminate() {
      return null;
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
      coerce_property_value(name, value, previous) {
        return super.coerce_property_value(name, value, previous);
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
          }
        }
      },
      "Swill::Controller": {
        constructor: Swill__Controller,
        properties: {},
        methods: {
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
          "wire_element": {
            "arity": 2
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
          "nearest_view": {
            "arity": 1
          },
          "each_reversed": {
            "arity": 2
          }
        }
      },
      "Swill::Application": {
        constructor: Swill__Application,
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
        mixins: [Swill__Model__Attributes, Swill__Model__Drafts],
        properties: {
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
  if (globalThis["Swill"]) throw new Error("Framework already loaded");
  Runtime.install(meta);
  globalThis["Swill"] = Object.freeze({ ...framework_classes_exports, Runtime, install: (meta2) => Runtime.install(meta2) });
  if (typeof document !== "undefined") new (Runtime.resolve("Swill::Launcher"))().install(document);
})();
//# sourceMappingURL=swill.js.map
