/**
 * The `Swill` global: what a page using plain JavaScript reaches. It offers the
 * public framework classes by name, such as `Swill.Controller`, and the
 * functions below to register classes and start the application.
 *
 * It only describes JavaScript classes to the runtime; framework behavior
 * stays in the compiled Ruby classes, whose members already carry their
 * JavaScript spelling (`viewDidLoad`, `makeRowElement`, `isRowElement`), so
 * a subclass overrides them directly.
 *
 * @module
 */

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

// The framework this page runs, set once by browserAPI: one per page, as one
// application runs per page.
let framework = null;

/**
 * Registers a plain JavaScript class with the framework, so markup can name it
 * and the runtime can reach its declarations.
 *
 * The class declares what Ruby declares with macros, as static fields:
 * `static properties = {name: {default: value}}` for observable properties,
 * with a factory for an array or object default; `static outlets = {name: {}}`,
 * with `optional: true` for one that may be absent; and `static actions =
 * ["name"]` for the methods markup may send. Every getter is a computed
 * property, and its dependencies are collected while it runs.
 *
 * Register a parent before its subclasses. The parent must be a public
 * framework class such as `Swill.Controller`, or a class already registered.
 *
 * @param {string | Function} name The name markup uses, such as
 *   `"Admin::Editor"`; or the class itself, registered under its own name.
 * @param {Function} [klass] The class, when a name is given.
 * @returns {Function} The class.
 * @throws {TypeError} When the class or a declaration is malformed.
 * @throws {Error} When the class is already registered, or its parent is not.
 */
export function register(name, klass) {
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
  if (!framework.roots.has(parent) && !registered.has(parent)) {
    throw new Error(`Register the parent class before ${name}`);
  }
  const {properties, methods} = declarationsFor(klass);
  framework.Runtime.install({classes: {[name]: {constructor: klass, properties, methods}}});
  registered.add(klass);
  return klass;
}

/**
 * Launches the application: awakens the markup under the root, then keeps
 * running until the page goes away.
 *
 * One application runs per page, as one `NSApp` runs per process; while it
 * runs, `Swill.Application.shared()` answers it.
 *
 * @param {object} [options]
 * @param {Element} [options.root] Where to launch; `document.body` by default.
 * @param {boolean} [options.development] Show the application's problems as
 *   alerts as well as in the console; false by default.
 * @param {Function} [options.application] A registered subclass of
 *   `Swill.Application`; `Swill.Application` by default.
 * @returns {object} The running application.
 * @throws {Error} When an application is already running, or there is no root.
 */
export function start(options = {}) {
  const {Application} = framework;
  if (!isObject(options) || Array.isArray(options)) throw new TypeError("Swill.start options must be an object");
  assertKeys(options, ["root", "application", "development"], "start");
  const root = options.root ?? globalThis.document?.body;
  const ApplicationClass = options.application ?? Application;
  if (!root) throw new Error("Swill.start requires a root element");
  if (Application.isRunning()) throw new Error("A Swill application is already running");
  if (typeof ApplicationClass !== "function" ||
      (ApplicationClass !== Application && !(ApplicationClass.prototype instanceof Application))) {
    throw new TypeError("application must extend Swill.Application");
  }
  if (ApplicationClass !== Application && !registered.has(ApplicationClass)) {
    throw new Error("Register the application class before starting it");
  }
  const application = new ApplicationClass();
  if (options.development) application.development = true;
  application.launch(root);
  root.ownerDocument?.defaultView?.addEventListener("pagehide", event => {
    if (!event.persisted) application.terminate();
  });
  return application;
}

/**
 * Installs compiled metadata: the classes and mixins an application bundle
 * defines. A compiled bundle calls this itself; it is here for a bundle
 * assembled by hand.
 *
 * @param {object} meta The `meta` object a compiled bundle exports.
 * @returns {void}
 */
export function install(meta) {
  return framework.Runtime.install(meta);
}

/**
 * Builds the `Swill` global from a build's compiled definitions.
 *
 * @param {object} definitions The compiled classes, by generated identifier.
 * @param {object} Runtime The runtime those classes were compiled against.
 * @param {Object<string, string>} names Each public name, such as
 *   `"Model.Base"`, with the identifier of the class it names.
 * @param {string[]} roots The public names a registered class may extend.
 * @returns {object} The global, frozen.
 * @ignore
 */
export function browserAPI(definitions, Runtime, names = {}, roots = []) {
  // A slim build carries only the UI classes: a public name whose class the
  // build lacks is left out, not present as undefined.
  const classes = {};
  for (const [name, identifier] of Object.entries(names)) {
    const klass = definitions[identifier];
    if (!klass) continue;
    const [space, member] = name.split(".");
    if (member) (classes[space] ??= {})[member] = klass;
    else classes[space] = klass;
  }
  for (const [name, value] of Object.entries(classes)) {
    if (typeof value !== "function") classes[name] = Object.freeze(value);
  }
  framework = {
    Runtime,
    Application: definitions.Swill__Application,
    roots: new Set(roots.map(name => definitions[names[name]]).filter(Boolean))
  };
  return Object.freeze({...definitions, Runtime, install, ...classes, register, start});
}
