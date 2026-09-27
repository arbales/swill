// Declaration-backed outlets and model attributes.
import {declarations} from "./metadata.mjs";

/**
 * Returns the restorable paths `object` declares, inherited ones included,
 * each as `{path, key, type}`: the values its window keeps in the URL
 * fragment.
 *
 * @param {object} object
 * @returns {object[]}
 */
export function restorations(object) {
  return declarations(object.constructor, "restorations");
}

/**
 * Returns the descriptors of the outlets `object` declares, inherited ones
 * included.
 *
 * @param {object} object
 * @returns {object[]}
 */
export function outlets(object) {
  return [...declarations(object.constructor, "properties").values()]
    .filter(descriptor => descriptor.outlet);
}
