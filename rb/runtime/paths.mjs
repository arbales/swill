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
  if (method) return object[method.js]();
  if (name === "dup" && hasInstalledMetadata(object.constructor)) return duplicateObject(object);
  if (VALUE_READERS.includes(name)) return valueRead(object, name);

  throw new Error(`Unknown reader: ${name}`);
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

export function segments(path) {
  return path === "" ? [] : path.split(".");
}

export function readPath(object, path) {
  return segments(path).reduce((owner, name) => read(owner, name), object);
}

// Write a declared property or name= method.
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
    if (property.computed) {
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
  if (!descriptor || descriptor.computed) {
    throw new Error(`Read-only binding: ${path}`);
  }

  return {owner, descriptor};
}

export function assertWritablePath(object, path) {
  pathWriter(object, path);
}

// Drop writes through missing owners.
export function writePath(object, path, value) {
  const writer = pathWriter(object, path);
  if (!writer) return undefined;
  if (writer.key !== undefined) return write(writer.owner, writer.key, value);
  return writeProperty(writer.owner, writer.descriptor, value);
}

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

// Ruby respond_to? over installed declarations.
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
    return (!!property && !property.computed) || methods.has(name);
  }

  return properties.has(name) || methods.has(name);
}

export function methodAccepts(object, name, count) {
  if (object == null || (typeof object !== "object" && typeof object !== "function")) return false;
  if (isPlainObject(object)) return false;
  return resolveMethod(declarations(object.constructor, "methods"), name, count) !== null;
}

// Invoke an untyped receiver through metadata.
export function invoke(object, name, ...args) {
  if (object == null) {
    throw new Error(`Cannot call ${name} on nil`);
  }

  const methods = declarations(object.constructor, "methods");
  if (!methods.has(name) && VALUE_METHODS.includes(name)) return valueInvoke(object, name, args);

  const method = resolveMethod(methods, name, positionalArgumentCount(args));
  if (!method) {
    throw new Error(`Unknown method or wrong arity: ${name}`);
  }
  if (method.minimum == null && args.some(isKeywordArguments)) {
    throw new Error(`Unknown method or wrong keywords: ${name}`);
  }
  if (method.minimum == null && args.some(isBlockArgument)) {
    throw new Error(`Method does not accept a block: ${name}`);
  }

  return object[method.js](...args);
}

export function performAction(object, name, sender, event) {
  // The runtime has a sender and an event to give, and gives as many of them
  // as the widest variant will take.
  const method = widestMethod(declarations(object.constructor, "methods"), name, 2);
  if (!method) {
    throw new Error(`Unknown action or wrong arity: ${name}`);
  }

  return object[method.js](...[sender, event].slice(0, method.arity));
}
