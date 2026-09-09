import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadBundles} from "./load_bundles.mjs";

const {Runtime} = loadBundles();

const SwillObject = Runtime.resolve("Swill::Object");
const Person = Runtime.resolve("Demo::Person");
const SpecialPerson = Runtime.resolve("Demo::SpecialPerson");
const Controller = Runtime.resolve("Demo::Controller");
const Bindings = Runtime.resolve("Swill::Bindings");
const Actions = Runtime.resolve("Swill::Actions");

test("real Attributes concern builds isolated inherited registries", () => {
  const Base = Runtime.resolve("Swill::Model::Base");
  const result = {
    record: Object.keys(Base.model_attributes()),
    person: Object.keys(Person.model_attributes()),
    special: Object.keys(SpecialPerson.model_attributes())
  };
  assert.deepEqual(result, JSON.parse(readFileSync("build/mri-attributes.json")));
  assert.notEqual(Person.model_attributes(), Base.model_attributes());
  assert.notEqual(SpecialPerson.model_attributes(), Person.model_attributes());
  assert.equal(Person.model_attributes().name.type, "String");
  assert.equal(SpecialPerson.model_attributes().role.key, "job");
  assert.equal(SpecialPerson.model_attributes().role.defaultValue(), "editor");
});

test("included declarations and super-based mutation hooks agree with MRI", () => {
  const results = ["ConcernRecord", "SpecializedRecord", "OtherConcernRecord"].map(name => {
    const object = new (Runtime.resolve(name))();
    const initial = object.name;
    const changes = [];
    object.observe("dirty", value => changes.push(["dirty", value]));
    object.observe("name", value => changes.push(["name", value]));
    object.name = ` ${initial} `;
    const unchanged = [object.name, object.dirty, object.baseline];
    object.name = " Changed ";
    const changed = [object.name, object.dirty, object.baseline];
    let message;
    assert.throws(() => { object.name = " "; }, error => {
      // Ruby raise compiles to a JavaScript Error, so stacks and messages survive.
      message = error.message;
      return typeof error.stack === "string" && message === "name must not be blank";
    });
    const rejected = [message, object.name, object.dirty, object.baseline];
    object.name = initial;
    const restored = [object.name, object.dirty, object.baseline];
    return {initial, unchanged, changed, rejected, restored, changes};
  });
  assert.deepEqual(results, JSON.parse(readFileSync(new URL("../build/mri-concerns.json", import.meta.url))));
});

test("shared Ruby model has the same result on MRI and compiled JavaScript", () => {
  const person = new SpecialPerson();
  const changes = [];
  person.observe("label", value => changes.push(value));
  person.id = "42";
  const renamed = person.rename(" Ada ");
  person.loud = true;
  const result = {
    renamed, greeting: person.greeting(), id: person.id, role: person.role, changes,
    truth: [person.ruby_truth(0), person.ruby_truth(null)],
    or: [person.ruby_or(""), person.ruby_or(null)]
  };
  assert.deepEqual(result, JSON.parse(readFileSync(new URL("../build/mri-result.json", import.meta.url))));
});

test("generated registry crosses artifact boundaries without exposing globals", () => {
  assert.equal(Object.getPrototypeOf(Person.prototype) instanceof SwillObject, true);
  assert.equal(globalThis.Demo, undefined);
  assert.throws(() => Runtime.resolve("Object"), /Unknown class/);
  assert.throws(() => Runtime.resolve("__proto__"), /Unknown class/);
});

test("inherited declaration metadata is isolated from subclasses", () => {
  const base = new Person();
  const special = new SpecialPerson();
  Runtime.writePath(special, "id", "7");
  assert.equal(Runtime.read(special, "id"), "7");
  assert.equal(Runtime.read(special, "role"), "editor");
  assert.throws(() => Runtime.read(base, "role"), /Unknown reader/);
  assert.equal(base.id, null);
});

test("mixin ordering and class super override survive factory lowering", () => {
  assert.equal(new Person().normalize(" Ada "), "[<Ada>]");
  assert.equal(new SpecialPerson().normalize(" Ada "), "[<Ada>]");
});

test("reference-based wiring preserves construction, instanceof, and native super", () => {
  class Base extends SwillObject {
    constructor(value) { super(); this.value = value; }
    label() { return this.value; }
  }
  const Wrap = Superclass => class extends Superclass {
    label() { return `<${super.label()}>`; }
  };
  class Explicit extends Base {
    constructor(value) { super(value); this.initialized = true; }
    label() { return `[${super.label()}]`; }
  }
  class Implicit extends Base {}
  Runtime.include(Explicit, [Wrap]);
  Runtime.include(Implicit, [Wrap]);
  const explicit = new Explicit("Ada");
  const implicit = new Implicit("Grace");
  assert.equal(explicit.label(), "[<Ada>]");
  assert.equal(explicit.initialized, true);
  assert.equal(implicit.label(), "<Grace>");
  assert.ok(explicit instanceof Explicit);
  assert.ok(explicit instanceof Base);
  assert.ok(implicit instanceof Base);
  assert.throws(() => Runtime.include(Person, [Wrap]), /before class installation/);
});

test("computed dependencies switch branches and detach old objects", () => {
  const controller = new Controller();
  const old = new Person();
  const next = new Person();
  old.name = "Ada";
  next.name = "Grace";
  const changes = [];
  controller.observe("title", value => changes.push(value));
  controller.person = old;
  controller.person = next;
  old.name = "Ignored";
  next.name = "Hopper";
  controller.fallback = "Not used";
  assert.deepEqual(changes, ["Hello Ada", "Hello Grace", "Hello Hopper"]);
  assert.equal(controller.title, "Hello Hopper");
});

test("reader chains share value helpers with compiled expressions", () => {
  const person = new Person();
  person.name = "  ";
  assert.equal(Runtime.readPath(person, "name.blank?"), Runtime.read(person, "blank?"));
  person.name = "  Ada  ";
  assert.equal(Runtime.readPath(person, "name.strip.upcase"), "ADA");
  assert.equal(Runtime.read(person, "greeting"), "Hello   Ada  ");
  assert.throws(() => Runtime.read(person, "constructor"), /Unknown reader/);
  assert.equal(Runtime.valueRead("\u00a0", "blank?"), false);
  assert.equal(Runtime.valueRead("\0\t Ada \n\0", "strip"), "Ada");
});

test("nested paths rehook before callbacks and stop after disposal", () => {
  const controller = new Controller();
  const first = new Person();
  const second = new Person();
  controller.person = first;
  const changes = [];
  const dispose = Runtime.observePath(controller, "person.name", value => {
    changes.push(value);
    if (value === "Grace") second.name = "Hopper";
  });
  second.name = "Grace";
  controller.person = second;
  first.name = "Ignored";
  dispose();
  second.name = "Also ignored";
  assert.deepEqual(changes, ["Grace", "Hopper"]);
});

test("derived paths cannot be written and null intermediates are explicit", () => {
  const controller = new Controller();
  assert.equal(Runtime.readPath(controller, "person.name"), null);
  assert.equal(Runtime.writePath(controller, "person.name", "Ada"), undefined, "a write through a missing owner is dropped");
  assert.equal(Runtime.readPath(controller, "person.name.blank?"), true, "blank? is defined for nil");
  assert.equal(Runtime.readPath(controller, "person.nil?"), true);
  assert.equal(Runtime.readPath(controller, "person.name.present?"), false);
  assert.equal(Runtime.readPath(controller, "person.name.upcase"), null, "other readers on nil yield nil");
  assert.equal(Runtime.readPath(controller, ""), controller, "an empty path is the object itself");
  assert.throws(() => Runtime.writePath(controller, "", {}), /Read-only/);
  controller.person = new Person();
  Runtime.writePath(controller, "person.name", "Ada");
  assert.equal(controller.person.name, "Ada");
  assert.throws(() => Runtime.writePath(controller, "person.label", "Wrong"), /Read-only/);
  assert.throws(() => Runtime.writePath(controller, "person.name.upcase", "Wrong"), /Read-only/);
});

test("dynamic writers mirror dynamic readers and primitives skip metadata", () => {
  const person = new Person();
  assert.equal(Runtime.write(person, "name", "Ada"), "Ada");
  assert.equal(person.name, "Ada");
  assert.throws(() => Runtime.write(person, "label", "x"), /Read-only/);
  assert.throws(() => Runtime.write(person, "missing", "x"), /Unknown writer/);
  assert.throws(() => Runtime.write(null, "name", "x"), /on nil/);
  const view = new (Runtime.resolve("Swill::View"))({});
  const controller = new Controller();
  Runtime.write(view, "controller", controller);
  assert.equal(view.controller_value(), controller);
  assert.equal(Runtime.read(" Ada ", "strip"), "Ada");
  assert.equal(Runtime.read(null, "strip"), null);
  assert.throws(() => Runtime.read(42, "strip"), /requires a string/);
  assert.throws(() => Runtime.read("Ada", "name"), /Unknown value reader/);
});

test("drafts copy inherited attributes but never observers or computed state", () => {
  const person = new SpecialPerson();
  person.id = "42";
  person.name = "Ada";
  person.loud = true;
  const changes = [];
  person.observe("label", value => changes.push(value));
  const draft = person.draft();
  assert.equal(draft.id, "42");
  assert.equal(draft.role, "editor");
  assert.equal(draft.loud, false);
  assert.equal(draft.label, "Ada");
  draft.name = "Grace";
  assert.equal(person.label, "ADA");
  assert.deepEqual(changes, []);
});

test("action dispatch uses generated method names and validates arity", () => {
  const controller = new Controller();
  const before = new Person();
  controller.person = before;
  assert.equal(Runtime.performAction(controller, "clear", {}, {}), "Hello ");
  assert.ok(controller.person instanceof Person);
  assert.notEqual(controller.person, before, "clear resets to a fresh person");
  assert.throws(() => Runtime.invoke(controller, "clear", 1), /wrong arity/);
  assert.throws(() => Runtime.invoke(controller, "toString"), /Unknown action/);
  assert.throws(() => Runtime.performAction(controller, "toString", {}, {}), /Unknown action/);
});

test("compiled bindings are two-way, validate writers, and release listeners", () => {
  class Element extends EventTarget {
    value = "";
    textContent = "";
    checked = false;

    constructor(attributes, tagName = "DIV", type = "") {
      super();
      this.attributes = attributes;
      this.tagName = tagName;
      this.type = type;
    }

    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    matches(selector) { return selector.toLowerCase().split(", ").includes(this.tagName.toLowerCase()); }
  }

  const person = new Person();
  const input = new Element({bind: "name"}, "INPUT");
  const output = new Element({bind: "label"});
  const bindings = new Bindings();
  const unbindInput = bindings.wire_element(person, input, null);
  const unbindOutput = bindings.wire_element(person, output, null);
  input.value = "Ada";
  input.dispatchEvent(new Event("input"));
  assert.equal(person.name, "Ada");
  assert.equal(output.textContent, "Ada");
  person.loud = true;
  assert.equal(output.textContent, "ADA");
  unbindInput();
  unbindOutput();
  input.value = "Ignored";
  input.dispatchEvent(new Event("input"));
  person.name = "Grace";
  assert.equal(output.textContent, "ADA");
  assert.equal(input.value, "Ignored");
  assert.throws(
    () => bindings.wire_element(person, new Element({bind: "label"}, "INPUT"), null),
    /Read-only/
  );
  const readonly = new Element({bind: "label", readonly: ""}, "INPUT");
  const unbindReadonly = bindings.wire_element(person, readonly, null);
  assert.equal(readonly.value, "GRACE");
  readonly.value = "Ignored";
  readonly.dispatchEvent(new Event("input"));
  assert.equal(person.name, "Grace");
  unbindReadonly();

  const checkbox = new Element({bind: "loud"}, "INPUT", "checkbox");
  const unbindCheckbox = bindings.wire_element(person, checkbox, null);
  assert.equal(checkbox.checked, true);
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change"));
  assert.equal(person.loud, false);
  unbindCheckbox();

  // A path whose owner is not there yet wires, ignores writes, and catches up.
  const controller = new Controller();
  const pending = new Element({bind: "person.name"}, "INPUT");
  const unbindPending = bindings.wire_element(controller, pending, null);
  assert.equal(pending.value, "");
  pending.value = "Early";
  pending.dispatchEvent(new Event("input"));
  assert.equal(controller.person, null);
  controller.person = new Person();
  controller.person.name = "Late";
  assert.equal(pending.value, "Late");
  pending.value = "Typed";
  pending.dispatchEvent(new Event("input"));
  assert.equal(controller.person.name, "Typed");
  unbindPending();
  assert.equal(Runtime.bindElement, undefined);
});

test("compiled actions parse event prefixes and release listeners", () => {
  class Element extends EventTarget {
    constructor(action) {
      super();
      this.attributes = {"data-action": action};
    }

    getAttribute(name) { return this.attributes[name] ?? null; }
  }

  const controller = new Controller();
  const element = new Element("change:clear");
  const actions = new Actions();
  const first = new Person();
  controller.person = first;
  const dispose = actions.wire_element(controller, element);
  element.dispatchEvent(new Event("click"));
  assert.equal(controller.person, first, "click is not the selected event");
  element.dispatchEvent(new Event("change"));
  assert.notEqual(controller.person, first, "the change event performed clear");
  const second = new Person();
  controller.person = second;
  dispose();
  element.dispatchEvent(new Event("change"));
  assert.equal(controller.person, second, "a disposed action no longer fires");
  assert.equal(element.__swill_action__, false);
  const blank = new Element(" ");
  actions.wire_element(controller, blank)();
  assert.equal(blank.__swill_action__, undefined);
});

test("the shared setter coerces before equality and invalidates before hooks", () => {
  const events = [];
  class Hooks extends SwillObject {
    coerce_property_value(_name, value) { return value.trim(); }
    property_will_change(name, previous, value) { events.push(["will", previous, value]); }
    name_did_change(previous, value) { events.push(["did", this.label]); }
  }
  Runtime.installClass(Hooks, "Test::Hooks", [
    {name: "name", js: "name", defaultValue() { return ""; }},
    {name: "label", js: "label", computed: true, compute() { return this.name.toUpperCase(); }}
  ], [{name: "name_did_change", js: "name_did_change", arity: 2}]);
  const object = new Hooks();
  assert.equal(object.label, "");
  object.observe("name", value => events.push(["observe", value]));
  object.name = " Ada ";
  object.name = "Ada";
  assert.deepEqual(events, [["will", "", "Ada"], ["did", "ADA"], ["observe", "Ada"]]);
});

test("disposing computed state releases dependencies without erasing stored values", () => {
  const controller = new Controller();
  const person = new Person();
  person.name = "Ada";
  controller.person = person;
  const values = [];
  controller.observe("title", value => values.push(value));
  controller.dispose();
  person.name = "Grace";
  assert.deepEqual(values, []);
  assert.equal(controller.person, person);
  assert.equal(controller.title, "Hello Grace");
  controller.dispose();
});

test("remaining runtime semantic helpers preserve Ruby values", () => {
  assert.equal(Runtime.isTruthy(0), true);
  assert.equal(Runtime.isTruthy(""), true);
  assert.equal(Runtime.isTruthy(false), false);
  assert.equal(Runtime.isTruthy(null), false);
  assert.equal(Runtime.isEqual([1, [2]], [1, [2]]), true);
  assert.equal(Runtime.isEqual([1], [2]), false);
  assert.equal(Runtime.isEqual(new Person(), new Person()), false);
});

test("computed cycles and exceptions do not leak capture state", () => {
  class Broken extends SwillObject {}
  Runtime.installClass(Broken, "Test::Broken", [
    {name: "cycle", js: "cycle", computed: true, compute() { return this.cycle; }},
    {name: "error", js: "error", computed: true, compute() { throw new Error("expected"); }}
  ], []);
  const broken = new Broken();
  assert.throws(() => broken.cycle, /Computed cycle/);
  assert.throws(() => broken.error, /expected/);
  const person = new Person();
  person.name = "Ada";
  assert.equal(person.label, "Ada");
});

test("duplicate registry installation is rejected", () => {
  assert.throws(() => Runtime.installClass(class {}, "Demo::Person", [], []), /Duplicate class/);
});

test("one meta object installs parents before children, including mixin metadata", () => {
  class Parent extends SwillObject {
    describe() { return this.value; }
  }
  class Child extends Parent {
    describe() { return `[${super.describe()}]`; }
  }
  const Wrap = Superclass => class extends Superclass {
    describe() { return `<${super.describe()}>`; }
    origin() { return "mixin"; }
  };
  Runtime.install({
    mixins: {"Test::Wrap": {factory: Wrap, methods: {describe: {arity: 0}, origin: {arity: 0}}}},
    classes: {
      // Deliberately reversed; the parent is not installed when scanning starts.
      "Test::Child": {constructor: Child, methods: {describe: {arity: 0}}},
      "Test::Parent": {
        constructor: Parent, mixins: [Wrap],
        properties: {value: {defaultValue() { return "Ada"; }}},
        methods: {}
      }
    }
  });
  const child = new Child();
  // Parent's own method overrides its included module, just as in Ruby.
  assert.equal(child.describe(), "[Ada]");
  assert.equal(Runtime.read(child, "value"), "Ada");
  assert.equal(Runtime.invoke(child, "describe"), "[Ada]");
  assert.equal(Runtime.read(child, "origin"), "mixin");
});

test("invalid meta is rejected before registering preceding valid classes", () => {
  class Valid extends SwillObject {}
  class Invalid extends SwillObject {}
  assert.throws(() => Runtime.install({classes: {
    "Test::Valid": {constructor: Valid},
    "Test::Invalid": {constructor: Invalid, mixins: [() => {}]}
  }}), /Unknown mixin/);
  assert.throws(() => Runtime.resolve("Test::Valid"), /Unknown class/);
  assert.throws(() => Runtime.install({classes: {"Test::Missing": {}}}), /Missing constructor/);
});

// ---- nested controller ownership ----

import {element} from "./dom.mjs";

const Awakening = Runtime.resolve("Swill::Awakening");
const Badge = Runtime.resolve("Demo::Badge");
let fixtureSequence = 0;

// Parent and child controllers with identically named bindings and actions.
// Hooks record their order; the runtime installs the recording subclasses
// under fresh names exactly like generated metadata would.
function nestedFixture() {
  const log = [];
  const hooks = ["view_did_load", "awake_from_dom", "controller_did_load", "view_will_appear",
    "view_did_appear", "view_will_disappear", "view_did_disappear"];
  const recording = (Base, label) => {
    const klass = class extends Base {};
    for (const hook of hooks) {
      klass.prototype[hook] = function () { log.push(`${label}:${hook}`); return Base.prototype[hook].call(this); };
    }
    return klass;
  };
  const Parent = class extends recording(Controller, "parent") {
    shout() { log.push("parent:shout"); return super.shout(); }
  };
  const Child = recording(Badge, "child");
  const Grandchild = recording(Badge, "grandchild");
  const suffix = ++fixtureSequence;
  Runtime.install({classes: {
    [`Test::Parent${suffix}`]: {constructor: Parent},
    [`Test::Child${suffix}`]: {constructor: Child},
    [`Test::Grandchild${suffix}`]: {constructor: Grandchild}
  }});

  const parentTitle = element("p", {bind: "title"});
  const nameInput = element("input", {bind: "person.name", outlet: "name_field"});
  const parentClear = element("button", {"data-action": "clear"});
  const seed = element("script", {type: "application/json", outlet: "seed"});
  seed.textContent = '{"name": "Ada"}';
  const childTitle = element("p", {bind: "title"});
  const childClear = element("button", {"data-action": "clear"});
  const childBump = element("button", {"data-action": "bump"});
  const childShout = element("button", {"data-action": "shout"});
  const grandchildTitle = element("p", {bind: "title"});
  const grandchildRoot = element("section", {controller: `Test::Grandchild${suffix}`}, [grandchildTitle]);
  const childRoot = element("section", {controller: `Test::Child${suffix}`, outlet: "badge"}, [
    childTitle, childClear, childBump, childShout, element("div", {}, [grandchildRoot])
  ]);
  const parentRoot = element("main", {controller: `Test::Parent${suffix}`}, [
    seed, parentTitle, nameInput, parentClear, childRoot
  ]);
  const document = element("body", {}, [parentRoot]);
  const controllers = new Awakening().wire(document);
  const [parent, child, grandchild] = controllers;
  return {log, suffix, document, controllers, parent, child, grandchild, parentRoot, childRoot, grandchildRoot,
    parentTitle, nameInput, parentClear, childTitle, childClear, childBump, childShout, grandchildTitle};
}

test("awakening builds a sparse view tree that defines ownership", () => {
  const f = nestedFixture();
  assert.equal(f.controllers.length, 3);
  assert.ok(f.parent instanceof Controller);
  assert.ok(f.child instanceof Badge);
  assert.deepEqual(Array.from(f.parent.child_controllers()), [f.child]);
  assert.deepEqual(Array.from(f.child.child_controllers()), [f.grandchild]);
  assert.deepEqual(Array.from(f.grandchild.child_controllers()), []);
  assert.equal(f.child.parent(), f.parent);
  assert.equal(f.grandchild.parent(), f.child);
  assert.equal(f.parent.parent(), null);
  assert.equal(f.child.next_responder(), f.parent);
  assert.equal(f.parent.next_responder(), null);
  assert.equal(f.child.view().superview(), f.parent.view());
  assert.deepEqual(Array.from(f.parent.view().subviews()), [f.parent.name_field, f.child.view()]);
  assert.equal(f.grandchild.view().owner(), f.grandchild);
  assert.equal(f.grandchildRoot.parentElement.__swill_view__, undefined, "plain elements never become views");
  assert.equal(f.parentTitle.__swill_view__, undefined, "bind-only elements never become views");
  assert.equal(f.parentClear.__swill_view__, undefined, "action-only elements never become views");
  assert.equal(f.childRoot.__swill_view__.next_responder(), f.child);
});

test("lifecycle runs children first per phase and preserves the flat order", () => {
  const f = nestedFixture();
  const phase = hook => ["grandchild", "child", "parent"].map(label => `${label}:${hook}`);
  assert.deepEqual(f.log, [
    "grandchild:view_did_load", "grandchild:awake_from_dom",
    "child:view_did_load", "child:awake_from_dom",
    "parent:view_did_load", "parent:awake_from_dom",
    ...phase("controller_did_load"), ...phase("view_will_appear"), ...phase("view_did_appear")
  ]);
  assert.ok(f.parent.person instanceof Person, "the parent's inherited view_did_load ran");
  assert.equal(f.parentTitle.textContent, "Hello Ada", "awake_from_dom saw the decoded JSON outlet");
});

test("outlets connect to their direct owner as views, controllers, and data", () => {
  const f = nestedFixture();
  assert.ok(f.parent.name_field instanceof View);
  assert.equal(f.parent.name_field.element(), f.nameInput);
  assert.equal(f.parent.name_field.owner(), f.parent);
  assert.equal(f.parent.name_field.superview(), f.parent.view());
  assert.deepEqual(Array.from(f.parent.view().subviews()), [f.parent.name_field, f.child.view()]);
  assert.equal(f.parent.badge, f.child);
  assert.deepEqual({...f.parent.seed}, {name: "Ada"});
  assert.equal(f.parent.missing, null);
  assert.equal(f.child.parent(), f.parent, "a plain outlet view between them does not change ownership");
  // Outlets are observable properties, so paths read and observe through them.
  assert.equal(Runtime.readPath(f.parent, "badge.title"), "Badge 0");
  const seen = [];
  const dispose = Runtime.observePath(f.parent, "badge.count", value => seen.push(value));
  f.childBump.click();
  assert.deepEqual(seen, [1]);
  dispose();
});

test("bindings and actions are wired only by their direct owner", () => {
  const f = nestedFixture();
  f.parent.person.name = "Ada";
  assert.equal(f.parentTitle.textContent, "Hello Ada");
  assert.equal(f.childTitle.textContent, "Badge 0");
  assert.equal(f.grandchildTitle.textContent, "Badge 0");
  f.childBump.click();
  assert.equal(f.childTitle.textContent, "Badge 1");
  assert.equal(f.child.count, 1);
  assert.equal(f.grandchild.count, 0);
  assert.equal(f.parentTitle.textContent, "Hello Ada");
  f.childClear.click();
  assert.equal(f.childTitle.textContent, "Badge 0");
  assert.ok(f.parent.person instanceof Person, "the child's clear never reaches the parent");
  const before = f.parent.person;
  f.parentClear.click();
  assert.notEqual(f.parent.person, before, "the parent's clear ran");
  assert.equal(f.parentTitle.textContent, "Hello ");
  assert.equal(f.childTitle.textContent, "Badge 0");
});

test("unhandled child actions continue through the responder chain", () => {
  const f = nestedFixture();
  f.parent.person.name = "Ada";
  f.childShout.click();
  assert.deepEqual(f.log.filter(entry => entry.endsWith(":shout")), ["parent:shout"]);
  assert.equal(f.parent.person.name, "ADA");
  assert.equal(f.parentTitle.textContent, "Hello ADA");
  assert.throws(() => f.grandchild.perform_action("missing", null, null), /Unhandled action: missing/);
  assert.throws(() => f.parent.perform_action("toString", null, null), /Unhandled action/);
  assert.equal(Runtime.hasAction(f.parent, "shout"), true);
  assert.equal(Runtime.hasAction(f.child, "shout"), false);
});

test("awakening a later fragment adopts it into the nearest live owner", () => {
  const f = nestedFixture();
  const lateTitle = element("p", {bind: "title"});
  const lateRoot = element("section", {controller: "Demo::Badge"}, [lateTitle]);
  f.childRoot.append(element("div", {}, [lateRoot]));
  const [late] = new Awakening().wire(lateRoot);
  assert.equal(late.parent(), f.child);
  assert.deepEqual(Array.from(f.child.child_controllers()), [f.grandchild, late]);
  assert.equal(lateTitle.textContent, "Badge 0");
  assert.equal(f.log.filter(entry => entry.endsWith(":view_did_load")).length, 3, "existing controllers are not re-awakened");
  assert.deepEqual(Array.from(new Awakening().wire(f.document)), [], "an awakened tree yields no new controllers");
});

test("tearing down the parent releases every descendant exactly once", () => {
  const f = nestedFixture();
  f.parent.person.name = "Ada";
  f.log.length = 0;
  f.parent.teardown();
  assert.deepEqual(f.log, [
    "parent:view_will_disappear", "child:view_will_disappear",
    "grandchild:view_will_disappear", "grandchild:view_did_disappear",
    "child:view_did_disappear", "parent:view_did_disappear"
  ]);
  assert.equal(f.child.view().controller_value(), null);
  assert.equal(f.child.parent(), null);
  assert.deepEqual(Array.from(f.parent.child_controllers()), []);
  assert.deepEqual(Array.from(f.parent.view().subviews()), []);
  f.childBump.click();
  assert.equal(f.child.count, 0, "child listeners are gone");
  assert.equal(f.childTitle.textContent, "Badge 0");
  f.parent.person.name = "Grace";
  assert.equal(f.parentTitle.textContent, "Hello Ada", "parent observers are gone");
  f.child.count = 5;
  assert.equal(f.childTitle.textContent, "Badge 0", "child observers are gone");
  f.parent.teardown();
  f.child.teardown();
  assert.equal(f.log.length, 6, "a second teardown is a no-op");
  const [again] = new Awakening().wire(f.parentRoot);
  assert.notEqual(again, f.parent);
  assert.equal(again.child_controllers().length, 1);
  assert.equal(f.childTitle.textContent, "Badge 0");
});

// ---- application launch and the top of the responder chain ----

const Launcher = Runtime.resolve("Swill::Launcher");
const DemoApplication = Runtime.resolve("Demo::Application");

// A document shim: the page body carries [application]; the document itself
// receives DOMContentLoaded and its window receives pagehide.
function pageFixture({readyState = "loading", log = [], appName = "Demo::Application"} = {}) {
  const badgeTitle = element("p", {bind: "title"});
  const resetButton = element("button", {"data-action": "reset"});
  const badge = element("section", {controller: "Demo::Badge", outlet: "badge"}, [badgeTitle, resetButton]);
  const parentTitle = element("p", {bind: "title"});
  const seed = element("script", {type: "application/json", outlet: "seed"});
  seed.textContent = '{"name": "Ada"}';
  const nameInput = element("input", {bind: "person.name", outlet: "name_field"});
  const main = element("main", {controller: "Demo::Controller"}, [seed, parentTitle, nameInput, badge]);
  const body = element("body", {application: appName}, [main]);
  const document = element("#document", {}, [body]);
  document.readyState = readyState;
  document.defaultView = new EventTarget();
  return {log, document, body, main, badge, parentTitle, badgeTitle, resetButton};
}

test("the launcher launches the declared application once the DOM is parsed", () => {
  const f = pageFixture();
  const log = [];
  class App extends DemoApplication {
    application_did_launch() { log.push("launch"); return super.application_did_launch(); }
    application_will_terminate() { log.push("terminate"); }
  }
  Runtime.install({classes: {"Test::App": {constructor: App}}});
  f.body.setAttribute("application", "Test::App");
  new Launcher().install(f.document);
  assert.equal(f.body.__swill_application__, undefined, "nothing happens while loading");
  f.document.dispatchEvent(new Event("DOMContentLoaded"));
  const application = f.body.__swill_application__;
  assert.ok(application instanceof App);
  assert.equal(application.launched, true);
  assert.deepEqual(log, ["launch"]);
  assert.equal(application.root(), f.body);
  const [parent, badge] = application.controllers();
  assert.ok(parent instanceof Controller);
  assert.ok(badge instanceof Badge);
  assert.equal(f.parentTitle.textContent, "Hello Ada", "the example sets its own initial state");
  assert.equal(parent.application(), application);
  assert.equal(badge.application(), application);
  assert.equal(parent.next_responder(), application);
  assert.equal(badge.next_responder(), parent);
  assert.equal(application.next_responder(), null);

  // A bfcache pagehide keeps the page alive; a real unload terminates it.
  const persisted = new Event("pagehide");
  persisted.persisted = true;
  f.document.defaultView.dispatchEvent(persisted);
  assert.deepEqual(log, ["launch"]);
  f.document.defaultView.dispatchEvent(new Event("pagehide"));
  assert.deepEqual(log, ["launch", "terminate"]);
  assert.equal(f.body.__swill_application__, null);
  assert.equal(parent.view().controller_value(), null);
  assert.equal(badge.view().controller_value(), null);
  assert.equal(parent.application(), null);
  assert.equal(parent.next_responder(), null);
  application.terminate();
  assert.deepEqual(log, ["launch", "terminate"], "terminate is idempotent");
});

test("unhandled root actions reach the application; a ready document launches at once", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  assert.ok(application instanceof DemoApplication);
  const [parent, badge] = application.controllers();
  parent.person.name = "Grace";
  badge.count = 3;
  assert.deepEqual([f.parentTitle.textContent, f.badgeTitle.textContent], ["Hello Grace", "Badge 3"]);
  f.resetButton.click();
  assert.deepEqual([f.parentTitle.textContent, f.badgeTitle.textContent], ["Hello ", "Badge 0"]);
  assert.throws(() => badge.perform_action("missing", null, null), /Unhandled action: missing/);
  assert.throws(() => application.perform_action("missing", null, null), /Unhandled action: missing/);
});

test("pages without an application stay inert and unknown applications fail closed", () => {
  const plain = element("#document", {}, [element("body", {}, [element("main", {controller: "Demo::Controller"})])]);
  plain.readyState = "complete";
  assert.equal(new Launcher().launch(plain), null);
  assert.equal(plain.children[0].children[0].__swill_view__, undefined, "nothing is awakened without an application");
  const f = pageFixture({readyState: "complete", appName: "Demo::Missing"});
  assert.throws(() => new Launcher().launch(f.document), /Unknown class: Demo::Missing/);
});

// ---- klass components, templates, and outlet failures ----

const View = Runtime.resolve("Swill::View");
const SwillController = Runtime.resolve("Swill::Controller");
let hostSequence = 0;

function outletDescriptor(type, optional = false) {
  return {type, attribute: false, outlet: true, optional, defaultValue() { return null; }};
}

// A host controller declaring outlets the way generated metadata does.
function installHost(outlets) {
  const Host = class extends SwillController {};
  const name = `Test::Host${++hostSequence}`;
  const properties = {};
  for (const [outlet, optional] of Object.entries(outlets)) properties[outlet] = outletDescriptor("T.untyped", optional);
  Runtime.install({classes: {[name]: {constructor: Host, properties}}});
  return name;
}

class Highlight extends View {}
Runtime.install({classes: {"Test::Highlight": {constructor: Highlight}}});

test("klass awakens View subclasses, alone or together with a controller", () => {
  const name = installHost({panel: false, both: false, proto: true});
  const panel = element("div", {klass: "Test::Highlight", outlet: "panel"});
  const both = element("section", {klass: "Test::Highlight", controller: "Demo::Badge", outlet: "both"}, [
    element("p", {bind: "title"})
  ]);
  const proto = element("template", {outlet: "proto"});
  const root = element("main", {controller: name}, [panel, both, proto]);
  const [host, badge] = new Awakening().wire(element("body", {}, [root]));
  assert.ok(host.panel instanceof Highlight);
  assert.equal(host.panel.element(), panel);
  assert.equal(host.panel.owner(), host);
  assert.equal(host.both, badge);
  assert.ok(badge.view() instanceof Highlight, "klass wraps the element and the controller uses that view");
  assert.equal(badge.parent(), host);
  assert.equal(host.proto, proto);
  assert.equal(proto.__swill_view__, undefined, "templates are inert");
  assert.equal(both.children[0].textContent, "Badge 0");
});

test("outlet mistakes fail at awakening with the outlet name", () => {
  const awaken = children => new Awakening().wire(element("body", {}, [element("main", {controller: installHost({panel: false})}, children)]));
  assert.throws(() => awaken([element("div", {outlet: "panel"}), element("div", {outlet: "panel"})]), /Duplicate outlet: panel/);
  assert.throws(() => awaken([element("div", {outlet: "panel"}), element("div", {outlet: "nope"})]), /Undeclared outlet: nope/);
  assert.throws(() => awaken([]), /Unresolved outlet: panel/);
  assert.throws(() => awaken([element("div", {klass: "Demo::Badge", outlet: "panel"})]), /Demo::Badge is not a Swill::View/);
  assert.throws(() => awaken([element("div", {klass: "Nope::View", outlet: "panel"})]), /Unknown class: Nope::View/);
  const broken = element("script", {type: "application/json", outlet: "panel"});
  broken.textContent = "{not json";
  assert.throws(() => awaken([broken]), error => error.name === "SyntaxError");
  const empty = element("script", {type: "application/json", outlet: "panel"});
  empty.textContent = "  ";
  const [host] = awaken([empty]);
  assert.equal(host.panel, null, "an empty JSON outlet decodes to nil");
  const inner = element("div", {outlet: "panel"});
  const nested = element("section", {controller: "Demo::Badge"}, [inner]);
  assert.throws(() => awaken([nested]), /Unresolved outlet: panel/,
    "an outlet inside a child controller is not visible to the parent");
});

test("decode_outlet_data shapes JSON before assignment", () => {
  const name = installHost({payload: false});
  const Host = Runtime.resolve(name);
  Host.prototype.decode_outlet_data = function (outlet, value) { return `${outlet}:${JSON.stringify(value)}`; };
  const payload = element("script", {type: "application/json", outlet: "payload"});
  payload.textContent = '[1, 2]';
  const [host] = new Awakening().wire(element("body", {}, [element("main", {controller: name}, [payload])]));
  assert.equal(host.payload, "payload:[1,2]");
});

// ---- binding parity: roots, properties, readers, represented objects ----

const PersonEditor = Runtime.resolve("Demo::PersonEditor");

// The whole tree awakens together: a child root's bind is wired when its
// parent loads, so the editor must be present before the parent awakens.
function editorFixture() {
  const seed = element("script", {type: "application/json", outlet: "seed"});
  seed.textContent = '{"name": "Ada"}';
  const parentTitle = element("p", {bind: "title"});
  const parentInput = element("input", {bind: "person.name", outlet: "name_field"});
  const parentClear = element("button", {"data-action": "clear"});
  const badgeRoot = element("section", {controller: "Demo::Badge", outlet: "badge"});
  const nameInput = element("input", {bind: "name"});
  const blank = element("output", {bind: "name.blank?"});
  const local = element("input", {bind: "@note"});
  const clearButton = element("button", {"data-action": "clear", "bind-disabled": "@represented_object.name.empty?"});
  const editorRoot = element("section", {controller: "Demo::PersonEditor", bind: "person", "bind-hidden": "@represented_object.nil?"}, [
    nameInput, blank, local, clearButton
  ]);
  const parentRoot = element("main", {controller: "Demo::Controller"}, [
    seed, parentTitle, parentInput, parentClear, badgeRoot, editorRoot
  ]);
  const [parent, , editor] = new Awakening().wire(element("body", {}, [parentRoot]));
  return {parent, editor, parentTitle, parentClear, editorRoot, nameInput, blank, local, clearButton};
}

test("respond_to? answers from metadata for objects, nil, and plain values", () => {
  const person = new Person();
  assert.equal(Runtime.respondsTo(person, "name"), true);
  assert.equal(Runtime.respondsTo(person, "name="), true);
  assert.equal(Runtime.respondsTo(person, "label="), false, "computed properties have no writer");
  assert.equal(Runtime.respondsTo(person, "greeting"), true);
  assert.equal(Runtime.respondsTo(person, "toString"), false, "JavaScript shape is not consulted");
  assert.equal(Runtime.respondsTo(null, "nil?"), true);
  assert.equal(Runtime.respondsTo(null, "strip"), false);
  assert.equal(Runtime.respondsTo("Ada", "strip"), true);
  assert.equal(Runtime.respondsTo({name: "plain"}, "name"), false);
});

test("binding roots and @ resolve paths against the right object", () => {
  const bindings = new Bindings();
  assert.equal(bindings.resolve_path(null, "name"), "name");
  assert.equal(bindings.resolve_path(null, "@name"), "name");
  assert.equal(bindings.resolve_path("represented_object", "name"), "represented_object.name");
  assert.equal(bindings.resolve_path("represented_object", "@note"), "note");
  assert.equal(bindings.resolve_path("represented_object", ""), "represented_object");
  assert.equal(new PersonEditor().binding_root(), "represented_object", "a Ruby symbol is a string here");
  assert.equal(bindings.resolve_path("represented_object", "@"), "");
});

test("a parent binds a child controller's represented object, nil included", () => {
  const f = editorFixture();
  assert.equal(f.editor.parent(), f.parent);
  assert.equal(f.editor.represented_object, f.parent.person, "the parent's path feeds the child's represented object");
  assert.equal(f.nameInput.value, "Ada", "child bindings resolve under binding_root");
  assert.equal(f.blank.textContent, "false");
  assert.equal(f.editorRoot.hidden, false, "bind-* on the child's root belongs to the child");
  assert.equal(f.clearButton.disabled, false);
  f.nameInput.value = "Grace";
  f.nameInput.dispatchEvent(new Event("input"));
  assert.equal(f.parent.person.name, "Grace", "child input writes through represented_object");
  assert.equal(f.parentTitle.textContent, "Hello Grace");
  f.nameInput.value = "";
  f.nameInput.dispatchEvent(new Event("input"));
  assert.deepEqual([f.blank.textContent, f.clearButton.disabled], ["true", true]);
  f.local.value = "scratch";
  f.local.dispatchEvent(new Event("input"));
  assert.equal(f.editor.note, "scratch", "@ binds the controller itself despite binding_root");
  assert.equal(f.parent.person.note, undefined);
  const replacement = new Person();
  replacement.name = "Grace";
  f.parent.person = replacement;
  assert.equal(f.editor.represented_object, replacement);
  assert.equal(f.nameInput.value, "Grace", "child bindings rehook when the represented object changes");
  f.parentClear.click();
  assert.equal(f.editor.represented_object, f.parent.person, "clear hands the editor the fresh person");
  assert.deepEqual([f.editorRoot.hidden, f.nameInput.value, f.blank.textContent], [false, "", "true"]);
  f.parent.person = null;
  assert.equal(f.editor.represented_object, null, "nil propagates");
  assert.deepEqual([f.editorRoot.hidden, f.nameInput.value, f.blank.textContent], [true, "", "true"]);
  f.nameInput.value = "Ignored";
  f.nameInput.dispatchEvent(new Event("input"));
  assert.equal(f.parent.person, null, "writes through a nil represented object are dropped");
});

test("bind-* writes DOM properties and attributes one way with Ruby truthiness", () => {
  const f = nestedFixture();
  const link = element("a", {"bind-href": "person.name", "bind-data-name": "person.name", "bind-aria-label": "title"});
  const field = element("input", {"bind-readonly": "person.nil?", "bind-required": "fallback", "bind-title": "fallback"});
  f.parentRoot.append(link);
  f.parentRoot.append(field);
  const [] = new Awakening().wire(f.parentRoot);
  const bindings = new Bindings();
  const disposers = [];
  for (const el of [link, field]) {
    for (const name of el.getAttributeNames()) {
      disposers.push(bindings.wire_property(f.parent, null, el, name.slice(5), el.getAttribute(name)));
    }
  }
  assert.equal(link.href, "Ada");
  assert.equal(link.getAttribute("data-name"), "Ada");
  assert.equal(link.getAttribute("aria-label"), "Hello Ada");
  assert.deepEqual([field.readOnly, field.required, field.title], [false, true, "Nobody"], "a non-empty string is truthy");
  f.parent.person.name = "";
  assert.equal(link.href, "");
  assert.equal(link.getAttribute("data-name"), null, "empty strings remove data attributes");
  f.parent.person = null;
  assert.equal(link.href, "");
  assert.equal(link.attributes.href, undefined, "nil removes href");
  assert.equal(link.getAttribute("aria-label"), "Nobody");
  assert.equal(field.readOnly, true);
  disposers.forEach(dispose => dispose());
  f.parent.person = new Person();
  assert.equal(field.readOnly, true, "disposed property bindings stop updating");
  assert.equal(Runtime.isEmpty([]), true);
  assert.throws(() => Runtime.isEmpty(42), /requires a string or array/);
});

test("object bindings keep a target equal to a source path and release on teardown", () => {
  const f = nestedFixture();
  assert.equal(f.parent.badge_count, 0);
  f.childBump.click();
  assert.equal(f.parent.badge_count, 1, "awake_from_dom bound badge_count to the badge outlet");
  const other = new Badge();
  other.count = 7;
  f.parent.bind("badge_count", {to: other, key_path: "count"});
  assert.equal(f.parent.badge_count, 7, "rebinding replaces the previous source");
  f.childBump.click();
  assert.equal(f.parent.badge_count, 7);
  other.count = 8;
  assert.equal(f.parent.badge_count, 8);
  assert.throws(() => f.parent.bind("nonexistent", {to: other, key_path: "count"}), /Unknown writer: nonexistent/);
  f.parent.unbind("badge_count");
  other.count = 9;
  assert.equal(f.parent.badge_count, 8);
  f.parent.bind("badge_count", {to: other, key_path: "count"});
  f.parent.teardown();
  other.count = 10;
  assert.equal(f.parent.badge_count, 9, "teardown unbinds object bindings");
});
