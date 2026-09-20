import { type BindOptions, bind, unbind } from "../core/bindings";
import type { ModelCodec } from "./codec";
import { attrDescriptorsOf, relationshipDescriptorOf } from "./decorators";
import type { JsonApiResource } from "./jsonapi";
import { ModelStore, type ModelId } from "./store";
import { createOne, deleteOne, fetchAllFrom, fetchOne, fetchOneFrom, updateOne } from "./transport";

export interface ModelClass<T extends Model> {
  new (): T;
  url: string;
  type: string;
  codec?: ModelCodec;
  store?: ModelStore<T>;
}

/**
 * Base class for app models. Subclasses use `@attr` on each persisted
 * field; dirty tracking and KVO callbacks are handled automatically.
 *
 * @example
 * ```ts
 * const u = await User.find(42);   // pool hit or fetch
 * u.name = "New";                  // marks "name" dirty, fires nameDidChange
 * await u.save();                  // PATCH with dirty diff, applies server response
 * await u.delete();                // DELETE + remove from pool
 * ```
 */
export class Model {
  // Decoration writes to these statics; declared here for type-safety.
  declare static url: string;
  declare static type: string;
  declare static codec?: ModelCodec;
  declare static store?: ModelStore<any>;

  id: ModelId | null = null;

  // Server-provided relationship pointers, keyed by relation name. Inert
  // until HasOne/HasMany wrappers consume them in a later step. Public for
  // the parser; not part of the user API.
  _relationships?: NonNullable<JsonApiResource["relationships"]>;

  // ---- dirty tracking ----

  protected _baseline: Record<string, unknown> = {};
  protected _dirty: Set<string> = new Set();
  protected _suspendDirty = 0;
  private _loadedRelationships = new Set<string>();

  /** Called by @attr setters. Records the first pre-edit value so a
   * mutation followed by un-mutation clears the dirty mark. */
  markDirty(name: string, prev: unknown, next: unknown): void {
    if (this._suspendDirty > 0) return;
    const prevDirty = this.dirty;
    const prevIsDirty = this.isDirty;

    if (!this._dirty.has(name)) {
      if (Object.is(prev, next)) return;
      this._dirty.add(name);
      this._baseline[name] = prev;
    } else if (Object.is(this._baseline[name], next)) {
      this._dirty.delete(name);
      delete this._baseline[name];
    }

    this.notifyDirtyChanged(prevDirty, prevIsDirty);
  }

  get dirty(): readonly string[] {
    return [...this._dirty];
  }

  get isDirty(): boolean {
    return this._dirty.size > 0;
  }

  private notifyDirtyChanged(prevDirty: readonly string[], prevIsDirty: boolean): void {
    const nextDirty = this.dirty;
    if (!sameStrings(prevDirty, nextDirty)) {
      const cb = (this as any).dirtyDidChange;
      if (typeof cb === "function") cb.call(this, prevDirty, nextDirty);
    }
    if (prevIsDirty !== this.isDirty) {
      const cb = (this as any).isDirtyDidChange;
      if (typeof cb === "function") cb.call(this, prevIsDirty, this.isDirty);
    }
  }

  private clearDirty(): void {
    const prevDirty = this.dirty;
    const prevIsDirty = this.isDirty;
    this._dirty.clear();
    this._baseline = {};
    this.notifyDirtyChanged(prevDirty, prevIsDirty);
  }

  // ---- attribute access (used by JSON:API parse / serialize) ----

  /** Apply attributes from a plain object (server response) to this
   * instance, bypassing dirty tracking. */
  applyAttributesFrom(other: Model | Record<string, unknown>): void {
    const source = other instanceof Model ? other.collectAttributes() : other;
    const attrs = attrDescriptorsOf(this);
    this._suspendDirty++;
    try {
      for (const attr of attrs) {
        if (Object.prototype.hasOwnProperty.call(source, attr.key)) {
          (this as any)[attr.name] = source[attr.key];
        } else if (Object.prototype.hasOwnProperty.call(source, attr.name)) {
          (this as any)[attr.name] = source[attr.name];
        }
      }
    } finally {
      this._suspendDirty--;
    }
  }

  /** Build a plain object of @attr values for serialization. */
  collectAttributes(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const attr of attrDescriptorsOf(this)) out[attr.key] = (this as any)[attr.name];
    return out;
  }

  // ---- read ----

  static async find<This extends ModelClass<any>>(
    this: This,
    id: ModelId,
    options: { reload?: boolean; params?: URLSearchParams } = {},
  ): Promise<InstanceType<This>> {
    const cached = modelStoreFor(this).get(id);
    if (cached && !options.reload) return cached as InstanceType<This>;
    return (await fetchOne(this, id, options.params)) as InstanceType<This>;
  }

  static async findAll<This extends ModelClass<any>>(
    this: This,
    options: { params?: URLSearchParams; url?: string; codec?: ModelCodec } = {},
  ): Promise<InstanceType<This>[]> {
    const url = options.url ?? this.url;
    return (await fetchAllFrom(this, url, options.params, options.codec)) as InstanceType<This>[];
  }

  async loadHasMany<T extends Model>(
    name: string,
    options: { reload?: boolean; url?: string } = {},
  ): Promise<T[]> {
    const existing = (this as any)[name];
    if (!options.reload && this.hasLoadedRelationship(name) && Array.isArray(existing)) {
      return existing as T[];
    }

    const descriptor = relationshipDescriptorOf(this, name);
    if (!descriptor || descriptor.kind !== "hasMany") {
      throw new Error(`${this.constructor.name}.${name} is not a hasMany relationship`);
    }

    const cls = descriptor.type() as ModelClass<T>;
    const url = options.url ?? descriptor.url?.(this);
    if (!url) {
      throw new Error(`${this.constructor.name}.${name} has no relationship URL`);
    }

    const values = await fetchAllFrom(cls, url);
    (this as any)[name] = values;
    this.markRelationshipLoaded(name);
    return values;
  }

  async loadHasOne<T extends Model>(
    name: string,
    options: { reload?: boolean; url?: string } = {},
  ): Promise<T | null> {
    const existing = (this as any)[name];
    if (!options.reload && this.hasLoadedRelationship(name)) {
      return existing as T | null;
    }

    const descriptor = relationshipDescriptorOf(this, name);
    if (!descriptor || descriptor.kind !== "hasOne") {
      throw new Error(`${this.constructor.name}.${name} is not a hasOne relationship`);
    }

    const cls = descriptor.type() as ModelClass<T>;
    const url = options.url ?? descriptor.url?.(this);
    if (!url) {
      throw new Error(`${this.constructor.name}.${name} has no relationship URL`);
    }

    const value = await fetchOneFrom(cls, url);
    (this as any)[name] = value;
    this.markRelationshipLoaded(name);
    return value;
  }

  hasLoadedRelationship(name: string): boolean {
    return this._loadedRelationships.has(name);
  }

  markRelationshipLoaded(name: string): void {
    this._loadedRelationships.add(name);
  }

  // ---- write ----

  /** PATCH (or POST if no id) sending only dirty attributes. Server response
   * is applied back to this instance and the dirty set is cleared. */
  async save(): Promise<this> {
    const ctor = this.constructor as ModelClass<this>;
    if (this.id == null) {
      const created = (await createOne(this)) as this;
      // The store now has the (newly-id'd) instance; ensure `this` reflects it.
      if (created !== this) this.applyAttributesFrom(created);
      this.id = created.id;
      modelStoreFor(ctor).put(this);
    } else if (this.isDirty) {
      const updated = (await updateOne(this)) as this;
      if (updated !== this) this.applyAttributesFrom(updated);
    }
    this.clearDirty();
    return this;
  }

  /** DELETE on the server, then remove from the pool. */
  async delete(): Promise<void> {
    const ctor = this.constructor as ModelClass<this>;
    await deleteOne(this);
    if (this.id != null) modelStoreFor(ctor).remove(this.id);
  }

  /** Force a re-fetch from the server; updates this instance and the pool. */
  async reload(params?: URLSearchParams): Promise<this> {
    if (this.id == null) throw new Error("reload requires an id");
    const ctor = this.constructor as ModelClass<this>;
    await fetchOne(ctor, this.id, params);
    return this;
  }

  /** Cross-field validation (Cocoa: validateForUpdate:). Override to return
   * an Error when fields are individually valid but the combination is not
   * (e.g. `watched_at` set with `watched=false`). The EditableListController
   * consults this before saving. Return undefined to allow the save. */
  validate(): Error | undefined {
    return undefined;
  }

  /** Produce an editing buffer: a fresh instance carrying the same id and
   * a copy of all @attr values, intentionally NOT registered in the pool.
   * Mutations on the draft mark *its* dirty set; `draft.save()` PATCHes the
   * server using the draft's id, then propagates the response onto the
   * pooled instance (firing its `*DidChange` callbacks). The draft itself
   * is single-use and can be discarded. */
  draft(): this {
    const ctor = this.constructor as ModelClass<this>;
    const d = new ctor() as this;
    d.id = this.id;
    d.applyAttributesFrom(this);
    // d._dirty stays empty; user mutations populate it.
    return d;
  }

  // ---- bindings ----

  /**
   * Cocoa `bind:toObject:withKeyPath:options:`. Keep `this[targetKey]` in
   * sync with `source.sourcePath`. Unlike a Controller, a Model has no
   * detach lifecycle — call `unbind` explicitly when done.
   */
  bind(targetKey: string, source: object, sourcePath: string, options?: BindOptions): void {
    bind(this, targetKey, source, sourcePath, options);
  }

  /** Cocoa `unbind:`. Tear down the binding for `targetKey`. */
  unbind(targetKey: string): void {
    unbind(this, targetKey);
  }
}

export function modelStoreFor<T extends Model>(cls: ModelClass<T>): ModelStore<T> {
  if (!Object.prototype.hasOwnProperty.call(cls, "store") || cls.store == null) {
    cls.store = new ModelStore<T>();
  }
  return cls.store;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
