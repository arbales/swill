// JavaScript authoring over the Ruby2JS-generated framework. This module only
// describes JavaScript classes to the existing runtime; framework behavior
// remains in the compiled Ruby classes.

const registered = new WeakSet();

const isObject = value => value !== null && typeof value === "object";

function assertDescriptorMap(value, declaration) {
  if (!isObject(value) || Array.isArray(value)) {
    throw new TypeError(`static ${declaration} must be an object`);
  }
}

function assertKeys(descriptor, allowed, declaration) {
  const unknown = Object.keys(descriptor).filter(key => !allowed.includes(key));
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
  const properties = Object.create(null);
  const methods = Object.create(null);
  const names = new Set();
  const declared = ownDeclaration(klass, "properties", {});
  assertDescriptorMap(declared, "properties");
  for (const [name, descriptor] of Object.entries(declared)) {
    if (name.length === 0) throw new TypeError("Property names must not be empty");
    properties[name] = {defaultValue: defaultValue(name, descriptor)};
    names.add(name);
  }

  const outlets = ownDeclaration(klass, "outlets", {});
  assertDescriptorMap(outlets, "outlets");
  for (const [name, descriptor] of Object.entries(outlets)) {
    if (name.length === 0) throw new TypeError("Outlet names must not be empty");
    if (names.has(name)) throw new TypeError(`Duplicate declaration: ${name}`);
    if (!isObject(descriptor) || Array.isArray(descriptor)) {
      throw new TypeError(`Outlet ${name} must use a descriptor`);
    }
    assertKeys(descriptor, ["optional"], `outlet ${name}`);
    if (Object.hasOwn(descriptor, "optional") && typeof descriptor.optional !== "boolean") {
      throw new TypeError(`Outlet ${name} optional must be boolean`);
    }
    properties[name] = {defaultValue: () => null, outlet: true, optional: descriptor.optional === true};
    names.add(name);
  }

  const prototypeDescriptors = Object.getOwnPropertyDescriptors(klass.prototype);
  for (const [name, descriptor] of Object.entries(prototypeDescriptors)) {
    if (name === "constructor" || descriptor.get === undefined) continue;
    if (descriptor.set !== undefined) throw new TypeError(`Computed property ${name} cannot have a setter`);
    if (names.has(name)) throw new TypeError(`Duplicate declaration: ${name}`);
    properties[name] = {compute: descriptor.get};
    names.add(name);
  }

  const actions = ownDeclaration(klass, "actions", []);
  if (!Array.isArray(actions)) throw new TypeError("static actions must be an array");
  const actionNames = new Set();
  for (const name of actions) {
    if (typeof name !== "string" || name.length === 0) throw new TypeError("Action names must be non-empty strings");
    if (actionNames.has(name)) throw new TypeError(`Duplicate action: ${name}`);
    if (names.has(name)) throw new TypeError(`Action conflicts with property: ${name}`);
    const descriptor = prototypeDescriptors[name];
    if (!descriptor || typeof descriptor.value !== "function") {
      throw new TypeError(`Missing action method: ${name}`);
    }
    if (descriptor.value.length > 2) throw new TypeError(`Action ${name} accepts more than two arguments`);
    methods[name] = {arity: descriptor.value.length};
    actionNames.add(name);
  }
  return {properties, methods};
}

function bridge(prototype, internalName, publicName) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, internalName);
  if (!descriptor || typeof descriptor.value !== "function") {
    throw new Error(`Missing framework method: ${internalName}`);
  }
  const original = descriptor.value;
  Object.defineProperty(prototype, publicName, {
    configurable: true, writable: true, value: original
  });
  Object.defineProperty(prototype, internalName, {
    ...descriptor,
    value(...args) { return this[publicName](...args); }
  });
}

export function browserAPI(definitions, Runtime) {
  const Controller = definitions.Swill__Controller;
  const Application = definitions.Swill__Application;
  const View = definitions.Swill__View;
  const roots = new Set([Controller, Application, View]);

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
    const {properties, methods} = declarationsFor(klass);
    Runtime.install({classes: {[name]: {constructor: klass, properties, methods}}});
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
    if (typeof ApplicationClass !== "function" ||
        (ApplicationClass !== Application && !(ApplicationClass.prototype instanceof Application))) {
      throw new TypeError("application must extend Swill.Application");
    }
    if (ApplicationClass !== Application && !registered.has(ApplicationClass)) {
      throw new Error("Register the application class before starting it");
    }
    const application = new ApplicationClass();
    application.launch(root);
    root.ownerDocument?.defaultView?.addEventListener("pagehide", event => {
      if (!event.persisted) application.terminate();
    });
    return application;
  }

  return Object.freeze({
    ...definitions,
    Runtime,
    install: meta => Runtime.install(meta),
    Controller,
    Application,
    View,
    register,
    start
  });
}
