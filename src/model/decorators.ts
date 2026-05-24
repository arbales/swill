import type { Model, ModelClass } from "./model";

// Model decorators — `@attr` annotates each serializable property. Cocoa
// parallel: NSManagedObject's entity description + KVO-instrumented
// attribute setters.
//
// Model class identity (`static type` / `static url`) lives on the class
// itself; `@register` makes the class findable for JSON:API type lookup.
// `@attr` extends `@observable`'s fire-on-set `${name}DidChange`
// behavior with two model-specific concerns: marking the instance dirty,
// and per-attribute validation hooks (`validate<Name>(value, prev)`) that
// can reject or coerce a write before it lands. Relationships are
// observable too: `@hasMany accessor members` / `@hasOne accessor owner`
// fire `${name}DidChange` and expose object-shaped loading API
// (`membersLoading`, `reloadMembers()`).
//
// Both decorators piggyback on Symbol.metadata the same way the
// framework's `@observable` / `@outlet` do.

interface ModelMetadata {
  attrs?: Map<string, AttrDescriptor>;
  relationships?: Map<string, RelationshipDescriptor>;
}

interface AttrDescriptor {
  name: string;
  key: string;
}

interface AttrOptions {
  key?: string;
}

interface RelationshipDescriptor {
  name: string;
  key: string;
  kind: "hasMany" | "hasOne";
  type: () => ModelClass<Model>;
  url?: (owner: Model) => string;
}

interface RelationshipOptions {
  key?: string;
  type: () => ModelClass<Model>;
  url?: (owner: Model) => string;
}

type AccessorTarget = {
  get(this: any): any;
  set(this: any, value: any): void;
};

type AccessorContext = {
  name: string | symbol;
  metadata: object | null | undefined;
  addInitializer?(initializer: (this: any) => void): void;
};

function metaFor(context: { metadata: object | null | undefined }): ModelMetadata {
  return context.metadata as unknown as ModelMetadata;
}

function ensureOwnAttrMap(meta: ModelMetadata): Map<string, AttrDescriptor> {
  if (!Object.prototype.hasOwnProperty.call(meta, "attrs")) {
    meta.attrs = new Map(meta.attrs ?? []);
  }
  return meta.attrs!;
}

function ensureOwnRelationshipMap(meta: ModelMetadata): Map<string, RelationshipDescriptor> {
  if (!Object.prototype.hasOwnProperty.call(meta, "relationships")) {
    meta.relationships = new Map(meta.relationships ?? []);
  }
  return meta.relationships!;
}

const SYMBOL_METADATA: symbol =
  (Symbol as unknown as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

export function attrDescriptorsOf(instance: object): readonly AttrDescriptor[] {
  const meta = (instance.constructor as any)?.[SYMBOL_METADATA] as ModelMetadata | undefined;
  return meta?.attrs ? [...meta.attrs.values()] : [];
}

export function relationshipDescriptorOf(
  instance: object,
  name: string,
): RelationshipDescriptor | null {
  const meta = (instance.constructor as any)?.[SYMBOL_METADATA] as ModelMetadata | undefined;
  return meta?.relationships?.get(name) ?? null;
}

export function relationshipDescriptorsOf(instance: object): readonly RelationshipDescriptor[] {
  const meta = (instance.constructor as any)?.[SYMBOL_METADATA] as ModelMetadata | undefined;
  return meta?.relationships ? [...meta.relationships.values()] : [];
}

// ---- @attr ----

/**
 * Behaves like `@observable` (fires `${name}DidChange`) and *also*
 * records the property as a serializable attribute and marks it dirty
 * on the instance when set.
 *
 * Per-attribute validation — Cocoa `validateValue:forKey:error:` analog —
 * runs if the instance defines a `validate<Name>(value, prev)` method.
 * The setter calls it before writing:
 *
 * - throw → reject; current value preserved, no dirty/KVO fires.
 * - return non-undefined → coerce; that value is what gets written.
 * - return undefined → accept value as-is.
 *
 * @example
 * ```ts
 * @attr accessor name: string = "";
 * ```
 */
export function attr(targetOrOptions: AccessorTarget | AttrOptions, context?: AccessorContext): any {
  if (context) {
    return decorateAttr(targetOrOptions as AccessorTarget, context, {});
  }
  const options = targetOrOptions as AttrOptions;
  return (target: AccessorTarget, context: AccessorContext) => decorateAttr(target, context, options);
}

function decorateAttr(
  target: AccessorTarget,
  context: AccessorContext,
  options: AttrOptions,
): any {
  const name = String(context.name);
  ensureOwnAttrMap(metaFor(context)).set(name, { name, key: options.key ?? name });
  const callbackName = `${name}DidChange`;
  const validateName = `validate${name[0]!.toUpperCase()}${name.slice(1)}`;
  return {
    get(this: Model): any {
      return target.get.call(this);
    },
    set(this: Model, value: any): void {
      const prev = target.get.call(this);
      const validator = (this as any)[validateName];
      if (typeof validator === "function") {
        try {
          const coerced = validator.call(this, value, prev);
          if (coerced !== undefined) value = coerced;
        } catch (err) {
          console.warn(
            `[model] ${this.constructor.name}.${name} rejected: ${(err as Error).message}`,
          );
          return;
        }
      }
      target.set.call(this, value);
      this.markDirty(name, prev, value);
      const cb = (this as any)[callbackName];
      if (typeof cb === "function") cb.call(this, prev, value);
    },
  };
}

export function hasOne(options: RelationshipOptions) {
  return decorateRelationship("hasOne", options);
}

export function hasMany(options: RelationshipOptions) {
  return decorateRelationship("hasMany", options);
}

function decorateRelationship(kind: RelationshipDescriptor["kind"], options: RelationshipOptions) {
  return function (target: AccessorTarget, context: AccessorContext): any {
    const name = String(context.name);
    const callbackName = `${name}DidChange`;
    const loadingName = `${name}Loading`;
    const loadingCallbackName = `${loadingName}DidChange`;
    const reloadName = `reload${name[0]!.toUpperCase()}${name.slice(1)}`;
    ensureOwnRelationshipMap(metaFor(context)).set(name, {
      name,
      key: options.key ?? name,
      kind,
      type: options.type,
      url: options.url,
    });
    const loading = new WeakSet<Model>();

    const loadingFor = (instance: Model): boolean => loading.has(instance);
    const setLoading = (instance: Model, next: boolean): void => {
      const prev = loadingFor(instance);
      if (prev === next) return;
      if (next) loading.add(instance);
      else loading.delete(instance);
      const cb = (instance as any)[loadingCallbackName];
      if (typeof cb === "function") cb.call(instance, prev, next);
    };

    const load = async (instance: Model, reload: boolean): Promise<any> => {
      if (instance.id == null) return target.get.call(instance);
      if (!reload && instance.hasLoadedRelationship(name)) {
        return target.get.call(instance);
      }
      setLoading(instance, true);
      try {
        return kind === "hasOne"
          ? await instance.loadHasOne(name, { reload })
          : await instance.loadHasMany(name, { reload });
      } finally {
        setLoading(instance, false);
      }
    };

    context.addInitializer?.(function (this: Model): void {
      if (!(loadingName in this)) {
        Object.defineProperty(this, loadingName, {
          configurable: true,
          get: () => loadingFor(this),
        });
      }
      if (!(reloadName in this)) {
        Object.defineProperty(this, reloadName, {
          configurable: true,
          value: () => load(this, true),
        });
      }
    });

    return {
      get(this: Model): any {
        const value = target.get.call(this);
        if (
          this.id != null &&
          !this.hasLoadedRelationship(name) &&
          !loadingFor(this)
        ) {
          void load(this, false).catch((err) => {
            console.error(`[model] ${this.constructor.name}.${name} load failed`, err);
          });
        }
        return value;
      },
      set(this: Model, value: any): void {
        const prev = target.get.call(this);
        target.set.call(this, value);
        this.markRelationshipLoaded(name);
        setLoading(this, false);
        if (Object.is(prev, value)) return;
        const cb = (this as any)[callbackName];
        if (typeof cb === "function") cb.call(this, prev, value);
      },
    };
  };
}
