// Declaration-backed outlets and model attributes.
import {declarations} from "./metadata.mjs";

export function isAttribute(object, name) {
  return !!declarations(object.constructor, "properties").get(name)?.attribute;
}

// Resolve validate_<name> through installed metadata.
export function validateAttribute(object, name, value, previous) {
  if (!isAttribute(object, name)) return value;
  const validator = declarations(object.constructor, "methods").get(`validate_${name}`);
  return validator && validator.arity === 2
    ? object[validator.js](value, previous)
    : value;
}

export function restorations(object) {
  return declarations(object.constructor, "restorations");
}

export function outlets(object) {
  return [...declarations(object.constructor, "properties").values()]
    .filter(descriptor => descriptor.outlet);
}

export function collectAttributes(object) {
  const result = {};
  for (const descriptor of declarations(object.constructor, "properties").values()) {
    if (descriptor.attribute && !descriptor.computed) {
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
