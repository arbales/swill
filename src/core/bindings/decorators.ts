import { observePath } from "./object_bindings";

/**
 * Auto-accessor decorator. Wraps the auto-generated setter to call
 * `${name}DidChange(prev, next)` on the same instance, if defined.
 */
export function observable<This extends object, Value>(
  target: ClassAccessorDecoratorTarget<This, Value>,
  context: ClassAccessorDecoratorContext<This, Value>,
): ClassAccessorDecoratorResult<This, Value> {
  const name = String(context.name);
  const callbackName = `${name}DidChange`;
  return {
    get(this: This): Value {
      return target.get.call(this);
    },
    set(this: This, value: Value): void {
      const prev = target.get.call(this);
      target.set.call(this, value);
      const cb = (this as any)[callbackName];
      if (typeof cb === "function") cb.call(this, prev, value);
    },
  };
}

const computedState = new WeakMap<object, Map<string, ComputedSlot>>();

interface ComputedSlot { installed: boolean; cached: unknown }

function computedSlotFor(obj: object, name: string): ComputedSlot {
  let perInstance = computedState.get(obj);
  if (!perInstance) { perInstance = new Map(); computedState.set(obj, perInstance); }
  let slot = perInstance.get(name);
  if (!slot) { slot = { installed: false, cached: undefined }; perInstance.set(name, slot); }
  return slot;
}

/**
 * Declarative read-only derived property. Cocoa
 * `+keyPathsForValuesAffectingValueForKey:` analog.
 */
export function computed(dependencies: readonly string[]) {
  return function <This extends object, Value>(
    originalGetter: (this: This) => Value,
    context: ClassGetterDecoratorContext<This, Value>,
  ): (this: This) => Value {
    const name = String(context.name);
    const callbackName = `${name}DidChange`;
    return function (this: This): Value {
      const slot = computedSlotFor(this, name);
      if (!slot.installed) {
        slot.installed = true;
        slot.cached = originalGetter.call(this);
        const onDepChange = (): void => {
          const prev = slot.cached as Value;
          const next = originalGetter.call(this);
          if (Object.is(prev, next)) return;
          slot.cached = next;
          const cb = (this as any)[callbackName];
          if (typeof cb === "function") cb.call(this, prev, next);
        };
        for (const dep of dependencies) {
          const segments = dep.split(".");
          const first = segments[0];
          if (first == null || !(first in this)) {
            console.error(
              `[computed] ${this.constructor.name}.${name}: unknown dependency` +
                ` \`${first}\` (path "${dep}") - typo or missing observable?`,
            );
            continue;
          }
          observePath(this, segments, onDepChange);
        }
      }
      return slot.cached as Value;
    };
  };
}

export interface BindingAdapter<This extends object, Value> {
  dependencies: readonly string[];
  get?(this: This, pending: Value): Value;
  set?(this: This, value: Value): boolean | void;
}

interface BindingSlot<Value> {
  installed: boolean;
  cached: Value | undefined;
  pending: Value | undefined;
  hasPending: boolean;
}

const bindingState = new WeakMap<object, Map<string, BindingSlot<any>>>();

function bindingSlotFor<Value>(obj: object, name: string): BindingSlot<Value> {
  let perInstance = bindingState.get(obj);
  if (!perInstance) { perInstance = new Map(); bindingState.set(obj, perInstance); }
  let slot = perInstance.get(name) as BindingSlot<Value> | undefined;
  if (!slot) {
    slot = { installed: false, cached: undefined, pending: undefined, hasPending: false };
    perInstance.set(name, slot);
  }
  return slot;
}

export function binding<This extends object, Value>(
  adapter: BindingAdapter<This, Value>,
) {
  return function (
    target: ClassAccessorDecoratorTarget<This, Value>,
    context: ClassAccessorDecoratorContext<This, Value>,
  ): ClassAccessorDecoratorResult<This, Value> {
    const name = String(context.name);
    const callbackName = `${name}DidChange`;

    const readCurrent = (instance: This, slot: BindingSlot<Value>): Value => {
      const pending = slot.hasPending ? slot.pending as Value : target.get.call(instance);
      return adapter.get ? adapter.get.call(instance, pending) : pending;
    };

    const fireIfChanged = (instance: This, slot: BindingSlot<Value>, prev: Value): void => {
      const next = readCurrent(instance, slot);
      if (slot.hasPending && !Object.is(next, slot.pending)) slot.hasPending = false;
      slot.cached = next;
      if (Object.is(prev, next)) return;
      const cb = (instance as any)[callbackName];
      if (typeof cb === "function") cb.call(instance, prev, next);
    };

    const retryPending = (instance: This, slot: BindingSlot<Value>): void => {
      if (!slot.hasPending || !adapter.set) return;
      const applied = adapter.set.call(instance, slot.pending as Value);
      if (applied !== false) slot.hasPending = false;
    };

    const install = (instance: This): BindingSlot<Value> => {
      const slot = bindingSlotFor<Value>(instance, name);
      if (slot.installed) return slot;
      slot.installed = true;
      slot.cached = readCurrent(instance, slot);
      let changeQueued = false;
      const onDepChange = (): void => {
        if (changeQueued) return;
        changeQueued = true;
        queueMicrotask(() => {
          changeQueued = false;
          const prev = slot.cached as Value;
          retryPending(instance, slot);
          fireIfChanged(instance, slot, prev);
        });
      };
      for (const dep of adapter.dependencies) {
        const segments = dep.split(".");
        const first = segments[0];
        if (first == null || !(first in instance)) {
          console.error(
            `[binding] ${instance.constructor.name}.${name}: unknown dependency` +
              ` \`${first}\` (path "${dep}") - typo or missing observable?`,
          );
          continue;
        }
        observePath(instance, segments, onDepChange);
      }
      return slot;
    };

    return {
      get(this: This): Value {
        const slot = install(this);
        return readCurrent(this, slot);
      },
      set(this: This, value: Value): void {
        const slot = install(this);
        const prev = readCurrent(this, slot);
        target.set.call(this, value);
        slot.pending = value;
        slot.hasPending = true;
        if (adapter.set) {
          const applied = adapter.set.call(this, value);
          if (applied !== false) slot.hasPending = false;
        } else {
          slot.hasPending = false;
        }
        fireIfChanged(this, slot, prev);
      },
    };
  };
}
