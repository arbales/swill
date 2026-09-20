// Declaration-backed outlets and model attributes.
import {declarations} from "./metadata.mjs";
import {resolveMethod} from "./paths.mjs";

export function isAttribute(object, name) {
  return !!declarations(object.constructor, "properties").get(name)?.attribute;
}

// Resolve validate_<name> through installed metadata. A validator is always
// sent the value and the previous one, so one that cannot take both is a
// mistake and says so rather than never running.
export function validateAttribute(object, name, value, previous) {
  if (!isAttribute(object, name)) return value;
  const methods = declarations(object.constructor, "methods");
  const validator = resolveMethod(methods, `validate_${name}`, 2);
  if (validator) return object[validator.js](value, previous);
  if (methods.has(`validate_${name}`)) {
    throw new Error(`Validator must take a value and a previous value: validate_${name}`);
  }
  return value;
}

export function restorations(object) {
  return declarations(object.constructor, "restorations");
}

export function outlets(object) {
  return [...declarations(object.constructor, "properties").values()]
    .filter(descriptor => descriptor.outlet);
}

// Attribute values keyed by wire key; with names, only those attributes.
export function collectAttributes(object, only = null) {
  const result = {};
  for (const descriptor of declarations(object.constructor, "properties").values()) {
    if (descriptor.attribute && !descriptor.computed && (only === null || only.includes(descriptor.name))) {
      result[descriptor.key] = object[descriptor.js];
    }
  }
  return result;
}

export function applyAttributes(object, source) {
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
