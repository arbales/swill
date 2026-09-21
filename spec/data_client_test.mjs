import test from "node:test";
import assert from "node:assert/strict";
import {Runtime} from "../rb/runtime/runtime.mjs";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";
import {
  Swill__Model__Base as Base,
  Swill__Model__Collection as Collection,
  Swill__Model__ResultSet as ResultSet
} from "../build/framework.mjs";

test("MessagePack preserves safe 64-bit integers and inert map keys", () => {
  const value = {large: 2 ** 40, negative: -(2 ** 40), ["__proto__"]: "data"};
  const decoded = unpack(pack(value));
  assert.equal(decoded.large, value.large);
  assert.equal(decoded.negative, value.negative);
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.hasOwn(decoded, "__proto__"), true);
});

class Post extends Base {}

Runtime.install({classes: {Post: {
  constructor: Post,
  properties: {
    title: {type: "T.nilable(String)", willAccess: true, defaultValue: () => null},
    body: {type: "T.nilable(String)", willAccess: true, defaultValue: () => null},
    comments: {type: "Swill::Model::Collection", willAccess: true, defaultValue: () => null}
  },
  registries: {remoteFields: {
    title: {kind: "field", type: "T.nilable(String)"},
    body: {kind: "field", type: "T.nilable(String)"},
    comments: {kind: "many", model: "Post"}
  }},
  settings: [{js: "remoteModelName", value: "Post"}]
}}});

class FakeWebSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = 0;
    this.listeners = new Map();
    this.requests = [];
    this.resolvers = [];
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", {});
    });
  }

  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }

  emit(name, event) {
    for (const callback of this.listeners.get(name) ?? []) callback(event);
  }

  send(bytes) {
    const request = unpack(bytes);
    this.requests.push(request);
    let response;
    if (request.type === "HELLO") {
      response = {type: "WELCOME", protocol_version: 1, schema_hash: "schema", actor_scope: "actor-1"};
    } else if (request.type === "QUERY") {
      response = {
        type: "RESULT", request_id: request.request_id,
        value: [{"$ref": ["Post", "1"]}],
        patches: [{model: "Post", id: "1", generation: request.generation, fields: {title: "Hello"}}]
      };
    } else if (request.type === "RESOLVE") {
      this.resolvers.push(request);
      if (this.resolvers.length < 2) return;
      const [older, newer] = this.resolvers;
      for (const current of [newer, older]) {
        const reply = {
          type: "RETURN", request_id: current.request_id, value: {"$ref": ["Post", "1"]},
          patches: [{model: "Post", id: "1", generation: current.generation,
            fields: {title: current === newer ? "Newer" : "Older"}}]
        };
        queueMicrotask(() => this.emit("message", {data: pack(reply).buffer}));
      }
      return;
    } else {
      response = {
        type: "RETURN", request_id: request.request_id, value: null,
        patches: [{model: "Post", id: "1", generation: request.generation, fields: {body: null}}]
      };
    }
    queueMicrotask(() => this.emit("message", {data: pack(response).buffer}));
  }
}

test("queries return canonical ResultSets and unknown fields hydrate", async () => {
  globalThis.WebSocket = FakeWebSocket;
  let transport;
  Runtime.configureData("ws://fixture", "schema", () => (transport = new FakeWebSocket()));
  assert.ok(new Post().comments instanceof Collection);

  const results = await Runtime.dataQuery(Post, "search", ["Hello"], {});
  assert.ok(results instanceof ResultSet);
  assert.equal(results.isLoaded(), true);
  const post = results.first();
  assert.equal(post.title, "Hello");

  await Runtime.dataQuery(Post, "search",
    [Runtime.omittedArgument(), null],
    {limit: Runtime.omittedArgument(), explicit: null});
  const encoded = transport.requests.filter(request => request.type === "QUERY").at(-1);
  assert.deepEqual(encoded.arguments, [null]);
  assert.deepEqual(encoded.keywords, {explicit: null});
  assert.equal(Runtime.dataFieldLoaded(post, "title"), true);

  assert.equal(post.body, null);
  assert.equal(Runtime.dataFieldLoading(post, "body"), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(Runtime.dataFieldLoaded(post, "body"), true);
  assert.equal(post.body, null, "known nil reads exactly like unknown nil");
  assert.equal(transport.requests.filter(request => request.type === "GET").length, 1);

  const older = Runtime.dataResolve(Post, "find", ["1"], {});
  const newer = Runtime.dataResolve(Post, "find", ["1"], {});
  const [sameFromOlder, sameFromNewer] = await Promise.all([older, newer]);
  assert.equal(sameFromOlder, post);
  assert.equal(sameFromNewer, post);
  assert.equal(post.title, "Newer", "an older response cannot replace a newer field");
});
