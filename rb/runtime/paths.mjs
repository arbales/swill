// Metadata-backed path and dynamic dispatch.
import {declarations, hasInstalledMetadata} from "./metadata.mjs";
import {subscribe, writeProperty} from "./properties.mjs";
import {valueRead, valueInvoke, isPlainObject, NIL_READERS, VALUE_READERS, VALUE_METHODS} from "./values.mjs";
import {positionalArgumentCount, isKeywordArguments, isBlockArgument} from "./arguments.mjs";

// Installed method maps are immutable. Index each one once by Ruby family
// name and arity so optional dispatch stays constant-time as classes grow.
const methodIndexes = new WeakMap();

function methodIndex(methods) {
  let index = methodIndexes.get(methods);
  if (index) return index;

  index = new Map();
  for (const method of methods.values()) {
    const name = method.family ?? method.name;
    if (!index.has(name)) index.set(name, new Map());
    index.get(name).set(method.arity, method);
  }
  methodIndexes.set(methods, index);
  return index;
}

// A Ruby method with optional parameters compiles to one JavaScript method
// per arity — `observe` and `observeWithObject` — so a name and an argument
// count name exactly one of them. The shortest variant keeps the plain name;
// the wider ones carry `family`. A name with no plain variant has no family.
export function resolveMethod(methods, name, count) {
  const base = methods.get(name);
  if (!base) return null;
  if (base.minimum != null && count >= base.minimum &&
      (base.maximum == null || count <= base.maximum)) return base;
  if (base.arity === count) return base;
  return methodIndex(methods).get(name)?.get(count) ?? null;
}

// The widest variant that fits, for a caller with a fixed supply of
// arguments: Ruby fills optionals from the left when arguments are there.
function widestMethod(methods, name, limit) {
  const family = methodIndex(methods).get(name);
  if (!family) return null;
  for (let count = limit; count >= 0; count -= 1) {
    if (family.has(count)) return family.get(count);
  }
  return null;
}

/**
 * Returns the value of `name` on `object`, as key-value coding reads it: the
 * value of a declared property, or the result of a method that takes no
 * arguments. An `attr_reader` is read rather than called.
 *
 * A read by name is lenient, as a key path must be: nil returns nil, except
 * for the readers nil responds to; a plain object returns its entry for
 * `name`, or nil; a string, number, or array returns the result of
 * `valueRead`. An object whose class Swill did not install, such as an
 * element, returns its own JavaScript member: the result of a function, or
 * the value of anything else, or `undefined` if it has no such member.
 *
 * @param {unknown} object
 * @param {string} name The Ruby name.
 * @returns {unknown}
 * @throws {Error} `Unknown reader`, for an installed class without the member.
 */
export function read(object, name) {
  if (object == null) {
    return NIL_READERS.includes(name) ? valueRead(object, name) : null;
  }

  if (typeof object !== "object" && typeof object !== "function") {
    return valueRead(object, name);
  }

  // A plain object is a Hash: key-value coding reads its entry, nil when
  // absent, as it does for a dictionary. Its entries are not observable.
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

// An object Swill did not install, such as an element or an event, answers
// with its own JavaScript members, by the name as written: a function is
// called, anything else is read. A read of a member it lacks is nil, as
// JavaScript reads an absent property, so an expando can be checked; a call
// to one is an error. A Swill object has no such fallback, so a misspelled
// member on one is still an error.
function nativeMember(object, name, args, call) {
  const member = object[name];
  if (typeof member === "function") return member.apply(object, args);
  if (call && !(name in object)) throw new Error(`Unknown method: ${name}`);
  if (args.length > 0) throw new Error(`Not a method: ${name}`);
  return member;
}

// Ruby dup for a framework object: a new instance of its class with the
// stored properties written through the property protocol, so validators
// run and nothing of the original's observation or computed state carries
// over. Outlets are connections, not values, and stay unset.
function duplicateObject(object) {
  const copy = new object.constructor();
  for (const descriptor of declarations(object.constructor, "properties").values()) {
    if (descriptor.computed || descriptor.outlet) continue;
    copy[descriptor.js] = object[descriptor.js];
  }
  return copy;
}

/**
 * Returns the names in the key path `path`: `"a.b.c"` returns
 * `["a", "b", "c"]`, and the empty path returns none.
 *
 * @param {string} path
 * @returns {string[]}
 */
export function segments(path) {
  return path === "" ? [] : path.split(".");
}

/**
 * Returns the value at the end of the key path `path`, reading each segment
 * with `read`. Returns nil if a segment before the end is nil, and `object`
 * itself for the empty path.
 *
 * @param {unknown} object
 * @param {string} path
 * @returns {unknown}
 */
export function readPath(object, path) {
  return segments(path).reduce((owner, name) => read(owner, name), object);
}

/**
 * Sets `name` on `object` to `value`, and returns `value`: a declared stored
 * property is set through the property protocol, so its coercion,
 * comparison, and observers run; otherwise a `name=` method is called. A plain
 * object has an entry it already has set.
 *
 * @param {object} object
 * @param {string} name The Ruby name, without `=`.
 * @param {unknown} value
 * @returns {unknown} The value.
 * @throws {Error} `Cannot write … on nil`; `Read-only property` for a
 *   computed one; `Unknown writer`; `Unknown key` for a dictionary without the
 *   entry.
 */
export function write(object, name, value) {
  if (object == null) {
    throw new Error(`Cannot write ${name} on nil`);
  }

  // A plain object is a Hash: key-value coding sets an entry it already
  // has; a key it lacks is a mistake in the path, not a new entry.
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

  // A writer method compiles to a JavaScript setter under its JavaScript
  // name, which differs from the Ruby one for a name of two or more words.
  const method = resolveMethod(declarations(object.constructor, "methods"), `${name}=`, 1);
  if (method) {
    object[(method.js ?? name).replace(/=$/, "")] = value;
    return value;
  }

  throw new Error(`Unknown writer: ${name}`);
}

// A missing owner may become writable later; an invalid leaf cannot.
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
    return {owner, key: name};
  }

  const descriptor = declarations(owner.constructor, "properties").get(name);
  if (!descriptor || (descriptor.computed && !descriptor.writer)) {
    throw new Error(`Read-only binding: ${path}`);
  }

  return {owner, descriptor};
}

/**
 * Raises unless the key path `path` can be written: unless it ends in a stored
 * property, or in an entry a plain object already has. A path through a nil
 * segment passes, since that owner may appear later.
 *
 * @param {object} object
 * @param {string} path
 * @returns {void}
 * @throws {Error} `Read-only binding` for a computed or undeclared leaf or
 *   the empty path; `Unknown key` for a dictionary without the entry.
 */
export function assertWritablePath(object, path) {
  pathWriter(object, path);
}

/**
 * Sets the value at the end of the key path `path` to `value`, and returns
 * `value`. If a segment before the end is nil, nothing is written and
 * `undefined` is returned.
 *
 * @param {object} object
 * @param {string} path
 * @param {unknown} value
 * @returns {unknown} The value, or `undefined` when the write was dropped.
 * @throws {Error} As `assertWritablePath`.
 */
export function writePath(object, path, value) {
  const writer = pathWriter(object, path);
  if (!writer) return undefined;
  if (writer.key !== undefined) return write(writer.owner, writer.key, value);
  return writeProperty(writer.owner, writer.descriptor, value);
}

/**
 * Calls `callback` with the new value at the end of the key path `path`
 * whenever it changes, and returns a function that stops observing.
 *
 * Each segment that is a declared property is observed, so replacing an
 * object partway along the path observes its replacement instead: only the
 * segments after the change are observed again. A segment that is not a
 * declared property, such as a plain object's entry, is read but not
 * observed.
 *
 * @param {object} object
 * @param {string} path
 * @param {(value: unknown) => void} callback
 * @returns {() => void} Stops observing.
 */
export function observePath(object, path, callback) {
  const names = segments(path);
  let active = true;

  // A single segment is the common case and owns no chain: nothing below it can
  // move, so it needs neither the owner cache nor a rebuild.
  if (names.length === 1) {
    const name = names[0];
    if (object == null || !declarations(object.constructor, "properties").has(name)) {
      return () => {};
    }

    const dispose = subscribe(object, name, () => {
      if (active) callback(read(object, name));
    }, "observers");

    return () => {
      active = false;
      dispose();
    };
  }

  // owners[i] is the object segment i is read from, so a rebuild can start
  // partway down the path instead of walking it again from the root.
  const owners = [object];
  const disposers = [];

  // A change at segment i moves only what is below it: the owners above are
  // still the same objects, and their subscriptions are still correct. So a
  // change rebinds from i + 1, and a change in the last segment — the common
  // case for a leaf binding — rebinds nothing at all.
  const hook = start => {
    for (let index = start; index < disposers.length; index += 1) disposers[index]?.();
    disposers.length = start;
    owners.length = start;
    // The segment above is what changed, so what it points at is re-read rather
    // than taken from the cache, which still holds the old object.
    owners[start] = start === 0 ? object : read(owners[start - 1], names[start - 1]);

    let owner = owners[start];
    for (let index = start; index < names.length; index += 1) {
      if (owner == null) break;
      const name = names[index];

      disposers[index] = declarations(owner.constructor, "properties").has(name)
        ? subscribe(owner, name, () => {
            if (!active) return;

            if (index + 1 < names.length) hook(index + 1); // Rebind before user code runs.
            callback(readPath(object, path));
          }, "observers")
        : null;

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

/**
 * Returns whether `object` responds to `name`, according to its installed
 * declarations: a declared property; `name=` for a stored property; a method;
 * or, for nil, a plain value, or a plain object, a reader `valueRead`
 * answers, or a plain object's own entry. The object's JavaScript members are
 * not consulted.
 *
 * @param {unknown} object
 * @param {string} name The Ruby name.
 * @returns {boolean}
 */
export function respondsTo(object, name) {
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
    return (!!property && (!property.computed || property.writer)) || methods.has(name);
  }

  return properties.has(name) || methods.has(name);
}

/**
 * Returns whether `object` has a method `name`, or a variant of it, that takes
 * `count` arguments.
 *
 * @param {unknown} object
 * @param {string} name
 * @param {number} count
 * @returns {boolean}
 */
export function methodAccepts(object, name, count) {
  if (object == null || (typeof object !== "object" && typeof object !== "function")) return false;
  if (isPlainObject(object)) return false;
  return resolveMethod(declarations(object.constructor, "methods"), name, count) !== null;
}

/**
 * Returns the result of sending `name`, with no arguments, to `object`: the
 * value of a property, or the result of a method. The compiler emits this for
 * a call such as `post.reload` on a receiver whose type it does not know, which
 * could be either. Sending to nil raises, except for the readers nil responds
 * to; otherwise it is as `read`.
 *
 * @param {unknown} object
 * @param {string} name The Ruby name.
 * @returns {unknown}
 * @throws {Error} `Cannot call … on nil`, and as `read`.
 */
export function send(object, name) {
  if (object == null && !NIL_READERS.includes(name)) {
    throw new Error(`Cannot call ${name} on nil`);
  }
  return read(object, name);
}

/**
 * Calls the method `name` on `object` with `args`, and returns its result. The
 * method is found by name and argument count, among the variants of a method
 * with optional parameters; with no arguments, a declared property's value is
 * returned. The compiler emits this for a call with arguments, parentheses, or
 * a bang on a receiver whose type it does not know.
 *
 * An object whose class Swill did not install, other than a plain object,
 * calls its own JavaScript method `name` with `args`, or returns its property
 * `name` when there are no arguments.
 *
 * @param {unknown} object
 * @param {string} name The Ruby name.
 * @param {...unknown} args
 * @returns {unknown}
 * @throws {Error} `Cannot call … on nil`; `Unknown method or wrong arity`;
 *   for another object, `Unknown method` or `Not a method`.
 */
export function invoke(object, name, ...args) {
  if (object == null) {
    throw new Error(`Cannot call ${name} on nil`);
  }

  const methods = declarations(object.constructor, "methods");
  if (!methods.has(name) && VALUE_METHODS.includes(name)) return valueInvoke(object, name, args);

  const method = resolveMethod(methods, name, positionalArgumentCount(args));
  if (!method) {
    // A reader called with parentheses, post.title(), is still the reader.
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

/**
 * Calls the action `name` on `object` with `sender` and `event`, and returns
 * its result: the widest variant of the method that takes at most two
 * arguments is called, with as many of them as it takes. `data-action` sends
 * actions this way.
 *
 * @param {object} object The responder handling the action.
 * @param {string} name The action's Ruby name.
 * @param {unknown} sender The element or object that sent it.
 * @param {Event} [event]
 * @returns {unknown}
 * @throws {Error} `Unknown action or wrong arity`.
 */
export function performAction(object, name, sender, event) {
  // The runtime has a sender and an event to give, and gives as many of them
  // as the widest variant will take.
  const method = widestMethod(declarations(object.constructor, "methods"), name, 2);
  if (!method || method.accessor) {
    throw new Error(`Unknown action or wrong arity: ${name}`);
  }

  return object[method.js](...[sender, event].slice(0, method.arity));
}
