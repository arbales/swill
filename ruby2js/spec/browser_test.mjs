// Optional real-browser check using Node's built-in WebSocket and Chrome's CDP.
// No npm packages, browser downloads, or access to the user's browser profile.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:http";
import {readFile, mkdtemp, rm} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(resolve(root, "build/chrome-"));
const server = createServer(async (request, response) => {
  try {
    const file = resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("outside root");
    const content = await readFile(file);
    response.setHeader("Content-Type", extname(file) === ".html" ? "text/html" : "text/javascript");
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

let child;
let socket;
const pending = new Map();
const exceptions = [];
let sequence = 0;
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, {resolve, reject});
  socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
});

const timeout = setTimeout(() => {
  for (const promise of pending.values()) promise.reject(new Error("Browser check timed out"));
  child?.kill();
  server.close();
}, 20_000);

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  child = spawn(chrome, [
    "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"
  ], {stdio: ["ignore", "ignore", "pipe"]});
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    child.on("error", reject);
    child.on("exit", code => reject(new Error(`Chrome exited ${code}: ${output}`)));
    child.stderr.on("data", data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
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
  await call("Page.navigate", {url: `http://127.0.0.1:${server.address().port}/examples/index.html`}, sessionId);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (document.querySelector("p[bind]")?.textContent === "Hello Ada") resolve(true);
      else if (Date.now() > deadline) reject(new Error("Application did not awaken"));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.equal(await evaluate(`(() => {
    const input = document.querySelector("input");
    input.value = "Grace";
    input.dispatchEvent(new Event("input", {bubbles: true}));
    return document.querySelector("p[bind]").textContent;
  })()`), "Hello Grace");
  assert.deepEqual(await evaluate(`(() => {
    document.querySelector("button").click();
    return [document.querySelector("p[bind]").textContent, document.querySelector("input").disabled];
  })()`), ["Nobody", true]);
  await evaluate(`(() => {
    window.dispatchEvent(new Event("pagehide"));
    const input = document.querySelector("input");
    input.disabled = false;
    input.value = "Detached";
    input.dispatchEvent(new Event("input"));
  })()`);
  assert.equal(await evaluate('document.querySelector("p[bind]").textContent'), "Nobody");
  assert.deepEqual(exceptions, []);
  console.log("Chrome: generated lookup, input/computed binding, action, and teardown passed.");
} finally {
  clearTimeout(timeout);
  socket?.close();
  if (child && child.exitCode === null && child.pid) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, {recursive: true, force: true});
}
