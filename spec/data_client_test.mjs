import test from "node:test";
import assert from "node:assert/strict";
import {Runtime} from "../rb/runtime/runtime.mjs";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";
import {
  Swill__Distant__Object as DistantBase,
  Swill__Distant__Client as Client,
  Swill__Distant__Context as Context,
  Swill__DateTransformer as DateTransformer,
  Swill__Model__Collection as Collection,
  Swill__Model__ResultSet as ResultSet
} from "../build/framework.mjs";

test("compiled client and date transformer use the runtime's date methods", () => {
  const client = Client.default();
  const date = client.decodeValue({$date: "2026-09-23"}, 0);
  assert.equal(Runtime.dataValueType(date), "Date");
  assert.deepEqual(client.encodeValue(date), {$date: "2026-09-23"});
  const transformer = new DateTransformer();
  assert.equal(transformer.format(date), "2026-09-23");
  assert.equal(Runtime.dataValueType(transformer.parse("2026-09-24")), "Date");
  assert.equal(Runtime.dataValueType(client.decodeValue({$datetime: "2026-09-23T04:00:00.123456Z"}, 0)), "DateTime");
  const time = client.decodeValue({$time: "2026-09-23T04:00:00.123456Z"}, 0);
  assert.equal(Runtime.dataValueType(time), "Time");
  assert.deepEqual(client.encodeValue(time), {$time: "2026-09-23T04:00:00.123456+00:00"});
  assert.equal(Runtime.dataValueType(client.decodeValue({$time_of_day: "12:34:56.123456"}, 0)), "TimeOfDay");
});

test("MessagePack preserves safe 64-bit integers and inert map keys", () => {
  const value = {large: 2 ** 40, negative: -(2 ** 40), ["__proto__"]: "data"};
  const decoded = unpack(pack(value));
  assert.equal(decoded.large, value.large);
  assert.equal(decoded.negative, value.negative);
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.hasOwn(decoded, "__proto__"), true);
});

class Post extends DistantBase {}

// The state properties a field declares beside its value, as
// Distant::Fields' macros do: loaded, loading and error, and stale for an
// association.
function fieldState(name, association) {
  const state = {
    [`${name}_loaded`]: {type: "T::Boolean", defaultValue: () => false},
    [`${name}_loading`]: {type: "T::Boolean", defaultValue: () => false},
    [`${name}_error`]: {type: "T.nilable(String)", defaultValue: () => null}
  };
  if (association) state[`${name}_stale`] = {type: "T::Boolean", defaultValue: () => false};
  return state;
}

// An association is a stored data_<name> the client writes and a computed
// public property reading it.
function association(name, type) {
  return {
    [`data_${name}`]: {type, defaultValue: () => null},
    [name]: {type, willAccess: true, compute() { return this[`data_${name}`]; }},
    ...fieldState(name, true)
  };
}

Runtime.install({classes: {Post: {
  constructor: Post,
  properties: {
    title: {type: "T.nilable(String)", attribute: true, key: "title", willAccess: true, defaultValue: () => null},
    ...fieldState("title", false),
    body: {type: "T.nilable(String)", attribute: true, key: "body", willAccess: true, defaultValue: () => null},
    ...fieldState("body", false),
    comment_count: {type: "Integer", compute() { return this.comments.size(); }},
    ...association("author", "T.nilable(Post)"),
    ...association("comments", "Swill::Model::Collection")
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
      response = {type: "WELCOME", protocol_version: 3, schema_hash: "schema",
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

  const results = await Client.default().query("Post", "search", ["Hello"], {}, "result_set");
  assert.ok(results instanceof ResultSet);
  assert.equal(results.isLoaded(), true);
  const post = results.first();
  assert.equal(post.title, "Hello");
  assert.equal(post.isDirty, false, "server identity does not become a local edit");

  await Client.default().query("Post", "search",
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

  const older = Client.default().resolve("Post", "find", ["1"], {}, "model");
  const newer = Client.default().resolve("Post", "find", ["1"], {}, "model");
  const [sameFromOlder, sameFromNewer] = await Promise.all([older, newer]);
  assert.equal(sameFromOlder, post);
  assert.equal(sameFromNewer, post);
  assert.equal(post.title, "Newer", "an older response cannot replace a newer field");
});

test("editing contexts accept before persistence and deletion is observable", async () => {
  globalThis.WebSocket = FakeWebSocket;
  let transport;
  Runtime.configureData("ws://fixture-lifecycle", "schema", () => (transport = new FakeWebSocket()));

  const post = new Post();
  post.title = "Created";
  assert.equal(post.isDraft(), false);
  assert.throws(() => post.context().newEditingContext().object(post), /before opening/);
  const saved = await post.save();
  assert.equal(saved, post, "the newly assigned identity keeps the original object canonical");
  assert.equal(post.id, "2");
  assert.equal(post.isDirty, false);

  const editing = post.context().newEditingContext();
  const draft = editing.object(post);
  draft.title = "Edited";
  assert.equal(post.title, "Created", "editing a draft does not expose unaccepted values");
  await editing.save();
  assert.equal(post.isDirty, true, "acceptance precedes persistence");
  await post.save();
  assert.equal(post.title, "Edited");
  assert.equal(draft.isDirty, false);
  editing.dealloc();

  transport.holdNextQuery = true;
  const stale = Client.default().query("Post", "search", ["stale"], {}, "result_set");
  await new Promise(resolve => setTimeout(resolve, 0));
  await post.delete();
  assert.equal(post.isDeleted, true);
  transport.releaseHeldQuery();
  const staleResults = await stale;
  assert.equal(staleResults.first(), post, "an older response retains the deleted tombstone identity");
  assert.equal(post.title, "Edited", "an older response cannot resurrect deleted data");
  await assert.rejects(post.save(), /deleted record/);
  assert.equal(transport.requests.filter(request => request.type === "CREATE").length, 1);
  assert.equal(transport.requests.filter(request => request.type === "UPDATE").length, 1);
  assert.equal(transport.requests.filter(request => request.type === "DELETE").length, 1);
});

test("dirty fields survive background patches and actor changes require reload", async () => {
  globalThis.WebSocket = FakeWebSocket;
  FakeWebSocket.actorScope = "actor-1";
  let transport;
  Runtime.configureData("ws://fixture-scope", "schema", () => (transport = new FakeWebSocket()));

  const first = (await Client.default().query(
    "Post", "search", [], {}, "result_set"
  )).first();
  first.title = "Local edit";
  const same = (await Client.default().query(
    "Post", "search", [], {}, "result_set"
  )).first();
  assert.equal(same, first);
  assert.equal(first.title, "Local edit", "a background patch does not replace a dirty field");

  const plain = await Client.default().query("Post", "search", [], {}, "array");
  assert.equal(Array.isArray(plain), true, "schema cardinality controls result wrapping");
  assert.equal(plain instanceof ResultSet, false);

  transport.close();
  FakeWebSocket.actorScope = "actor-2";
  await assert.rejects(Client.default().query("Post", "search", [], {}, "result_set"), {code: "actor_scope_changed"});
  assert.equal(Client.default().connectionState, "reload_required");
  assert.equal(first.title_loaded, false, "the previous actor's fields are invalidated");
  FakeWebSocket.actorScope = "actor-1";
});


test("association membership is read-only while query results remain editable", () => {
  const post = new Post();
  const comments = post.comments;
  const author = new Post();
  assert.throws(() => { post.author = author; }, /Read-only property: author/);
  assert.throws(() => Runtime.write(post, "author", author), /Read-only property: author/);
  const authors = [];
  const stopAuthor = Runtime.observe(post, "author", value => authors.push(value));
  post.applyDataField("author", author, 1, false);
  assert.equal(post.author, author);
  assert.deepEqual(authors, [author], "the client's write is observable through the public property");
  stopAuthor();
  assert.throws(() => { post.comments = []; }, /Read-only property: comments/);
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

test("association loading, errors, retry, and reset follow owner state", () => {
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

test("a field's state is observable as it loads and fails", async () => {
  const {post, transport} = await effectsFixture();
  const states = [];
  const stops = ["body_loading", "body_loaded", "body_error"].map(name =>
    Runtime.observe(post, name, value => states.push([name, value])));
  assert.equal(post.body, null, "reading an unloaded field starts its request");
  assert.equal(post.isFieldLoading("body"), true);
  await nextTurn();
  assert.equal(post.isFieldLoaded("body"), true);
  assert.deepEqual(states, [["body_loading", true], ["body_loaded", true], ["body_loading", false]]);

  states.length = 0;
  transport.failNextGet = true;
  await assert.rejects(post.reloadField("body"), /retry later/);
  assert.deepEqual(states, [["body_loading", true], ["body_loading", false], ["body_error", "retry later"]]);
  assert.equal(post.fieldError("body"), "retry later");
  assert.equal(post.isFieldLoaded("body"), true, "a failed reload keeps the loaded value");
  stops.forEach(stop => stop());
});

test("context identity and relationship counterparts stay isolated", async () => {
  const {post, client} = await effectsFixture();
  const editing = post.context().newEditingContext();
  const local = editing.object(post);
  assert.equal(editing.object(post), local);
  assert.notEqual(local, post);
  assert.equal(local.context(), editing);
  const stranger = (await client.query("Post", "search", [], {}, "result_set")).first();
  assert.equal(stranger, post);
  assert.equal(editing.object(stranger), local);
  assert.equal(post.context().object(local), post);
  editing.dealloc();
  await assert.rejects(local.save(), /released/);
});

test("an association controller is released when its owner deallocs", async () => {
  const {post, comments} = await effectsFixture();
  const controller = post.associationController("comments");
  assert.equal(controller.content, comments);
  assert.equal(post.associationController("comments"), controller, "one controller per association");
  post.dealloc();
  assert.equal(controller.content, null);
  assert.notEqual(post.associationController("comments"), controller, "a dealloc'd controller is not reused");
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
  const client = Client.default();
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


test("only live computed observers keep association demand active", async () => {
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

test("automatic recovery backs off, coalesces manual retries, and connects an idle page", async () => {
  Runtime.closeData();
  const client = Client.default();
  const timers = new Map(); let timerId = 0;
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout, random = Math.random;
  globalThis.setTimeout = (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId; };
  globalThis.clearTimeout = id => timers.delete(id);
  Math.random = () => 0.5;
  let online = false, sockets = [];
  const states = [];
  const stop = Runtime.observe(client, "connection_state", state => states.push(state));
  Runtime.configureData("ws://recovery-test", "schema", () => {
    if (!online) throw new Error("offline");
    const socket = new FakeWebSocket(); sockets.push(socket); return socket;
  });
  try {
    assert.equal(client.connectionState, "idle");
    assert.equal(timers.size, 0, "the initial connection is lazy");
    await assert.rejects(client.query("Post", "search", [], {}, "array"), {code: "connection_lost"});
    for (const delay of [1000, 2000, 4000, 8000, 15000, 30000, 30000]) {
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers][0];
      assert.equal(timer.delay, delay);
      timers.delete(id);
      await timer.callback();
    }
    online = true;
    await Promise.all([client.reconnect(), client.reconnect()]);
    assert.equal(sockets.length, 1, "Retry Now shares the opening attempt");
    assert.equal(client.connectionState, "connected");
    assert.equal(timers.size, 0);
    assert.deepEqual(sockets[0].requests.map(r => r.type), ["HELLO"], "a failed query is not replayed");
    sockets[0].close();
    const [id, timer] = [...timers][0];
    assert.equal(timer.delay, 1000, "a successful handshake resets backoff");
    timers.delete(id);
    await timer.callback();
    assert.equal(client.connectionState, "connected", "an idle page reconnects without a query");
    assert.equal(sockets.length, 2);
    Runtime.closeData();
    assert.equal(client.connectionState, "idle");
    assert.equal(timers.size, 0);
    assert.ok(states.includes("connecting") && states.includes("disconnected") && states.includes("connected"));
  } finally {
    Runtime.closeData(); stop();
    globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; Math.random = random;
  }
});

test("compatible reconnection preserves canonical objects, dirty fields, contexts and queued hydration", async () => {
  Runtime.closeData();
  const client = Client.default();
  let current;
  let holdReads = false;
  class RecoveringSocket extends FakeWebSocket {
    send(bytes) {
      if (holdReads && unpack(bytes).type === "GET") { this.close(); return; }
      super.send(bytes);
    }
  }
  Runtime.configureData("ws://preserve-test", "schema", () => (current = new RecoveringSocket()));
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const first = (await client.query("Post", "search", [], {}, "array"))[0];
    first.title = "Local edit";
    const draft = first.context().newEditingContext().object(first);
    draft.title = "Draft edit";
    holdReads = true;
    assert.equal(first.body, null);
    await tick();
    assert.equal(client.connectionState, "disconnected");
    assert.equal(first.title, "Local edit");
    assert.equal(draft.title, "Draft edit");
    holdReads = false;
    assert.equal(await client.reconnect(), true);
    await tick();
    assert.equal(first.body_loaded, true, "queued field reads resume after WELCOME");
    const same = (await client.query("Post", "search", [], {}, "array"))[0];
    assert.equal(same, first);
    assert.equal(first.title, "Local edit");
    assert.equal(draft.title, "Draft edit");
    assert.equal(current.requests.filter(r => r.type === "GET").length, 1);
  } finally { Runtime.closeData(); }
});

test("isolated edits accept locally, rollback independently, and preserve cyclic identity", async () => {
  const {post, transport} = await effectsFixture();
  const parent = post.context();
  const editing = parent.newEditingContext();
  const local = editing.object(post);
  assert.equal(local.isFieldLoaded("comments"), false, "opening an editor does not traverse its relationship graph");
  assert.equal(local.comments.first(), local);
  local.title = "Accepted";
  assert.equal(editing.hasChanges, true);
  assert.equal(parent.hasChanges, false);
  editing.rollback();
  assert.equal(local.title, "Hello");
  local.title = "Accepted";
  const before = transport.requests.length;
  await local.save();
  assert.equal(transport.requests.length, before, "child acceptance makes no request");
  assert.equal(post.title, "Accepted");
  assert.equal(parent.hasChanges, true);
  assert.equal(editing.hasChanges, false);
  editing.rollback();
  assert.equal(post.title, "Accepted", "child rollback cannot retract accepted changes");
  parent.rollback();
  assert.equal(post.title, "Hello");
  assert.equal(parent.hasChanges, false);
  editing.dealloc();
});

test("multi-record and overlapping parent edits are refused before any acceptance", async () => {
  const {post} = await effectsFixture();
  const other = Client.default().canonical("Post", "9", 1);
  other.applyDataField("title", "Other", 1, false);
  const editing = post.context().newEditingContext();
  const local = editing.object(post);
  const second = editing.object(other);
  local.title = "Child";
  second.title = "Second";
  await assert.rejects(editing.save(), /multiple changed records/);
  assert.equal(post.title, "Hello");
  assert.equal(other.title, "Other");
  second.rollback();
  post.title = "Parent";
  await assert.rejects(editing.save(), /Parent changed title/);
  assert.equal(local.title, "Child");
  assert.equal(post.title, "Parent");
  assert.equal(editing.hasChanges, true);
  editing.dealloc();
});

test("server conflicts keep local edits and rollback reveals the received baseline", async () => {
  const {post} = await effectsFixture();
  post.title = "Local";
  post.applyDataField("title", "Remote", 10000, false);
  assert.equal(post.title, "Local");
  assert.deepEqual(post.conflictedFields, ["title"]);
  await assert.rejects(post.save(), /conflicting fields/);
  post.rollback();
  assert.equal(post.title, "Remote");
  assert.equal(post.isDirty, false);
  assert.deepEqual(post.conflictedFields, []);
});

test("inline changes share identity and scoped cancellation preserves earlier dirties", async () => {
  const {post} = await effectsFixture();
  post.body = "Earlier edit";
  const edit = post.beginEdit();
  post.title = "Inline";
  assert.equal(post.context().object(post).title, "Inline");
  edit.rollback();
  assert.equal(post.title, "Hello");
  assert.equal(post.body, "Earlier edit");
  assert.deepEqual(post.dirtyAttributes, ["body"]);
  const finished = post.beginEdit();
  post.title = "Accepted";
  finished.finish();
  post.title = "Later";
  assert.throws(() => finished.rollback(), /changed after this edit/);
  assert.equal(post.title, "Later");
});

class SavingSocket extends FakeWebSocket {
  send(bytes) {
    const request = unpack(bytes);
    if (request.type === "UPDATE" || request.type === "CREATE") {
      this.pending = request;
      this.requests.push(request);
      return;
    }
    super.send(bytes);
  }
  complete(error = null, fields = null) {
    const request = this.pending;
    this.pending = null;
    const id = request.id || "2";
    const response = error
      ? {type: "ERROR", request_id: request.request_id, error}
      : {type: "RETURN", request_id: request.request_id, value: {$ref: ["Post", id]},
          patches: [{model: "Post", id, generation: request.generation,
            fields: fields || request.attributes}]};
    this.emit("message", {data: pack(response).buffer});
  }
}

async function savingFixture() {
  Runtime.closeData();
  let transport;
  Runtime.configureData("ws://saving", "schema", () => (transport = new SavingSocket()));
  const post = (await Client.default().query("Post", "search", [], {}, "result_set")).first();
  return {post, transport};
}

test("save acknowledgement preserves later edits and takes server normalization as baseline", async () => {
  const {post, transport} = await savingFixture();
  post.title = "submitted";
  const saving = post.save();
  await nextTurn();
  post.title = "Later";
  transport.complete(null, {title: "Submitted"});
  await saving;
  assert.equal(post.title, "Later");
  assert.equal(post.isDirty, true);
  assert.equal(post.saving, false);
  post.rollback();
  assert.equal(post.title, "Submitted");
  assert.equal(post.isDirty, false);
});

test("a rejected save retains accepted edits for retry or later", async () => {
  const {post, transport} = await savingFixture();
  const editing = post.context().newEditingContext();
  editing.object(post).title = "Accepted";
  await editing.save();
  const saving = post.context().save();
  const rejected = assert.rejects(saving, /Validation failed/);
  await nextTurn();
  transport.complete({code: "validation_failed", message: "Validation failed"});
  await rejected;
  assert.equal(post.title, "Accepted");
  assert.equal(post.isDirty, true);
  editing.dealloc();
  assert.equal(post.context().hasChanges, true, "closing the child leaves accepted edits unsaved");
  const retry = post.save();
  await nextTurn();
  transport.complete();
  await retry;
  assert.equal(post.isDirty, false);
});

test("an uncertain write cannot be blindly retried or locally rolled back", async () => {
  const {post, transport} = await savingFixture();
  post.title = "Possibly saved";
  const saving = post.save();
  const rejected = assert.rejects(saving, {code: "outcome_unknown"});
  await nextTurn();
  transport.close();
  await rejected;
  assert.equal(post.saveOutcomeUnknown, true);
  assert.equal(post.isDirty, true);
  await assert.rejects(post.save(), /outcome is unknown/);
  assert.throws(() => post.rollback(), /outcome is unknown/);
  Runtime.closeData();
});

test("isolated field hydration uses the shared connection and cannot issue commands", async () => {
  const {post, client, transport} = await effectsFixture();
  const child = post.context().newEditingContext();
  const local = child.object(post);
  assert.equal(await local.loadField("body"), null);
  assert.equal(local.isFieldLoaded("body"), true);
  assert.equal(post.isFieldLoaded("body"), true);
  assert.equal(transport.requests.filter(r => r.type === "GET").length, 1);
  await assert.rejects(client.command(local, "invalidate", [], {}, "primitive"), /isolated editing context/);
  await assert.rejects(local.delete(), /isolated editing context/);
  assert.equal(transport.requests.filter(r => r.type === "COMMAND" || r.type === "DELETE").length, 0);
  Runtime.closeData();
  await assert.rejects(local.save(), /released actor scope/);
  await assert.rejects(post.save(), /released actor scope/);
});

test("child acceptance cannot become part of another active inline interaction", async () => {
  const {post} = await effectsFixture();
  const child = post.context().newEditingContext();
  const local = child.object(post);
  local.title = "Popup";
  const inline = post.beginEdit();
  post.body = "Inline";
  await assert.rejects(child.save(), /active inline edit/);
  assert.equal(post.title, "Hello");
  assert.equal(local.title, "Popup");
  inline.rollback();
  await child.save();
  assert.equal(post.title, "Popup");
  child.dealloc();
});

test("rollback never restores obsolete baselines for already-clean fields", async () => {
  const {post} = await effectsFixture();
  post.title = "Temporary";
  post.title = "Hello";
  post.applyDataField("title", "New server value", 10000, false);
  post.body = "Unsaved body";
  post.rollback();
  assert.equal(post.title, "New server value");
  assert.equal(post.isDirty, false);
  post.title = "Local";
  post.applyDataField("title", "Another server value", 10001, false);
  assert.deepEqual(post.conflictedFields, ["title"]);
  post.title = "Another server value";
  assert.equal(post.isDirty, false);
  assert.deepEqual(post.conflictedFields, []);
  await post.save();
});

test("association controller survives observation teardown but context reset retires it", async () => {
  const {client, post} = await effectsFixture();
  const controller = post.associationController("comments");
  const stop = Runtime.observe(controller, "arranged_objects", () => {});
  controller.selectObject(post);
  stop();
  assert.equal(post.associationController("comments"), controller);
  assert.equal(controller.selectedObject, post);
  let resolve;
  const request = controller.fetch(Runtime.blockArgument(() => new Promise(done => { resolve = done; })));
  client.reset();
  resolve([post]);
  assert.equal(await request, false);
  assert.equal(controller.content, null);
  await assert.rejects(controller.fetch(), /released/);
  const fresh = client.canonical("Post", post.id, 2, null);
  assert.notEqual(fresh.associationController("comments"), controller);
});

test("closing an editing context retires its pending field hydration quietly", async () => {
  for (const fails of [false, true]) {
    const {post} = await effectsFixture();
    const editing = post.context().newEditingContext();
    const local = editing.object(post);
    let resolve, reject;
    post.loadContextField = () => new Promise((done, fail) => { resolve = done; reject = fail; });
    const warnings = [];
    const stop = Runtime.observeWarnings(message => warnings.push(message));
    try {
      const pending = local.loadContextField("body", true);
      editing.dealloc();
      fails ? reject(new Error("late load failure")) : resolve();
      assert.equal(await pending, null);
      assert.equal(local.isFieldLoaded("body"), false);
      assert.deepEqual(warnings, [], "closing a popup is not a stale-actor error");
    } finally {
      stop();
    }
  }
});
