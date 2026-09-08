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
  assert.throws(() => Runtime.writePath(controller, "person.name", "Ada"), /Unavailable/);
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
  controller.person = new Person();
  assert.equal(Runtime.performAction(controller, "clear", {}, {}), "Nobody");
  assert.equal(controller.person, null);
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
  const unbindInput = bindings.wire_element(person, input);
  const unbindOutput = bindings.wire_element(person, output);
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
    () => bindings.wire_element(person, new Element({bind: "label"}, "INPUT")),
    /Read-only/
  );
  const readonly = new Element({bind: "label", readonly: ""}, "INPUT");
  const unbindReadonly = bindings.wire_element(person, readonly);
  assert.equal(readonly.value, "GRACE");
  readonly.value = "Ignored";
  readonly.dispatchEvent(new Event("input"));
  assert.equal(person.name, "Grace");
  unbindReadonly();

  const checkbox = new Element({bind: "loud"}, "INPUT", "checkbox");
  const unbindCheckbox = bindings.wire_element(person, checkbox);
  assert.equal(checkbox.checked, true);
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change"));
  assert.equal(person.loud, false);
  unbindCheckbox();

  const controller = new Controller();
  assert.throws(
    () => bindings.wire_element(controller, new Element({bind: "person.name"}, "INPUT")),
    /Unavailable binding owner/
  );
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
  controller.person = new Person();
  const dispose = actions.wire_element(controller, element);
  element.dispatchEvent(new Event("click"));
  assert.ok(controller.person instanceof Person);
  element.dispatchEvent(new Event("change"));
  assert.equal(controller.person, null);
  controller.person = new Person();
  dispose();
  element.dispatchEvent(new Event("change"));
  assert.ok(controller.person instanceof Person);
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
  const nameInput = element("input", {bind: "person.name"});
  const parentClear = element("button", {"data-action": "clear"});
  const childTitle = element("p", {bind: "title"});
  const childClear = element("button", {"data-action": "clear"});
  const childBump = element("button", {"data-action": "bump"});
  const childShout = element("button", {"data-action": "shout"});
  const grandchildTitle = element("p", {bind: "title"});
  const grandchildRoot = element("section", {controller: `Test::Grandchild${suffix}`}, [grandchildTitle]);
  const childRoot = element("section", {controller: `Test::Child${suffix}`}, [
    childTitle, childClear, childBump, childShout, element("div", {}, [grandchildRoot])
  ]);
  const parentRoot = element("main", {controller: `Test::Parent${suffix}`}, [
    parentTitle, nameInput, parentClear, childRoot
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
  assert.deepEqual(Array.from(f.parent.view().subviews()), [f.child.view()]);
  assert.equal(f.grandchild.view().owner(), f.grandchild);
  assert.equal(f.grandchildRoot.parentElement.__swill_view__, undefined, "plain elements never become views");
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
  f.parentClear.click();
  assert.equal(f.parent.person, null);
  assert.equal(f.parentTitle.textContent, "Nobody");
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
