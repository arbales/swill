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
  ],
]);

install(body);

// Loading the bundle runs TestApp.shared.start against document.body.
require("./dist/integration.js");

const main = body.children[0];
const h1 = main.children[0]; // bind="message"
const messageInput = main.children[1]; // bind="message", outlet="message_field"
const greeting = main.children[2]; // bind="greeting" (computed over user.name)
const nameInput = main.children[3]; // bind="user.name" (key path)
const button = main.children[4]; // data-action="clear"
const counterSection = main.children[5]; // controller="CounterController"
const counterValue = counterSection.children[0]; // bind="count"
const counterButton = counterSection.children[1]; // data-action="increment"
const rootedSection = main.children[6]; // controller="RootedController"
const rootedName = rootedSection.children[0]; // bind="name" via binding_root
const rootedInput = rootedSection.children[1]; // bind="name" via binding_root
const rootedButton = rootedSection.children[2]; // bind-disabled="@local_message.strip.empty?"

// 1. Lifecycle hook ordering.
assert.deepStrictEqual(
  globalThis.__hooks__,
  ["before_launch", "before_load", "after_load", "before_appear", "after_appear", "after_launch"],
  `unexpected hook order: ${globalThis.__hooks__.join(", ")}`,
);

// 2. Initial bindings rendered the defaults, including the key-path and the
// computed that reads across the nested object.
assert.strictEqual(h1.textContent, "hi", "h1 should show initial message");
assert.strictEqual(messageInput.value, "hi", "input should show initial message");
assert.strictEqual(greeting.textContent, "Hi world", "computed greeting initial value");
assert.strictEqual(nameInput.value, "world", "key-path input shows user.name");

// 2b. after_load made the outlet the first responder; becoming FR focuses the
// View's element (the shim records focus on the underlying element).
assert.strictEqual(messageInput._focused, true, "make_first_responder should focus the field");

// 3. Single-segment input propagates back to the property and out to its peer.
messageInput.value = "yo";
messageInput.dispatch("input");
assert.strictEqual(h1.textContent, "yo", "editing input should update h1");

// 4. Key-path two-way binding writes user.name, which recomputes greeting
// (a computed depending across the object boundary) and pushes it out.
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

// 8c. Window templates stay inert until shown, then wire like normal subtrees.
assert.strictEqual(body.children.length, 2, "template should be inert at launch");
globalThis.__showPalette__();
assert.strictEqual(body.children.length, 3, "show_window should append cloned window root");
const palette = body.children[2];
const paletteInput = palette.children[0];
const paletteClose = palette.children[1];
assert.strictEqual(palette.tagName, "DIALOG", "window template root should be cloned");
assert.strictEqual(globalThis.__palette__.join(","), "after_load", "window controller should load on show");
assert.ok(document.activeElement === paletteInput, "shown window should focus its first responder");
paletteClose.dispatch("click");
assert.strictEqual(body.children.length, 2, "dismiss should remove the window root");
assert.strictEqual(
  globalThis.__palette__.join(","),
  "after_load,before_disappear,after_disappear",
  "dismiss should run window disappear hooks",
);
assert.ok(document.activeElement === messageInput, "dismiss should restore previous first responder focus");

// 9. Detach: removing the nested subtree fires its disappear hooks and tears
// down its bindings/actions (the increment action stops working).
globalThis.__swillDetach__(counterSection);
assert.deepStrictEqual(
  globalThis.__disappeared__,
  ["counter:before", "counter:after"],
  `disappear hooks: ${globalThis.__disappeared__.join(", ")}`,
);
counterButton.dispatch("click");
assert.strictEqual(counterValue.textContent, "1", "action listener removed after detach");

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

console.log("integration: OK");
