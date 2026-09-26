import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {readFile} from "node:fs/promises";
import {createContext, runInContext} from "node:vm";

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
    Runtime.closeData();
  } catch (error) {
    error.message += `\nFalcon output:\n${output}`;
    throw error;
  } finally {
    await stop(child);
  }
});
