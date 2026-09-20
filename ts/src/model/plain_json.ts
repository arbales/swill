import { attrDescriptorsOf } from "./decorators";
import type { Model, ModelClass } from "./model";
import { modelStoreFor } from "./model";
import type { ModelCodec } from "./codec";
import type { ModelId } from "./store";

export const plainJsonCodec: ModelCodec = {
  parseOne<T extends Model>(cls: ModelClass<T>, payload: unknown): T | null {
    if (payload == null) return null;
    if (Array.isArray(payload) || typeof payload !== "object") {
      throw new Error("expected plain JSON object");
    }
    return instantiateOrRefresh(cls, payload as Record<string, unknown>);
  },

  parseMany<T extends Model>(cls: ModelClass<T>, payload: unknown): T[] {
    if (!Array.isArray(payload)) throw new Error("expected plain JSON array");
    return payload.map((item) => this.parseOne(cls, item)).filter((item): item is T => item != null);
  },

  serialize(model: Model, options: { dirtyOnly: boolean }): Record<string, unknown> {
    const dirty = options.dirtyOnly ? new Set(model.dirty) : null;
    const out: Record<string, unknown> = {};
    for (const attr of attrDescriptorsOf(model)) {
      if (dirty == null || dirty.has(attr.name)) out[attr.key] = (model as any)[attr.name];
    }
    return out;
  },
};

function instantiateOrRefresh<T extends Model>(
  cls: ModelClass<T>,
  payload: Record<string, unknown>,
): T {
  const id = payload.id;
  const store = modelStoreFor(cls);
  const existing = isModelId(id) ? store.get(id) : null;
  const instance = existing ?? new cls();
  instance.id = isModelId(id) ? id : null;
  instance.applyAttributesFrom(payload);
  if (instance.id != null) store.put(instance);
  return instance;
}

function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" || typeof value === "number";
}
