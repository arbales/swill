// Observable state and computed dependency tracking.
import {declarations} from "./metadata.mjs";
import {isEqual} from "./values.mjs";

const states = new WeakMap();
const captures = [];
const dependentTargets = new WeakMap();

function state(object) {
  let current = states.get(object);
  if (!current) {
    current = {
      values: new Map(),
      computed: new Map(),
      observers: new Map(),
      dependents: new Map(),
      retained: []
    };

    states.set(object, current);

    // Hooked computed properties stay current.
    for (const descriptor of declarations(object.constructor, "properties").values()) {
      if (descriptor.computed && hooked(object, descriptor.name)) {
        computedValue(object, descriptor);
      }
    }
  }

  return current;
}

function hooked(object, name) {
  return declarations(object.constructor, "methods").has(`${name}_did_change`);
}

export function record(object, name) {
  const frame = captures.at(-1);
  if (!frame) return;

  if (!frame.has(object)) frame.set(object, new Set());
  frame.get(object).add(name);
}

function listeners(object, name, kind) {
  const table = state(object)[kind];
  if (!table.has(name)) table.set(name, new Set());
  return table.get(name);
}

export function subscribe(object, name, callback, kind, target = null) {
  if (target) dependentTargets.set(callback, target);
  const descriptor = declarations(object.constructor, "properties").get(name);
  if (!descriptor) {
    throw new Error(`Unknown observable property: ${name}`);
  }

  if (descriptor.computed) computedValue(object, descriptor);

  // Listeners are kept under the property's own name, which a JavaScript
  // spelling of it (selectedObject for selected_object) resolves to.
  const set = listeners(object, descriptor.name, kind);
  set.add(callback);

  return () => set.delete(callback);
}

// Follow computed dependencies only when they lead to a live observer or hook.
export function observed(object, name, visited = new Map()) {
  const names = visited.get(object) ?? new Set();
  if (names.has(name)) return false;
  names.add(name);
  visited.set(object, names);
  const current = states.get(object);
  if (!current) return false;
  if (current.observers.get(name)?.size || hooked(object, name)) return true;
  for (const callback of current.dependents.get(name) ?? []) {
    const target = dependentTargets.get(callback);
    if (target && observed(target[0], target[1], visited)) return true;
  }
  return false;
}

export function storedValue(object, descriptor) {
  const values = state(object).values;
  if (!values.has(descriptor.name)) {
    values.set(descriptor.name, descriptor.defaultValue.call(object));
  }

  return values.get(descriptor.name);
}

export function computedValue(object, descriptor) {
  const slots = state(object).computed;
  let slot = slots.get(descriptor.name);
  if (!slot) {
    slot = {
      valid: false,
      running: false,
      value: undefined,
      disposers: []
    };

    slots.set(descriptor.name, slot);
  }

  if (slot.valid) return slot.value;
  if (slot.running) {
    throw new Error(`Computed cycle: ${descriptor.name}`);
  }

  slot.disposers.splice(0).forEach(dispose => dispose());

  const frame = new Map();
  slot.running = true;
  captures.push(frame);

  try {
    slot.value = descriptor.compute.call(object);
    slot.valid = true;
  } finally {
    captures.pop();
    slot.running = false;
  }

  for (const [dependency, names] of frame) {
    for (const name of names) {
      slot.disposers.push(
        subscribe(
          dependency,
          name,
          () => invalidate(object, descriptor),
          "dependents",
          [object, descriptor.name]
        )
      );
    }
  }

  return slot.value;
}

function invalidate(object, descriptor) {
  const slot = state(object).computed.get(descriptor.name);
  if (!slot?.valid) return;

  const previous = slot.value;
  slot.valid = false;
  // Invalid cached values no longer need to retain their previous inputs.
  slot.disposers.splice(0).forEach(dispose => dispose());

  for (const callback of [
    ...listeners(object, descriptor.name, "dependents")
  ]) callback();

  // Recompute only when a listener needs the result.
  if (listeners(object, descriptor.name, "observers").size || hooked(object, descriptor.name)) {
    const value = computedValue(object, descriptor);
    if (!isEqual(previous, value)) notify(object, descriptor.name, previous, value);
  }
}

function notify(object, name, previous, value) {
  for (const callback of [
    ...listeners(object, name, "dependents")
  ]) callback();

  const hook = declarations(object.constructor, "methods").get(`${name}_did_change`);
  if (hook) object[hook.js](previous, value);

  for (const callback of [
    ...listeners(object, name, "observers")
  ]) callback(value, previous);
}

// Mutations always follow: coerce, compare, will-change, store, notify.
export function writeProperty(object, descriptor, value) {
  if (descriptor.writer) return object[descriptor.writer](value);
  if (descriptor.computed) throw new Error(`Read-only property: ${descriptor.name}`);
  const previous = storedValue(object, descriptor);
  value = object.coercePropertyValue(descriptor.name, value, previous);
  if (isEqual(previous, value)) return value;

  object.propertyWillChange(descriptor.name, previous, value);
  state(object).values.set(descriptor.name, value);
  notify(object, descriptor.name, previous, value);

  return value;
}

/**
 * Calls `callback` with the new and previous values of the property `name`
 * of `object` whenever it changes, and returns a function that stops
 * observing. Setting a property to its current value changes nothing, and
 * calls no observer.
 *
 * @param {object} object
 * @param {string} name The property's Ruby name.
 * @param {(value: unknown, previous: unknown) => void} callback
 * @returns {() => void} Stops observing.
 */
export function observe(object, name, callback) {
  return subscribe(object, name, callback, "observers");
}

/**
 * Retains `disposer` for `object`, which calls it when deallocated, and
 * returns `disposer`. Anything that should end with `object`, such as an
 * observation, a DOM listener, or a binding, is retained this way.
 *
 * @param {object} object
 * @param {() => void} disposer
 * @returns {() => void} The disposer.
 */
export function retain(object, disposer) {
  state(object).retained.push(disposer);
  return disposer;
}

/**
 * Removes `disposer` from what `object` retains, and calls it. A disposer
 * `object` never retained is called all the same.
 *
 * @param {object} object
 * @param {() => void} disposer
 * @returns {void}
 */
export function release(object, disposer) {
  const retained = states.get(object)?.retained;
  const index = retained ? retained.indexOf(disposer) : -1;
  if (index >= 0) retained.splice(index, 1);
  disposer();
}

/**
 * Calls every disposer `object` retains, then removes `object` from the
 * observation graph. Its disposers are called first, so nothing they do can
 * reach it again.
 *
 * @param {object} object
 * @returns {void}
 */
export function dealloc(object) {
  const current = states.get(object);
  if (current) current.retained.splice(0).forEach(disposer => disposer());
  disconnect(object);
}

/**
 * Removes `object` from the observation graph in both directions: its computed
 * properties stop observing the properties they read, and its observers stop
 * observing it. Its stored values are kept, so it remains usable, and its
 * computed properties observe again when next read.
 *
 * @param {object} object
 * @returns {void}
 */
export function disconnect(object) {
  const current = states.get(object);
  if (!current) return;

  // Keep the invalidations before dropping their sets. Once the old graph is
  // gone, an eagerly observed computation may read this object and attach a
  // fresh subscription; an unobserved one stays invalid until its next read.
  const dependents = [...current.dependents.values()]
    .flatMap(callbacks => [...callbacks]);

  for (const slot of current.computed.values()) {
    slot.disposers.splice(0).forEach(dispose => dispose());
  }

  current.computed.clear();
  current.observers.clear();
  current.dependents.clear();
  dependents.forEach(callback => callback());
}
