import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "node:net";

const root = fileURLToPath(new URL("..", import.meta.url));
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise(resolveWait => setTimeout(resolveWait, 2_000))]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

const port = await availablePort();
const profile = await mkdtemp(resolve(root, "build/data-chrome-"));
let falcon;
let browser;
let socket;
let sequence = 0;
const pending = new Map();
const exceptions = [];

const call = (method, params = {}, sessionId) => new Promise((resolveCall, rejectCall) => {
  const id = ++sequence;
  pending.set(id, {resolve: resolveCall, reject: rejectCall});
  socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
});

try {
  let falconOutput = "";
  falcon = spawn("bundle", [
    "exec", "falcon", "serve", "--forked", "--count", "1", "--no-restart",
    "--bind", `http://127.0.0.1:${port}`,
    "--config", "spec/fixtures/data/server/config.ru"
  ], {cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"]});
  falcon.stdout.on("data", chunk => { falconOutput += chunk; });
  falcon.stderr.on("data", chunk => { falconOutput += chunk; });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (falcon.exitCode !== null) throw new Error(`Falcon exited ${falcon.exitCode}:\n${falconOutput}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 25));
  }

  browser = spawn(chrome, [
    "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"
  ], {stdio: ["ignore", "ignore", "pipe"]});
  const endpoint = await new Promise((resolveEndpoint, rejectEndpoint) => {
    let output = "";
    browser.on("error", rejectEndpoint);
    browser.on("exit", code => rejectEndpoint(new Error(`Chrome exited ${code}: ${output}`)));
    browser.stderr.on("data", data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolveEndpoint(match[1]);
    });
  });

  socket = new WebSocket(endpoint);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const promise = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) promise?.reject(new Error(JSON.stringify(message.error)));
      else promise?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params);
  });
  await once(socket, "open");
  const {targetId} = await call("Target.createTarget", {url: "about:blank"});
  const {sessionId} = await call("Target.attachToTarget", {targetId, flatten: true});
  await call("Runtime.enable", {}, sessionId);
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true}, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  await call("Page.enable", {}, sessionId);
  await call("Page.addScriptToEvaluateOnNewDocument", {source: `
    window.recoverySockets = [];
    window.WebSocket = class extends WebSocket {
      constructor(...args) {
        if (window.recoveryOffline) throw new Error("Test outage");
        super(...args);
        window.recoverySockets.push(this);
      }
    };
  `}, sessionId);
  await call("Page.navigate", {url: `http://127.0.0.1:${port}/`}, sessionId);
  const loaded = await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const read = name => document.querySelector('[data-field="' + name + '"]')?.textContent;
    const poll = () => {
      if (read("status") === "Loaded" && read("body") === "A useful boundary." && read("comments") === "1") {
        resolve([read("title"), read("author"), read("body"), read("comments"), read("published")]);
      } else if (Date.now() > deadline) {
        reject(new Error(document.body.dataset.swillError || JSON.stringify({
          status: read("status"), title: read("title"), author: read("author"),
          body: read("body"), comments: read("comments")
        })));
      } else setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.deepEqual(loaded, ["DISTRIBUTED OBJECTS", "Ada", "A useful boundary.", "1", "false"]);

  const published = await evaluate(`new Promise((resolve, reject) => {
    document.querySelector("button").click();
    const deadline = Date.now() + 5000;
    const poll = () => {
      const value = document.querySelector('[data-field="published"]').textContent;
      const timestamp = document.querySelector('[data-field="published-at"]').textContent;
      if (value === "true" && timestamp) {
        const controller = document.querySelector("main").__swill_view__.controllerValue();
        resolve([value, controller.post.publishedAt.toISOString()]);
      }
      else if (Date.now() > deadline) reject(new Error("publish did not update bindings"));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.deepEqual(published, ["true", "2026-01-02T03:04:05.000Z"]);

  const lifecycle = await evaluate(`(async () => {
    const Comment = Swill.Runtime.resolve("DataFixture::Comment");
    const comment = new Comment();
    comment.postId = 1;
    comment.authorId = 1;
    comment.body = "Browser draft";
    const saved = await comment.save();
    const id = comment.id;
    const draft = comment.draft();
    draft.body = "Browser accepted";
    const before = comment.body;
    await comment.applyDraft(draft);
    const after = comment.body;
    await comment.delete();
    return [saved === comment, id, before, after, draft.isDirty, comment.isDeleted];
  })()`);
  assert.equal(lifecycle[0], true);
  assert.match(String(lifecycle[1]), /^\d+$/);
  assert.deepEqual(lifecycle.slice(2), ["Browser draft", "Browser accepted", false, true]);
  const waitFor = expression => evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (${expression}) resolve(true);
      else if (Date.now() > deadline) reject(new Error("Timed out: " + ${JSON.stringify(expression)}));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  await evaluate(`(() => {
    window.recoveryClient = Swill.Runtime.resolve("Swill::Distant::Client").default();
    window.recoveryPost = document.querySelector("main").__swill_view__.controllerValue().post;
    recoveryPost.title = "Unsaved title";
    window.recoveryDraft = recoveryPost.draft();
    recoveryDraft.title = "Unsaved draft";
    window.recoveryOffline = true;
    recoverySockets.at(-1).close();
  })()`);
  await waitFor(`document.querySelector("dialog.alert .alert-text")?.textContent.includes("Connection lost")`);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll("dialog.alert button"), b => b.textContent)`), ["Retry Now", "Dismiss"]);
  await evaluate(`document.querySelector("dialog.alert button").click()`);
  await waitFor(`recoveryClient.connectionState === "disconnected"`);
  assert.equal(await evaluate(`!!document.querySelector("dialog.alert")`), true);
  await evaluate(`window.recoveryOffline = false; window.dispatchEvent(new Event("online"))`);
  await waitFor(`recoveryClient.connectionState === "connected" && !document.querySelector("dialog.alert")`);
  assert.deepEqual(await evaluate(`[recoveryPost.title, recoveryDraft.title]`), ["Unsaved title", "Unsaved draft"]);

  assert.equal(await evaluate(`Swill.Application.shared().development`), false, "production also gets connection notices");
  await evaluate(`Swill.Runtime.configureData("/data", "obsolete-schema"); recoveryClient.reconnect()`);
  await waitFor(`recoveryClient.connectionState === "reload_required"`);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll("dialog.alert button"), b => b.textContent)`), ["Reload"]);
  await call("Input.dispatchKeyEvent", {type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27}, sessionId);
  await call("Input.dispatchKeyEvent", {type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27}, sessionId);
  assert.equal(await evaluate(`!!document.querySelector("dialog.alert[open]")`), true, "Escape cannot dismiss the required reload");
  assert.deepEqual(exceptions, []);
  console.log("Swill data browser fixture passed");
} finally {
  socket?.close();
  await stop(browser);
  await stop(falcon);
  await rm(profile, {recursive: true, force: true});
}
