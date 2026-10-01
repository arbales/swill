import test from "node:test";
import assert from "node:assert/strict";
import * as transport from "../rb/runtime/data_client.mjs";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";

class Socket {
  listeners = new Map();
  sent = [];
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  emit(name, value = {}) { this.listeners.get(name)?.(value); }
  send(bytes) { this.sent.push(unpack(bytes)); }
  close() { this.emit("close"); }
  welcome(scope = "actor") {
    this.emit("message", {data: pack({type: "WELCOME", protocol_version: 2, schema_hash: "schema", actor_scope: scope})});
  }
}
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture() {
  transport.closeData();
  const sockets = [], states = [];
  let resets = 0;
  transport.registerDataLifecycle(() => resets++, () => {}, (state, detail) => states.push([state, detail]));
  transport.configureData("ws://transport-test", "schema", () => {
    const socket = new Socket(); sockets.push(socket); return socket;
  });
  return {sockets, states, get resets() { return resets; }};
}

test("requests wait for WELCOME and concurrent callers share one attempt", async () => {
  const f = fixture();
  try {
    const one = transport.dataRequest("QUERY", {name: "one"});
    const two = transport.dataRequest("QUERY", {name: "two"});
    assert.equal(f.sockets.length, 1);
    const socket = f.sockets[0];
    socket.emit("open");
    await turn();
    assert.equal(transport.dataConnected(), false);
    assert.deepEqual(socket.sent.map(m => m.type), ["HELLO"]);
    socket.welcome();
    await turn();
    assert.equal(transport.dataConnected(), true);
    for (const request of socket.sent.slice(1)) {
      socket.emit("message", {data: pack({type: "RESULT", request_id: request.request_id})});
    }
    await Promise.all([one, two]);
    assert.deepEqual(f.states.map(s => s[0]), ["connecting", "connected"]);
  } finally { transport.closeData(); }
});

test("close before open settles the attempt and stale events cannot affect a replacement", async () => {
  const f = fixture();
  try {
    const opening = transport.connectData();
    const failed = assert.rejects(opening, {code: "connection_lost"});
    f.sockets[0].close();
    await failed;
    const next = transport.dataRequest("QUERY", {});
    const current = f.sockets[1];
    current.emit("open");
    current.welcome();
    await turn();
    f.sockets[0].emit("error");
    f.sockets[0].emit("open");
    f.sockets[0].close();
    f.sockets[0].welcome("obsolete-actor");
    assert.equal(transport.dataConnected(), true);
    current.emit("message", {data: pack({type: "RESULT", request_id: current.sent[1].request_id})});
    await next;
    assert.equal(f.resets, 0, "transient failures retain identity");
  } finally { transport.closeData(); }
});

test("lost writes have an uncertain outcome, and reconnect never replays requests", async () => {
  const f = fixture();
  try {
    const write = transport.dataRequest("UPDATE", {id: "1"});
    const failed = assert.rejects(write, {code: "outcome_unknown"});
    const socket = f.sockets[0];
    socket.emit("open"); socket.welcome();
    await turn();
    socket.close();
    await failed;
    assert.equal(f.resets, 0);
    const next = transport.connectData();
    f.sockets[1].emit("open"); f.sockets[1].welcome();
    await next;
    assert.deepEqual(f.sockets[1].sent.map(m => m.type), ["HELLO"]);
  } finally { transport.closeData(); }
});

for (const mismatch of ["schema", "protocol", "actor"]) {
  test(`${mismatch} mismatch requires reload and blocks subsequent operations`, async () => {
    const f = fixture();
    try {
      if (mismatch === "actor") {
        const first = transport.connectData();
        f.sockets[0].emit("open"); f.sockets[0].welcome();
        await first;
        f.sockets[0].close();
      }
      const opening = transport.connectData();
      const code = mismatch === "actor" ? "actor_scope_changed" : "schema_mismatch";
      const failure = assert.rejects(opening, {code});
      const socket = f.sockets.at(-1);
      socket.emit("open");
      if (mismatch === "actor") socket.welcome("another-actor");
      else socket.emit("message", {data: pack({type: "WELCOME", protocol_version: mismatch === "protocol" ? 3 : 2, schema_hash: "other", actor_scope: "actor"})});
      await failure;
      await assert.rejects(transport.dataRequest("QUERY", {}), {code});
      assert.equal(f.states.at(-1)[0], "reload_required");
      assert.equal(transport.dataConnected(), false);
      if (mismatch === "actor") assert.equal(f.resets, 1);
    } finally { transport.closeData(); }
  });
}

test("a silent handshake times out and intentional close cancels its timer", async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let id = 0;
  globalThis.setTimeout = (callback, delay) => { timers.set(++id, {callback, delay}); return id; };
  globalThis.clearTimeout = key => timers.delete(key);
  const f = fixture();
  try {
    const opening = transport.connectData();
    const failure = assert.rejects(opening, /timed out/);
    assert.equal(timers.get(id).delay, 10000);
    timers.get(id).callback();
    await failure;
    assert.equal(timers.size, 0);
    const next = transport.connectData();
    const closed = assert.rejects(next, /closed/);
    transport.closeData();
    await closed;
    assert.equal(timers.size, 0);
    assert.equal(f.states.at(-1)[0], "idle");
  } finally {
    transport.closeData();
    globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
  }
});

test("a write rejected before send does not claim an uncertain outcome", async () => {
  const f = fixture();
  try {
    const opening = transport.connectData();
    const socket = f.sockets[0];
    socket.emit("open"); socket.welcome();
    await opening;
    socket.send = () => { throw new Error("not sent"); };
    await assert.rejects(transport.dataRequest("UPDATE", {}), {code: "connection_lost"});
  } finally { transport.closeData(); }
});
