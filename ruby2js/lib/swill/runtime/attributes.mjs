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

// The installed has_many/has_one descriptor for a name, or null.
export function relationship(object, name) {
  return declarations(object.constructor, "relationships").get(name) ?? null;
}

export function relationships(object) {
  return [...declarations(object.constructor, "relationships").values()];
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
