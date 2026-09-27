import {pack, unpack} from "./message_pack.mjs";

let configuration = null;
let socket = null;
let connecting = null;
let actorScope = null;
let sequence = 0;
const pending = new Map();
let resetCoordinator = () => {};
let connectionOpened = () => {};

/**
 * Registers the functions the data client calls when the connection closes,
 * and when it opens and the server has answered the handshake.
 *
 * @param {() => void} reset Called when the connection closes.
 * @param {() => void} opened Called after the handshake succeeds.
 * @returns {void}
 */
export function registerDataLifecycle(reset, opened) {
  resetCoordinator = reset;
  connectionOpened = opened;
}

/**
 * Configures the data connection, which opens on the first request, to reach
 * `url` with the schema `schemaHash`. An `http` or `https` URL is connected to
 * as `ws` or `wss`, relative to the page. A different URL or schema closes the
 * current connection.
 *
 * @param {string} url
 * @param {string} schemaHash The schema the client was generated from, which
 *   the server checks in the handshake.
 * @param {(url: string) => WebSocket} [webSocketFactory] Opens the socket;
 *   `new WebSocket(url)` by default.
 * @returns {void}
 * @throws {TypeError} `Unsupported data URL protocol`.
 */
export function configureData(
  url,
  schemaHash,
  webSocketFactory = value => new WebSocket(value)
) {
  url = websocketURL(url);
  if (configuration &&
      (configuration.url !== url || configuration.schemaHash !== schemaHash)) {
    closeData();
  }
  configuration = {url, schemaHash, webSocketFactory};
}

function websocketURL(value) {
  const url = new URL(value, globalThis.location?.href ?? "http://localhost/");
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new TypeError(`Unsupported data URL protocol: ${url.protocol}`);
  }
  return url.href;
}

/**
 * Closes the data connection. Every request still waiting for a reply is
 * rejected, and the data client resets.
 *
 * @returns {void}
 */
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

/**
 * Returns whether the data connection is open.
 *
 * @returns {boolean}
 */
export function dataConnected() {
  return socket?.readyState === WebSocket.OPEN;
}

/**
 * Sends a request of `type` with `contents` over the data connection,
 * opening it first if needed, and returns a promise for the reply and the
 * actor scope the handshake named. The data client builds the request and
 * interprets the reply; they travel as MessagePack.
 *
 * @param {string} type The request type.
 * @param {object} contents The request's fields.
 * @returns {Promise<{message: object, actor_scope: unknown}>}
 * @throws {Error} When the transport is not configured, the connection fails
 *   or closes, or the server answers with an error, whose `code` and `details`
 *   it carries.
 */
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
      sendRaw({type: "HELLO", protocol_version: 2, schema_hash: configuration.schemaHash})
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

/**
 * Returns whether `value` is a date.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function dataTime(value) {
  return value instanceof Date;
}

/**
 * Returns `value` as an ISO 8601 string.
 *
 * @param {Date} value
 * @returns {string}
 */
export function dataTimeIso(value) {
  return value.toISOString();
}

/**
 * Returns the date the ISO 8601 string `value` represents.
 *
 * @param {string} value
 * @returns {Date}
 */
export function dataTimeFromIso(value) {
  return new Date(value);
}

/**
 * Returns whether `value` is a plain record: an object that is not an array, a
 * date, or an instance of a class.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function dataRecord(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
