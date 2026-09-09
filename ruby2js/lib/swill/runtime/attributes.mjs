// Declaration-driven views of an object: outlets, and the attribute
// collection and application that models and drafts use.
import {declarations} from "./metadata.mjs";

export function outlets(object) {
  return [...declarations(object.constructor, "properties").values()].filter(descriptor => descriptor.outlet);
}

export function collect_attributes(object) {
  const result = {};
  for (const descriptor of declarations(object.constructor, "properties").values()) {
    if (descriptor.attribute && !descriptor.computed) {
      result[descriptor.key] = object[descriptor.js];
    }
  }
  return result;
}

export function apply_attributes(object, source) {
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
