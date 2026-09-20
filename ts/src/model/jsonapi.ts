import { registeredClasses } from "../core/awakening/registry";
import { installDefaultCodec, type ModelCodec } from "./codec";
import { attrDescriptorsOf, relationshipDescriptorsOf } from "./decorators";
import type { Model, ModelClass } from "./model";
import { modelStoreFor } from "./model";
import type { ModelId } from "./store";

// JSON:API parsing/serialization. The wire shape we target matches what
// JSONAPI::Serializer emits on the Roda side:
//
//   {
//     "data": { "id": "42", "type": "user", "attributes": {...},
//               "relationships": { "groups": { "data": [{id,type}] }, ... } },
//     "included": [ ...nested resources... ]
//   }
//
// This module knows about resources but not about how to fetch them — the
// transport layer handles the network, then hands docs in here for parsing.

export interface JsonApiResource {
  // Optional only for client → server creates (server assigns id on POST).
  // Always present in server responses.
  id?: ModelId;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data: { id: ModelId; type: string } | { id: ModelId; type: string }[] | null }
  >;
}

export interface JsonApiDoc {
  data: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
  meta?: Record<string, unknown>;
}

export function lookupModelType(type: string): ModelClass<any> | null {
  for (const cls of registeredClasses()) {
    if ((cls as Partial<ModelClass<any>>).type === type) {
      return cls as ModelClass<any>;
    }
  }
  return null;
}

/**
 * Parse a JSON:API document into model instances. Pre-caches `included`
 * resources into their respective stores so relationship hydration sees
 * populated instances.
 *
 * Returns `null` when `doc.data` is null; an array when `doc.data` is a
 * collection; a single instance when `doc.data` is a single resource.
 * Callers that know which shape they expect should assert it.
 */
export function parseJsonApi<T extends Model>(
  cls: ModelClass<T>,
  doc: JsonApiDoc,
): T | T[] | null {
  const resources = [
    ...(doc.included ?? []),
    ...(doc.data == null ? [] : Array.isArray(doc.data) ? doc.data : [doc.data]),
  ];

  // Pool every resource first so relationship hydration can resolve
  // included objects by type/id without caring about document order.
  if (doc.included) {
    for (const r of doc.included) instantiateOrRefresh(r);
  }
  if (doc.data != null) {
    for (const r of Array.isArray(doc.data) ? doc.data : [doc.data]) instantiateOrRefresh(r);
  }

  for (const r of resources) hydrateRelationships(r);

  if (doc.data == null) return null;
  if (Array.isArray(doc.data)) return doc.data.map((r) => findPooledResource(r) as T);
  return findPooledResource(doc.data) as T;
}

export const jsonApiCodec: ModelCodec = {
  parseOne<T extends Model>(cls: ModelClass<T>, payload: unknown): T | null {
    const result = parseJsonApi(cls, payload as JsonApiDoc);
    if (Array.isArray(result)) {
      throw new Error("expected single JSON:API resource");
    }
    return result;
  },

  parseMany<T extends Model>(cls: ModelClass<T>, payload: unknown): T[] {
    const result = parseJsonApi(cls, payload as JsonApiDoc);
    if (!Array.isArray(result)) {
      throw new Error("expected JSON:API collection");
    }
    return result;
  },

  serialize(instance: Model, options: { dirtyOnly: boolean }): { data: JsonApiResource } {
    return serializeModel(instance, options);
  },
};

installDefaultCodec(jsonApiCodec);

function instantiateOrRefresh(resource: JsonApiResource): Model | null {
  const cls = lookupModelType(resource.type);
  if (!cls) {
    console.warn(`[model] no class registered for type "${resource.type}"`);
    return null;
  }
  if (resource.id == null) {
    console.warn(`[model] response resource missing id (type=${resource.type})`);
    return null;
  }
  const store = modelStoreFor(cls);
  let instance = store.get(resource.id);
  if (!instance) {
    instance = new cls() as Model;
    instance.id = resource.id;
  }
  if (resource.attributes) {
    instance.applyAttributesFrom(resource.attributes);
  }
  // Relationships: stored as raw ids on the instance for now; HasOne/HasMany
  // wrappers (added in a later step) read from this slot. Until then, the
  // relationships are inert metadata.
  if (resource.relationships) {
    instance._relationships = resource.relationships;
  }
  store.put(instance);
  return instance;
}

function findPooledResource(resource: JsonApiResource): Model | null {
  const cls = lookupModelType(resource.type);
  if (!cls || resource.id == null) return null;
  return modelStoreFor(cls).get(resource.id) ?? null;
}

function hydrateRelationships(resource: JsonApiResource): void {
  const instance = findPooledResource(resource);
  if (!instance || !resource.relationships) return;

  for (const descriptor of relationshipDescriptorsOf(instance)) {
    const linkage = resource.relationships[descriptor.key] ?? resource.relationships[descriptor.name];
    if (!linkage) continue;

    if (descriptor.kind === "hasOne") {
      if (Array.isArray(linkage.data)) continue;
      if (linkage.data == null) {
        (instance as any)[descriptor.name] = null;
        instance.markRelationshipLoaded(descriptor.name);
        continue;
      }
      const related = findPooledResource(linkage.data);
      if (!related) continue;
      (instance as any)[descriptor.name] = related;
      instance.markRelationshipLoaded(descriptor.name);
      continue;
    }

    if (!Array.isArray(linkage.data)) continue;
    const related = linkage.data.map(findPooledResource).filter((m): m is Model => m != null);
    if (related.length !== linkage.data.length) continue;
    (instance as any)[descriptor.name] = related;
    instance.markRelationshipLoaded(descriptor.name);
  }
}

/** Serialize a single model instance for PATCH/POST. Includes only dirty
 * attributes (caller decides — pass empty Set for a full create). */
export function serializeModel(
  instance: Model,
  options: { dirtyOnly: boolean } = { dirtyOnly: true },
): { data: JsonApiResource } {
  const ctor = instance.constructor as ModelClass<Model>;
  const dirty = options.dirtyOnly ? new Set(instance.dirty) : null;
  const filtered: Record<string, unknown> = {};
  for (const attr of attrDescriptorsOf(instance)) {
    if (dirty == null || dirty.has(attr.name)) {
      filtered[attr.key] = (instance as any)[attr.name];
    }
  }
  return {
    data: {
      type: ctor.type,
      ...(instance.id != null ? { id: instance.id } : {}),
      attributes: filtered,
    },
  };
}
