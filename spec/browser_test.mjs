// Optional real-browser check using Deno's built-in WebSocket and Chrome's CDP.
// No npm packages, browser downloads, or access to the user's browser profile.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:http";
import {readFile, mkdtemp} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {SourceMap} from "node:module";
import {removeBrowserProfile} from "./browser_profile.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(resolve(root, "build/chrome-"));
const server = createServer(async (request, response) => {
  try {
    const file = resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("outside root");
    const content = await readFile(file);
    const types = {".html": "text/html", ".css": "text/css"};
    response.setHeader("Content-Type", types[extname(file)] ?? "text/javascript");
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

let child;
let socket;
const pending = new Map();
const exceptions = [];
const scripts = [];
let onPause;
let sequence = 0;
let evaluate;
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
    if (message.method === "Debugger.scriptParsed") scripts.push(message.params);
    if (message.method === "Debugger.paused") onPause?.(message.params);
  });
  await once(socket, "open");
  const {targetId} = await call("Target.createTarget", {url: "about:blank"});
  const {sessionId} = await call("Target.attachToTarget", {targetId, flatten: true});
  await call("Runtime.enable", {}, sessionId);
  evaluate = async expression => {
    const result = await call("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true}, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call("Page.navigate", {url: `http://127.0.0.1:${server.address().port}/examples/rb/index.html#main=farewell,n=2;people.selected=2`}, sessionId);
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
  // The fragment chose the main window's content and restored its state
  // before controller_did_load.
  assert.deepEqual(await evaluate(`(() => {
    const container = document.querySelector("[window=main]");
    const badge = container.children[0].__swill_view__.controllerValue();
    return [container.getAttribute("name"), container.querySelector("p[bind]").textContent, badge.count, badge.restored];
  })()`), ["farewell", "Badge 2", 2, true]);
  assert.equal(await evaluate(`(() => {
    const input = document.querySelector("input");
    input.value = "Grace";
    input.dispatchEvent(new Event("input", {bubbles: true}));
    return document.querySelector("p[bind]").textContent;
  })()`), "Hello Grace");
  // The name field is first responder from awake_from_dom; Escape travels
  // view, controller; focusing the badge's button moves the first responder.
  assert.deepEqual(await evaluate(`(() => {
    const application = Swill.Application.shared();
    const parent = application.controllers[0];
    const badge = application.controllers.find(c => c.constructor === Swill.Runtime.resolve("Demo::Badge"));
    const input = document.querySelector("input");
    const results = [document.activeElement === input, application.firstResponder() === parent.nameField];
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    results.push(document.querySelector("p[bind]").textContent, input.value);
    document.querySelector("section[controller='Demo::Badge'] button").focus();
    results.push(application.firstResponder() === badge);
    input.focus();
    results.push(application.firstResponder() === parent.nameField);
    input.value = "Grace";
    input.dispatchEvent(new Event("input", {bubbles: true}));
    return results;
  })()`), [true, true, "Hello ", "", true, true]);
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
    const application = Swill.Application.shared();
    const [parent, child] = application.controllers;
    return [document.querySelector("p[bind]").textContent, badge.querySelector("p[bind]").textContent,
      application.constructor === Swill.Runtime.resolve("Demo::Application"), application.launched,
      application.controllers.length,
      parent.nameField.element === document.querySelector("input"),
      parent.badge === application.controllers.find(c => c.constructor === Swill.Runtime.resolve("Demo::Badge")),
      parent.seed.name, parent.missing];
  })()`), ["Hello ", "Badge 0", true, true, 5, true, true, "Ada", null]);
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
  // Windows: the main container was filled from its template at launch,
  // swap_window replaces it through the application, and the palette is a
  // dialog that closes itself and restores focus.
  assert.deepEqual(await evaluate(`(() => {
    const application = Swill.Application.shared();
    const container = document.querySelector("[window=main]");
    const results = [container.getAttribute("name"), container.querySelector(".note").textContent,
      container.querySelector("p[bind]").textContent, application.controllers.length];
    document.querySelector("[data-action=swap_window]").click();
    results.push(container.getAttribute("name"), container.querySelector(".note").textContent, container.children.length,
      location.hash);
    document.querySelector("[data-action=open_palette]").click();
    const dialog = document.querySelector("dialog");
    results.push(dialog.open, application.firstResponder() === dialog.__swill_view__.controllerValue());
    dialog.querySelector("[data-action=close]").click();
    results.push(document.querySelector("dialog") === null, application.firstResponder() === application.controllers[0].nameField);
    return results;
  })()`), ["farewell", "Farewell", "Badge 0", 5, "welcome", "Welcome", 1, "#main=welcome,n=0;people.selected=2", true, true, true, true]);
  // Back returns to the previous window content and its restored state.
  assert.deepEqual(await evaluate(`(async () => {
    const container = document.querySelector("[window=main]");
    const before = [location.hash, container.getAttribute("name")];
    const popped = new Promise(resolve => window.addEventListener("popstate", resolve, {once: true}));
    history.back();
    await popped;
    await new Promise(resolve => setTimeout(resolve, 0));
    const badge = container.children[0].__swill_view__.controllerValue();
    return [...before, location.hash, container.getAttribute("name"), badge.count, badge.restored];
  })()`), ["#main=welcome,n=0;people.selected=2", "welcome", "#main=farewell,n=0;people.selected=2", "farewell", 0, true]);
  // The people list rendered rows from its template inside the people
  // window and restored the selection the fragment named by id. Clicks and
  // arrow keys select, the fragment follows, Enter hands the selection to
  // the parent, and a row's button reaches the parent knowing its row.
  assert.deepEqual(await evaluate(`(() => {
    const list = document.querySelector("section[controller='Demo::PeopleList']");
    const controller = list.__swill_view__.controllerValue();
    const application = Swill.Application.shared();
    const rows = () => Array.from(list.querySelectorAll("tbody tr"));
    const names = () => rows().map(row => row.children[0].textContent);
    const selected = () => rows().map(row => row.classList.contains("selected"));
    const results = [names(), selected(), list.querySelector("output").textContent,
      list.querySelector("[data-action=activate_selection]").disabled];
    rows()[0].children[0].click();
    results.push(selected(), controller.selectedObjectId, list.querySelector("output").textContent, location.hash);
    list.focus();
    results.push(application.firstResponder() === controller);
    list.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}));
    results.push(selected(), location.hash);
    list.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    results.push(rows().length, rows()[1].classList.contains("being-edited"), controller.isEditing());
    list.querySelector("tbody tr[controller] input").dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    results.push(rows().length, controller.isEditing(), application.firstResponder() === controller);
    rows()[2].querySelector("button").click();
    results.push(names(), controller.selectedObjectId, selected(), document.querySelector("p[bind]").textContent);
    return results;
  })()`), [
    ["Ada", "Grace", "Linus"], [false, true, false], "Grace", false,
    [true, false, false], "1", "Ada", "#main=farewell,n=0;people.dir=ascending,selected=1",
    true,
    [false, true, false], "#main=farewell,n=0;people.dir=ascending,selected=2",
    4, true, true,
    3, false, true,
    ["Ada", "Grace"], null, [false, false], "Hello Hopper"
  ]);
  // Header cells sort the list through the sort_by action; the sort is
  // written to the fragment, the list marks the sorted column (its class,
  // and aria-sort, which no markup writes), and the
  // selection follows its object through the reorder.
  assert.deepEqual(await evaluate(`(() => {
    const list = document.querySelector("section[controller='Demo::PeopleList']");
    const rows = () => Array.from(list.querySelectorAll("tbody tr"));
    const names = () => rows().map(row => row.children[0].textContent);
    const headers = () => Array.from(list.querySelectorAll("th")).slice(0, 2).map(th =>
      [...th.classList].find(name => name.startsWith("sorted-")) ?? th.getAttribute("aria-sort"));
    const aria = () => Array.from(list.querySelectorAll("th")).slice(0, 2).map(th => th.getAttribute("aria-sort"));
    rows()[0].children[0].click();
    const results = [names(), headers()];
    list.querySelector("th[data-column=role]").click();
    results.push(names(), headers(), aria(), rows().map(row => row.classList.contains("selected")), location.hash);
    list.querySelector("th[data-column=role]").click();
    results.push(names(), headers(), location.hash);
    return results;
  })()`), [
    ["Ada", "Grace"], [null, null],
    ["Grace", "Ada"], [null, "sorted-ascending"], [null, "ascending"], [false, true], "#main=farewell,n=0;people.dir=ascending,selected=1,sort=role",
    ["Ada", "Grace"], [null, "sorted-descending"], "#main=farewell,n=0;people.dir=descending,selected=1,sort=role"
  ]);
  // Enter on the selected row opens the inline editor after it; typing
  // edits a draft, Enter commits it into the person and the row, and Escape
  // discards.
  assert.deepEqual(await evaluate(`(() => {
    const list = document.querySelector("section[controller='Demo::PeopleList']");
    const controller = list.__swill_view__.controllerValue();
    const rows = () => Array.from(list.querySelectorAll("tbody tr"));
    const names = () => rows().filter(row => !row.hasAttribute("controller")).map(row => row.children[0].textContent);
    const editor = () => list.querySelector("tbody tr[controller]");
    const key = (target, name) => target.dispatchEvent(new KeyboardEvent("keydown", {key: name, bubbles: true}));
    const type = (input, value) => { input.value = value; input.dispatchEvent(new Event("input", {bubbles: true})); };
    rows()[0].children[0].click();
    list.focus();
    key(list, "Enter");
    const results = [rows().length, rows()[0].classList.contains("being-edited"), document.activeElement === editor().querySelector("input")];
    type(editor().querySelector("input"), "Edited");
    results.push(names()[0], controller.editedObject.name);
    key(editor().querySelector("input"), "Enter");
    results.push(rows().length, names()[0], controller.selectedObject.name, document.activeElement === list);
    key(list, "Enter");
    type(editor().querySelector("input"), "Discarded");
    key(editor().querySelector("input"), "Escape");
    results.push(editor() === null, names()[0], location.hash);
    return results;
  })()`), [
    3, true, true,
    "Ada", "Edited",
    2, "Edited", "Edited", true,
    true, "Edited", "#main=farewell,n=0;people.dir=descending,selected=1,sort=role"
  ]);
  // Code-created content awakens through the MutationObserver, and removed
  // content is torn down, without any explicit call.
  assert.deepEqual(await evaluate(`(async () => {
    const main = document.querySelector("main");
    const late = document.createElement("section");
    late.setAttribute("controller", "Demo::Badge");
    late.innerHTML = '<p bind="title"></p>';
    main.appendChild(late);
    await new Promise(resolve => setTimeout(resolve, 0));
    const controller = late.__swill_view__.controllerValue();
    const awakened = [late.querySelector("p").textContent, controller.parent() === Swill.Application.shared().controllers[0]];
    late.remove();
    await new Promise(resolve => setTimeout(resolve, 0));
    return [...awakened, controller.view.controllerValue() === null];
  })()`), ["Badge 0", true, true]);
  assert.deepEqual(await evaluate(`(() => {
    document.querySelector("button").click();
    const editor = document.querySelector("section[controller='Demo::PersonEditor']");
    return [document.querySelector("p[bind]").textContent, Swill.Application.isRunning(),
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
    Swill.Application.isRunning()
  ]`), ["Hello ", "Badge 1", false]);

  // The static example: every facility on one page. The fragment picks the
  // main pane and restores the workspace pane's fields.
  await call("Page.navigate", {url: `http://127.0.0.1:${server.address().port}/examples/rb/static/index.html#main=bindings;workspace=intro-pane,page=3,q=Hi`}, sessionId);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (document.querySelector("h1[bind=greeting]")?.textContent === "Hello, world!") resolve(true);
      else if (Date.now() > deadline) reject(new Error("The static example did not awaken"));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  // Bindings pane: key paths, the draft editor, the notification center,
  // the first responder, and the workspace restoration.
  assert.deepEqual(await evaluate(`(() => {
    const type = (input, value) => { input.value = value; input.dispatchEvent(new Event("input", {bubbles: true})); };
    const key = (target, name) => target.dispatchEvent(new KeyboardEvent("keydown", {key: name, bubbles: true}));
    const pane = document.querySelector("[controller='Static::BindingsPane']");
    const results = [document.querySelector("[data-example=bindings]").getAttribute("aria-pressed"),
      document.activeElement === pane.querySelector("[outlet=name_field]"),
      pane.querySelector("[bind=first_responder_debug]").textContent];
    type(pane.querySelector("[outlet=name_field]"), "Ada");
    results.push(pane.querySelector("h1").textContent, pane.querySelector("[bind='user.dirty?']").textContent);
    pane.querySelector("[data-action=increment]").click();
    results.push(pane.querySelector("[bind=last_notification]").textContent);
    const draftName = pane.querySelector("[outlet=draft_editor] input");
    draftName.focus();
    type(draftName, "Grace");
    results.push(pane.querySelector("h1").textContent, pane.querySelector("[data-action=apply_draft]").disabled);
    key(draftName, "Enter");
    results.push(pane.querySelector("h1").textContent, pane.querySelector("[data-action=apply_draft]").disabled);
    const intro = document.querySelector("[controller='Static::IntroPane']");
    results.push(intro.querySelector("[outlet=field]").value, intro.querySelector("output").textContent, location.hash);
    return results;
  })()`), [
    "true", true, "Swill::View input[outlet=name_field]",
    "Hello, Ada!", "true",
    "Counter changed to 1",
    "Hello, Ada!", false,
    "Hello, Grace!", true,
    "Hi", "3", "#main=bindings;workspace=intro-pane,page=3,q=Hi"
  ]);
  // Controls pane through the toolbar, then the data pane's editable list,
  // then the palette dialog.
  assert.deepEqual(await evaluate(`(() => {
    const key = (target, name) => target.dispatchEvent(new KeyboardEvent("keydown", {key: name, bubbles: true}));
    document.querySelector("[data-example=controls]").click();
    const controls = document.querySelector("[controller='Static::ControlsPane']");
    const picker = controls.querySelector("[outlet=custom_select]");
    const results = [document.querySelector("[window=main]").getAttribute("name"),
      document.querySelector("[data-example=controls]").getAttribute("aria-pressed"),
      controls.querySelector("[bind='standalone_text_field.value']").textContent,
      controls.querySelector("[bind='standalone_select.value']").textContent,
      picker.querySelector("[class='custom-select-label']").textContent,
      controls.querySelector("output[bind=selected_person]").textContent];
    picker.focus();
    key(picker, "Enter");
    const popup = picker.querySelector('.custom-select-popup');
    if (getComputedStyle(popup).position !== 'absolute' || getComputedStyle(popup).display === 'none') {
      throw new Error('Custom select popup must overlay the page when open');
    }
    key(picker, "ArrowDown");
    if (getComputedStyle(popup).display !== 'none') throw new Error('Closed popup must be hidden');
    results.push(controls.querySelector("output[bind=selected_person]").textContent, location.hash.includes("main=controls"));
    document.querySelector("[data-example=data]").click();
    const data = document.querySelector("[controller='Static::DataPane']");
    const rows = () => Array.from(data.querySelectorAll("tbody tr"));
    rows()[1].children[0].click();
    results.push(rows().length, data.querySelector("[bind=selected_people]").textContent);
    data.querySelector("table").focus();
    key(data.querySelector("table"), "Enter");
    results.push(rows().length, rows()[2].querySelector("input") !== null, document.activeElement === rows()[2].querySelector("input"));
    key(rows()[2].querySelector("input"), "Escape");
    results.push(rows().length);
    document.querySelector("[data-action=show_palette]").click();
    const dialog = document.querySelector("dialog[controller='Static::Palette']");
    const bounds = dialog.getBoundingClientRect();
    if (getComputedStyle(dialog).position !== 'fixed' || bounds.top < 0 || bounds.bottom > innerHeight) {
      throw new Error('Palette must float within the viewport, independent of its document position');
    }
    results.push(dialog !== null && dialog.open, document.activeElement === dialog.querySelector("input"));
    dialog.querySelector("[data-action=close]").click();
    results.push(document.querySelector("dialog[controller='Static::Palette']") === null);
    return results;
  })()`), [
    "controls", "true", "Observable control", "Grace", "Ada Lovelace", "ada",
    "grace", true,
    3, "Grace",
    4, true, true,
    3,
    true, true,
    true
  ]);
  assert.deepEqual(exceptions, []);

  assert.deepEqual(await evaluate(`(() => {
    document.querySelector("[data-example=controls]").click();
    const root = document.querySelector("[outlet=segmented]");
    const control = root.__swill_view__;
    const buttons = Array.from(root.querySelectorAll("[role=radio]"));
    const changes = [];
    root.addEventListener("change", () => changes.push(control.value));
    Swill.Application.shared().makeFirstResponder(control);
    const key = name => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key: name, bubbles: true, cancelable: true}));
    const result = [getComputedStyle(root.querySelector('.segmented-options')).display,
      buttons.filter(b => b.tabIndex === 0).length, document.activeElement === buttons[0]];
    key("ArrowRight");
    result.push(control.value, document.activeElement === buttons[1]);
    document.activeElement.click();
    result.push(control.value, document.querySelector("[outlet=custom_select] .custom-select-label").textContent);
    key("End"); result.push(control.value, document.activeElement === buttons[2]);
    key("Home"); result.push(control.value, document.activeElement === buttons[0]);
    buttons[2].click(); result.push(control.value);
    control.disabled = true;
    buttons[0].click(); result.push(control.value, buttons.every(b => b.disabled));
    result.push(changes.length);
    return result;
  })()`), ["inline-flex", 1, true, "ada", true, "grace", "Grace Hopper", "grace", true, "grace", true, "katherine", "katherine", true, 2]);

  // Windows and the key view loop, with keys the browser itself receives,
  // so its own Tab handling is what the framework has to contain.
  const press = async (key, {shift = false} = {}) => {
    const codes = {Tab: 9, Escape: 27, Enter: 13};
    for (const type of ["rawKeyDown", "keyUp"]) {
      await call("Input.dispatchKeyEvent", {type, key, code: key, windowsVirtualKeyCode: codes[key],
        modifiers: shift ? 8 : 0}, sessionId);
    }
  };
  const focused = () => evaluate(`(() => {
    const active = document.activeElement;
    const app = Swill.Application.shared();
    return [active.textContent.trim() || active.getAttribute("outlet") || active.tagName,
      app.keyWindow() === app.mainWindow() ? "page" : app.keyWindow().name];
  })()`);
  await evaluate(`(() => {
    document.querySelector("[data-action=show_palette]").focus();
    document.querySelector("[data-action=confirm]").click();
  })()`);
  assert.deepEqual(await focused(), ["Cancel", "alert"], "an alert is key, its default button focused");
  await press("Tab");
  assert.deepEqual(await focused(), ["Discard", "alert"]);
  await press("Tab");
  assert.deepEqual(await focused(), ["Cancel", "alert"], "Tab wraps within the alert");
  await press("Tab", {shift: true});
  assert.deepEqual(await focused(), ["Discard", "alert"], "Shift-Tab wraps back");
  await press("Escape");
  assert.deepEqual(await focused(), ["Palette", "page"], "dismissed, the page is key, focused where it was");
  assert.equal(await evaluate(`document.querySelector("[bind=answer]").textContent`), "Cancel");
  await evaluate(`document.querySelector("[data-action=show_palette]").click()`);
  assert.deepEqual(await focused(), ["field", "palette"], "a palette's content keeps the field it chose");
  await press("Tab");
  assert.deepEqual(await focused(), ["Close", "palette"]);
  await press("Tab");
  assert.deepEqual(await focused(), ["field", "palette"], "a non-modal window's loop wraps too");
  await evaluate(`document.querySelector(".palette-window [data-action=close]").click()`);
  assert.deepEqual(await focused(), ["Palette", "page"]);
  assert.deepEqual(await evaluate(`(() => {
    const app = Swill.Application.shared();
    const views = app.mainWindow().keyViews([]);
    views[0].focus();
    return [views.length > 3, views.at(-1).outerHTML];
  })()`).then(async ([many]) => {
    await press("Tab", {shift: true});
    return [many, await evaluate(`(() => {
      const views = Swill.Application.shared().mainWindow().keyViews([]);
      return document.activeElement === views.at(-1);
    })()`)];
  }), [true, true], "Shift-Tab from the page's first key view wraps to its last");

  // A second page uses the same framework bundle directly from plain
  // JavaScript: registration is metadata-backed and startup is explicit.
  await call("Page.navigate", {url: `http://127.0.0.1:${server.address().port}/examples/rb/javascript.html`}, sessionId);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (document.querySelector("h1")?.textContent === "Hello Ada" && window.application &&
          getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() &&
          window.application.theme === "linear") resolve(true);
      else if (Date.now() > deadline) reject(new Error("JavaScript application did not start"));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.deepEqual(await evaluate(`(() => {
    const controller = application.controllers[0];
    const another = new controller.constructor();
    return [
      application instanceof Swill.Application,
      controller instanceof Swill.Controller,
      document.body.dataset.viewDidLoad,
      document.querySelector("[outlet=status]").textContent,
      controller.items !== another.items
    ];
  })()`), [true, true, "true", "Ready", true]);
  assert.deepEqual(await evaluate(`(() => {
    const input = document.querySelector("input");
    input.value = "Grace";
    input.dispatchEvent(new Event("input", {bubbles: true}));
    const changed = document.querySelector("h1").textContent;
    document.querySelector("button").click();
    return [changed, document.querySelector("h1").textContent, input.value];
  })()`), ["Hello Grace", "Hello ", ""]);
  await evaluate(`window.dispatchEvent(new Event("pagehide"))`);
  assert.equal(await evaluate(`Swill.Application.isRunning()`), false);

  // Chrome discovers the composed map and a real paused call frame resolves
  // to the second class's original Ruby, not its extracted or formatted JS.
  await call("Debugger.enable", {}, sessionId);
  await call("Page.navigate", {url: `http://127.0.0.1:${server.address().port}/spec/fixtures/source_maps/index.html`}, sessionId);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      try {
        if (Swill.Runtime.resolve("SourceMapFixture::Second")) return resolve(true);
      } catch {}
      if (Date.now() > deadline) reject(new Error("Source-map fixture did not load"));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  const script = scripts.find(script => script.url.endsWith("/build/source_map_client.js"));
  assert.ok(script?.sourceMapURL, "Chrome found the script's sourceMappingURL");
  const mapURL = new URL(script.sourceMapURL, script.url);
  const mapResponse = await fetch(mapURL);
  assert.ok(mapResponse.ok);
  const map = await mapResponse.json();
  const {scriptSource} = await call("Debugger.getScriptSource", {scriptId: script.scriptId}, sessionId);
  const token = '"second_token"';
  const prefix = scriptSource.slice(0, scriptSource.indexOf(token)).split("\n");
  const breakpoint = await call("Debugger.setBreakpointByUrl", {
    url: script.url, lineNumber: prefix.length - 1, columnNumber: 0
  }, sessionId);
  assert.ok(breakpoint.locations.length);
  const paused = new Promise(resolve => { onPause = resolve; });
  const result = evaluate(`new (Swill.Runtime.resolve("SourceMapFixture::Second"))().marker()`);
  const {callFrames: [frame]} = await paused;
  await call("Debugger.resume", {}, sessionId);
  onPause = null;
  assert.equal(await result, "second_token");
  const original = new SourceMap(map).findEntry(frame.location.lineNumber, frame.location.columnNumber);
  assert.ok(original.originalSource?.endsWith("/spec/fixtures/source_maps/app.rb"));
  const source = map.sourcesContent[map.sources.indexOf(original.originalSource)];
  const rubyLines = source.split("\n");
  const rubyRow = rubyLines.findIndex(line => line.includes(token));
  assert.equal(original.originalLine, rubyRow);
  assert.equal(original.originalColumn, rubyLines[rubyRow].indexOf(token));
  await call("Debugger.removeBreakpoint", {breakpointId: breakpoint.breakpointId}, sessionId);

  // The actual error reporter follows the bundle's map over HTTP, without
  // changing Error.stack or waiting to present the original error.
  await evaluate(`(() => {
    Swill.start({development: true});
    try { new (Swill.Runtime.resolve("SourceMapFixture::Second"))().explode(); }
    catch (error) {
      window.originalSourceMapStack = error.stack;
      window.dispatchEvent(new ErrorEvent("error", {error, message: error.message}));
    }
    return true;
  })()`);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      const text = document.querySelector("dialog .alert-text");
      if (text?.children[0].textContent === "source_map_probe" &&
          /source_maps\\/app\\.rb:19:\\d+/.test(text.children[1].textContent)) resolve(true);
      else if (Date.now() > deadline) reject(new Error("Ruby error report did not map: " + text?.textContent));
      else setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.equal(await evaluate(`originalSourceMapStack.includes("source_map_client.js:") && !originalSourceMapStack.includes("app.rb:")`), true);
  await evaluate(`Swill.Application.shared().terminate()`);

  assert.deepEqual(exceptions, []);
  console.log("Chrome: compiled Ruby, no-build JavaScript, paused Ruby frames, and mapped error reports passed.");
} catch (error) {
  // What the page saw, for the failure.
  console.error("page exceptions:", JSON.stringify(exceptions.map(e => e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text), null, 2));
  try {
    console.error("main window:", JSON.stringify(await evaluate(`[document.body.dataset.swillError || null, document.querySelector("[window=main]")?.outerHTML.slice(0, 400)]`)));
  } catch (inner) {
    console.error("page state unavailable:", inner.message);
  }
  throw error;
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
  await removeBrowserProfile(profile);
}
