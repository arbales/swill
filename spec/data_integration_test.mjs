import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {readFile} from "node:fs/promises";
import {createContext, runInContext} from "node:vm";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";

const root = new URL("..", import.meta.url);

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Falcon exited with status ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Falcon fixture did not start");
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  let timer;
  await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 2_000); })]);
  clearTimeout(timer);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

test("generated clients cross the real WebSocket boundary", {timeout: 20_000}, async () => {
  const port = await availablePort();
  let output = "";
  const child = spawn("bundle", [
    "exec", "falcon", "serve", "--forked", "--count", "1", "--no-restart",
    "--bind", `http://127.0.0.1:${port}`,
    "--config", "spec/fixtures/data/server/config.ru"
  ], {cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"]});
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });

  try {
    await waitForServer(`http://127.0.0.1:${port}/`, child);
    const schema = JSON.parse(await readFile(new URL("fixtures/data/client/models/generated/schema.json", import.meta.url)));
    const context = createContext({
      console, URL, URLSearchParams, Event, WebSocket, Blob, TextEncoder, TextDecoder,
      queueMicrotask, setTimeout, clearTimeout
    });
    for (const file of ["../rb/dist/swill.js", "../build/data_client.js"]) {
      const url = new URL(file, import.meta.url);
      runInContext(await readFile(url, "utf8"), context, {filename: url.pathname});
    }

    const Runtime = context.Swill.Runtime;
    Runtime.configureData(`ws://127.0.0.1:${port}/data`, schema.schema_hash);
    const User = Runtime.resolve("DataFixture::User");
    const Post = Runtime.resolve("DataFixture::Post");

    const current = await User.currentUser();
    assert.deepEqual([current.id, current.name, current.avatar], ["1", "Ada", "ada.png"]);

    const grace = await User.firstByEmail("grace@example.test");
    assert.equal(grace.name, "Grace");
    assert.equal(await grace.loadField("avatar"), null);
    assert.equal(grace.isFieldLoaded("avatar"), true, "denied fields arrive as present nil");

    const posts = await Post.search("Objects");
    const post = posts.first();
    assert.equal(post.displayTitle(), "DISTRIBUTED OBJECTS",
      "handwritten client behavior reopens the generated model");
    assert.equal(post.author, current, "query projections share canonical identity");
    const comments = post.comments;
    await post.loadField("comments");
    assert.equal(post.comments, comments, "to-many hydration retains collection identity");
    assert.equal(comments.size(), 1);

    const comment = comments.first();
    await comment.loadField("author");
    assert.equal(comment.author, grace);
    assert.equal(await post.publishBang(), true);
    assert.equal(post.published, true);
    assert.equal(post.publishedAt.toISOString(), "2026-01-02T03:04:05.000Z");
    const lookup = await Post.lookupTitle("Distributed Objects");
    assert.equal(lookup.post, post);
    assert.equal(lookup.status, "found");
    const shared = current.postsController();
    assert.equal(shared, current.postsController(), "the association controller is cached per owner");
    assert.equal(current.isFieldLoaded("posts"), false, "constructing a controller does not fetch membership");
    const oldPosts = await current.loadField("posts");
    assert.equal(shared.content, oldPosts);
    const newPosts = await grace.loadField("posts");
    assert.equal(oldPosts.first(), post);
    assert.equal(newPosts.size(), 0);
    let resolveRefresh;
    const refreshed = new Promise(resolve => { resolveRefresh = resolve; });
    const stop = Runtime.observe(oldPosts, "records", records => {
      if (records.length === 0) resolveRefresh();
    });
    await post.moveToAuthorBang(2);
    assert.equal(post.author, grace);
    assert.equal(newPosts.isStale(), true, "unused membership waits for access");
    await refreshed;
    assert.equal(oldPosts.isLoaded(), true);
    assert.equal(oldPosts.isStale(), false);
    assert.equal(await grace.loadField("posts"), newPosts);
    assert.equal(newPosts.first(), post);
    stop();
    Runtime.closeData();
    assert.equal(shared.content, null, "connection reset releases cached controllers");

    const socket = new WebSocket(`ws://127.0.0.1:${port}/data`);
    socket.binaryType = "arraybuffer";
    await new Promise((resolve, reject) => {
      socket.onopen = resolve; socket.onerror = reject;
    });
    const pending = new Map(), order = [];
    socket.onmessage = event => {
      const response = unpack(new Uint8Array(event.data));
      const id = response.request_id ?? 'hello';
      order.push(id);
      pending.get(id)?.(response); pending.delete(id);
    };
    const send = message => new Promise(resolve => {
      pending.set(message.request_id ?? 'hello', resolve);
      socket.send(pack(message));
    });
    const query = (id, delay = 0, text = '') => send({
      type: 'QUERY', request_id: id, generation: id, model: 'DataFixture::Post',
      name: 'search', arguments: [text], test_delay_ms: delay,
    });
    try {
      assert.equal((await send({type: 'HELLO', protocol_version: schema.protocol_version,
        schema_hash: schema.schema_hash})).type, 'WELCOME');
      const slow = query(1, 100), fast = query(2);
      assert.equal((await fast).type, 'RESULT');
      assert.equal((await slow).type, 'RESULT');
      assert.deepEqual(order.slice(-2), [2, 1], 'independent reads complete out of order');

      const before = query(3, 75);
      const saved = send({type: 'UPDATE', request_id: 4, generation: 4,
        model: 'DataFixture::Post', id: '1', attributes: {title: 'Concurrency fixture'}});
      const after = query(5, 0, 'Concurrency fixture');
      assert.equal((await before).type, 'RESULT');
      assert.equal((await saved).type, 'RETURN');
      const refreshed = await after;
      assert.equal(refreshed.type, 'RESULT');
      const refreshedPost = refreshed.patches.find(patch => patch.model === 'DataFixture::Post');
      assert.equal(refreshedPost?.fields.title, 'Concurrency fixture', 'later read observes committed write');
      assert.deepEqual(order.slice(-3), [3, 4, 5], 'write fences reads on both sides');
    } finally {
      socket.close();
    }
  } catch (error) {
    error.message += `\nFalcon output:\n${output}`;
    throw error;
  } finally {
    await stop(child);
  }
});
