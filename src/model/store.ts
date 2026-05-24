import type { Model } from "./model";

export type ModelId = string | number;

/**
 * Per-class identity pool — one `Map<id, instance>` per `Model` subclass.
 * Lazily attached to each class by the model layer; instances flow in via
 * `parseJsonApi` and out via `Class.find` / `Class.findAll`.
 */
export class ModelStore<T extends Model> {
  private instances = new Map<ModelId, T>();

  get(id: ModelId): T | null {
    return this.instances.get(id) ?? null;
  }

  has(id: ModelId): boolean {
    return this.instances.has(id);
  }

  /**
   * Pool an instance by its id. If an instance with the same id is
   * already pooled, the pooled one wins: its attributes are updated
   * from the incoming object and the pooled instance is returned. This
   * keeps a single canonical instance per record so observers see one
   * source of truth.
   */
  put(instance: T): T {
    if (instance.id == null) throw new Error("ModelStore.put requires an id");
    const existing = this.instances.get(instance.id);
    if (existing && existing !== instance) {
      existing.applyAttributesFrom(instance);
      return existing;
    }
    this.instances.set(instance.id, instance);
    return instance;
  }

  remove(id: ModelId): void {
    this.instances.delete(id);
  }

  clear(): void {
    this.instances.clear();
  }

  values(): IterableIterator<T> {
    return this.instances.values();
  }
}
