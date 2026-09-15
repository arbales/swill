// Metadata-backed path and dynamic dispatch.
import {declarations} from "./metadata.mjs";
import {subscribe, writeProperty} from "./properties.mjs";
import {valueRead, isPlainObject, NIL_READERS, VALUE_READERS} from "./values.mjs";

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

  const method = declarations(object.constructor, "methods").get(name);
  if (method?.arity === 0) return object[method.js]();
  if (VALUE_READERS.includes(name)) return valueRead(object, name);

  throw new Error(`Unknown reader: ${name}`);
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

// A missing owner may become writable later; an invalid leaf cannot.
function pathWriter(object, path) {
  const names = segments(path);
  if (names.length === 0) {
    throw new Error(`Read-only binding: ${path}`);
  }

  const name = names.pop();
  const owner = names.reduce((target, segment) => read(target, segment), object);
  if (owner == null) return null;

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
  return writeProperty(writer.owner, writer.descriptor, value);
}

export function observePath(object, path, callback) {
  let disposers = [];
  let active = true;

  const rehook = () => {
    disposers.splice(0).forEach(dispose => dispose());
    let owner = object;

    for (const name of segments(path)) {
      if (owner == null) break;

      if (declarations(owner.constructor, "properties").has(name)) {
        disposers.push(
          subscribe(owner, name, () => {
            if (!active) return;

            rehook(); // Rebind before user code runs.
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
    disposers.splice(0).forEach(dispose => dispose());
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

// Invoke an untyped receiver through metadata.
export function invoke(object, name, ...args) {
  if (object == null) {
    throw new Error(`Cannot call ${name} on nil`);
  }

  const method = declarations(object.constructor, "methods").get(name);
  if (!method || method.arity !== args.length) {
    throw new Error(`Unknown method or wrong arity: ${name}`);
  }

  return object[method.js](...args);
}

export function performAction(object, name, sender, event) {
  const method = declarations(object.constructor, "methods").get(name);
  if (!method || method.arity > 2) {
    throw new Error(`Unknown action or wrong arity: ${name}`);
  }

  return object[method.js](...[sender, event].slice(0, method.arity));
}
