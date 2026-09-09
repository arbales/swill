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
      else if (Date.now() > deadline) reject(new Error(
        document.body.dataset.swillError || "Application did not awaken"
      ));
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
  // The nested controller owns its own title binding and clear action; its
  // unhandled shout action reaches the parent through the responder chain.
  assert.deepEqual(await evaluate(`(() => {
    const badge = document.querySelector("section[controller='Demo::Badge']");
    const text = () => [document.querySelector("p[bind]").textContent, badge.querySelector("p[bind]").textContent];
    const results = [text()];
    badge.querySelector("[data-action=bump]").click();
    results.push(text());
    badge.querySelector("[data-action=clear]").click();
    results.push(text());
    badge.querySelector("[data-action=shout]").click();
    results.push([...text(), document.querySelector("input").value]);
    return results;
  })()`), [
    ["Hello Grace", "Badge 0"], ["Hello Grace", "Badge 1"],
    ["Hello Grace", "Badge 0"], ["Hello GRACE", "Badge 0", "GRACE"]
  ]);
  // The badge's reset action is handled by neither controller; it reaches
  // the application declared on <body>, which clears every controller.
  assert.deepEqual(await evaluate(`(() => {
    const badge = document.querySelector("section[controller='Demo::Badge']");
    badge.querySelector("[data-action=bump]").click();
    badge.querySelector("[data-action=reset]").click();
    const application = document.body.__swill_application__;
    const [parent, child] = application.controllers();
    return [document.querySelector("p[bind]").textContent, badge.querySelector("p[bind]").textContent,
      application.constructor === Swill.Runtime.resolve("Demo::Application"), application.launched,
      application.controllers().length,
      parent.name_field.element() === document.querySelector("input"),
      parent.badge === application.controllers().find(c => c.constructor === Swill.Runtime.resolve("Demo::Badge")),
      parent.seed.name, parent.missing];
  })()`), ["Hello ", "Badge 0", true, true, 3, true, true, "Ada", null]);
  // The editor is a child controller bound to the parent's person: its own
  // bindings resolve under represented_object, bind-* on its root is its own,
  // and the object binding mirrors the badge count into the parent.
  assert.deepEqual(await evaluate(`(() => {
    const editor = document.querySelector("section[controller='Demo::PersonEditor']");
    const input = editor.querySelector("input");
    const results = [[editor.hidden, input.value, editor.querySelector("output").textContent,
      editor.querySelector("button").disabled, document.querySelector("output[bind=badge_count]").textContent]];
    input.value = "Hopper";
    input.dispatchEvent(new Event("input", {bubbles: true}));
    results.push([document.querySelector("p[bind]").textContent, document.querySelector("input").value]);
    document.querySelector("section[controller='Demo::Badge'] [data-action=bump]").click();
    results.push(document.querySelector("output[bind=badge_count]").textContent);
    return results;
  })()`), [[false, "", "true", true, "0"], ["Hello Hopper", "Hopper"], "1"]);
  assert.deepEqual(await evaluate(`(() => {
    document.querySelector("button").click();
    const editor = document.querySelector("section[controller='Demo::PersonEditor']");
    return [document.querySelector("p[bind]").textContent, document.body.__swill_application__ != null,
      document.querySelector("input").disabled, editor.hidden, editor.querySelector("input").value];
  })()`), ["Hello ", true, false, false, ""]);
  await evaluate(`(() => {
    window.dispatchEvent(new Event("pagehide"));
    const input = document.querySelector("input");
    input.value = "Detached";
    input.dispatchEvent(new Event("input"));
    document.querySelector("section[controller='Demo::Badge'] [data-action=bump]").click();
  })()`);
  assert.deepEqual(await evaluate(`[
    document.querySelector("p[bind]").textContent,
    document.querySelector("section[controller='Demo::Badge'] p[bind]").textContent,
    document.body.__swill_application__
  ]`), ["Hello ", "Badge 1", null]);
  assert.deepEqual(exceptions, []);
  console.log("Chrome: application launch, outlets, nested ownership, roots, property and object bindings, actions, responder chain, and teardown passed.");
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
