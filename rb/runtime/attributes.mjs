// Declaration-backed outlets and model attributes.
import {declarations} from "./metadata.mjs";

export function restorations(object) {
  return declarations(object.constructor, "restorations");
}

export function outlets(object) {
  return [...declarations(object.constructor, "properties").values()]
    .filter(descriptor => descriptor.outlet);
}
