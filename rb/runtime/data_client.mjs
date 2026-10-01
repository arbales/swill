import {pack, unpack} from "./message_pack.mjs";

const HANDSHAKE_TIMEOUT = 10_000;

let configuration = null;
let connection = null;
let actorScope = null;
let terminalError = null;
let sequence = 0;
let resetCoordinator = () => {};
let connectionOpened = () => {};
let connectionChanged = () => {};

// Ruby owns retry policy and presentation; this module owns one socket attempt.
export function registerDataLifecycle(reset, opened, changed = () => {}) {
  resetCoordinator = reset;
  connectionOpened = opened;
  connectionChanged = changed;
}

/** Configure the lazy connection. A different endpoint or schema resets it. */
export function configureData(url, schemaHash, webSocketFactory = value => new WebSocket(value)) {
  url = websocketURL(url);
  if (configuration && (configuration.url !== url || configuration.schemaHash !== schemaHash)) closeData();
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

/** Intentional shutdown cancels pending work and forgets the previous identity. */
export function closeData() {
  const previous = connection;
  connection = null;
  if (previous) dispose(previous, transportError("Swill data connection closed"));
  actorScope = null;
  terminalError = null;
  resetCoordinator();
  connectionChanged("idle", "");
}

/** An open socket is usable only after WELCOME. */
export function dataConnected() {
  return connection?.ready === true;
}

/** Open or join the current attempt; never replay a request. */
export function connectData() {
  if (terminalError) return Promise.reject(terminalError);
  if (!configuration) return Promise.reject(new Error("Swill data transport is not configured"));
  if (connection) return connection.promise;

  const attempt = {socket: null, ready: false, pending: new Map(), timer: null};
  attempt.promise = new Promise((resolve, reject) => {
    attempt.resolve = resolve;
    attempt.reject = reject;
  });
  connection = attempt;
  connectionChanged("connecting", "");
  attempt.timer = setTimeout(() => fail(attempt, transportError("Swill data connection timed out")), HANDSHAKE_TIMEOUT);
  try {
    const next = configuration.webSocketFactory(configuration.url);
    attempt.socket = next;
    next.binaryType = "arraybuffer";
    next.addEventListener("open", () => {
      if (connection !== attempt) return;
      sendRaw(attempt, {type: "HELLO", protocol_version: 2, schema_hash: configuration.schemaHash})
        .then(message => {
          if (connection !== attempt) return;
          if (message.type !== "WELCOME" || message.protocol_version !== 2 || message.schema_hash !== configuration.schemaHash) {
            throw remoteError({code: "schema_mismatch", message: "The application has changed. Reload to continue."});
          }
          if (actorScope !== null && actorScope !== message.actor_scope) {
            resetCoordinator();
            throw remoteError({code: "actor_scope_changed", message: "Your session has changed. Reload to continue."});
          }
          actorScope = message.actor_scope;
          clearTimeout(attempt.timer);
          attempt.ready = true;
          connectionChanged("connected", "");
          connectionOpened();
          attempt.resolve(attempt);
        }).catch(error => fail(attempt, error));
    });
    next.addEventListener("message", async event => {
      try {
        const bytes = event.data instanceof Blob
          ? new Uint8Array(await event.data.arrayBuffer()) : new Uint8Array(event.data);
        if (connection !== attempt) return;
        const message = unpack(bytes);
        const key = message.request_id ?? "HELLO";
        const waiter = attempt.pending.get(key);
        if (!waiter) return;
        attempt.pending.delete(key);
        if (message.type === "ERROR") waiter.reject(remoteError(message.error));
        else waiter.resolve(message);
      } catch (error) {
        fail(attempt, transportError("Invalid data response", error));
      }
    });
    next.addEventListener("close", () => fail(attempt, transportError("Swill data connection closed")));
    next.addEventListener("error", () => fail(attempt, transportError("Swill data connection failed")));
  } catch (error) {
    fail(attempt, transportError("Swill data connection failed", error));
  }
  return attempt.promise;
}

export async function dataRequest(type, contents) {
  const attempt = await connectData();
  if (connection !== attempt || !attempt.ready) throw terminalError ?? transportError("Swill data connection closed");
  const message = await sendRaw(attempt, {...contents, type, request_id: ++sequence});
  return {message, actor_scope: actorScope};
}

function fail(attempt, error) {
  if (connection !== attempt) return;
  connection = null;
  const reload = ["schema_mismatch", "actor_scope_changed"].includes(error.code);
  if (reload) terminalError = error;
  dispose(attempt, error);
  connectionChanged(reload ? "reload_required" : "disconnected", error.message);
}

function dispose(attempt, error) {
  clearTimeout(attempt.timer);
  attempt.ready = false;
  attempt.reject(error);
  for (const waiter of attempt.pending.values()) {
    // A sent operation may have committed even though its reply was lost.
    waiter.reject(waiter.write && waiter.sent
      ? transportError("The connection was lost. The operation may have completed; check its result before trying again.", error, "outcome_unknown")
      : error);
  }
  attempt.pending.clear();
  attempt.socket?.close();
}

function sendRaw(attempt, message) {
  const bytes = pack(message);
  const key = message.type === "HELLO" ? "HELLO" : message.request_id;
  return new Promise((resolve, reject) => {
    const waiter = {resolve, reject, sent: false, write: !["HELLO", "QUERY", "GET"].includes(message.type)};
    attempt.pending.set(key, waiter);
    try {
      attempt.socket.send(bytes);
      waiter.sent = true;
    } catch (error) {
      fail(attempt, transportError("Swill data connection failed", error));
    }
  });
}

function transportError(message, cause, code = "connection_lost") {
  return Object.assign(new Error(message, {cause}), {code});
}

function remoteError(error) {
  return Object.assign(new Error(error?.message ?? "Remote operation failed"), {
    code: error?.code, details: error?.details
  });
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
