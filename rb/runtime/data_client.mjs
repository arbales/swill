import {pack, unpack} from "./message_pack.mjs";
import {isOmittedArgument} from "./arguments.mjs";
import {resolve, nameOf} from "./install.mjs";
import {write} from "./paths.mjs";
import {disconnect} from "./properties.mjs";

const objectStates = new WeakMap();
const stores = new Map();
const tombstones = new Map();
let configuration = null;
let socket = null;
let connecting = null;
let actorScope = null;
let sequence = 0;
let generation = 0;
const activeGenerations = new Set();
const pending = new Map();
const queuedDemands = new Map();
let demandScheduled = false;

function state(object) {
  if (!objectStates.has(object)) {
    objectStates.set(object, {fields: new Map(), detached: false, original: null});
  }
  return objectStates.get(object);
}

function fieldState(object, name) {
  const fields = state(object).fields;
  if (!fields.has(name)) fields.set(name, {status: "unknown", error: null, generation: -1});
  return fields.get(name);
}

function modelStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function modelTombstones(name) {
  if (!tombstones.has(name)) tombstones.set(name, new Map());
  return tombstones.get(name);
}

function pruneTombstones() {
  if (!tombstones.size) return;
  let oldestActive = Number.MAX_SAFE_INTEGER;
  for (const active of activeGenerations) oldestActive = Math.min(oldestActive, active);
  for (const [name, removedObjects] of tombstones) {
    for (const [id, removed] of removedObjects) {
      if (removed.generation < oldestActive) removedObjects.delete(id);
    }
    if (!removedObjects.size) tombstones.delete(name);
  }
}

function canonical(name, id, responseGeneration = Number.MAX_SAFE_INTEGER, preferred = null) {
  const key = String(id);
  const store = modelStore(name);
  if (store.has(key)) return store.get(key);
  const removed = modelTombstones(name).get(key);
  if (removed && responseGeneration <= removed.generation) return removed.object;
  if (removed) modelTombstones(name).delete(key);
  const object = preferred ?? new (resolve(name))();
  object.applyAttributes({id: key});
  fieldState(object, "id").status = "present";
  store.set(key, object);
  return object;
}

function decodeValue(value, responseGeneration = Number.MAX_SAFE_INTEGER, preferred = null) {
  if (Array.isArray(value)) return value.map(item => decodeValue(item, responseGeneration, preferred));
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && value.$ref) {
      const usePreferred = preferred && modelName(preferred) === value.$ref[0] && preferred.id == null;
      return canonical(value.$ref[0], value.$ref[1], responseGeneration, usePreferred ? preferred : null);
    }
    if (Object.keys(value).length === 1 && value.$time) return new Date(value.$time);
    if (Object.keys(value).length === 1 && value.$date) return value.$date;
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, decodeValue(item, responseGeneration, preferred)]));
  }
  return value;
}

function encodeValue(value) {
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value instanceof Date) return {$time: value.toISOString()};
  if (value && typeof value === "object") {
    const name = value.constructor.dataModelName?.();
    if (name && value.id != null) return {$ref: [name, String(value.id)]};
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }
  return value;
}

function applyPatch(patch, preferred = null) {
  const usePreferred = preferred && modelName(preferred) === patch.model && preferred.id == null;
  const object = canonical(patch.model, patch.id, patch.generation, usePreferred ? preferred : null);
  const removed = modelTombstones(patch.model).get(String(patch.id));
  if (removed && patch.generation <= removed.generation) return object;
  for (const [name, encoded] of Object.entries(patch.fields ?? {})) {
    const slot = fieldState(object, name);
    if (patch.generation < slot.generation) continue;
    slot.generation = patch.generation;
    slot.status = "present";
    slot.error = null;
    const value = decodeValue(encoded, patch.generation);
    const descriptor = object.constructor.dataFields?.()[name];
    if (descriptor?.kind === "many") object[name].replace(value);
    else if (descriptor?.kind === "field" || name === "id") object.applyAttributes({[name]: value});
    else write(object, name, value);
  }
  return object;
}

function applyEnvelope(message, responseGeneration, preferred = null) {
  for (const patch of message.patches ?? []) applyPatch(patch, preferred);
  return decodeValue(message.value, responseGeneration, preferred);
}

function clearState() {
  for (const store of stores.values()) {
    for (const object of store.values()) {
      disconnect(object);
      objectStates.delete(object);
    }
  }
  stores.clear();
  tombstones.clear();
  queuedDemands.clear();
}

function openSocket() {
  if (!configuration) return Promise.reject(new Error("Swill data transport is not configured"));
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (connecting) return connecting;
  connecting = new Promise((resolveConnection, rejectConnection) => {
    const next = configuration.webSocketFactory(configuration.url);
    next.binaryType = "arraybuffer";
    next.addEventListener("open", () => {
      socket = next;
      sendRaw({type: "HELLO", protocol_version: 1, schema_hash: configuration.schemaHash})
        .then(message => {
          if (actorScope !== null && actorScope !== message.actor_scope) clearState();
          actorScope = message.actor_scope;
          resolveConnection(next);
          if (queuedDemands.size && !demandScheduled) {
            demandScheduled = true;
            queueMicrotask(flushDemands);
          }
        }, rejectConnection)
        .finally(() => { connecting = null; });
    });
    next.addEventListener("message", async event => {
      const bytes = event.data instanceof Blob ? new Uint8Array(await event.data.arrayBuffer()) : new Uint8Array(event.data);
      const message = unpack(bytes);
      const waiter = pending.get(message.request_id ?? "HELLO");
      if (!waiter) return;
      pending.delete(message.request_id ?? "HELLO");
      if (message.type === "ERROR") waiter.reject(remoteError(message.error));
      else waiter.resolve(message);
    });
    next.addEventListener("close", () => {
      if (socket === next) socket = null;
      for (const waiter of pending.values()) waiter.reject(new Error("Swill data connection closed"));
      pending.clear();
    });
    next.addEventListener("error", () => {
      if (socket === next) socket = null;
      connecting = null;
      const waiter = pending.get("HELLO");
      if (waiter) {
        pending.delete("HELLO");
        waiter.reject(new Error("Swill data connection failed"));
      }
      rejectConnection(new Error("Swill data connection failed"));
    });
  });
  return connecting;
}

function remoteError(error) {
  const result = new Error(error?.message ?? "Remote operation failed");
  result.code = error?.code;
  result.details = error?.details;
  return result;
}

function sendRaw(message) {
  const key = message.type === "HELLO" ? "HELLO" : message.request_id;
  return new Promise((resolveMessage, rejectMessage) => {
    pending.set(key, {resolve: resolveMessage, reject: rejectMessage});
    socket.send(pack(message));
  });
}

async function requestWithGeneration(type, contents, preferred = null) {
  await openSocket();
  const request_id = ++sequence;
  const operationGeneration = ++generation;
  activeGenerations.add(operationGeneration);
  try {
    const response = await sendRaw({type, request_id, generation: operationGeneration, ...contents});
    return {value: applyEnvelope(response, operationGeneration, preferred), generation: operationGeneration};
  } finally {
    activeGenerations.delete(operationGeneration);
    pruneTombstones();
  }
}

async function request(type, contents) {
  return (await requestWithGeneration(type, contents)).value;
}

function modelName(target) {
  const declared = typeof target === "function"
    ? target.dataModelName?.()
    : target.constructor.dataModelName?.();
  return declared ?? nameOf(target);
}

export function configureData(url, schemaHash, webSocketFactory = value => new WebSocket(value)) {
  if (configuration && (configuration.url !== url || configuration.schemaHash !== schemaHash)) closeData();
  configuration = {url, schemaHash, webSocketFactory};
}

export function closeData() {
  const current = socket;
  socket = null;
  connecting = null;
  actorScope = null;
  clearState();
  for (const waiter of pending.values()) waiter.reject(new Error("Swill data connection closed"));
  pending.clear();
  current?.close();
}

export function initializeDistantData(object) {
  for (const [field, descriptor] of Object.entries(object.constructor.dataFields?.() ?? {})) {
    if (descriptor.kind === "many") write(object, field, new (resolve("Swill::Model::Collection"))());
  }
}

export function dataQuery(klass, name, args, keywords) {
  return request("QUERY", {model: modelName(klass), name,
    arguments: encodeArguments(args), keywords: encodeKeywords(keywords)}).then(value => {
    if (!Array.isArray(value)) return value;
    const result = new (resolve("Swill::Model::ResultSet"))();
    result.replace(value);
    return result;
  });
}

export function dataResolve(klass, name, args, keywords) {
  return request("RESOLVE", {model: modelName(klass), name,
    arguments: encodeArguments(args), keywords: encodeKeywords(keywords)});
}

export function dataCommand(object, name, args, keywords) {
  return request("COMMAND", {model: modelName(object), id: object.id, name,
    arguments: encodeArguments(args), keywords: encodeKeywords(keywords)});
}

function assertMutable(object) {
  if (object.isDeleted) throw new Error("Cannot persist a deleted distant object");
  if (state(object).detached) throw new Error("Save a distant draft with original.apply_draft(draft)");
}

export async function dataSave(object) {
  assertMutable(object);
  const attributes = object.collectDirtyAttributes();
  if (object.id != null && Object.keys(attributes).length === 0) return object;
  const type = object.id == null ? "CREATE" : "UPDATE";
  const contents = {model: modelName(object), attributes: encodeValue(attributes)};
  if (object.id != null) contents.id = object.id;
  const {value} = await requestWithGeneration(type, contents, type === "CREATE" ? object : null);
  object.markClean();
  return value ?? object;
}

export function dataDraft(object) {
  if (object.isDeleted) throw new Error("Cannot draft a deleted distant object");
  if (object.id == null) throw new Error("Save a distant object before drafting it");
  const copy = new object.constructor();
  const copyState = state(copy);
  copyState.detached = true;
  copyState.original = object;
  const attributes = {};
  attributes.id = object.id;
  fieldState(copy, "id").status = "present";
  for (const [name, descriptor] of Object.entries(object.constructor.dataFields?.() ?? {})) {
    if (descriptor.kind !== "field" || !dataFieldLoaded(object, name)) continue;
    attributes[name] = object[name];
    fieldState(copy, name).status = "present";
  }
  copy.applyAttributes(attributes);
  copy.markClean();
  return copy;
}

export async function applyDataDraft(object, copy) {
  assertMutable(object);
  const copyState = state(copy);
  if (!copyState.detached || copyState.original !== object) {
    throw new Error("apply_draft requires a draft created from this distant object");
  }
  const attributes = copy.collectDirtyAttributes();
  if (Object.keys(attributes).length === 0) return object;
  await requestWithGeneration("UPDATE", {
    model: modelName(object), id: object.id, attributes: encodeValue(attributes)
  });
  copy.markClean();
  return object;
}

export async function dataDelete(object) {
  assertMutable(object);
  if (object.id == null) throw new Error("Cannot delete an unsaved distant object");
  const name = modelName(object);
  const id = String(object.id);
  const {generation: removedGeneration} = await requestWithGeneration("DELETE", {model: name, id});
  modelStore(name).delete(id);
  modelTombstones(name).set(id, {object, generation: removedGeneration});
  write(object, "deleted", true);
  queuedDemands.delete(`${name}:${id}`);
  disconnect(object);
  pruneTombstones();
  return object;
}

function encodeArguments(args) {
  const encoded = [];
  for (const value of args) if (!isOmittedArgument(value)) encoded.push(encodeValue(value));
  return encoded;
}

function encodeKeywords(keywords) {
  const encoded = {};
  for (const [name, value] of Object.entries(keywords)) {
    if (!isOmittedArgument(value)) encoded[name] = encodeValue(value);
  }
  return encoded;
}

export function dataFieldWillAccess(object, name) {
  if (state(object).detached || object.isDeleted) return;
  const slot = fieldState(object, name);
  if (slot.status !== "unknown" || object.id == null) return;
  slot.status = "loading";
  const key = `${modelName(object)}:${object.id}`;
  if (!queuedDemands.has(key)) queuedDemands.set(key, {object, fields: new Set()});
  queuedDemands.get(key).fields.add(name);
  if (!demandScheduled) {
    demandScheduled = true;
    queueMicrotask(flushDemands);
  }
}

async function flushDemands() {
  demandScheduled = false;
  const batch = [...queuedDemands.values()];
  queuedDemands.clear();
  if (!batch.length) return;
  try {
    await request("GET", {demands: batch.map(item => ({
      model: modelName(item.object), id: item.object.id, fields: [...item.fields]
    }))});
  } catch (error) {
    if (!socket) {
      for (const item of batch) {
        const key = `${modelName(item.object)}:${item.object.id}`;
        if (!queuedDemands.has(key)) queuedDemands.set(key, {object: item.object, fields: new Set()});
        for (const field of item.fields) queuedDemands.get(key).fields.add(field);
      }
    }
    for (const {object, fields} of batch) {
      for (const name of fields) {
        const slot = fieldState(object, name);
        slot.status = "failed";
        slot.error = error.message;
      }
    }
    console.warn(`[Swill] data did not load: ${error.message}`);
  }
}

export function dataFieldLoaded(object, name) { return fieldState(object, name).status === "present"; }
export function dataFieldLoading(object, name) { return fieldState(object, name).status === "loading"; }
export function dataFieldError(object, name) { return fieldState(object, name).error; }

export async function loadDataField(object, name, reload) {
  if (state(object).detached) throw new Error("A distant draft cannot hydrate fields");
  if (object.isDeleted) throw new Error("A deleted distant object cannot hydrate fields");
  if (object.id == null) throw new Error("An unsaved distant object cannot hydrate fields");
  const slot = fieldState(object, name);
  if (!reload && slot.status === "present") return object[name];
  slot.status = "loading";
  slot.error = null;
  try {
    await request("GET", {demands: [{model: modelName(object), id: object.id, fields: [name]}]});
    return object[name];
  } catch (error) {
    slot.status = "failed";
    slot.error = error.message;
    throw error;
  }
}
