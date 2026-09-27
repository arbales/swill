import test from "node:test";
import assert from "node:assert/strict";
import {Runtime} from "../rb/runtime/runtime.mjs";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";
import {
  Swill__Model__DistantObject as DistantObject,
  Swill__Model__DistantClient as DistantClient,
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

class Post extends DistantObject {}

Runtime.install({classes: {Post: {
  constructor: Post,
  properties: {
    title: {type: "T.nilable(String)", attribute: true, key: "title", willAccess: true, defaultValue: () => null},
    body: {type: "T.nilable(String)", attribute: true, key: "body", willAccess: true, defaultValue: () => null},
    comment_count: {type: "Integer", compute() { return this.comments.size(); }},
    author: {type: "T.nilable(Post)", willAccess: true, defaultValue: () => null},
    comments: {type: "Swill::Model::Collection", willAccess: true, defaultValue: () => null}
  },
  registries: {
    modelAttributes: {
      id: {name: "id", key: "id", type: "T.nilable(String)", default: null},
      title: {name: "title", key: "title", type: "T.nilable(String)", default: null},
      body: {name: "body", key: "body", type: "T.nilable(String)", default: null}
    },
    dataFields: {
      title: {kind: "field", type: "T.nilable(String)"},
      body: {kind: "field", type: "T.nilable(String)"},
      author: {kind: "one", model: "Post"},
      comments: {kind: "many", model: "Post"}
    }
  },
  settings: [{js: "dataModelName", value: "Post"}]
}}});

class FakeWebSocket {
  static OPEN = 1;
  static actorScope = "actor-1";

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

  close() {
    this.readyState = 3;
    this.emit("close", {});
  }

  releaseHeldQuery() {
    const request = this.heldQuery;
    this.heldQuery = null;
    const response = {
      type: "RESULT", request_id: request.request_id,
      value: [{"$ref": ["Post", "2"]}],
      patches: [{model: "Post", id: "2", generation: request.generation, fields: {title: "Stale"}}]
    };
    this.emit("message", {data: pack(response).buffer});
  }

  send(bytes) {
    const request = unpack(bytes);
    this.requests.push(request);
    let response;
    if (request.type === "HELLO") {
      response = {type: "WELCOME", protocol_version: 2, schema_hash: "schema",
        actor_scope: FakeWebSocket.actorScope};
    } else if (request.type === "QUERY") {
      if (this.holdNextQuery) {
        this.holdNextQuery = false;
        this.heldQuery = request;
        return;
      }
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
    } else if (request.type === "CREATE") {
      response = {
        type: "RETURN", request_id: request.request_id,
        value: {"$ref": ["Post", "2"]},
        patches: [{model: "Post", id: "2", generation: request.generation,
          fields: request.attributes}]
      };
    } else if (request.type === "UPDATE") {
      response = {
        type: "RETURN", request_id: request.request_id,
        value: {"$ref": ["Post", String(request.id)]},
        patches: [{model: "Post", id: String(request.id), generation: request.generation,
          fields: request.attributes}]
      };
    } else if (request.type === "DELETE") {
      response = {type: "RETURN", request_id: request.request_id, value: null, patches: []};
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

  const results = await DistantClient.default().query("Post", "search", ["Hello"], {}, "result_set");
  assert.ok(results instanceof ResultSet);
  assert.equal(results.isLoaded(), true);
  const post = results.first();
  assert.equal(post.title, "Hello");
  assert.equal(post.isDirty, false, "server identity does not become a local edit");

  await DistantClient.default().query("Post", "search",
    [Runtime.omittedArgument(), null],
    {limit: Runtime.omittedArgument(), explicit: null}, "result_set");
  const encoded = transport.requests.filter(request => request.type === "QUERY").at(-1);
  assert.deepEqual(encoded.arguments, [null]);
  assert.deepEqual(encoded.keywords, {explicit: null});
  assert.equal(post.isFieldLoaded("title"), true);

  assert.equal(post.body, null);
  assert.equal(post.isFieldLoading("body"), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(post.isFieldLoaded("body"), true);
  assert.equal(post.body, null, "known nil reads exactly like unknown nil");
  assert.equal(transport.requests.filter(request => request.type === "GET").length, 1);

  const older = DistantClient.default().resolve("Post", "find", ["1"], {}, "model");
  const newer = DistantClient.default().resolve("Post", "find", ["1"], {}, "model");
  const [sameFromOlder, sameFromNewer] = await Promise.all([older, newer]);
  assert.equal(sameFromOlder, post);
  assert.equal(sameFromNewer, post);
  assert.equal(post.title, "Newer", "an older response cannot replace a newer field");
});

test("distant drafts persist only after acceptance and deletion is observable", async () => {
  globalThis.WebSocket = FakeWebSocket;
  let transport;
  Runtime.configureData("ws://fixture-lifecycle", "schema", () => (transport = new FakeWebSocket()));

  const post = new Post();
  post.title = "Created";
  assert.equal(post.isDraft(), false);
  assert.throws(() => post.draft(), /before drafting/);
  const saved = await post.save();
  assert.equal(saved, post, "the newly assigned identity keeps the original object canonical");
  assert.equal(post.id, "2");
  assert.equal(post.isDirty, false);

  const draft = post.draft();
  assert.equal(draft.isDraft(), true);
  draft.title = "Edited";
  assert.equal(post.title, "Created", "editing a draft does not expose unaccepted values");
  await post.applyDraft(draft);
  assert.equal(post.title, "Edited");
  assert.equal(draft.isDirty, false);
  await assert.rejects(draft.save(), /original\.apply_draft/);

  transport.holdNextQuery = true;
  const stale = DistantClient.default().query("Post", "search", ["stale"], {}, "result_set");
  await new Promise(resolve => setTimeout(resolve, 0));
  await post.delete();
  assert.equal(post.isDeleted, true);
  transport.releaseHeldQuery();
  const staleResults = await stale;
  assert.equal(staleResults.first(), post, "an older response retains the deleted tombstone identity");
  assert.equal(post.title, "Edited", "an older response cannot resurrect deleted data");
  await assert.rejects(post.save(), /deleted distant object/);
  assert.equal(transport.requests.filter(request => request.type === "CREATE").length, 1);
  assert.equal(transport.requests.filter(request => request.type === "UPDATE").length, 1);
  assert.equal(transport.requests.filter(request => request.type === "DELETE").length, 1);
});

test("dirty fields survive background patches and actor changes replace identity", async () => {
  globalThis.WebSocket = FakeWebSocket;
  FakeWebSocket.actorScope = "actor-1";
  let transport;
  Runtime.configureData("ws://fixture-scope", "schema", () => (transport = new FakeWebSocket()));

  const first = (await DistantClient.default().query(
    "Post", "search", [], {}, "result_set"
  )).first();
  first.title = "Local edit";
  const same = (await DistantClient.default().query(
    "Post", "search", [], {}, "result_set"
  )).first();
  assert.equal(same, first);
  assert.equal(first.title, "Local edit", "a background patch does not replace a dirty field");

  const plain = await DistantClient.default().query("Post", "search", [], {}, "array");
  assert.equal(Array.isArray(plain), true, "schema cardinality controls result wrapping");
  assert.equal(plain instanceof ResultSet, false);

  transport.close();
  FakeWebSocket.actorScope = "actor-2";
  const replacement = (await DistantClient.default().query(
    "Post", "search", [], {}, "result_set"
  )).first();
  assert.notEqual(replacement, first);
  assert.equal(replacement.title, "Hello");
  FakeWebSocket.actorScope = "actor-1";
});


test("relationship membership is read-only while query results remain editable", () => {
  const post = new Post();
  const comments = post.comments;
  const author = new Post();
  assert.throws(() => { post.author = author; }, /read-only/);
  post.applyDataField("author", author, 1, false);
  assert.equal(post.author, author);
  assert.throws(() => { post.comments = []; }, /read-only/);
  assert.throws(() => { comments.records = []; }, /read-only/);
  assert.throws(() => comments.replace([]), /read-only/);
  assert.throws(() => comments.records.push(post), TypeError);
  const incoming = [new Post()];
  post.applyDataField("comments", incoming, 1, false);
  incoming.length = 0;
  assert.equal(comments.size(), 1, "hydration copies the supplied membership");
  assert.equal(post.comments, comments);
  assert.throws(() => comments.records.pop(), TypeError);
  assert.equal(new ResultSet().replace([post]).first(), post);
});

test("relationship loading, errors, retry, and reset follow owner state", () => {
  const post = new Post();
  const comments = post.comments;
  assert.equal(comments.isLoaded(), false);
  const loading = [];
  const stop = Runtime.observe(comments, "loading", value => loading.push(value));
  post.beginDataFieldLoad("comments", false);
  assert.equal(comments.isLoading(), post.isFieldLoading("comments"));
  post.failDataField("comments", "try again");
  assert.equal(comments.error, post.fieldError("comments"));
  assert.equal(comments.isLoading(), false);
  post.beginDataFieldLoad("comments", false);
  assert.equal(comments.error, null);
  post.applyDataField("comments", [], 3, false);
  assert.equal(comments.isLoaded(), post.isFieldLoaded("comments"));
  assert.equal(comments.isLoaded(), true);
  post.applyDataField("comments", [new Post()], 2, false);
  assert.equal(comments.size(), 0, "stale hydration cannot replace membership");
  post.resetDataFields();
  assert.equal(comments.isLoaded(), false);
  assert.deepEqual(loading, [true, false, true, false]);
  stop();
});


class EffectsWebSocket extends FakeWebSocket {
  send(bytes) {
    const request = unpack(bytes);
    if (request.type !== "GET" && request.type !== "COMMAND") return super.send(bytes);
    this.requests.push(request);
    if (request.type === "GET" && this.failNextGet) {
      this.failNextGet = false;
      const error = {type: "ERROR", request_id: request.request_id,
        error: {code: "refresh_failed", message: "retry later", details: {retry: true}}};
      queueMicrotask(() => this.emit("message", {data: pack(error).buffer}));
      return;
    }
    const response = {type: "RETURN", request_id: request.request_id, value: true, patches: []};
    if (request.type === "COMMAND") {
      response.invalidations = (request.keywords.ids ?? ["1"]).map(id => ({
        model: "Post", id, generation: request.generation, fields: ["comments"]
      }));
      if (request.keywords.replace) response.patches.push({
        model: "Post", id: "1", generation: request.generation, fields: {comments: []}
      });
    } else {
      response.patches = request.demands.map(demand => ({
        model: demand.model, id: demand.id, generation: request.generation,
        fields: Object.fromEntries(demand.fields.map(name => [name, name === "comments" ? [] : null]))
      }));
      if (this.holdNextGet) {
        this.holdNextGet = false;
        this.heldGet = response;
        return;
      }
    }
    queueMicrotask(() => this.emit("message", {data: pack(response).buffer}));
  }
}

const nextTurn = () => new Promise(resolve => setTimeout(resolve, 0));
async function effectsFixture() {
  Runtime.closeData();
  let transport;
  Runtime.configureData("ws://effects", "schema", () => (transport = new EffectsWebSocket()));
  const client = DistantClient.default();
  const post = (await client.query("Post", "search", [], {}, "result_set")).first();
  post.applyDataField("comments", [post], 1, false);
  return {client, post, comments: post.comments, transport};
}

test("unused invalidations retain membership and refresh when a held collection is read", async () => {
  const {client, post, comments, transport} = await effectsFixture();
  await client.command(post, "invalidate", [], {}, "primitive");
  assert.equal(comments.isLoaded(), true);
  assert.equal(comments.isStale(), true);
  assert.equal(comments.isLoading(), false);
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 0);
  assert.equal(comments.first(), post, "stale membership stays available");
  await nextTurn();
  assert.equal(comments.isStale(), false);
  assert.equal(comments.size(), 0);
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 1);
});

test("observed overlapping collections refresh in one batch and disposal stops demand", async () => {
  const {client, post, comments, transport} = await effectsFixture();
  const other = client.canonical("Post", "2", 1, null);
  other.applyDataField("comments", [post], 1, false);
  const stop = Runtime.observe(comments, "records", () => {});
  const stopOther = Runtime.observe(other.comments, "records", () => {});
  await client.command(post, "invalidate", [], {ids: ["1", "2", "unseen"]}, "primitive");
  await nextTurn();
  const gets = transport.requests.filter(r => r.type === "GET");
  assert.equal(gets.length, 1);
  assert.deepEqual(gets[0].demands.map(d => d.id), ["1", "2"]);
  assert.equal(client.modelStore("Post").unseen, undefined, "invalidation does not create objects");
  stop(); stopOther();
  await client.command(post, "invalidate", [], {ids: ["1", "2"]}, "primitive");
  await nextTurn();
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 1);
});

test("a replacement patch satisfies an invalidation without an extra GET", async () => {
  const {client, post, comments, transport} = await effectsFixture();
  const stop = Runtime.observe(comments, "records", () => {});
  await client.command(post, "invalidate", [], {replace: true}, "primitive");
  await nextTurn();
  assert.equal(comments.isStale(), false);
  assert.equal(comments.size(), 0);
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 0);
  stop();
});

test("older hydration and failures cannot clear newer invalidation or refresh state", async () => {
  const {client, post, comments, transport} = await effectsFixture();
  transport.holdNextGet = true;
  const older = post.reloadField("comments");
  await nextTurn();
  const oldGeneration = transport.heldGet.patches[0].generation;
  await client.command(post, "invalidate", [], {}, "primitive");
  transport.emit("message", {data: pack(transport.heldGet).buffer});
  await older;
  // Explicit load returns through an accessor, which can demand stale contents.
  await nextTurn();
  assert.equal(comments.size(), 0);
  assert.equal(comments.isStale(), false);
  post.failDataFieldWithGeneration("comments", "old error", oldGeneration);
  assert.equal(comments.error, null);
  await client.command(post, "invalidate", [], {}, "primitive");
  post.applyDataField("comments", [post], oldGeneration, false);
  assert.equal(comments.isStale(), true);
  assert.equal(comments.isLoaded(), true);
});


test("only live computed observers keep relationship demand active", async () => {
  const {client, post, comments, transport} = await effectsFixture();
  assert.equal(post.comment_count, 1);
  assert.equal(Runtime.observed(comments, "records"), false, "a cached computation is not a subscription");
  const stop = Runtime.observe(post, "comment_count", () => {});
  assert.equal(Runtime.observed(comments, "records"), true);
  await client.command(post, "invalidate", [], {}, "primitive");
  await nextTurn();
  assert.equal(post.comment_count, 0);
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 1);
  stop();
  assert.equal(Runtime.observed(comments, "records"), false);
  await client.command(post, "invalidate", [], {}, "primitive");
  await nextTurn();
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 1);
});


test("a failed stale refresh preserves availability and remote error details", async () => {
  const {client, post, comments, transport} = await effectsFixture();
  await client.command(post, "invalidate", [], {}, "primitive");
  transport.failNextGet = true;
  await assert.rejects(post.loadField("comments"), error => {
    assert.equal(error.code, "refresh_failed");
    assert.deepEqual(error.details, {retry: true});
    return true;
  });
  assert.equal(comments.isLoaded(), true);
  assert.equal(comments.isStale(), true);
  assert.equal(comments.isLoading(), false);
  assert.equal(comments.error, "retry later");
  assert.equal(await post.loadField("comments"), comments);
  assert.equal(comments.isStale(), false);
  assert.equal(comments.error, null);
});
