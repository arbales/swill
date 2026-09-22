import {pack, unpack} from "./message_pack.mjs";

let configuration = null;
let socket = null;
let connecting = null;
let actorScope = null;
let sequence = 0;
const pending = new Map();
let resetCoordinator = () => {};
let connectionOpened = () => {};

export function registerDataLifecycle(reset, opened) {
  resetCoordinator = reset;
  connectionOpened = opened;
}

export function configureData(
  url,
  schemaHash,
  webSocketFactory = value => new WebSocket(value)
) {
  if (configuration &&
      (configuration.url !== url || configuration.schemaHash !== schemaHash)) {
    closeData();
  }
  configuration = {url, schemaHash, webSocketFactory};
}

export function closeData() {
  const current = socket;
  socket = null;
  connecting = null;
  actorScope = null;
  for (const waiter of pending.values()) {
    waiter.reject(new Error("Swill data connection closed"));
  }
  pending.clear();
  resetCoordinator();
  current?.close();
}

export function dataConnected() {
  return socket?.readyState === WebSocket.OPEN;
}

// Ruby supplies the protocol payload and receives an uninterpreted envelope.
export async function dataRequest(type, contents) {
  await openSocket();
  const request_id = ++sequence;
  const message = await sendRaw({type, request_id, ...contents});
  return {message, actor_scope: actorScope};
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
          actorScope = message.actor_scope;
          resolveConnection(next);
          connectionOpened();
        }, rejectConnection)
        .finally(() => { connecting = null; });
    });
    next.addEventListener("message", async event => {
      const bytes = event.data instanceof Blob
        ? new Uint8Array(await event.data.arrayBuffer())
        : new Uint8Array(event.data);
      const message = unpack(bytes);
      const waiter = pending.get(message.request_id ?? "HELLO");
      if (!waiter) return;
      pending.delete(message.request_id ?? "HELLO");
      if (message.type === "ERROR") waiter.reject(remoteError(message.error));
      else waiter.resolve(message);
    });
    next.addEventListener("close", () => {
      if (socket === next) socket = null;
      for (const waiter of pending.values()) {
        waiter.reject(new Error("Swill data connection closed"));
      }
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

function sendRaw(message) {
  const key = message.type === "HELLO" ? "HELLO" : message.request_id;
  return new Promise((resolveMessage, rejectMessage) => {
    pending.set(key, {resolve: resolveMessage, reject: rejectMessage});
    socket.send(pack(message));
  });
}

function remoteError(error) {
  const result = new Error(error?.message ?? "Remote operation failed");
  result.code = error?.code;
  result.details = error?.details;
  return result;
}

// Native probes keep browser representations out of protocol policy.
export function dataTime(value) {
  return value instanceof Date;
}

export function dataTimeIso(value) {
  return value.toISOString();
}

export function dataTimeFromIso(value) {
  return new Date(value);
}

export function dataRecord(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
