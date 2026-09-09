// Per-object observable state and the one property mutation path:
//   read previous → coerce → compare → will-change → store → notify
// Computed properties capture their dependencies while running.
import {declarations} from "./metadata.mjs";
import {isEqual} from "./values.mjs";

const states = new WeakMap();
const captures = [];

function state(object) {
  if (!states.has(object)) {
    states.set(object, {values: new Map(), computed: new Map(), observers: new Map(), dependents: new Map()});
  }
  return states.get(object);
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

export function subscribe(object, name, callback, kind) {
  const descriptor = declarations(object.constructor, "properties").get(name);
  if (!descriptor) throw new Error(`Unknown observable property: ${name}`);
  if (descriptor.computed) computedValue(object, descriptor);
  const set = listeners(object, name, kind);
  set.add(callback);
  return () => set.delete(callback);
}

export function storedValue(object, descriptor) {
  const values = state(object).values;
  if (!values.has(descriptor.name)) values.set(descriptor.name, descriptor.defaultValue.call(object));
  return values.get(descriptor.name);
}

export function computedValue(object, descriptor) {
  const slots = state(object).computed;
  let slot = slots.get(descriptor.name);
  if (!slot) {
    slot = {valid: false, running: false, value: undefined, disposers: []};
    slots.set(descriptor.name, slot);
  }
  if (slot.valid) return slot.value;
  if (slot.running) throw new Error(`Computed cycle: ${descriptor.name}`);
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
      slot.disposers.push(subscribe(dependency, name, () => invalidate(object, descriptor), "dependents"));
    }
  }
  return slot.value;
}

function invalidate(object, descriptor) {
  const slot = state(object).computed.get(descriptor.name);
  if (!slot?.valid) return;
  const previous = slot.value;
  slot.valid = false;
  for (const callback of [...listeners(object, descriptor.name, "dependents")]) callback();
  if (listeners(object, descriptor.name, "observers").size) {
    const value = computedValue(object, descriptor);
    if (!isEqual(previous, value)) notify(object, descriptor.name, previous, value);
  }
}

function notify(object, name, previous, value) {
  for (const callback of [...listeners(object, name, "dependents")]) callback();
  const hook = declarations(object.constructor, "methods").get(`${name}_did_change`);
  if (hook) object[hook.js](previous, value);
  for (const callback of [...listeners(object, name, "observers")]) callback(value, previous);
}

export function writeProperty(object, descriptor, value) {
  const previous = storedValue(object, descriptor);
  value = object.coerce_property_value(descriptor.name, value, previous);
  if (isEqual(previous, value)) return value;
  object.property_will_change(descriptor.name, previous, value);
  state(object).values.set(descriptor.name, value);
  notify(object, descriptor.name, previous, value);
  return value;
}

export function observe(object, name, callback) {
  return subscribe(object, name, callback, "observers");
}

export function dispose(object) {
  const current = states.get(object);
  if (!current) return;
  for (const slot of current.computed.values()) {
    slot.disposers.splice(0).forEach(dispose => dispose());
  }
  current.computed.clear();
  current.observers.clear();
  current.dependents.clear();
}
