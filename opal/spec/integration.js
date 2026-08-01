// End-to-end check of the compiled Swill bundle against the DOM shim:
// awakening resolves the controller, lifecycle hooks fire in order, the
// initial binding renders, input propagates back, and data-action dispatches.
//
//   node spec/integration.js   (after building spec/dist/integration.js)

const assert = require("assert");
const { build, install } = require("./support/dom");

globalThis.__hooks__ = [];
globalThis.__escaped__ = false;
globalThis.__disappeared__ = [];
globalThis.__palette__ = [];
globalThis.__panes__ = [];
globalThis.__wire_url__ = null;
globalThis.__wire_requests__ = [];
globalThis.__editor_events__ = [];
globalThis.fetch = (url, options = {}) => {
  globalThis.__wire_url__ = url;
  const method = options.method || "GET";
  globalThis.__wire_requests__.push({ url, method, body: options.body });
  const data = method === "PATCH"
    ? { id: "1", type: "members", attributes: { name: "Persisted member" } }
    : [{ id: "1", type: "members", attributes: { name: "Dataset member" } }];
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  });
};

// <body><main controller><h1 bind><input bind><button data-action></main></body>
const body = build([
  "body", {}, [
    ["main", { controller: "RecordingController" }, [
      ["h1", { bind: "message" }],
      ["input", { bind: "message", outlet: "message_field" }],
      ["h2", { bind: "greeting" }],
      ["input", { bind: "user.name" }],
      ["button", { type: "button", "data-action": "clear" }],
      ["section", { controller: "CounterController" }, [
        ["p", { bind: "count" }],
        ["button", { type: "button", "data-action": "increment" }],
      ]],
      ["section", { controller: "RootedController" }, [
        ["p", { bind: "name" }],
        ["input", { bind: "name" }],
        ["button", { type: "button", "bind-disabled": "@local_message.strip.empty?" }],
      ]],
    ]],
    ["template", { for: "window", name: "palette" }, [
      ["dialog", { controller: "PaletteController" }, [
        ["input", { outlet: "palette_field" }],
        ["button", { type: "button", "data-action": "close" }],
      ]],
    ]],
    ["section", { window: "workspace", name: "pane-one" }],
    ["template", { for: "window", name: "pane-one" }, [
      ["article", { controller: "PaneOneController" }, [
        ["input", { outlet: "pane_one_field" }],
        ["button", { type: "button", "data-action": "swap" }],
      ]],
    ]],
    ["template", { for: "window", name: "pane-two" }, [
      ["article", { controller: "PaneTwoController" }, [
        ["input", { outlet: "pane_two_field" }],
      ]],
    ]],
    ["section", { controller: "ListHostController" }, [
      ["div", { controller: "Swill::List", outlet: "item_list", tabindex: "0", multiple: "" }, [
        ["section", { outlet: "rows" }],
        ["template", { for: "row" }, [["div", { class: "source-row" }, [["span", { bind: "name" }]]]]],
      ]],
      ["p", { bind: "item_list.selected_object.name" }],
      ["p", { bind: "selection_summary" }],
      ["input", { klass: "Swill::TextField", outlet: "text_control", value: "Control" }],
      ["p", { bind: "text_control.value" }],
      ["select", { klass: "Swill::Select", outlet: "select_control" }, [
        ["option", { value: "" }],
      ]],
      ["p", { bind: "select_control.value" }],
      ["div", { klass: "Swill::CustomSelect", outlet: "custom_select" }],
      ["p", { bind: "custom_select.value" }],
    ]],
    ["section", { controller: "EditorHostController" }, [
      ["section", { controller: "RecordingEditor", outlet: "editor" }, [
        ["input", { bind: "name" }],
      ]],
      ["p", { bind: "editor.represented_object.name" }],
    ]],
  ],
]);

install(body);

// Loading the bundle runs TestApp.shared.start against document.body.
require("./dist/integration.js");

assert.deepStrictEqual(globalThis.__model__, ["Grace", true, "Grace"], "compiled model should remain reactive");

const main = body.children[0];
const h1 = main.children[0]; // bind="message"
const messageInput = main.children[1]; // bind="message", outlet="message_field"
const greeting = main.children[2]; // bind="greeting" (derived from user.name)
const nameInput = main.children[3]; // bind="user.name" (key path)
const button = main.children[4]; // data-action="clear"
const counterSection = main.children[5]; // controller="CounterController"
const counterValue = counterSection.children[0]; // bind="count"
const counterButton = counterSection.children[1]; // data-action="increment"
const rootedSection = main.children[6]; // controller="RootedController"
const rootedName = rootedSection.children[0]; // bind="name" via binding_root
const rootedInput = rootedSection.children[1]; // bind="name" via binding_root
const rootedButton = rootedSection.children[2]; // bind-disabled="@local_message.strip.empty?"
const workspace = body.children[2]; // window="workspace"
const listHost = body.children[5];
const listRoot = listHost.children[0];
const listRows = listRoot.children[0];
const selectedName = listHost.children[1];
const selectionSummary = listHost.children[2];
const componentInput = listHost.children[3];
const componentValue = listHost.children[4];
const selectControl = listHost.children[5];
const selectValue = listHost.children[6];
const customSelect = listHost.children[7];
const customSelectValue = listHost.children[8];
const editorHost = body.children[6];
const editorInput = editorHost.children[0].children[0];
const editorValue = editorHost.children[1];
const baseChildCount = 7;

// 1. Lifecycle hook ordering.
assert.deepStrictEqual(
  globalThis.__hooks__,
  ["before_launch", "before_load", "after_load", "before_appear", "after_appear", "after_launch"],
  `unexpected hook order: ${globalThis.__hooks__.join(", ")}`,
);

// 2. Initial bindings rendered the defaults, including the key-path and the
// derived property that reads across the nested object.
assert.strictEqual(h1.textContent, "hi", "h1 should show initial message");
assert.strictEqual(messageInput.value, "hi", "input should show initial message");
assert.strictEqual(greeting.textContent, "Hi world", "derived greeting initial value");
assert.strictEqual(nameInput.value, "world", "key-path input shows user.name");

// 2b. after_load made the outlet the first responder; becoming FR focuses the
// View's element (the shim records focus on the underlying element).
assert.strictEqual(messageInput._focused, true, "make_first_responder should focus the field");

// 3. Single-segment input propagates back to the property and out to its peer.
messageInput.value = "yo";
messageInput.dispatch("input");
assert.strictEqual(h1.textContent, "yo", "editing input should update h1");

// 4. Key-path two-way binding writes user.name, which recomputes greeting
// (a derived property depending across the object boundary) and pushes it out.
nameInput.value = "ada";
nameInput.dispatch("input");
assert.strictEqual(greeting.textContent, "Hi ada", "key-path write should recompute greeting");

// 5. data-action walks the responder chain to the controller method.
button.dispatch("click");
assert.strictEqual(h1.textContent, "", "clear action should empty the message");
assert.strictEqual(messageInput.value, "", "clear action should empty the input");

// 6. Key routing: Escape on the body reaches the current first responder (the
// outlet View) and bubbles up the responder chain to the controller.
body.dispatch("keydown", { key: "Escape" });
assert.strictEqual(globalThis.__escaped__, true, "Escape should reach controller.cancel_operation");

// 6b. owner() walked the view tree from the adopted outlet View to its
// controller.
assert.strictEqual(globalThis.__owner_ok__, true, "outlet View's owner should be its controller");

// 8. Nested controller: its own binding and action work, and are isolated
// from the parent (incrementing the counter doesn't touch parent state).
assert.strictEqual(counterValue.textContent, "0", "nested controller initial binding");
const greetingBefore = greeting.textContent;
counterButton.dispatch("click");
assert.strictEqual(counterValue.textContent, "1", "nested action increments nested state");
assert.strictEqual(greeting.textContent, greetingBefore, "nested action must not affect parent");

// 8b. binding_root prefixes plain paths, while @ remains controller-relative.
assert.strictEqual(rootedName.textContent, "rooted", "binding_root should prefix display binding");
assert.strictEqual(rootedInput.value, "rooted", "binding_root should prefix input binding");
rootedInput.value = "branch";
rootedInput.dispatch("input");
assert.strictEqual(rootedName.textContent, "branch", "binding_root input writes through to represented object");
assert.strictEqual(rootedButton.disabled, true, "@ path should ignore binding_root for property binding");

// 8c. Generated list rows bind directly to their objects and dispose as a unit.
assert.strictEqual(listRows.children.length, 3, "list renders one row per item");
assert.strictEqual(listRows.children[0].children[0].textContent, "Ada", "first row binding");
assert.strictEqual(listRows.children[1].children[0].textContent, "Grace", "second row binding");
listRows.dispatch("click", { target: listRows.children[1], shiftKey: false });
assert.strictEqual(selectedName.textContent, "Grace", "selected object remains observable through parent outlet");
assert.strictEqual(listRows.children[1].classList.contains("selected"), true, "selection applies row CSS state");
listRows.dispatch("click", { target: listRows.children[2], shiftKey: true });
assert.strictEqual(selectionSummary.textContent, "Grace, Katherine", "shift-click selects anchor range");
const removedRow = listRows.children[0];
globalThis.__replaceList__();
assert.strictEqual(listRows.children.length, 1, "replacing collection rerenders rows");
assert.strictEqual(listRows.children[0].children[0].textContent, "Katherine", "replacement row binds new item");
globalThis.__mutateRemovedRow__();
assert.strictEqual(removedRow.children[0].textContent, "Ada", "removed row bindings are disposed");
assert.strictEqual(componentValue.textContent, "Control", "klass component exposes its initial observable value");
componentInput.value = "Changed control";
componentInput.dispatch("input");
assert.strictEqual(componentValue.textContent, "Changed control", "text field component observes DOM input");
assert.strictEqual(selectControl.children.length, 3, "select preserves markup options and appends programmatic options");
assert.strictEqual(selectControl.value, "Grace", "select accepts a programmatic value");
assert.strictEqual(selectValue.textContent, "Grace", "select exposes its observable value");
selectControl.value = "Ada";
selectControl.dispatch("change");
assert.strictEqual(selectValue.textContent, "Ada", "select observes native change events");
assert.strictEqual(customSelect.getAttribute("role"), "combobox", "custom select exposes combobox semantics");
assert.strictEqual(customSelectValue.textContent, "ada", "custom select exposes its initial value");
const customTrigger = customSelect.children[0];
const customPopup = customSelect.children[1];
customTrigger.dispatch("click", { detail: 1 });
assert.strictEqual(customSelect.getAttribute("aria-expanded"), "true", "custom select opens from its trigger");
customPopup.children[1].dispatch("click", { detail: 1 });
assert.strictEqual(customSelectValue.textContent, "grace", "custom option click changes observable value");
assert.strictEqual(customSelect.getAttribute("aria-expanded"), "false", "choosing an option closes the popup");

globalThis.__commitEditor__();
globalThis.__discardEditor__();
assert.deepStrictEqual(globalThis.__editor_events__, ["commit", "discard"], "editor routes commit and discard hooks");
assert.strictEqual(editorInput.value, "Draft", "late-assigned editor object synchronizes to its input");
editorInput.value = "Edited draft";
editorInput.dispatch("input");
assert.strictEqual(editorValue.textContent, "Edited draft", "late-assigned editor input writes to represented object");

// 8c. Window containers load default content before the launch wire pass, and
// content swapping tears down the old subtree before wiring the new one.
assert.strictEqual(workspace.getAttribute("name"), "pane-one", "window container should keep content name");
assert.strictEqual(workspace.children.length, 1, "window container should receive default content");
const paneOne = workspace.children[0];
const paneOneInput = paneOne.children[0];
const paneSwap = paneOne.children[1];
assert.strictEqual(paneOne.tagName, "ARTICLE", "default window content should be cloned");
assert.strictEqual(globalThis.__panes__.join(","), "one:load", "default window content should load");
paneSwap.dispatch("click");
assert.strictEqual(workspace.getAttribute("name"), "pane-two", "load_window_content should update content name");
assert.strictEqual(workspace.children.length, 1, "load_window_content should replace old content");
const paneTwo = workspace.children[0];
const paneTwoInput = paneTwo.children[0];
assert.strictEqual(paneTwo.tagName, "ARTICLE", "replacement window content should be cloned");
assert.strictEqual(
  globalThis.__panes__.join(","),
  "one:load,one:before,one:after,two:load",
  "content swap should detach old controller and load new controller",
);
assert.ok(document.activeElement === paneTwoInput, "replacement window content should take focus");
paneSwap.dispatch("click");
assert.strictEqual(globalThis.__panes__.join(","), "one:load,one:before,one:after,two:load", "old action listener removed");

// 8c. Window templates stay inert until shown, then wire like normal subtrees.
assert.strictEqual(body.children.length, baseChildCount, "templates should be inert at launch");
globalThis.__showPalette__();
assert.strictEqual(body.children.length, baseChildCount + 1, "show_window should append cloned window root");
const palette = body.children[baseChildCount];
const paletteInput = palette.children[0];
const paletteClose = palette.children[1];
assert.strictEqual(palette.tagName, "DIALOG", "window template root should be cloned");
assert.strictEqual(globalThis.__palette__.join(","), "after_load", "window controller should load on show");
assert.ok(document.activeElement === paletteInput, "shown window should focus its first responder");

globalThis.__showPalette__();
assert.strictEqual(body.children.length, baseChildCount + 2, "show_window should allow another cloned window root");
const secondPalette = body.children[baseChildCount + 1];
const secondPaletteInput = secondPalette.children[0];
const secondPaletteClose = secondPalette.children[1];
assert.ok(document.activeElement === secondPaletteInput, "second shown window should take focus");
secondPaletteClose.dispatch("click");
assert.strictEqual(body.children.length, baseChildCount + 1, "closing the second window should remove only that root");
assert.strictEqual(
  globalThis.__palette__.join(","),
  "after_load,after_load,before_disappear,after_disappear",
  "second dismiss should run window disappear hooks",
);
assert.ok(document.activeElement === paletteInput, "dismissing second window should restore first window focus");

paletteClose.dispatch("click");
assert.strictEqual(body.children.length, baseChildCount, "dismiss should remove the window root");
assert.strictEqual(
  globalThis.__palette__.join(","),
  "after_load,after_load,before_disappear,after_disappear,before_disappear,after_disappear",
  "dismiss should run window disappear hooks",
);
assert.ok(document.activeElement === paneTwoInput, "dismiss should restore previous first responder focus");

// 9. Detach: removing the nested subtree fires its disappear hooks and tears
// down its bindings/actions (the increment action stops working).
globalThis.__setCounterSource__(2);
assert.strictEqual(counterValue.textContent, "2", "object binding should synchronize before teardown");
globalThis.__swillDetach__(counterSection);
assert.deepStrictEqual(
  globalThis.__disappeared__,
  ["counter:before", "counter:after"],
  `disappear hooks: ${globalThis.__disappeared__.join(", ")}`,
);
counterButton.dispatch("click");
globalThis.__setCounterSource__(3);
assert.strictEqual(counterValue.textContent, "2", "actions and object bindings should be removed after detach");

// 7. ISO-8601 date polyfill runs correctly on the real Opal runtime.
assert.deepStrictEqual(
  globalThis.__iso__,
  {
    calendar: "2026-6-23",
    basic: "2026-6-23",
    ordinal: "2026-6-23",
    week: "2026-6-23",
    week53: "2021-1-3",
    invalid: "invalid",
  },
  `ISO-8601 polyfill drifted on Opal: ${JSON.stringify(globalThis.__iso__)}`,
);

setTimeout(() => {
  assert.strictEqual(globalThis.__wire_requests__[0].url, "/members?page=2", "wire should encode dataset parameters");
  assert.deepStrictEqual(globalThis.__dataset__, ["Dataset member", false, true], "dataset should decode fetched models");
  assert.deepStrictEqual(globalThis.__persistence__, ["Persisted member", false], "save should apply response and mark clean");
  assert.strictEqual(globalThis.__wire_requests__[1].method, "PATCH", "dirty model should PATCH");
  assert.strictEqual(globalThis.__wire_requests__[1].url, "/members/1", "save should target the resource URL");
  assert.deepStrictEqual(
    JSON.parse(globalThis.__wire_requests__[1].body),
    { data: { type: "members", id: "1", attributes: { name: "Local edit" } } },
    "save should send dirty-only JSON:API attributes",
  );
  console.log("integration: OK");
}, 0);
