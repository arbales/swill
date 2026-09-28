// The generated documentation in headless Chrome, opened from disk: the
// navigator (plain JavaScript on the UI build) renders the indexes, filters
// them as the query changes, answers ~, arrows, Enter, and Escape, and
// remembers the pane sizes dragged and the language chosen. Run `rake rdoc`
// first.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const page = pathToFileURL(resolve(root, "rdoc/Swill/Controller.html")).href;
const profile = await mkdtemp(resolve(root, "build/chrome-"));

let child;
let socket;
let sessionId;
const pending = new Map();
const exceptions = [];
let sequence = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, {resolve, reject});
  socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
});
const evaluate = async expression => {
  const result = await call("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const press = async (key, code, keyCode, text) => {
  await call("Input.dispatchKeyEvent", {type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, text});
  await call("Input.dispatchKeyEvent", {type: "keyUp", key, code, windowsVirtualKeyCode: keyCode});
};
const rows = kind => evaluate(`[...document.querySelectorAll(".${kind} li")].map(li => li.textContent)`);
const loaded = () => evaluate(`new Promise((resolve, reject) => {
  const deadline = Date.now() + 5000;
  const poll = () => {
    if (document.querySelectorAll(".class-index li").length > 0) resolve(true);
    else if (Date.now() > deadline) reject(new Error("The navigator did not render"));
    else setTimeout(poll, 20);
  };
  poll();
})`);

const timeout = setTimeout(() => {
  for (const promise of pending.values()) promise.reject(new Error("Documentation check timed out"));
  child?.kill();
}, 20_000);

try {
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
  ({sessionId} = await call("Target.attachToTarget", {targetId, flatten: true}));
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false});
  await call("Page.navigate", {url: page});
  await loaded();

  // The indexes render from search_index.js, links relative to this page.
  const files = await rows("file-index");
  assert.ok(files.includes("README.md"), "the file index lists the guides");
  assert.ok((await rows("class-index")).includes("Swill::Controller"));
  assert.ok((await rows("method-index")).length > 500, "every public method is listed");
  assert.equal(await evaluate(`document.querySelector(".class-index a").getAttribute("href").startsWith("../")`), true);

  // Read as Ruby, the class index lists every class. Read as JavaScript, the
  // classes JavaScript cannot name are the implementation: closed under one
  // row, which opens and closes, and remembers which.
  const rubyRows = await rows("class-index");
  assert.ok(rubyRows.includes("Swill::Launcher") && rubyRows.includes("Swill::Ruby2JS::Compiler"));
  assert.ok(!rubyRows.includes("Implementation"), "Ruby has no implementation row");
  await evaluate(`document.querySelector('[data-action="useJavaScript"]').click()`);
  const javascriptRows = await rows("class-index");
  assert.equal(javascriptRows.at(-1), "Implementation", "the implementation follows the rest, closed");
  assert.ok(javascriptRows.includes("Swill.Object"));
  assert.ok(!javascriptRows.includes("Swill::Launcher") && !javascriptRows.includes("Swill::Distant::Schema"));
  await evaluate(`document.querySelector(".class-index .disclosure:not([hidden])").click()`);
  assert.ok((await rows("class-index")).includes("Swill::Launcher"), "the row opens");
  assert.equal(await evaluate(`document.querySelector(".class-index .disclosure:not([hidden])").getAttribute("aria-expanded")`), "true");
  await call("Page.reload");
  await new Promise(resolve => setTimeout(resolve, 300));
  await loaded();
  assert.ok((await rows("class-index")).includes("Swill::Launcher"), "the open row is remembered");
  await evaluate(`document.querySelector(".class-index .disclosure:not([hidden])").click()`);
  assert.ok(!(await rows("class-index")).includes("Swill::Launcher"), "the row closes");
  await evaluate(`document.querySelector('[data-action="useRuby"]').click()`);
  await evaluate(`localStorage.removeItem("swill-doc-internal")`);
  await evaluate(`localStorage.removeItem("swill-doc-language")`);

  // ~ moves to the search, which the application routes through the
  // responder chain to the navigator.
  await press("~", "Backquote", 192, "~");
  assert.equal(await evaluate(`document.activeElement === document.querySelector(".search input")`), true);
  assert.equal(await evaluate(`document.querySelector(".search input").value`), "", "the ~ is not typed");

  // Typing filters all three lists; the time is the whole update, from the
  // input event to the re-rendered rows.
  const filtered = await evaluate(`(() => {
    const input = document.querySelector(".search input");
    input.value = "binding_root";
    const started = performance.now();
    input.dispatchEvent(new Event("input", {bubbles: true}));
    const elapsed = performance.now() - started;
    const texts = kind => [...document.querySelectorAll("." + kind + " li")].map(li => li.textContent);
    return {methods: texts("method-index"), classes: texts("class-index").length, elapsed};
  })()`);
  assert.deepEqual(filtered.methods, ["#binding_rootSwill::Controller", "#binding_rootSwill::Controller::Editor"]);
  assert.equal(filtered.classes, 0);

  // Clearing the query restores every row; the times are measured on the way.
  const unfiltered = await evaluate(`(() => {
    const input = document.querySelector(".search input");
    const update = value => {
      input.value = value;
      const started = performance.now();
      input.dispatchEvent(new Event("input", {bubbles: true}));
      return performance.now() - started;
    };
    const narrowed = update("b");
    const restored = update("");
    update("binding_root");
    return {narrowed, restored};
  })()`);

  // Arrows move one selection through the results in the order shown; Enter
  // opens it.
  const selected = () => evaluate(`[...document.querySelectorAll(".navigator li.selected")].map(li => li.textContent)`);
  await press("ArrowDown", "ArrowDown", 40);
  assert.deepEqual(await selected(), ["#binding_rootSwill::Controller"]);
  await press("ArrowDown", "ArrowDown", 40);
  assert.deepEqual(await selected(), ["#binding_rootSwill::Controller::Editor"]);
  await press("ArrowDown", "ArrowDown", 40);
  assert.deepEqual(await selected(), ["#binding_rootSwill::Controller::Editor"], "the last result holds");
  await press("ArrowUp", "ArrowUp", 38);
  await press("ArrowUp", "ArrowUp", 38);
  await press("ArrowUp", "ArrowUp", 38);
  assert.deepEqual(await selected(), [], "above the first result, nothing is selected");
  await press("ArrowDown", "ArrowDown", 40);
  await press("ArrowDown", "ArrowDown", 40);
  assert.equal(await evaluate(`document.activeElement === document.querySelector(".search input")`), true,
               "the search keeps the keyboard");

  // A section with no results hides, header and all.
  const hidden = () => evaluate(`[...document.querySelectorAll(".navigator .pane-header[bind-hidden]")]
    .filter(header => header.hidden).map(header => header.textContent.trim())`);
  assert.deepEqual(await hidden(), ["File index", "Class index"]);
  assert.equal(await evaluate(`document.querySelector(".class-index").hidden`), true);

  // Escape abandons the query and leaves the search; every section returns.
  await press("Escape", "Escape", 27);
  assert.equal(await evaluate(`document.activeElement === document.querySelector(".search input")`), false);
  assert.equal(await evaluate(`document.querySelector(".search input").value`), "");
  assert.deepEqual(await hidden(), []);
  assert.ok((await rows("method-index")).length > 500);

  // Dragging the right edge sets the pane's width, and dragging a header the
  // height of the index above it.
  const drag = async (selector, dx, dy) => {
    const [x, y] = await evaluate(`(() => {
      const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return [box.left + box.width / 2, box.top + box.height / 2];
    })()`);
    await call("Input.dispatchMouseEvent", {type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1});
    await call("Input.dispatchMouseEvent", {type: "mouseMoved", x: x + dx, y: y + dy, button: "left", buttons: 1});
    await call("Input.dispatchMouseEvent", {type: "mouseReleased", x: x + dx, y: y + dy, button: "left", buttons: 0, clickCount: 1});
  };
  const sizes = () => evaluate(`[document.querySelector(".navigator").getBoundingClientRect().width,
    document.querySelector(".file-index").getBoundingClientRect().height]`);
  const [width, height] = await sizes();
  await drag(".width-handle", 120, 0);
  await drag("[data-resizes=file-index]", 0, 60);
  const [widened, taller] = await sizes();
  assert.ok(Math.abs(widened - (width + 120)) <= 4, `the pane widened from ${width} to ${widened}`);
  assert.ok(Math.abs(taller - (height + 60)) <= 4, `the file index grew from ${height} to ${taller}`);

  assert.equal(await evaluate(`document.querySelector('[data-section="class-index"]').getAttribute("aria-expanded")`), "true", "resizing does not collapse the section");

  for (const name of ["file-index", "method-index"]) {
    const headerTop = await evaluate(`document.querySelector('[data-section="${name}"]').getBoundingClientRect().top`);
    await drag(`[data-section="${name}"]`, 0, 0);
    assert.equal(await evaluate(`document.querySelector(".${name}").getBoundingClientRect().height`), 0);
    if (name === "file-index") {
      assert.equal(await evaluate(`document.querySelector('[data-section="file-index"]').getBoundingClientRect().top`), headerTop, "the top section collapses upward into its heading");
    } else {
      assert.equal(await evaluate(`(() => {
        const header = document.querySelector('[data-section="method-index"]').closest("header");
        return header.getBoundingClientRect().bottom === document.querySelector(".navigator").getBoundingClientRect().bottom;
      })()`), true, "the bottom section collapses downward to the foot of the sidebar");
    }
    await evaluate(`document.querySelector('[data-section="${name}"]').focus()`);
    await press(" ", "Space", 32, " ");
    assert.equal(await evaluate(`document.querySelector('[data-section="${name}"]').getAttribute("aria-expanded")`), "true", "Space reopens a focused section");
  }
  assert.equal(await evaluate(`[...document.querySelectorAll(".navigator .pane-header:not(.search)")].every(header => getComputedStyle(header).borderTopWidth === "1px")`), true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(".search")).borderTopWidth`), "0px");
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(".search-field")).padding`), "6px");

  // Each index keeps its scroll position, including a section closed during navigation.
  const scrollPositions = () => evaluate(`[...document.querySelectorAll(".navigator .index")].map(list => list.scrollTop)`);
  await evaluate(`[...document.querySelectorAll(".navigator .index")].forEach((list, i) => list.scrollTop = 80 + i * 100)`);
  await new Promise(resolve => setTimeout(resolve, 100));
  const scrolled = await scrollPositions();
  assert.ok(scrolled.every(position => position > 0), "all three indexes scroll");
  await drag('[data-section="class-index"]', 0, 0);
  assert.equal(await evaluate(`document.querySelector(".class-index").getBoundingClientRect().height`), 0);
  assert.equal(await evaluate(`document.querySelector('[data-section="class-index"]').getAttribute("aria-expanded")`), "false");

  // The sizes carry to the next page.
  await call("Page.navigate", {url: pathToFileURL(resolve(root, "rdoc/Swill/View.html")).href});
  await new Promise(resolve => setTimeout(resolve, 300));
  await loaded();
  const [kept, keptHeight] = await sizes();
  assert.ok(Math.abs(kept - widened) <= 1 && Math.abs(keptHeight - taller) <= 1, "the layout is remembered");
  assert.equal(await evaluate(`document.querySelector('[data-section="class-index"]').getAttribute("aria-expanded")`), "false", "collapsed sections stay closed across pages");
  await evaluate(`document.querySelector('[data-section="class-index"]').focus()`);
  await press("Enter", "Enter", 13, "\r");
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await evaluate(`document.querySelector('[data-section="class-index"]').getAttribute("aria-expanded")`), "true", "Enter opens a focused section");
  assert.deepEqual(await scrollPositions(), scrolled, "each index restores its scroll position");

  await press("~", "Backquote", 192, "~");
  await evaluate(`(() => {
    const input = document.querySelector(".search input");
    input.value = "binding_root";
    input.dispatchEvent(new Event("input", {bubbles: true}));
  })()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  await press("Escape", "Escape", 27);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(await scrollPositions(), scrolled, "clearing search restores the index positions");
  await evaluate(`localStorage.removeItem("swill-doc-layout")`);

  // The language switch re-spells the page and the indexes, and the choice
  // carries to the next page.
  const visibleTitle = () => evaluate(`[...document.querySelectorAll(".title, .title span")]
    .filter(node => node.offsetParent && !node.querySelector("span")).map(node => node.textContent).join("")`);
  assert.equal(await visibleTitle(), "Swill::View");
  await evaluate(`document.querySelector('[data-action="useJavaScript"]').click()`);
  assert.equal(await evaluate(`document.documentElement.dataset.language`), "javascript");
  assert.equal(await visibleTitle(), "Swill.View");
  assert.ok((await rows("method-index")).some(text => text.startsWith("#awakeFromDOM")), "the method index is re-spelled");
  await call("Page.navigate", {url: pathToFileURL(resolve(root, "rdoc/Swill/Controller.html")).href});
  await new Promise(resolve => setTimeout(resolve, 300));
  await loaded();
  assert.equal(await visibleTitle(), "Swill.Controller", "the language is remembered");
  await evaluate(`document.querySelector('[data-action="useRuby"]').click()`);
  assert.equal(await visibleTitle(), "Swill::Controller");
  await evaluate(`localStorage.removeItem("swill-doc-language")`);

  // ~ returns to the search, and Enter opens the selected result.
  await press("~", "Backquote", 192, "~");
  await evaluate(`(() => {
    const input = document.querySelector(".search input");
    input.value = "binding_root";
    input.dispatchEvent(new Event("input", {bubbles: true}));
  })()`);
  await press("ArrowDown", "ArrowDown", 40);
  await press("ArrowDown", "ArrowDown", 40);
  const navigated = once(socket, "message");
  await press("Enter", "Enter", 13, "\r");
  await navigated;
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate(`location.pathname.endsWith("/Swill/Controller/Editor.html") && location.hash`),
               "#method-i-binding_root");

  assert.deepEqual(exceptions, []);
  console.log(`Documentation: navigator passed. Filter: ${filtered.elapsed.toFixed(1)}ms to one row, ` +
              `${unfiltered.narrowed.toFixed(1)}ms to a broad match, ${unfiltered.restored.toFixed(1)}ms back to every row.`);
} catch (error) {
  console.error("page exceptions:", JSON.stringify(exceptions.map(e => e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text), null, 2));
  throw error;
} finally {
  clearTimeout(timeout);
  socket?.close();
  if (child && child.exitCode === null && child.pid) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await rm(profile, {recursive: true, force: true});
}
