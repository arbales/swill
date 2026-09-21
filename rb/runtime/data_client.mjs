import {pack, unpack} from "./message_pack.mjs";
import {isOmittedArgument} from "./arguments.mjs";
import {resolve, nameOf} from "./install.mjs";
import {write} from "./paths.mjs";
import {disconnect} from "./properties.mjs";

const objectStates = new WeakMap();
const stores = new Map();
let configuration = null;
let socket = null;
let connecting = null;
let actorScope = null;
let sequence = 0;
let generation = 0;
const pending = new Map();
const queuedDemands = new Map();
let demandScheduled = false;

function state(object) {
  if (!objectStates.has(object)) {
    objectStates.set(object, {fields: new Map()});
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

function canonical(name, id) {
  const key = String(id);
  const store = modelStore(name);
  if (store.has(key)) return store.get(key);
  const object = new (resolve(name))();
  write(object, "id", key);
  fieldState(object, "id").status = "present";
  store.set(key, object);
  return object;
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && value.$ref) return canonical(value.$ref[0], value.$ref[1]);
    if (Object.keys(value).length === 1 && value.$time) return new Date(value.$time);
    if (Object.keys(value).length === 1 && value.$date) return value.$date;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
  }
  return value;
}

function encodeValue(value) {
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value instanceof Date) return {$time: value.toISOString()};
  if (value && typeof value === "object") {
    const name = value.constructor.remoteModelName?.();
    if (name && value.id != null) return {$ref: [name, String(value.id)]};
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }
  return value;
}

function applyPatch(patch) {
  const object = canonical(patch.model, patch.id);
  for (const [name, encoded] of Object.entries(patch.fields ?? {})) {
    const slot = fieldState(object, name);
    if (patch.generation < slot.generation) continue;
    slot.generation = patch.generation;
    slot.status = "present";
    slot.error = null;
    const value = decodeValue(encoded);
    const current = object[name];
    if (current && typeof current.replace === "function" && Array.isArray(value)) current.replace(value);
    else write(object, name, value);
  }
  return object;
}

function applyEnvelope(message) {
  for (const patch of message.patches ?? []) applyPatch(patch);
  return decodeValue(message.value);
}

function clearState() {
  for (const store of stores.values()) {
    for (const object of store.values()) {
      disconnect(object);
      objectStates.delete(object);
    }
  }
  stores.clear();
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

async function request(type, contents) {
  await openSocket();
  const request_id = ++sequence;
  const operationGeneration = ++generation;
  const response = await sendRaw({type, request_id, generation: operationGeneration, ...contents});
  return applyEnvelope(response);
}

function modelName(target) {
  const declared = typeof target === "function"
    ? target.remoteModelName?.()
    : target.constructor.remoteModelName?.();
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

export function initializeRemoteData(object) {
  for (const [field, descriptor] of Object.entries(object.constructor.remoteFields?.() ?? {})) {
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
