import {test, afterEach} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInContext} from "node:vm";
import {loadBundles} from "./load_bundles.mjs";

const swill = loadBundles();
const {Runtime, context} = swill;
context.HTMLTemplateElement = class {
  static [Symbol.hasInstance](value) { return value?.tagName === "TEMPLATE"; }
};

const SwillObject = Runtime.resolve("Swill::Object");
const Person = Runtime.resolve("Demo::Person");
const SpecialPerson = Runtime.resolve("Demo::SpecialPerson");
const Controller = Runtime.resolve("Demo::Controller");
const Application = Runtime.resolve("Swill::Application");

// One application runs per page; each test launches its own.
afterEach(() => { if (Application.isRunning()) Application.shared().terminate(); });

// Launch the demo application on a body and return its controllers, ending
// whatever a previous call in the same test launched.
function launched(body) {
  if (Application.isRunning()) Application.shared().terminate();
  const application = new DemoApplication();
  application.launch(body);
  return application.controllers;
}
const Bindings = swill.Swill__Connections__Bindings;
const Actions = swill.Swill__Connections__Actions;

test("binding destination factories return shared instances of the namespaced classes", () => {
  const Destination = Runtime.resolve("Swill::BindingDestination");
  const cases = [
    ["Text", () => Destination.forElement({tagName: "SPAN"})],
    ["Field", () => Destination.forElement({tagName: "INPUT", type: "text"})],
    ["Field", () => Destination.forElement({tagName: "TEXTAREA"})],
    ["Select", () => Destination.forElement({tagName: "SELECT"})],
    ["Checkbox", () => Destination.forElement({tagName: "INPUT", type: "checkbox"})],
    ["ElementProperty", () => Destination.elementProperty()],
    ["ObjectProperty", () => Destination.objectProperty()]
  ];
  for (const [name, create] of cases) {
    const destination = create();
    assert.ok(destination instanceof Runtime.resolve(`Swill::BindingDestination::${name}`), name);
    assert.ok(destination instanceof Destination);
    assert.equal(create(), destination, `${name} is shared`);
  }
  const Field = Runtime.resolve("Swill::BindingDestination::Field");
  assert.ok(Destination.forElement({tagName: "SELECT"}) instanceof Field);
  assert.ok(Destination.forElement({tagName: "INPUT", type: "checkbox"}) instanceof Field);
});

test("real Attributes concern builds isolated inherited registries", () => {
  const Base = Runtime.resolve("Swill::Model::Base");
  const result = {
    record: Object.keys(Base.modelAttributes()),
    person: Object.keys(Person.modelAttributes()),
    special: Object.keys(SpecialPerson.modelAttributes())
  };
  assert.deepEqual(result, JSON.parse(readFileSync("build/mri-attributes.json")));
  assert.notEqual(Person.modelAttributes(), Base.modelAttributes());
  assert.notEqual(SpecialPerson.modelAttributes(), Person.modelAttributes());
  assert.equal(Person.modelAttributes().name.type, "String");
  assert.equal(SpecialPerson.modelAttributes().role.key, "job");
  assert.equal(SpecialPerson.modelAttributes().role.default, "editor");
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
    truth: [person.rubyTruth(0), person.rubyTruth(null)],
    or: [person.rubyOr(""), person.rubyOr(null)]
  };
  assert.deepEqual(result, JSON.parse(readFileSync(new URL("../build/mri-result.json", import.meta.url))));
});

test("dirty tracking and validation agree with MRI", () => {
  const person = new SpecialPerson();
  const changes = [];
  person.observe("dirty?", value => changes.push(["dirty?", value]));
  person.observe("dirty_attributes", value => changes.push(["dirty_attributes", [...value]]));
  const steps = [];
  steps.push([person.isDirty, [...person.dirty()]]);
  person.name = "Ada";
  steps.push([person.isDirty, [...person.dirty()]]);
  person.role = " writer ";
  steps.push([person.role, [...person.dirty()]]);
  person.name = "";
  steps.push([person.isDirty, [...person.dirty()]]);
  let message;
  assert.throws(() => { person.role = "  "; }, error => { message = error.message; return true; });
  steps.push([message, person.role, [...person.dirty()]]);
  person.applyAttributes({name: "Grace"});
  steps.push([person.name, person.isDirty, [...person.dirty()]]);
  const draft = person.draft();
  steps.push([draft.name, draft.role, draft.isDirty]);
  person.markCleanBang();
  steps.push([person.isDirty, [...person.dirty()]]);
  person.role = "editor";
  steps.push([person.isDirty, [...person.dirty()]]);
  assert.deepEqual({steps, changes}, JSON.parse(readFileSync("build/mri-dirty.json")));
  assert.equal(Runtime.readPath(person, "dirty?"), true);
  assert.notEqual(person.dirty(), person.dirtyAttributes, "dirty returns a copy");
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
  assert.equal(view.controllerValue(), controller);
  assert.equal(Runtime.read(" Ada ", "strip"), "Ada");
  assert.equal(Runtime.read(null, "strip"), null);
  assert.throws(() => Runtime.read(42, "strip"), /requires a string/);
  assert.throws(() => Runtime.read("Ada", "name"), /Unknown value reader/);
});

test("an object Swill did not install answers with its own JavaScript members", () => {
  // An element found in the page, say: no Swill metadata, only its own shape.
  class Paragraph {
    constructor() { this.tagName = "P"; this.open = false; }
    showPopover() { this.open = true; return "shown"; }
    toggleClass(name, on) { return `${name}:${on}`; }
  }
  const paragraph = new Paragraph();
  assert.equal(Runtime.invoke(paragraph, "tagName"), "P", "a property called with parentheses reads");
  assert.equal(Runtime.send(paragraph, "tagName"), "P");
  assert.equal(Runtime.send(paragraph, "showPopover"), "shown", "a method without parentheses is called");
  assert.equal(paragraph.open, true);
  assert.equal(Runtime.invoke(paragraph, "toggleClass", "open", true), "open:true");
  assert.equal(Runtime.send(paragraph, "__widget__"), undefined, "an absent member reads as nil, as an expando does");
  assert.throws(() => Runtime.invoke(paragraph, "missing"), /Unknown method: missing/, "calling an absent member raises");
  assert.throws(() => Runtime.invoke(paragraph, "tagName", 1), /Not a method: tagName/);
  assert.throws(() => Runtime.send(null, "tagName"), /Cannot call tagName on nil/);

  // A Swill object keeps strict lookup; plain objects stay dictionaries; and
  // an array keeps Ruby's readers ahead of its own members.
  assert.throws(() => Runtime.send(new (Runtime.resolve("Swill::View"))({}), "missing"), /Unknown reader/);
  assert.equal(Runtime.send({tagName: "div"}, "tagName"), "div");
  assert.throws(() => Runtime.invoke({}, "missing"), /Unknown method or wrong arity/);
  assert.equal(Runtime.send([1, 2], "first"), 1);
  assert.equal(Runtime.send([1, 2], "length"), 2);
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
  assert.throws(() => Runtime.invoke(controller, "toString"), /Unknown method/);
  // Dynamic dispatch on a plain value carries Ruby's core methods.
  assert.deepEqual([Runtime.invoke([3, 1], "index", 1), Runtime.invoke([3], "index", 9), Runtime.invoke([1, 2, 3], "take", 2)], [1, null, [1, 2]]);
  assert.deepEqual([Runtime.read([3, 1], "first"), Runtime.read([], "last"), Runtime.read([1, null, 1], "compact"), Runtime.read(null, "to_s")], [3, null, [1, 1], ""]);
  assert.throws(() => Runtime.read("text", "first"), /requires an array/);
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
  const unbindInput = Bindings.connect(person, input, null);
  const unbindOutput = Bindings.connect(person, output, null);
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
    () => Bindings.connect(person, new Element({bind: "label"}, "INPUT"), null),
    /Read-only/
  );
  const readonly = new Element({bind: "label", readonly: ""}, "INPUT");
  const unbindReadonly = Bindings.connect(person, readonly, null);
  assert.equal(readonly.value, "GRACE");
  readonly.value = "Ignored";
  readonly.dispatchEvent(new Event("input"));
  assert.equal(person.name, "Grace");
  unbindReadonly();

  const checkbox = new Element({bind: "loud"}, "INPUT", "checkbox");
  const unbindCheckbox = Bindings.connect(person, checkbox, null);
  assert.equal(checkbox.checked, true);
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change"));
  assert.equal(person.loud, false);
  unbindCheckbox();

  // A path whose owner is not there yet wires, ignores writes, and catches up.
  const controller = new Controller();
  const pending = new Element({bind: "person.name"}, "INPUT");
  const unbindPending = Bindings.connect(controller, pending, null);
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
  const first = new Person();
  controller.person = first;
  const dispose = Actions.connect(element, controller);
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
  Actions.connect(blank, controller)();
  assert.equal(blank.__swill_action__, undefined);
});

test("the shared setter coerces before equality and invalidates before hooks", () => {
  const events = [];
  class Hooks extends SwillObject {
    coercePropertyValue(_name, value) { return value.trim(); }
    propertyWillChange(name, previous, value) { events.push(["will", previous, value]); }
    nameDidChange(previous, value) { events.push(["did", this.label]); }
  }
  Runtime.installClass(Hooks, "Test::Hooks", [
    {name: "name", js: "name", defaultValue() { return ""; }},
    {name: "label", js: "label", computed: true, compute() { return this.name.toUpperCase(); }}
  ], [{name: "name_did_change", js: "nameDidChange", arity: 2}]);
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
  controller.disconnect();
  person.name = "Grace";
  assert.deepEqual(values, []);
  assert.equal(controller.person, person);
  assert.equal(controller.title, "Hello Grace");
  controller.disconnect();
});

test("disconnect invalidates computations on other objects before severing the graph", () => {
  class Source extends SwillObject {}
  class Dependent extends SwillObject {}
  Runtime.install({classes: {
    "Test::DisconnectSource": {constructor: Source, properties: {
      count: {type: "Integer", defaultValue() { return 1; }}
    }},
    "Test::DisconnectDependent": {constructor: Dependent, properties: {
      source: {type: "Test::DisconnectSource", defaultValue() { return null; }},
      doubled: {type: "Integer", compute() { return this.source.count * 2; }}
    }}
  }});
  const source = new Source();
  const dependent = new Dependent();
  dependent.source = source;
  assert.equal(dependent.doubled, 2);
  source.disconnect();
  source.count = 2;
  assert.equal(dependent.doubled, 4, "the next read resubscribes to a disconnected source");
  source.count = 3;
  assert.equal(dependent.doubled, 6, "the fresh subscription remains live");
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
  // dup of a framework object is a new instance with the stored properties.
  const twin = Runtime.read(child, "dup");
  assert.ok(twin instanceof child.constructor && twin !== child);
  assert.equal(twin.name, child.name);
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

test("installation rejects a setter for a declared property, before registering the class", () => {
  const stored = () => ({count: {defaultValue() { return 0; }}});
  class Shadowed extends SwillObject { set count(_value) {} }
  assert.throws(() => Runtime.install({classes: {"Test::Shadowed": {constructor: Shadowed, properties: stored()}}}),
    /Setter method for declared property: count/);
  assert.throws(() => Runtime.resolve("Test::Shadowed"), /Unknown class/);
  class SetterBase extends SwillObject {}
  Runtime.install({classes: {"Test::SetterBase": {constructor: SetterBase, properties: stored()}}});
  class SetterSub extends SetterBase { set count(_value) {} }
  assert.throws(() => Runtime.install({classes: {"Test::SetterSub": {constructor: SetterSub}}}),
    /Setter method for declared property: count/, "a setter shadowing an inherited accessor bypasses the protocol");
});

test("a did_change hook runs for stored properties and keeps a computed property current", () => {
  class Tally extends SwillObject {
    constructor() { super(); this.seen = []; }
    countDidChange(previous, value) { this.seen.push(["count", previous, value]); }
    totalDidChange(previous, value) { this.seen.push(["total", previous, value]); }
  }
  Runtime.install({classes: {"Test::Tally": {
    constructor: Tally,
    properties: {count: {defaultValue() { return 1; }}, total: {compute() { return this.count * 2; }}},
    methods: {count_did_change: {arity: 2, js: "countDidChange"}, total_did_change: {arity: 2, js: "totalDidChange"}}
  }}});
  const tally = new Tally();
  tally.count = 2;
  assert.deepEqual(tally.seen, [["total", 2, 4], ["count", 1, 2]],
    "nothing observes total, yet its hook ran on the dependency change, before the stored hook");
  tally.count = 2;
  assert.equal(tally.seen.length, 2, "an equal write is not a change");
  assert.equal(tally.total, 4);
  tally.disconnect();
  tally.count = 3;
  assert.deepEqual(tally.seen.slice(2), [["count", 2, 3]], "a disposed object's computed hooks are released");
});

// ---- nested controller ownership ----

import {element, keyEvent, Browser} from "./dom.mjs";

const Awakening = swill.Swill__Awakening;
const Badge = Runtime.resolve("Demo::Badge");
let fixtureSequence = 0;

// Parent and child controllers with identically named bindings and actions.
// Hooks record their order; the runtime installs the recording subclasses
// under fresh names exactly like generated metadata would.
function nestedFixture() {
  const log = [];
  const atLoad = {};
  const hooks = ["viewDidLoad", "awakeFromDOM", "controllerDidLoad", "viewWillAppear",
    "viewDidAppear", "viewWillDisappear", "viewDidDisappear"];
  const recording = (Base, label) => {
    const klass = class extends Base {};
    for (const hook of hooks) {
      klass.prototype[hook] = function () {
        log.push(`${label}:${hook}`);
        if (hook === "viewDidLoad") atLoad[label] = {nameField: this.nameField, title: parentTitle.textContent};
        return Base.prototype[hook].call(this);
      };
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
  const controllers = launched(document);
  const [parent, child, grandchild] = controllers;
  return {log, atLoad, suffix, document, controllers, parent, child, grandchild, parentRoot, childRoot, grandchildRoot,
    parentTitle, nameInput, parentClear, childTitle, childClear, childBump, childShout, grandchildTitle};
}

test("awakening builds a sparse view tree that defines ownership", () => {
  const f = nestedFixture();
  assert.equal(f.controllers.length, 3);
  assert.ok(f.parent instanceof Controller);
  assert.ok(f.child instanceof Badge);
  assert.deepEqual(Array.from(f.parent.childControllers()), [f.child]);
  assert.deepEqual(Array.from(f.child.childControllers()), [f.grandchild]);
  assert.deepEqual(Array.from(f.grandchild.childControllers()), []);
  assert.equal(f.child.parent(), f.parent);
  assert.equal(f.grandchild.parent(), f.child);
  assert.equal(f.parent.parent(), null);
  assert.equal(f.child.nextResponder(), f.parent);
  assert.equal(f.parent.nextResponder(), Application.shared(), "a root controller answers to the application");
  assert.equal(f.child.view.superview, f.parent.view);
  assert.deepEqual(Array.from(f.parent.view.subviews), [f.parent.nameField, f.child.view]);
  assert.equal(f.grandchild.view.owner(), f.grandchild);
  assert.equal(f.grandchildRoot.parentElement.__swill_view__, undefined, "plain elements never become views");
  assert.equal(f.parentTitle.__swill_view__, undefined, "bind-only elements never become views");
  assert.equal(f.parentClear.__swill_view__, undefined, "action-only elements never become views");
  assert.equal(f.childRoot.__swill_view__.nextResponder(), f.child);
});

test("lifecycle runs children first per phase and preserves the flat order", () => {
  const f = nestedFixture();
  const phase = hook => ["grandchild", "child", "parent"].map(label => `${label}:${hook}`);
  assert.deepEqual(f.log, [
    "grandchild:viewDidLoad", "grandchild:awakeFromDOM",
    "child:viewDidLoad", "child:awakeFromDOM",
    "parent:viewDidLoad", "parent:awakeFromDOM",
    ...phase("controllerDidLoad"), ...phase("viewWillAppear"), ...phase("viewDidAppear")
  ]);
  assert.ok(f.parent.person instanceof Person, "the parent's inherited view_did_load ran");
  assert.equal(f.parentTitle.textContent, "Hello Ada", "awake_from_dom saw the decoded JSON outlet");
});

test("view_did_load runs after outlets connect and before bindings push", () => {
  const f = nestedFixture();
  assert.equal(f.atLoad.parent.nameField, f.parent.nameField, "the outlet was already connected");
  assert.ok(f.atLoad.parent.nameField, "and is not nil");
  assert.equal(f.atLoad.parent.title, "", "no binding had pushed yet");
});

test("outlets connect to their direct owner as views, controllers, and data", () => {
  const f = nestedFixture();
  assert.ok(f.parent.nameField instanceof View);
  assert.equal(f.parent.nameField.element, f.nameInput);
  assert.equal(f.parent.nameField.owner(), f.parent);
  assert.equal(f.parent.nameField.superview, f.parent.view);
  assert.deepEqual(Array.from(f.parent.view.subviews), [f.parent.nameField, f.child.view]);
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

// What every element kind does with every kind of value, recorded so a change
// to the binding path has to state which of these it means to alter. Ruby
// truthiness is load-bearing here: "" and 0 are true, only nil and false are
// false, which is not what JavaScript would do with the same values.
test("a bound value reaches each element kind the same way", () => {
  class Subject extends SwillObject {}
  Runtime.installClass(Subject, "Test::BindingMatrix",
    [{name: "v", js: "v", defaultValue() { return null; }}], []);

  const bound = (tag, attributes) => {
    const subject = new Subject();
    const target = element(tag, {bind: "v", ...attributes});
    Bindings.connect(subject, target, null);
    return [subject, target];
  };

  // [value, span textContent, input value, checkbox checked]
  for (const [value, text, field, checked] of [
    ["hi", "hi", "hi", true],
    ["", "", "", true],
    [null, "", "", false],
    [0, "0", "0", true],
    [42, "42", "42", true],
    [false, "false", "false", false],
    [true, "true", "true", true]
  ]) {
    const label = JSON.stringify(value);
    const [span, spanElement] = bound("SPAN", {});
    span.v = value;
    assert.equal(spanElement.textContent, text, `span text for ${label}`);

    const [input, inputElement] = bound("INPUT", {});
    input.v = value;
    assert.equal(inputElement.value, field, `input value for ${label}`);

    const [box, boxElement] = bound("INPUT", {type: "checkbox"});
    box.v = value;
    assert.equal(boxElement.checked, checked, `checkbox for ${label}`);
  }
});

test("a bound DOM property follows the rule for its kind", () => {
  class Subject extends SwillObject {}
  Runtime.installClass(Subject, "Test::PropertyMatrix",
    [{name: "v", js: "v", defaultValue() { return null; }}], []);

  const written = (property, value) => {
    const subject = new Subject();
    const target = element("a", {});
    Bindings.connectProperty(subject, null, target, property, "v");
    subject.v = value;
    return [target.getAttribute(property), target[property]];
  };

  // A boolean property takes the truth of the value and never an attribute.
  for (const [value, expected] of [
    ["v", true], ["", true], [null, false], [0, true], [false, false], [true, true]
  ]) {
    assert.deepEqual(written("hidden", value), [null, expected],
      `hidden for ${JSON.stringify(value)}`);
  }

  // data-* drops nil, "" and false; aria-* drops nil and "" but keeps "false",
  // which is a state of its own rather than an absence.
  assert.deepEqual(written("data-flag", "v")[0], "v");
  assert.deepEqual(written("data-flag", "")[0], null);
  assert.deepEqual(written("data-flag", null)[0], null);
  assert.deepEqual(written("data-flag", false)[0], null);
  assert.deepEqual(written("data-flag", 0)[0], "0");

  assert.deepEqual(written("aria-busy", "")[0], null);
  assert.deepEqual(written("aria-busy", null)[0], null);
  assert.deepEqual(written("aria-busy", false)[0], "false");
  assert.deepEqual(written("aria-busy", 0)[0], "0");

  // A nil href clears the property rather than leaving "null" in the document.
  assert.deepEqual(written("href", null), [null, ""]);
  assert.deepEqual(written("href", "/x")[1], "/x");
  // Any other property is written as it comes, nil included.
  assert.deepEqual(written("title", null)[1], null);
  assert.deepEqual(written("title", 0)[1], 0);
});

// A change partway along a path re-points only what is below it, so the
// subscriptions above stay put and the ones below follow the new object.
test("observing a path re-subscribes below a change and releases the old branch", () => {
  const f = nestedFixture();
  const seen = [];
  const first = f.parent.person;
  const second = new Person();
  second.name = "Second";

  const dispose = Runtime.observePath(f.parent, "person.name", value => seen.push(value));

  first.name = "First";
  assert.deepEqual(seen, ["First"], "the leaf notifies");

  f.parent.person = second;
  assert.deepEqual(seen, ["First", "Second"], "swapping the owner reports the new leaf");

  first.name = "Ignored";
  assert.deepEqual(seen, ["First", "Second"], "the branch that was replaced is silent");

  second.name = "Third";
  assert.deepEqual(seen, ["First", "Second", "Third"], "the new branch is live");

  f.parent.person = null;
  assert.deepEqual(seen, ["First", "Second", "Third", null], "a nil owner reports nil");

  second.name = "Detached";
  assert.deepEqual(seen, ["First", "Second", "Third", null], "a detached branch is silent");

  // Restoring an owner has to re-read it rather than trust what was cached.
  f.parent.person = second;
  assert.deepEqual(seen, ["First", "Second", "Third", null, "Detached"], "reattaching resubscribes");

  second.name = "Live";
  assert.deepEqual(seen.at(-1), "Live", "the restored branch notifies again");

  dispose();
  second.name = "After";
  f.parent.person = first;
  assert.equal(seen.at(-1), "Live", "disposal releases every segment");
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
  assert.throws(() => f.grandchild.performAction("vanish", null, null), /Unhandled action: vanish/);
  assert.throws(() => f.parent.performAction("toString", null, null), /Unhandled action/);
  assert.equal(Runtime.respondsTo(f.parent, "shout"), true);
  assert.equal(Runtime.respondsTo(f.child, "shout"), false);
  // A responder that responds to the name but cannot take the action is an
  // error there, as a wrong-arity send would be in Ruby; it never bubbles.
  assert.throws(() => f.child.performAction("title", null, null), /Unknown action or wrong arity: title/);
  class Wide extends Badge { wide(a, b, c) { return [a, b, c]; } }
  Runtime.install({classes: {"Test::Wide": {constructor: Wide, methods: {wide: {arity: 3}}}}});
  assert.throws(() => new Wide().performAction("wide", null, null), /Unknown action or wrong arity: wide/);
});

test("an object retains what it observes and lets it go when it deallocs", () => {
  const watcher = new (Runtime.resolve("Demo::Badge"))();
  const watched = new Person();
  const seen = [];

  // Three arguments: I observe another object, and own the observation.
  watcher.observeWithObject(watched, "name", value => seen.push(value));
  // Two arguments: I observe my own property, and own that too.
  watcher.observe("count", value => seen.push(`count ${value}`));
  watched.name = "Ada";
  watcher.count = 1;
  assert.deepEqual(seen, ["Ada", "count 1"]);

  watcher.dealloc();
  watched.name = "Grace";
  watcher.count = 2;
  assert.deepEqual(seen, ["Ada", "count 1"], "dealloc releases what the object retained");
  watcher.dealloc();
  watched.name = "Hopper";
  assert.deepEqual(seen, ["Ada", "count 1"], "a second dealloc is a no-op");

  // A disposer with no observation of its own is retained the same way.
  let released = 0;
  const other = new (Runtime.resolve("Demo::Badge"))();
  other.retain(() => { released += 1; });
  other.dealloc();
  other.dealloc();
  assert.equal(released, 1, "a retained disposer is called once");

  // release gives one up early, so dealloc has nothing left to give up.
  let early = 0;
  const owner = new (Runtime.resolve("Demo::Badge"))();
  const disposer = owner.retain(() => { early += 1; });
  owner.release(disposer);
  assert.equal(early, 1, "release ends the disposer");
  owner.dealloc();
  assert.equal(early, 1, "and takes it out of what dealloc would release");
});

test("complex calls keep positional hashes separate and enforce keywords", () => {
  const signature = {
    positional: [{name: "value", kind: "req"}],
    keywords: [{name: "required", kind: "keyreq"}, {name: "optional", kind: "key"}],
    keywordRest: null, block: "block"
  };
  const positional = {required: "positional"};
  const bound = Runtime.bindArguments(
    [positional, Runtime.keywordArguments({required: 1})], signature
  );
  assert.equal(Runtime.argument(bound, "value"), positional);
  assert.equal(Runtime.argument(bound, "required"), 1);
  assert.equal(Runtime.isOmittedArgument(Runtime.argument(bound, "optional")), true);
  assert.throws(() => Runtime.bindArguments([positional], signature), /missing keyword: required/);
  assert.throws(
    () => Runtime.bindArguments(
      [positional, Runtime.keywordArguments({required: 1, unknown: 2})], signature
    ),
    /unknown keyword: unknown/
  );
});

test("a method family resolves by argument count", () => {
  class Family extends SwillObject {
    tally() { return 1; }
    tallyWithScale(scale) { return scale; }
    greet(name) { return `Hello ${name}`; }
    greetWithGreeting(greeting, name) { return `${greeting} ${name}`; }
    clicked(sender) { return ["one", sender]; }
    clickedWithEvent(sender, event) { return ["two", sender, event]; }
    validateTag(value) { return value; }
  }
  Runtime.install({classes: {"Test::Family": {constructor: Family,
    properties: {},
    methods: {
      tally: {arity: 0},
      tally_with_scale: {arity: 1, js: "tallyWithScale", family: "tally"},
      greet: {arity: 1},
      greet_with_greeting: {arity: 2, js: "greetWithGreeting", family: "greet"},
      clicked: {arity: 1},
      clicked_with_event: {arity: 2, js: "clickedWithEvent", family: "clicked"},
      validate_tag: {arity: 1, js: "validateTag"}
    }}}});
  const family = new Family();

  assert.equal(Runtime.invoke(family, "greet", "Ada"), "Hello Ada");
  assert.equal(Runtime.invoke(family, "greet", "Hi", "Ada"), "Hi Ada", "a wider variant answers the same name");
  assert.throws(() => Runtime.invoke(family, "greet", "a", "b", "c"), /wrong arity/);
  assert.equal(Runtime.read(family, "tally"), 1, "a reader is the variant that takes nothing");

  // The runtime has a sender and an event, and gives as many as the widest
  // variant will take.
  assert.deepEqual(Runtime.performAction(family, "clicked", "s", "e"), ["two", "s", "e"]);
  assert.equal(Runtime.performAction(family, "tally", "s", "e"), "s",
    "the widest variant that fits takes the sender, though the plain one takes nothing");
  assert.equal(Runtime.methodAccepts(family, "validate_tag", 2), false);
});

test("method-family lookup does not scan unrelated methods", () => {
  class Indexed extends SwillObject {
    target(sender) { return sender; }
    targetWithEvent(sender, event) { return [sender, event]; }
  }
  const methods = {
    target: {arity: 1},
    target_with_event: {arity: 2, js: "targetWithEvent", family: "target"}
  };
  for (let index = 0; index < 100; index += 1) {
    const name = `unrelated_${index}`;
    Indexed.prototype[name] = value => value;
    methods[name] = {arity: 1};
  }
  Runtime.install({classes: {"Test::Indexed": {constructor: Indexed, methods}}});
  const indexed = new Indexed();
  assert.equal(Runtime.invoke(indexed, "target", "sender"), "sender");
  assert.deepEqual(Runtime.performAction(indexed, "target", "sender", "event"), ["sender", "event"]);
});

test("awakening a later fragment adopts it into the nearest live owner", () => {
  const f = nestedFixture();
  const lateTitle = element("p", {bind: "title"});
  const lateRoot = element("section", {controller: "Demo::Badge"}, [lateTitle]);
  f.childRoot.append(element("div", {}, [lateRoot]));
  const [late] = Awakening.instantiate(lateRoot);
  assert.equal(late.parent(), f.child);
  assert.deepEqual(Array.from(f.child.childControllers()), [f.grandchild, late]);
  assert.equal(lateTitle.textContent, "Badge 0");
  assert.equal(f.log.filter(entry => entry.endsWith(":viewDidLoad")).length, 3, "existing controllers are not re-awakened");
  assert.deepEqual(Array.from(Awakening.instantiate(f.document)), [], "an awakened tree yields no new controllers");
});

test("unloading the parent releases every descendant exactly once", () => {
  const f = nestedFixture();
  f.parent.person.name = "Ada";
  f.log.length = 0;
  f.parent.unload();
  assert.deepEqual(f.log, [
    "parent:viewWillDisappear", "child:viewWillDisappear",
    "grandchild:viewWillDisappear", "grandchild:viewDidDisappear",
    "child:viewDidDisappear", "parent:viewDidDisappear"
  ]);
  assert.equal(f.child.view.controllerValue(), null);
  assert.equal(f.child.parent(), null);
  assert.deepEqual(Array.from(f.parent.childControllers()), []);
  assert.deepEqual(Array.from(f.parent.view.subviews), []);
  f.childBump.click();
  assert.equal(f.child.count, 0, "child listeners are gone");
  assert.equal(f.childTitle.textContent, "Badge 0");
  f.parent.person.name = "Grace";
  assert.equal(f.parentTitle.textContent, "Hello Ada", "parent observers are gone");
  f.child.count = 5;
  assert.equal(f.childTitle.textContent, "Badge 0", "child observers are gone");
  f.parent.unload();
  f.child.unload();
  assert.equal(f.log.length, 6, "a second unload is a no-op");
  const [again] = Awakening.instantiate(f.parentRoot);
  assert.notEqual(again, f.parent);
  assert.equal(again.childControllers().length, 1);
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
  document.defaultView = new Browser();
  return {log, document, body, main, badge, parentTitle, badgeTitle, resetButton, nameInput};
}

test("the launcher launches the declared application once the DOM is parsed", () => {
  const f = pageFixture();
  const log = [];
  class App extends DemoApplication {
    applicationDidLaunch() { log.push("launch"); return super.applicationDidLaunch(); }
    applicationWillTerminate() { log.push("terminate"); }
  }
  Runtime.install({classes: {"Test::App": {constructor: App}}});
  f.body.setAttribute("application", "Test::App");
  new Launcher().install(f.document);
  assert.equal(Application.isRunning(), false, "nothing happens while loading");
  f.document.dispatchEvent(new Event("DOMContentLoaded"));
  const application = Application.shared();
  assert.ok(application instanceof App);
  assert.equal(new Launcher().launch(f.document), application, "an attached root is not launched twice");
  assert.equal(application.launched, true);
  assert.deepEqual(log, ["launch"]);
  assert.equal(application.root, f.body);
  const [parent, badge] = application.controllers;
  assert.ok(parent instanceof Controller);
  assert.ok(badge instanceof Badge);
  assert.equal(f.parentTitle.textContent, "Hello Ada", "the example sets its own initial state");
  assert.equal(parent.application(), application);
  assert.equal(badge.application(), application);
  assert.equal(parent.nextResponder(), application);
  assert.equal(badge.nextResponder(), parent);
  assert.equal(application.nextResponder(), null);

  // A bfcache pagehide keeps the page alive; a real unload terminates it.
  const persisted = new Event("pagehide");
  persisted.persisted = true;
  f.document.defaultView.dispatchEvent(persisted);
  assert.deepEqual(log, ["launch"]);
  f.document.defaultView.dispatchEvent(new Event("pagehide"));
  assert.deepEqual(log, ["launch", "terminate"]);
  assert.equal(Application.isRunning(), false);
  assert.equal(parent.view.controllerValue(), null);
  assert.equal(badge.view.controllerValue(), null);
  assert.throws(() => parent.application(), /No application is running/);
  assert.throws(() => parent.nextResponder(), /No application is running/);
  application.terminate();
  assert.deepEqual(log, ["launch", "terminate"], "terminate is idempotent");
});

test("unhandled root actions reach the application; a ready document launches at once", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  assert.ok(application instanceof DemoApplication);
  const [parent, badge] = application.controllers;
  parent.person.name = "Grace";
  badge.count = 3;
  assert.deepEqual([f.parentTitle.textContent, f.badgeTitle.textContent], ["Hello Grace", "Badge 3"]);
  f.resetButton.click();
  assert.deepEqual([f.parentTitle.textContent, f.badgeTitle.textContent], ["Hello ", "Badge 0"]);
  assert.throws(() => badge.performAction("vanish", null, null), /Unhandled action: vanish/);
  assert.throws(() => application.performAction("vanish", null, null), /Unhandled action: vanish/);
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
  const [host, badge] = launched(element("body", {}, [root]));
  assert.ok(host.panel instanceof Highlight);
  assert.equal(host.panel.element, panel);
  assert.equal(host.panel.owner(), host);
  assert.equal(host.both, badge);
  assert.ok(badge.view instanceof Highlight, "klass wraps the element and the controller uses that view");
  assert.equal(badge.parent(), host);
  assert.equal(host.proto, proto);
  assert.equal(proto.__swill_view__, undefined, "templates are inert");
  assert.equal(both.children[0].textContent, "Badge 0");
});

test("outlet mistakes fail at awakening with the outlet name", () => {
  const hostName = installHost({panel: false, movie_list: true});
  const awaken = children => launched(element("body", {}, [element("main", {controller: hostName}, children)]));
  const message = thunk => { try { thunk(); } catch (error) { return error.message; } assert.fail("expected an error"); };
  assert.equal(message(() => awaken([element("div", {outlet: "panel", id: "a"}), element("div", {outlet: "panel", id: "b"})])),
    `Duplicate outlet panel on ${hostName}: <div outlet="panel" id="a"> and <div outlet="panel" id="b"> both carry outlet="panel"; ` +
    "an outlet connects one element");
  assert.equal(message(() => awaken([element("div", {outlet: "panel"}), element("div", {outlet: "nope"})])),
    `Undeclared outlet nope on ${hostName}: <div outlet="nope"> names an outlet ${hostName} does not declare ` +
    "Its outlets: panel, movie_list. Declare it with `outlet :nope, type: ...`, or remove the attribute");
  assert.match(message(() => awaken([element("div", {outlet: "panel"}), element("section", {outlet: "movieList"})])),
    /names an outlet .* does not declare\. Did you mean movie_list\?/, "a camelCase spelling of a declared name");
  assert.match(message(() => awaken([element("div", {outlet: "panle"})])), /Did you mean panel\?/, "a typo");
  assert.equal(message(() => awaken([])),
    `Unresolved outlet panel on ${hostName}: no element in its region carries outlet="panel". ` +
    `Add the attribute to an element ${hostName} owns, or declare the outlet \`optional: true\``);
  assert.equal(message(() => awaken([element("section", {controller: "Demo::Badge"}, [element("div", {outlet: "panel"})])])),
    `Unresolved outlet panel on ${hostName}: no element in its region carries outlet="panel". ` +
    `<div outlet="panel"> does, but it is inside <section controller="Demo::Badge">'s region, whose outlets are its own. ` +
    `Add the attribute to an element ${hostName} owns, or declare the outlet \`optional: true\``,
    "an element inside a nested controller's region is named, with the region");
  assert.throws(() => awaken([element("div", {klass: "Demo::Badge", outlet: "panel"})]), /Demo::Badge is not a Swill::View/);
  assert.throws(() => awaken([element("div", {klass: "Nope::View", outlet: "panel"})]), /Unknown class: Nope::View/);
  const broken = element("script", {type: "application/json", outlet: "panel"});
  broken.textContent = "{not json";
  assert.throws(() => awaken([broken]), error => error.name === "SyntaxError");
  const empty = element("script", {type: "application/json", outlet: "panel"});
  empty.textContent = "  ";
  const [host] = awaken([empty]);
  assert.equal(host.panel, null, "an empty JSON outlet decodes to nil");
  // A typed outlet's value is checked against its type, whatever the element:
  // a div or an array where a Hash is declared, or JSON where a controller is.
  const Typed = class extends SwillController {};
  Runtime.install({classes: {"Test::TypedOutlets": {constructor: Typed, properties: {
    seed: outletDescriptor("T.nilable(Hash)"),
    people: outletDescriptor("T.nilable(Array)", true),
    badge: outletDescriptor("T.nilable(Demo::Badge)", true)
  }}}});
  const awakenTyped = children => launched(element("body", {}, [
    element("main", {controller: "Test::TypedOutlets"}, children)
  ]));
  const jsonScript = (outlet, text) => {
    const script = element("script", {type: "application/json", outlet});
    script.textContent = text;
    return script;
  };
  assert.throws(() => awakenTyped([element("div", {klass: "Test::Highlight", outlet: "seed"})]), /Outlet seed expects T.nilable\(Hash\)/);
  assert.throws(() => awakenTyped([jsonScript("seed", "[1]")]), /Outlet seed expects T.nilable\(Hash\)/);
  assert.throws(() => awakenTyped([jsonScript("seed", "{}"), jsonScript("badge", "{}")]), /Outlet badge expects T.nilable\(Demo::Badge\)/);
  const [typed] = awakenTyped([jsonScript("seed", '{"a": 1}'), jsonScript("people", "  ")]);
  assert.equal(JSON.stringify(typed.seed), '{"a":1}');
  assert.equal(typed.people, null, "an empty script is nil, which a nilable outlet accepts");
  const inner = element("div", {outlet: "panel"});
  const nested = element("section", {controller: "Demo::Badge"}, [inner]);
  assert.throws(() => awaken([nested]), /Unresolved outlet panel on .*inside <section controller="Demo::Badge">'s region/,
    "an outlet inside a child controller is not visible to the parent");
});

test("decode_outlet_data shapes JSON before assignment", () => {
  const name = installHost({payload: false});
  const Host = Runtime.resolve(name);
  Host.prototype.decodeOutletData = function (outlet, value) { return `${outlet}:${JSON.stringify(value)}`; };
  const payload = element("script", {type: "application/json", outlet: "payload"});
  payload.textContent = '[1, 2]';
  const [host] = launched(element("body", {}, [element("main", {controller: name}, [payload])]));
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
  const [parent, , editor] = launched(element("body", {}, [parentRoot]));
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
  assert.equal(Runtime.respondsTo({name: "plain"}, "name"), true, "a plain object is a Hash whose keys are readable");
  assert.equal(Runtime.read({name: "plain"}, "name"), "plain");
  assert.equal(Runtime.read({name: "plain"}, "missing"), null, "a missing key is nil, as key-value coding on a dictionary");
});

test("binding roots and @ resolve paths against the right object", () => {
  assert.equal(Bindings.resolvePath(null, "name"), "name");
  assert.equal(Bindings.resolvePath(null, "@name"), "name");
  assert.equal(Bindings.resolvePath("represented_object", "name"), "represented_object.name");
  assert.equal(Bindings.resolvePath("represented_object", "@note"), "note");
  assert.equal(Bindings.resolvePath("represented_object", ""), "represented_object");
  assert.equal(new PersonEditor().bindingRoot(), "represented_object", "a Ruby symbol is a string here");
  assert.equal(Bindings.resolvePath("represented_object", "@"), "");
});

test("a parent binds a child controller's represented object, nil included", () => {
  const f = editorFixture();
  assert.equal(f.editor.parent(), f.parent);
  assert.equal(f.editor.representedObject, f.parent.person, "the parent's path feeds the child's represented object");
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
  assert.equal(f.editor.representedObject, replacement);
  assert.equal(f.nameInput.value, "Grace", "child bindings rehook when the represented object changes");
  f.parentClear.click();
  assert.equal(f.editor.representedObject, f.parent.person, "clear hands the editor the fresh person");
  assert.deepEqual([f.editorRoot.hidden, f.nameInput.value, f.blank.textContent], [false, "", "true"]);
  f.parent.person = null;
  assert.equal(f.editor.representedObject, null, "nil propagates");
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
  const [] = Awakening.instantiate(f.parentRoot);
  const disposers = [];
  for (const el of [link, field]) {
    for (const name of el.getAttributeNames()) {
      disposers.push(Bindings.connectProperty(f.parent, null, el, name.slice(5), el.getAttribute(name)));
    }
  }
  assert.equal(link.href, "Ada");
  assert.equal(link.getAttribute("data-name"), "Ada");
  assert.equal(link.getAttribute("aria-label"), "Hello Ada");
  assert.deepEqual([field.readOnly, field.required, field.title], [false, true, "Nobody"], "a non-empty string is truthy");
  f.parent.person.name = "";
  assert.equal(link.href, "");
  assert.equal(link.getAttribute("data-name"), null, "empty strings remove data attributes");
  const flagged = element("i", {"bind-data-on": "person.nil?", "bind-aria-busy": "person.nil?"});
  const releaseFlag = [Bindings.connectProperty(f.parent, null, flagged, "data-on", "person.nil?"), Bindings.connectProperty(f.parent, null, flagged, "aria-busy", "person.nil?")];
  assert.deepEqual([flagged.getAttribute("data-on"), flagged.getAttribute("aria-busy")], [null, "false"], "false removes a data attribute and is written to an ARIA one");
  releaseFlag.forEach(dispose => dispose());
  f.parent.person = null;
  assert.equal(link.href, "");
  assert.equal(link.attributes.href, undefined, "nil removes href");
  assert.equal(link.getAttribute("aria-label"), "Nobody");
  assert.equal(field.readOnly, true);
  disposers.forEach(dispose => dispose());
  f.parent.person = new Person();
  assert.equal(field.readOnly, true, "disposed property bindings stop updating");
  assert.equal(Runtime.isEmpty([]), true);
  assert.throws(() => Runtime.isEmpty(42), /requires a string, array, or hash/);
});

test("object bindings keep a target equal to a source path and release on unload", () => {
  const f = nestedFixture();
  assert.equal(f.parent.badgeCount, 0);
  f.childBump.click();
  assert.equal(f.parent.badgeCount, 1, "awake_from_dom bound badge_count to the badge outlet");
  const other = new Badge();
  other.count = 7;
  f.parent.bind("badge_count", Runtime.keywordArguments({to: other, key_path: "count"}));
  assert.equal(f.parent.badgeCount, 7, "rebinding replaces the previous source");
  f.childBump.click();
  assert.equal(f.parent.badgeCount, 7);
  other.count = 8;
  assert.equal(f.parent.badgeCount, 8);
  assert.throws(() => f.parent.bind("nonexistent", Runtime.keywordArguments({to: other, key_path: "count"})), /Unknown writer: nonexistent/);
  f.parent.unbind("badge_count");
  other.count = 9;
  assert.equal(f.parent.badgeCount, 8);
  // Cocoa's NSNullPlaceholderBindingOption, so a path that can have no value
  // can feed a property that must have one.
  f.parent.bind("badge_count", Runtime.keywordArguments({to: other, key_path: "count", null_placeholder: -1}));
  other.count = null;
  assert.equal(f.parent.badgeCount, -1, "no value on the path is the placeholder");
  other.count = 3;
  assert.equal(f.parent.badgeCount, 3, "a value replaces it again");
  f.parent.bind("badge_count", Runtime.keywordArguments({to: other, key_path: "count"}));
  other.count = null;
  assert.equal(f.parent.badgeCount, null, "without a placeholder the target takes the nil");
  other.count = 9;
  f.parent.bind("badge_count", Runtime.keywordArguments({to: other, key_path: "count"}));
  f.parent.unload();
  other.count = 10;
  assert.equal(f.parent.badgeCount, 9, "unload unbinds object bindings");
});

// The same options markup has, asked for in Ruby: a binding is one thing
// established two ways.
test("a binding made in Ruby takes a transformer, as transform= does in markup", () => {
  const f = nestedFixture();
  const other = new Badge();
  other.count = 7;

  f.parent.bind("fallback", Runtime.keywordArguments({
    to: other, key_path: "count", transform: "string"
  }));
  assert.equal(f.parent.fallback, "7", "the transformer formatted on the way out");

  other.count = 8;
  assert.equal(f.parent.fallback, "8", "and keeps formatting as the source changes");

  assert.throws(
    () => f.parent.bind("fallback", Runtime.keywordArguments({
      to: other, key_path: "count", transform: "nonexistent"
    })),
    /unknown transform nonexistent/,
    "an unregistered name is refused when the binding is made, not ignored"
  );

  f.parent.unbind("fallback");
});

// ---- first responder and key routing ----

test("the application owns the first responder and moves focus with it", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  const [parent, badge] = application.controllers;
  assert.equal(application.firstResponder(), parent.nameField, "awake_from_dom made the field first responder");
  assert.equal(f.document.activeElement, f.nameInput);
  assert.equal(f.nameInput.focusOptions.preventScroll, true, "first responder changes do not scroll the page");
  assert.equal(application.makeFirstResponder(parent.nameField), true, "already first responder");
  assert.equal(application.makeFirstResponder(badge), true, "a controller with a focusable element accepts");
  assert.equal(application.firstResponder(), badge);
  assert.equal(f.document.activeElement, f.resetButton);
  const bare = new (Runtime.resolve("Swill::Responder"))();
  assert.equal(application.makeFirstResponder(bare), false, "a bare responder does not accept");
  assert.equal(application.firstResponder(), badge);
  assert.equal(application.makeFirstResponder(null), true);
  assert.equal(application.firstResponder(), application, "nothing specific falls back to the application");
  f.nameInput.focus();
  assert.equal(application.firstResponder(), parent.nameField, "browser focus reconciles the first responder");
  f.resetButton.focus();
  assert.equal(application.firstResponder(), badge);
  // Leaving for the browser's own chrome keeps the first responder, as Cocoa
  // does; when focus comes back to the page, keys still reach it.
  f.resetButton.blur();
  assert.equal(application.firstResponder(), badge, "a null focusout destination keeps the first responder");
  f.resetButton.dispatchEvent(keyEvent("keydown", "x"));
  // Leaving for another part of the page outside the application releases it.
  const outside = element("input", {});
  f.document.append(outside);
  f.resetButton.focus();
  outside.focus();
  assert.equal(application.firstResponder(), application, "focus elsewhere in the page releases the first responder");
  f.nameInput.focus();
  assert.equal(application.firstResponder(), parent.nameField);
});

test("focus cannot make a responder that does not accept first responder", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  const [parent, badge] = application.controllers;
  badge.acceptsFirstResponder = () => false;
  application.makeFirstResponder(null);
  f.resetButton.focus();
  assert.equal(application.firstResponder(), application, "with nothing to go back to, focus is let go");
  assert.notEqual(f.document.activeElement, f.resetButton);
  application.makeFirstResponder(parent.nameField);
  f.resetButton.focus();
  assert.equal(application.firstResponder(), parent.nameField, "a click or Tab is refused as makeFirstResponder is");
  assert.equal(f.document.activeElement, f.nameInput, "focus went back to the first responder");
  application.terminate();
});

test("a refusing first responder keeps focus", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  const [parent, badge] = application.controllers;
  badge.resignFirstResponder = () => false;
  application.makeFirstResponder(badge);
  assert.equal(application.makeFirstResponder(parent.nameField), false);
  assert.equal(application.firstResponder(), badge);
  f.nameInput.focus();
  assert.equal(application.firstResponder(), badge, "focusin cannot take it either");
  assert.equal(f.document.activeElement, f.resetButton, "focus was restored to the refuser");
});

test("a focused element keeps the keys it handles, and the rest become commands", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  const seen = [];
  application.keyDown = event => seen.push(`raw:${event.key}`);
  application.moveDown = () => seen.push("down");
  application.moveUp = () => seen.push("up");
  application.moveLeft = () => seen.push("left");
  application.insertNewline = () => seen.push("enter");
  const key = (target, name, extra = {}) => target.dispatchEvent(Object.assign(keyEvent("keydown", name), extra));

  const [parent] = application.controllers;
  application.makeFirstResponder(parent.nameField);
  for (const name of ["x", "Backspace", "ArrowLeft", "Home"]) key(f.nameInput, name);
  assert.deepEqual(seen, [], "typing and moving within a single-line field stay with the field");
  key(f.nameInput, "ArrowDown");
  key(f.nameInput, "ArrowUp");
  assert.deepEqual(seen.splice(0), ["down", "up"], "Up and Down in a single line are commands for the chain");

  key(f.nameInput, "Enter", {isComposing: true});
  assert.deepEqual(seen, [], "a key during composition belongs to the input method");
  key(f.nameInput, "k", {ctrlKey: true});
  key(f.nameInput, "Enter", {metaKey: true});
  assert.deepEqual(seen.splice(0), ["raw:k", "raw:Enter"], "a modified key passes up as it is");

  const notes = element("textarea");
  f.main.appendChild(notes);
  for (const name of ["Enter", "ArrowDown"]) key(notes, name);
  const menu = element("select");
  f.main.appendChild(menu);
  key(menu, "ArrowDown");
  key(f.resetButton, "Enter");
  assert.deepEqual(seen, [], "a textarea, a select and a button keep their own keys");
  key(f.resetButton, "ArrowLeft");
  assert.deepEqual(seen.splice(0), ["left"], "a button has no use for arrows");

  parent.nameField.moveDown = () => seen.push("field");
  key(f.nameInput, "ArrowDown");
  assert.deepEqual(seen.splice(0), ["field"], "commands start at the first responder, so a field can take one");
  application.terminate();
});

test("restorable paths on a controller that is not window content warn once", () => {
  const warnings = [];
  const original = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const f = pageFixture({readyState: "complete"});
    const application = new Launcher().launch(f.document);
    application.terminate();
    new Launcher().launch(pageFixture({readyState: "complete"}).document).terminate();
  } finally {
    console.warn = original;
  }
  const expected = "[Swill] Demo::Badge declares restorable count, but only a window's content controller is restored; " +
    "declare it there as a path through this controller";
  assert.deepEqual(warnings.filter(message => message.includes("restorable")), [expected, expected],
    "the nested badge is named once per application, with the fix");

  warnings.length = 0;
  console.warn = message => warnings.push(message);
  try {
    const f = windowedPage();
    assert.ok(f.application.windowNamed("main").controller instanceof Badge);
    f.application.terminate();
  } finally {
    console.warn = original;
  }
  assert.deepEqual(warnings.filter(message => message.includes("restorable")), [],
    "a class that is a window's content as well declares for that use, so its nested instances are not warned about");
});

test("key events route from the first responder up the chain", () => {
  const f = pageFixture({readyState: "complete"});
  const application = new Launcher().launch(f.document);
  const [parent] = application.controllers;
  parent.person.name = "Grace";
  assert.equal(f.parentTitle.textContent, "Hello Grace");
  f.nameInput.dispatchEvent(keyEvent("keydown", "x"));
  assert.equal(f.parentTitle.textContent, "Hello Grace");
  f.nameInput.dispatchEvent(keyEvent("keydown", "Escape"));
  assert.equal(f.parentTitle.textContent, "Hello ", "Escape reached the controller's cancel_operation through the view chain");
  const seen = [];
  application.insertNewline = event => seen.push(`enter:${event.key}`);
  application.insertTab = () => seen.push("tab");
  application.insertBacktab = () => seen.push("backtab");
  application.keyUp = event => seen.push(`up:${event.key}`);
  f.nameInput.dispatchEvent(keyEvent("keydown", "Enter"));
  f.nameInput.dispatchEvent(keyEvent("keydown", "Tab"));
  f.nameInput.dispatchEvent(Object.assign(keyEvent("keydown", "Tab"), {shiftKey: true}));
  f.nameInput.dispatchEvent(keyEvent("keyup", "Tab"));
  assert.deepEqual(seen, ["enter:Enter", "tab", "backtab", "up:Tab"]);
  parent.unload();
  assert.equal(application.firstResponder(), application, "tearing down the region releases its first responder");
  application.terminate();
  f.resetButton.focus();
  assert.equal(application.firstResponder(), application, "terminate removed the listeners");
});

// ---- windows: templates, containers, dialogs, detach ----

function windowedPage(hash = "") {
  const seed = element("script", {type: "application/json", outlet: "seed"});
  seed.textContent = '{"name": "Ada"}';
  const nameInput = element("input", {bind: "person.name", outlet: "name_field"});
  const badge = element("section", {controller: "Demo::Badge", outlet: "badge"}, [element("button", {"data-action": "bump"})]);
  const mainWindow = element("section", {window: "main", name: "welcome"});
  const prerendered = element("article", {controller: "Demo::Badge"}, [element("p", {bind: "title"}), element("i", {}, [])]);
  prerendered.children[1].textContent = "pre-rendered";
  const sideWindow = element("aside", {window: "side"}, [prerendered]);
  const main = element("main", {controller: "Demo::Controller"}, [seed, nameInput, badge, mainWindow, sideWindow]);
  const welcome = element("template", {for: "window", name: "welcome"}, [
    element("article", {controller: "Demo::Badge"}, [element("p", {bind: "title"}), element("input", {})])
  ]);
  const farewell = element("template", {name: "farewell"}, [
    element("article", {controller: "Demo::Badge"}, [element("p", {bind: "title"})])
  ]);
  const nested = element("div", {}, [element("template", {name: "ignored"}, [element("p", {})])]);
  const palette = element("template", {for: "window", name: "palette"}, [
    element("dialog", {controller: "Demo::Badge"}, [element("p", {bind: "title"}), element("button", {"data-action": "close"})])
  ]);
  const body = element("body", {application: "Demo::Application"}, [main, welcome, farewell, nested, palette]);
  const document = element("#document", {}, [body]);
  document.readyState = "complete";
  document.defaultView = new Browser(hash);
  const application = new Launcher().launch(document);
  return {application, document, body, main, mainWindow, sideWindow, prerendered, welcome, palette, badge,
    browser: document.defaultView};
}

test("window containers fill from templates at launch and keep pre-rendered content", () => {
  const f = windowedPage();
  const [parent, , windowBadge, sideBadge] = f.application.controllers;
  assert.equal(f.mainWindow.children.length, 1);
  assert.equal(f.mainWindow.getAttribute("name"), "welcome");
  assert.equal(f.mainWindow.children[0].children[0].textContent, "Badge 0", "cloned content awakened in the launch pass");
  assert.ok(windowBadge instanceof Badge);
  assert.equal(windowBadge.parent(), parent, "window content nests under the containing controller");
  assert.equal(f.application.windowNamed("main").controller, windowBadge);
  assert.equal(f.application.windowNamed("main").contentName, "welcome");
  assert.equal(f.sideWindow.children[0], f.prerendered, "pre-rendered content stays in place");
  assert.equal(f.application.windowNamed("side").controller, sideBadge);
  assert.equal(f.application.isWindowContent("side"), true, "pre-rendered content is captured under the window name");
  assert.equal(f.application.isWindowContent("farewell"), true, "a root-level template counts");
  assert.equal(f.application.isWindowContent("ignored"), false, "a nested template without for=window does not");
  assert.equal(f.welcome.__swill_view__, undefined, "templates are inert");
  assert.equal(f.welcome.content.firstElementChild.__swill_view__, undefined, "template content is never awakened");
  assert.equal(f.application.firstResponder(), parent.nameField);
});

test("load_window_content replaces, tears down, awakens, and moves focus", () => {
  const f = windowedPage();
  const [parent, , welcomeBadge] = f.application.controllers;
  const teardown = [];
  welcomeBadge.viewDidDisappear = () => teardown.push("welcome");
  const farewellBadge = f.application.loadWindowContent("main", "farewell");
  assert.deepEqual(teardown, ["welcome"]);
  assert.equal(welcomeBadge.view.controllerValue(), null);
  assert.ok(farewellBadge instanceof Badge);
  assert.notEqual(farewellBadge, welcomeBadge);
  assert.equal(f.mainWindow.getAttribute("name"), "farewell");
  assert.equal(f.mainWindow.children.length, 1);
  assert.equal(f.mainWindow.children[0].children[0].textContent, "Badge 0");
  assert.equal(farewellBadge.parent(), parent);
  assert.equal(f.application.windowNamed("main").controller, farewellBadge);
  assert.equal(f.application.firstResponder(), parent.nameField, "content without a focusable element leaves focus alone");
  const back = f.application.loadWindowContent("main", "welcome");
  assert.equal(f.application.firstResponder(), back, "focusable content takes the first responder");
  assert.equal(f.document.activeElement, f.mainWindow.children[0].children[1]);
  const again = f.application.loadWindowContent("side", "side");
  assert.ok(again instanceof Badge, "captured pre-rendered content can be reloaded");
  assert.notEqual(f.sideWindow.children[0], f.prerendered, "reloaded content is a clone");
  assert.throws(() => f.application.loadWindowContent("main", "nope"), /No window content template: nope/);
  assert.throws(() => f.application.loadWindowContent("nope", "welcome"), /No window container: nope/);
});

test("a bundle names its resources, loads their contents once, and links stylesheets", async () => {
  const Bundle = Runtime.resolve("Swill::Bundle");
  const bundle = Bundle.register("fixture", "https://cdn.test/app/",
    ["Poster.png", "icons/Star.svg", "icons/Star.png", "notes.txt", "read me.md", "themes/dark.css"],
    {"notes.txt": "embedded"}, false);
  assert.equal(Bundle.named("fixture"), bundle);
  assert.equal(bundle.urlForResource("Poster"), "https://cdn.test/app/resources/fixture/Poster.png");
  assert.equal(bundle.urlForResourceWithExtension("icons/Star", "svg"), "https://cdn.test/app/resources/fixture/icons/Star.svg",
    "a name includes its folder");
  assert.equal(bundle.urlForResource("read me"), "https://cdn.test/app/resources/fixture/read%20me.md", "segments are encoded");
  assert.throws(() => bundle.urlForResource("icons/Star"), /Ambiguous resource icons\/Star in bundle fixture/);
  assert.equal(bundle.urlForResource("Missing"), null);
  assert.equal(bundle.isResourceWithExtension("icons/Star", "png"), true);
  assert.equal(bundle.isResourceWithExtension("icons/Star", "gif"), false);

  const fetched = [];
  context.fetch = async url => {
    fetched.push(url);
    return url.endsWith("gone.txt") ? {ok: false, status: 404} : {ok: true, status: 200, text: async () => `text of ${url}`};
  };
  try {
    assert.equal(bundle.loadedResource("notes"), "embedded", "an embedded resource is already loaded");
    assert.equal(await bundle.loadResource("notes", "txt"), "embedded");
    assert.equal(bundle.loadedResource("read me"), null);
    assert.equal(await bundle.loadResource("read me", null), "text of https://cdn.test/app/resources/fixture/read%20me.md");
    assert.equal(await bundle.loadResource("read me", "md"), "text of https://cdn.test/app/resources/fixture/read%20me.md");
    assert.deepEqual(fetched, ["https://cdn.test/app/resources/fixture/read%20me.md"], "fetched once, embedded never");
    assert.equal(bundle.loadedResource("read me"), "text of https://cdn.test/app/resources/fixture/read%20me.md");
    await assert.rejects(bundle.loadResource("Missing", null), /No resource Missing in bundle fixture/);
    const broken = Bundle.register("broken", "/", ["gone.txt"], {}, false);
    await assert.rejects(broken.loadResource("gone", "txt"), /Could not load gone.txt from bundle broken: 404/);
  } finally {
    delete context.fetch;
  }

  const head = element("head");
  const document = element("html", {}, [head]);
  document.head = head;
  const linked = bundle.addStylesheet("themes/dark", document);
  const link = head.children[0];
  assert.deepEqual([link.tagName, link.getAttribute("rel"), link.getAttribute("href")],
    ["LINK", "stylesheet", "https://cdn.test/app/resources/fixture/themes/dark.css"]);
  link.dispatchEvent(new Event("load"));
  assert.equal(await linked, link);
  assert.equal(await bundle.addStylesheet("themes/dark", document), link, "a stylesheet is linked once");
  assert.equal(head.children.length, 1);
  assert.throws(() => bundle.addStylesheet("Poster", document), /No stylesheet Poster in bundle fixture/);
});

test("images are found in the application's bundle, then the framework's, and image views show them", () => {
  const Bundle = Runtime.resolve("Swill::Bundle");
  const Image = Runtime.resolve("Swill::Image");
  const ImageView = Runtime.resolve("Swill::Control::ImageView");
  assert.equal(Image.named("Warning").url, "resources/swill/Warning.png", "the framework's own");
  Bundle.register("images-app", "/assets/", ["Warning.png", "Poster.webp"], {}, true);
  assert.equal(Image.named("Warning").url, "/assets/resources/images-app/Warning.png", "the application's comes first");
  assert.equal(Image.named("Poster").url, "/assets/resources/images-app/Poster.webp");
  assert.equal(Image.named("Missing"), null);
  assert.equal(new Image("/posters/42.jpg").url, "/posters/42.jpg");

  const img = element("img", {klass: "Swill::Control::ImageView", image: "Poster", alt: ""});
  const view = new ImageView(img);
  assert.equal(img.getAttribute("aria-hidden"), "true", "an image with empty alt text is decoration");
  assert.equal(new ImageView(element("img", {alt: "Poster"})).element.getAttribute("aria-hidden"), null);
  assert.equal(img.getAttribute("src"), "/assets/resources/images-app/Poster.webp");
  view.value = "Warning";
  assert.equal(img.getAttribute("src"), "/assets/resources/images-app/Warning.png", "a string names an image");
  view.value = "https://example.test/a.png";
  assert.equal(img.getAttribute("src"), "https://example.test/a.png", "or is a URL when no bundle has that name");
  view.value = new Image("/b.png");
  assert.equal(img.getAttribute("src"), "/b.png");
  view.value = null;
  assert.equal(img.hasAttribute("src"), false, "nil shows nothing");

  const holder = element("span", {klass: "Swill::Control::ImageView"});
  element("body", {}, [holder]);
  new ImageView(holder).value = "Poster";
  assert.equal(holder.children[0].tagName, "IMG", "a view without an img gets one");
  assert.equal(holder.children[0].getAttribute("src"), "/assets/resources/images-app/Poster.webp");
  assert.throws(() => new ImageView(element("img", {image: "Nowhere"})), /Unknown image: Nowhere/);
  Bundle.register("no-app", "", [], {}, true);
});

test("an error's origin reads the first frame whichever browser wrote the stack", () => {
  const Reporter = Runtime.resolve("Swill::ProblemReporter");
  const error = stack => { const made = runInContext('new Error("boom")', context); made.stack = stack; return made; };
  assert.equal(Reporter.originOf(error("Error: boom\n    at Movies__Menubar.editMovie (http://localhost:9292/app.js:12:5)\n    at run (x.js:1:1)")),
    "at Movies__Menubar.editMovie (http://localhost:9292/app.js:12:5)", "Chrome's frame, as written");
  assert.equal(Reporter.originOf(error("editMovie@http://localhost:9292/app.js:12:5\nglobal code@http://localhost:9292/app.js:40:1")),
    "at editMovie (http://localhost:9292/app.js:12:5)", "Safari's and Firefox's, written the same way");
  assert.equal(Reporter.originOf(error("@http://localhost:9292/app.js:12:5")), "at http://localhost:9292/app.js:12:5", "an anonymous frame");
  assert.equal(Reporter.originOf(error("Error: boom")), "", "no frame");
  assert.equal(Reporter.originOf("gone away"), "", "not an Error");
});

test("in development, problems are shown as alerts one at a time", async () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const quiet = pageFixture({readyState: "complete"});
    const plainApplication = new Launcher().launch(quiet.document);
    assert.equal(plainApplication.development, false, "development is opted into");
    Runtime.warn("nobody is told");
    assert.equal(quiet.document.querySelector("dialog"), null, "outside development, problems are only logged");
    plainApplication.terminate();

    const f = pageFixture({readyState: "complete"});
    f.body.setAttribute("development", "");
    const application = new Launcher().launch(f.document);
    assert.equal(application.development, true);
    const browser = f.document.defaultView;
    const alerts = () => Array.from(f.body.children).filter(child => child.tagName === "DIALOG");
    const shown = () => {
      const dialog = alerts()[0];
      const icon = dialog.querySelector(".alert-icon");
      const text = dialog.querySelector(".alert-text");
      return [icon.getAttribute("src"), text.children[0].textContent, text.children[1].hidden ? "" : text.children[1].textContent];
    };
    const dismiss = async () => { alerts()[0].querySelector("button").click(); await new Promise(resolve => setTimeout(resolve, 0)); };

    assert.match(shown()[1], /^Demo::Badge declares restorable count/, "a warning raised while launching is shown once it has launched");
    assert.equal(alerts()[0].querySelector(".window-title").children[0].textContent, "Warning");
    await dismiss();
    assert.equal(alerts().length, 0);

    // Made in the framework's realm, as a page's own errors are.
    const boom = runInContext('new Error("boom")', context);
    const uncaught = Object.assign(new Event("error"), {message: "Uncaught Error: boom", error: boom});
    // A stackless error takes its location from the event, as Safari reports it.
    const bare = runInContext('new Error("bare")', context);
    bare.stack = "";
    const located = Object.assign(new Event("error"), {message: "bare", error: bare, filename: "http://localhost:9292/app.js", lineno: 7, colno: 3});
    browser.dispatchEvent(uncaught);
    assert.equal(alerts().length, 1);
    assert.deepEqual(shown().slice(0, 2), ["resources/swill/Stop.png", "boom"], "an uncaught error shows the Stop image");
    assert.match(shown()[2], /^at /, "with where it was raised");
    Runtime.warn("restorable s is left out of the URL");
    browser.dispatchEvent(Object.assign(new Event("unhandledrejection"), {reason: "gone away"}));
    browser.dispatchEvent(uncaught);
    assert.equal(alerts().length, 1, "later problems wait behind the one showing, and a repeat is dropped");

    await dismiss();
    assert.deepEqual(shown(), ["resources/swill/Warning.png", "restorable s is left out of the URL", ""], "a warning shows the Warning image");
    await dismiss();
    assert.deepEqual(shown(), ["resources/swill/Stop.png", "gone away", ""], "a rejected promise is an error too");
    await dismiss();
    assert.equal(alerts().length, 0);

    browser.dispatchEvent(located);
    assert.deepEqual(shown(), ["resources/swill/Stop.png", "bare", "at http://localhost:9292/app.js:7:3"]);
    await dismiss();

    application.terminate();
    Runtime.warn("after terminate");
    assert.equal(alerts().length, 0, "terminating stops reporting");
  } finally {
    console.warn = original;
  }
});

test("an alert builds its own window and yields the button chosen", async () => {
  const f = windowedPage();
  const [parent] = f.application.controllers;
  const Alert = Runtime.resolve("Swill::Alert");
  const ask = buttons => {
    const alert = new Alert();
    alert.messageText = "Delete “Ada”?";
    alert.informativeText = "This cannot be undone.";
    for (const title of buttons) alert.addButton(title);
    return [alert, alert.run()];
  };

  const [alert, answer] = ask(["Cancel", "Delete"]);
  const dialog = alert.view.element;
  assert.equal(dialog.parentElement, f.body);
  assert.equal(dialog.open, true);
  assert.equal(dialog.modal, true, "an alert is modal");
  const [titleBar, icon, text] = dialog.children;
  assert.deepEqual([titleBar.tagName, titleBar.getAttribute("class")], ["HEADER", "window-title"], "a window's title bar comes first");
  const titleText = titleBar.children[0];
  assert.equal(dialog.getAttribute("aria-labelledby"), titleText.getAttribute("id"), "the dialog is labelled by its title");
  assert.equal(icon.tagName, "IMG");
  assert.deepEqual([icon.getAttribute("class"), icon.getAttribute("alt"), icon.getAttribute("aria-hidden")], ["alert-icon", "", "true"]);
  assert.equal(icon.getAttribute("src"), "resources/swill/Warning.png", "the framework's Warning image, beside swill.js");
  assert.equal(text.getAttribute("class"), "alert-text");
  assert.deepEqual([text.children[0].textContent, text.children[1].textContent], ["Delete “Ada”?", "This cannot be undone."]);
  const buttons = Array.from(dialog.querySelector(".actions").children);
  assert.deepEqual(buttons.map(button => button.textContent), ["Cancel", "Delete"]);
  assert.deepEqual(buttons.map(button => button.classList.contains("default")), [true, false], "the first button is the default");
  assert.deepEqual(buttons.map(button => button.getAttribute("tabindex")), ["0", "0"], "alert buttons are Control::Buttons, so Tab reaches them");
  assert.equal(titleText.textContent, "", "an untitled document leaves the title empty");
  alert.title = "Movies";
  assert.equal(titleText.textContent, "Movies", "the title bar follows the controller's title");
  assert.equal(f.application.firstResponder(), buttons[0].__swill_view__, "the default button is first responder");
  assert.equal(f.application.firstResponder().nextResponder().nextResponder(), alert, "and the alert follows its dialog in the chain");
  assert.equal(f.document.activeElement, buttons[0], "the first button takes the keyboard");
  buttons[0].dispatchEvent(keyEvent("keydown", "Tab"));
  assert.equal(f.document.activeElement, buttons[1], "Tab moves through the modal window's key view loop");
  buttons[1].dispatchEvent(keyEvent("keydown", "Tab"));
  assert.equal(f.document.activeElement, buttons[0], "and wraps rather than leaving the window");
  buttons[0].dispatchEvent(keyEvent("keydown", "Tab", {shiftKey: true}));
  assert.equal(f.document.activeElement, buttons[1], "Shift-Tab wraps backward");
  buttons[1].dispatchEvent(keyEvent("keydown", "Tab", {shiftKey: true}));
  assert.equal(f.document.activeElement, buttons[0], "and steps back");
  dialog.focus();
  assert.equal(f.document.activeElement, buttons[0], "the dialog itself hands focus to its default button");
  buttons[1].click();
  assert.equal(await answer, "Delete");
  assert.equal(dialog.parentElement, null, "choosing dismisses the alert");
  assert.equal(f.application.firstResponder(), parent.nameField, "the saved first responder returns");

  const [cancelled, cancelAnswer] = ask(["Delete", "Cancel"]);
  cancelled.view.element.querySelector("button").dispatchEvent(keyEvent("keydown", "Escape"));
  assert.equal(await cancelAnswer, "Cancel", "Escape chooses Cancel");
  const [plain, plainAnswer] = ask([]);
  assert.deepEqual(Array.from(plain.view.element.querySelector(".actions").children).map(b => b.textContent), ["OK"]);
  const detail = plain.view.element.querySelector(".alert-text").children[1];
  assert.equal(detail.hidden, false);
  plain.informativeText = "";
  assert.equal(detail.hidden, true, "the template's binding hides empty informative text");
  plain.view.element.querySelector("button").dispatchEvent(keyEvent("keydown", "Escape"));
  assert.equal(await plainAnswer, null, "Escape without a Cancel button yields nil");
});

test("a window shows its content controller's title, and the page's theme can be switched", () => {
  const titled = element("template", {for: "window", name: "titled"}, [
    element("dialog", {controller: "Demo::Badge", class: "window"}, [element("p", {bind: "title"})])
  ]);
  const theme = element("link", {rel: "stylesheet", "data-swill-theme": "", href: "/assets/resources/swill/linear.css"});
  const main = element("main", {controller: installHost({})}, [element("section", {window: "main", name: "welcome"})]);
  const welcome = element("template", {for: "window", name: "welcome"}, [element("article", {controller: "Demo::Badge"})]);
  const body = element("body", {application: "Demo::Application"}, [theme, main, welcome, titled]);
  const document = element("#document", {}, [body]);
  document.readyState = "complete";
  document.defaultView = new Browser();
  const application = new Launcher().launch(document);

  assert.equal(application.theme, "linear", "read from the page's theme link");
  application.theme = "bioplastic";
  assert.equal(theme.getAttribute("href"), "resources/swill/bioplastic.css", "the link now names the other theme");
  application.theme = "linear";
  assert.equal(theme.getAttribute("href"), "resources/swill/linear.css");
  assert.throws(() => { application.theme = "chrome"; }, /Unknown theme: chrome/);

  assert.equal(document.querySelector(".window-title"), null, "content windows have no title bar");
  const window = application.showWindow("titled");
  const dialog = window.root;
  const header = dialog.children[0];
  assert.deepEqual([header.tagName, header.getAttribute("class")], ["HEADER", "window-title"]);
  const title = header.children[0];
  assert.equal(title.textContent, "Badge 0", "the content controller's title");
  assert.equal(dialog.getAttribute("aria-labelledby"), title.getAttribute("id"));
  window.controller.count = 4;
  assert.equal(title.textContent, "Badge 4", "and it follows the title");
  application.terminate();
});

test("show_window presents a dialog whose dismissal restores the first responder", async () => {
  const f = windowedPage();
  const [parent] = f.application.controllers;
  const window = f.application.showWindow("palette");
  const dialog = window.root;
  assert.equal(dialog.parentElement, f.body);
  assert.equal(dialog.open, true, "a dialog root is shown");
  assert.ok(window.controller instanceof Badge);
  assert.equal(window.isContainer(), false);
  assert.equal(f.application.firstResponder(), window.controller);
  assert.equal(window.savedFirstResponder, parent.nameField);
  let resolved = false;
  window.closed.then(() => { resolved = true; });
  dialog.querySelector("[data-action=close]").click();
  await window.closed;
  assert.equal(resolved, true);
  assert.equal(dialog.parentElement, null, "dismiss removes the root");
  assert.equal(dialog.open, false);
  assert.equal(window.controller.view.controllerValue(), null, "dismiss tears down the controller");
  assert.equal(f.application.firstResponder(), parent.nameField, "the saved first responder returns");
  assert.equal(f.application.dismiss(window.controller), false, "a dismissed window is gone");
  assert.throws(() => f.application.showWindow("ignored"), /No window content template: ignored/);
  const plain = element("template", {for: "window", name: "plain"}, [
    element("div", {}, [element("section", {controller: "Demo::Badge"})])
  ]);
  f.body.append(plain);
  const before = f.body.children.length;
  assert.throws(() => f.application.showWindow("plain"), /Window root has no controller: plain/,
    "templates inserted later are found and still validated");
  assert.equal(f.body.children.length, before, "a rejected window leaves nothing in the page");
  const host = element("div", {});
  f.body.append(host);
  const hosted = f.application.showWindow("palette", Runtime.keywordArguments({into: host}));
  assert.equal(hosted.root.parentElement, host, "show_window into: presents into a chosen element");
  f.application.dismiss(hosted.controller);
  assert.equal(host.children.length, 0);
});

test("detach tears down a removed subtree and terminate releases windows", () => {
  const f = windowedPage();
  const [parent, badge, welcomeBadge, sideBadge] = f.application.controllers;
  assert.deepEqual(Array.from(Awakening.controllersWithin(f.main)), [parent, badge, welcomeBadge, sideBadge]);
  f.badge.remove();
  Awakening.detach(f.badge);
  assert.equal(badge.view.controllerValue(), null);
  assert.deepEqual(Array.from(parent.childControllers()), [welcomeBadge, sideBadge]);
  const window = f.application.showWindow("palette");
  f.application.terminate();
  assert.equal(window.root.parentElement, null, "terminate dismisses dialogs");
  assert.equal(welcomeBadge.view.controllerValue(), null, "terminate tears down window content");
  assert.equal(parent.view.controllerValue(), null);
});

// ---- URL restoration ----

test("window content and restorable state round-trip through the fragment", () => {
  const f = windowedPage("#main=farewell&main.n=3&main.junk=x");
  const [, , badge] = f.application.controllers;
  assert.equal(f.mainWindow.getAttribute("name"), "farewell", "the fragment chose the content at launch");
  assert.equal(badge.count, 3, "an Integer path decoded its value");
  assert.equal(badge.restored, true, "controller_did_restore saw the applied value");
  assert.equal(f.browser.location.hash, "#main=farewell&main.n=3&main.junk=x", "launch only reads");
  badge.count = 4;
  assert.equal(f.browser.location.hash, "#main=farewell&main.n=4&main.junk=x", "state changes replace the fragment value");
  assert.equal(f.browser.entries.length, 1, "state changes add no history entries");
  const welcomeBadge = f.application.loadWindowContent("main", "welcome");
  assert.equal(f.browser.location.hash, "#main=welcome&main.n=4&main.junk=x", "navigation pushes the content; a key the new controller shares carries over");
  assert.equal(f.browser.entries.length, 2);
  assert.equal(welcomeBadge.count, 4, "the carried value was applied to the new controller");
  assert.equal(welcomeBadge.restored, true);
  welcomeBadge.count = 9;
  assert.equal(f.browser.location.hash, "#main=welcome&main.n=9&main.junk=x");
  badge.count = 5;
  assert.equal(f.browser.location.hash, "#main=welcome&main.n=9&main.junk=x", "the replaced controller no longer writes");
  f.browser.back();
  assert.equal(f.mainWindow.getAttribute("name"), "farewell", "Back restores the content");
  const restoredBadge = f.application.windowNamed("main").controller;
  assert.equal(restoredBadge.count, 4, "Back restores the state that was in that entry");
  assert.equal(f.browser.entries.length, 1, "Back/Forward routing writes no history");
  f.browser.navigate("#main=farewell&main.n=oops");
  assert.equal(f.application.windowNamed("main").controller.count, 4, "a value that is not an Integer is ignored");
  f.browser.navigate("#main=missing");
  assert.equal(f.mainWindow.getAttribute("name"), "farewell", "unknown content is reported and ignored");
});

test("a restorable value the URL cannot hold is left out of it, with one warning", () => {
  // Installed by hand, so the compiler never saw these paths: the read-only
  // one reaches the runtime, as a path through an untyped property would.
  const Stubborn = class extends SwillController {};
  Runtime.installClass(Stubborn, "Test::Stubborn", [
    {name: "count", js: "count", type: "Integer", defaultValue() { return 0; }},
    {name: "label", js: "label", computed: true, compute() { return "fixed"; }},
    {name: "chosen", js: "chosen", defaultValue() { return null; }}
  ], [], {}, [
    {path: "count", key: "n", type: "Integer"},
    {path: "label", key: "l", type: "String"},
    {path: "chosen", key: "c", type: "T.untyped"}
  ]);
  const warnings = [];
  const original = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const content = element("article", {controller: "Test::Stubborn"});
    const body = element("body", {application: "Demo::Application"}, [
      element("section", {window: "main", name: "stubborn"}, [content])
    ]);
    const document = element("#document", {}, [body]);
    document.readyState = "complete";
    document.defaultView = new Browser("#main=stubborn&main.n=3&main.l=other");
    const application = new Launcher().launch(document);
    const controller = application.windowNamed("main").controller;
    const hash = () => document.defaultView.location.hash;
    assert.equal(controller.count, 3, "the rest of the window's state restores");
    assert.equal(hash(), "#main=stubborn&main.n=3", "the key that could not be restored leaves the fragment");
    controller.chosen = "Dark City";
    assert.equal(hash(), "#main=stubborn&main.n=3&main.c=Dark+City");
    controller.chosen = {title: "Dark City"};
    assert.equal(hash(), "#main=stubborn&main.n=3", "an object is left out rather than written as [object Object]");
    controller.chosen = {title: "Solaris"};
    application.terminate();
  } finally {
    console.warn = original;
  }
  assert.deepEqual(warnings.filter(message => message.includes("left out")), [
    "[Swill] Test::Stubborn: restorable label is left out of the URL: Read-only binding: label",
    "[Swill] Test::Stubborn: restorable chosen is left out of the URL: its value cannot be written to the URL; restore a string, number or boolean"
  ], "each path warns once");
});

test("restoration state is scoped per window and pruned when content changes", () => {
  const f = windowedPage("#side=side&side.n=2");
  const sideBadge = f.application.windowNamed("side").controller;
  assert.equal(sideBadge.count, 2);
  const mainBadge = f.application.windowNamed("main").controller;
  assert.equal(mainBadge.count, 0, "another window's key does not apply");
  const dialog = f.application.showWindow("palette");
  dialog.controller.count = 7;
  assert.match(f.browser.location.hash, /palette\.n=7/, "a dialog's state is scoped under its name");
  f.application.dismiss(dialog.controller);
  dialog.controller.count = 8;
  assert.doesNotMatch(f.browser.location.hash, /palette\.n=8/, "a dismissed window stops writing");
  assert.equal(f.application.isWindowContent("side"), true);
});

test("fragment routing is inert without a browser window", () => {
  const f = pageFixture({readyState: "complete"});
  f.document.defaultView = new EventTarget();
  const application = new Launcher().launch(f.document);
  assert.ok(application.controllers.length > 0);
  application.terminate();
});

// ---- list controllers: rows, selection, ownership, restoration ----

const PeopleList = Runtime.resolve("Demo::PeopleList");

// The example's roster table: the parent decodes the roster JSON into people
// and the list shows them through bind="people". The list sits in the people
// window so its selection is kept in the fragment by id.
function peoplePage(hash = "", rowTemplate = null, listController = "Demo::PeopleList") {
  const seed = element("script", {type: "application/json", outlet: "seed"});
  seed.textContent = '{"name": "Ada"}';
  const nameInput = element("input", {bind: "person.name", outlet: "name_field"});
  const badge = element("section", {controller: "Demo::Badge", outlet: "badge"}, [element("p", {bind: "title"})]);
  const roster = element("script", {type: "application/json", outlet: "roster"});
  roster.textContent = JSON.stringify([
    {id: "1", name: "Ada", job: "engineer"}, {id: "2", name: "Grace", job: "admiral"}, {id: "3", name: "Linus", job: "kernel"}
  ]);
  const template = element("template", {for: "row"}, [rowTemplate ?? element("tr", {}, [
    element("td", {bind: "name"}), element("td", {bind: "role"}),
    element("td", {}, [element("button", {"data-action": "remove_person"})])
  ])]);
  const editorTemplate = element("template", {for: "editor"}, [
    element("tr", {controller: "Swill::Controller::InlineEditor"}, [
      element("td", {}, [element("input", {klass: "Swill::Control::TextField", bind: "name"})]),
      element("td", {}, [element("input", {klass: "Swill::Control::TextField", bind: "role"})])
    ])
  ]);
  const stale = element("tr", {}, [element("td", {})]);
  stale.children[0].textContent = "pre-rendered";
  const rows = element("tbody", {outlet: "rows"}, [template, editorTemplate, stale]);
  const nameHeader = element("th", {"data-column": "name", "data-action": "sort_by", "bind-aria-sort": "sort_states.name"});
  const roleHeader = element("th", {"data-column": "role", "data-action": "sort_by", "bind-aria-sort": "sort_states.role"});
  const header = element("thead", {outlet: "header_view"}, [element("tr", {}, [nameHeader, roleHeader, element("th", {})])]);
  const selected = element("output", {bind: "@selected_object.name"});
  const edit = element("button", {"data-action": "activate_selection", "bind-disabled": "@selected_indexes.empty?"});
  const list = element("section", {controller: listController, outlet: "people_list", bind: "people"}, [
    element("table", {}, [header, rows]), selected, edit
  ]);
  const peopleWindow = element("section", {window: "people"}, [list]);
  const title = element("p", {bind: "title"});
  const main = element("main", {controller: "Demo::Controller"}, [seed, title, nameInput, badge, roster, peopleWindow]);
  const body = element("body", {application: "Demo::Application"}, [main]);
  const document = element("#document", {}, [body]);
  document.readyState = "complete";
  document.defaultView = new Browser(hash);
  const application = new Launcher().launch(document);
  const [parent, , controller] = application.controllers;
  const rowsOf = () => rows.children.filter(child => child.tagName === "TR");
  return {application, document, browser: document.defaultView, parent, controller, list, rows, header, template,
    editorTemplate, stale, selected, edit, title, rowsOf, nameHeader, roleHeader, nameInput};
}

// A list with no rows outlet and no bind, hosted by a controller that does
// not handle activate_selection.
function bareList(listController = "Demo::PeopleList") {
  const template = element("template", {for: "row"}, [element("li", {bind: "name"})]);
  const editorTemplate = element("template", {for: "editor"}, [
    element("li", {controller: "Swill::Controller::InlineEditor"}, [element("input", {bind: "name"})])
  ]);
  const list = element("ul", {controller: listController}, [template, editorTemplate]);
  const host = element("section", {controller: "Demo::Badge"}, [list]);
  const body = element("body", {application: "Demo::Application"}, [host]);
  const document = element("#document", {}, [body]);
  document.readyState = "complete";
  document.defaultView = new Browser();
  const application = new Launcher().launch(document);
  const [badge, controller] = application.controllers;
  const items = () => list.children.filter(child => child.tagName === "LI");
  return {application, document, list, controller, badge, template, items};
}

test("a list renders a row per object from its template, binds cells to the object, and owns the rows", () => {
  const f = peoplePage();
  const [ada, grace, linus] = f.parent.people;
  assert.ok(f.controller instanceof PeopleList);
  assert.equal(f.controller.parent(), f.parent);
  assert.equal(f.controller.representedObject, f.parent.people, 'bind="people" feeds the list');
  assert.deepEqual(f.rowsOf().map(row => row.children.map(cell => cell.textContent)),
    [["Ada", "engineer", ""], ["Grace", "admiral", ""], ["Linus", "kernel", ""]]);
  assert.equal(f.stale.parentElement, null, "pre-rendered rows are replaced");
  assert.equal(f.template.parentElement, f.rows, "the template stays inert in place");
  assert.equal(f.list.getAttribute("tabindex"), "0", "the list is focusable");
  assert.equal(f.controller.rows.element, f.rows);
  assert.equal(f.controller.headerView.element, f.header);
  const rowViews = Array.from(f.controller.rows.subviews);
  assert.deepEqual(rowViews.map(view => view.element), f.rowsOf(), "rows are views under the rows outlet");
  assert.equal(rowViews[0].owner(), f.controller);
  assert.equal(f.controller.rowFor(f.rowsOf()[1].children[0]), 1, "an element inside a row knows its row");
  assert.equal(f.controller.rowFor(f.list), -1);
  assert.equal(f.controller.rowFor(f.template), -1);
  assert.equal(f.controller.objectAt(2), linus);
  assert.equal(f.controller.objectAt(3), null);
  ada.name = "Ada Lovelace";
  assert.equal(f.rowsOf()[0].children[0].textContent, "Ada Lovelace", "cells observe their object");
  const oldRow = f.rowsOf()[0];
  f.parent.people = [linus, ada];
  assert.deepEqual(f.rowsOf().map(row => row.children[0].textContent), ["Linus", "Ada Lovelace"]);
  assert.equal(oldRow.parentElement, null, "a new collection replaces the rows");
  ada.name = "Ada";
  assert.equal(oldRow.children[0].textContent, "Ada Lovelace", "released rows stop observing");
  assert.equal(f.rowsOf()[1].children[0].textContent, "Ada");
  assert.equal(f.controller.rows.subviews.length, 2, "released row views leave the tree");
  assert.equal(f.parent.people.length, 2);
  f.template.remove();
  assert.throws(() => { f.parent.people = [grace]; }, /no <template for="row">/);
});

test("clicks select by identity, shift-click extends, and the selection shows on rows and paths", () => {
  const f = peoplePage();
  const [ada, grace, linus] = f.parent.people;
  assert.deepEqual([Array.from(f.controller.selectedObjects), f.controller.selectedObject, f.controller.selectedObjectId,
    f.edit.disabled, f.selected.textContent], [[], null, null, true, ""]);
  f.rowsOf()[1].children[0].click();
  assert.deepEqual(Array.from(f.controller.selectedObjects), [grace]);
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [1]);
  assert.equal(f.controller.selectedObject, grace);
  assert.equal(f.controller.selectedObjectId, "2", "the selection names its object by id");
  assert.deepEqual(f.rowsOf().map(row => row.classList.contains("selected")), [false, true, false]);
  assert.deepEqual(f.rowsOf().map(row => row.getAttribute("aria-selected")), [null, null, null], "rows have no role to be selected in");
  assert.equal(f.document.scrolledTo, f.rowsOf()[1], "the leading selected row is scrolled into view");
  assert.equal(f.selected.textContent, "Grace", "@ paths read through the computed selected_object");
  assert.equal(f.edit.disabled, false, "bind-* observes the computed indexes");
  assert.equal(f.controller.selectionChanges, 1, "selected_object_did_change ran once");
  f.rowsOf()[2].children[0].click({shiftKey: true});
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [2], "shift-click is a plain click without allows_multiple_selection");
  f.controller.allowsMultipleSelection = true;
  f.rowsOf()[0].children[0].click({shiftKey: true});
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [0, 1, 2], "shift-click extends from the anchor");
  assert.equal(f.controller.selectedObject, ada, "the lowest row leads a range");
  assert.equal(f.controller.selectedObjectId, "1");
  assert.equal(f.controller.selectionChanges, 3);
  f.parent.people = [linus, grace, ada];
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [0, 1, 2]);
  assert.equal(f.controller.selectionChanges, 3, "reordering changes no object");
  f.controller.selectObject(grace);
  f.parent.people = [ada, grace];
  assert.deepEqual([Array.from(f.controller.selectedIndexes), f.controller.selectedObjectId], [[1], "2"],
    "the selection follows its object through a new collection");
  f.parent.people = [ada, linus];
  assert.deepEqual([Array.from(f.controller.selectedObjects), f.controller.selectedObjectId], [[], "2"],
    "an object that left is no longer selected, but its id stays wanted");
  assert.deepEqual([f.selected.textContent, f.edit.disabled], ["", true]);
  f.parent.people = [grace, ada];
  assert.deepEqual([f.controller.selectedObject, Array.from(f.controller.selectedIndexes)], [grace, [0]],
    "the wanted id resolves when its object returns");
  f.controller.deselectAll();
  assert.deepEqual([Array.from(f.controller.selectedObjects), f.controller.selectedObjectId, f.edit.disabled], [[], null, true]);
  assert.deepEqual(f.rowsOf().map(row => row.classList.contains("selected")), [false, false]);
  f.controller.selectIndexes([1, 5]);
  assert.deepEqual(Array.from(f.controller.selectedObjects), [ada], "out-of-range indexes are ignored");
});

// A row's bindings are the list's to release. Removing the region any way
// other than through the list itself — a window's content being replaced, or
// the observer noticing a removed subtree — must release them just the same,
// or every re-render leaves the old rows observing their objects forever.
test("detaching a region releases the bindings of the rows inside it", () => {
  const f = peoplePage();
  const [ada] = f.parent.people;
  const row = f.rowsOf()[0];
  const cell = row.children[0];
  assert.equal(cell.textContent, "Ada", "the row is bound before detaching");

  // The path the MutationObserver takes for a removed subtree, and the one a
  // window takes when its content is replaced. The list reaches its rows
  // because it retains a disposer that clears them, so unloading it releases
  // every row's bindings without the caller knowing rows exist.
  Awakening.detach(f.list);

  ada.name = "Ada Lovelace";
  assert.equal(cell.textContent, "Ada",
    "a detached row stops observing the object it displayed");
});

test("row actions dispatch from the list knowing their row, and activation reaches the owner", () => {
  const f = peoplePage("", null, "Swill::Controller::SortableList");
  const [ada, grace, linus] = f.parent.people;
  f.rowsOf()[0].children[2].children[0].click();
  assert.deepEqual(Array.from(f.parent.people), [grace, linus], "the row's button reached the parent's remove_person");
  assert.deepEqual(f.rowsOf().map(row => row.children[0].textContent), ["Grace", "Linus"]);
  assert.deepEqual([Array.from(f.controller.selectedObjects), f.controller.selectedObjectId], [[], "1"],
    "the click selected the row before its action removed it");
  f.rowsOf()[1].children[0].doubleClick();
  assert.equal(f.controller.selectedObject, linus);
  assert.equal(f.parent.person, linus, "double-click activates: the parent received the list as sender");
  assert.equal(f.title.textContent, "Hello Linus");
  f.parent.resetPerson();
  f.edit.click();
  assert.equal(f.parent.person, linus, "the list's own activate_selection button is handled by the list first");
  assert.equal(f.controller.actionTarget("activate_selection"), f.controller);
  assert.equal(f.parent.actionTarget("activate_selection"), f.parent);
  assert.equal(f.controller.actionTarget("vanish"), null);
  f.controller.unload();
  assert.equal(f.rowsOf().length, 0, "teardown removes the rows");
  assert.equal(f.controller.rows.subviews.length, 0);
  f.parent.people = [ada];
  assert.equal(f.rowsOf().length, 0, "a torn-down list no longer renders");
});

test("the keyboard moves a single selection from the first responder and Enter activates it", () => {
  const f = peoplePage("", null, "Swill::Controller::SortableList");
  const [, grace] = f.parent.people;
  assert.equal(f.application.makeFirstResponder(f.controller), true);
  assert.equal(f.document.activeElement, f.list, "the list root took focus through its tabindex");
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [0], "becoming first responder selects the first row");
  const key = name => f.list.dispatchEvent(keyEvent("keydown", name));
  key("ArrowDown");
  key("ArrowDown");
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [2]);
  key("ArrowDown");
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [2], "the end clamps");
  let boundaryCancels = 0;
  const cancelOperation = f.controller.cancelOperation.bind(f.controller);
  f.controller.cancelOperation = event => {
    if (event.key === "ArrowUp") boundaryCancels += 1;
    else cancelOperation(event);
  };
  key("ArrowUp");
  key("ArrowUp");
  key("ArrowUp");
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [0]);
  assert.equal(boundaryCancels, 1, "Up at the first row invokes the list's cancel behavior");
  key("ArrowDown");
  key("Enter");
  assert.equal(f.parent.person, grace, "Enter activates the selection");
  key("Escape");
  assert.notEqual(f.parent.person, grace, "Escape continues up to the parent's cancel_operation");
  f.controller.deselectAll();
  const seen = [];
  f.application.insertNewline = () => seen.push("application");
  key("Enter");
  assert.deepEqual(seen, ["application"], "Enter without a selection continues up the chain");
  f.parent.people = [];
  key("ArrowDown");
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [], "arrows do nothing in an empty list");
});

test("without a rows outlet rows mount in the list itself, and an unhandled activation is quiet", () => {
  const f = bareList("Swill::Controller::List");
  const people = ["Ada", "Grace"].map(name => { const person = new Person(); person.name = name; return person; });
  f.controller.representedObject = people;
  assert.deepEqual(f.items().map(item => item.textContent), ["Ada", "Grace"], "bind on the row root binds to the object");
  assert.deepEqual(Array.from(f.controller.view.subviews).map(view => view.element), f.items());
  f.items()[0].click();
  assert.equal(f.controller.selectedObject, people[0]);
  assert.equal(f.controller.selectedObjectId, null, "an object without an id gives the selection none");
  f.items()[1].click();
  assert.equal(f.controller.selectedObject, people[1], "id-less selection still moves");
  assert.equal(f.badge.actionTarget("activate_selection"), null);
  f.items()[1].doubleClick();
  assert.equal(f.controller.selectedObject, people[1], "nobody handling activate_selection is not an error");
  assert.throws(() => f.controller.performAction("activate_selection_now", null, null), /Unhandled action/);
});

test("a controller inside a row belongs to the list and is fed the row's object", () => {
  const rowTemplate = element("tr", {controller: "Demo::PersonEditor", bind: "@"}, [
    element("td", {}, [element("input", {bind: "name"})])
  ]);
  const f = peoplePage("", rowTemplate);
  const [ada] = f.parent.people;
  const editors = Array.from(f.controller.childControllers());
  assert.equal(editors.length, 3);
  assert.ok(editors[0] instanceof PersonEditor);
  assert.equal(editors[0].representedObject, ada, 'bind="@" hands the row controller its object');
  assert.equal(editors[0].parent(), f.controller);
  assert.equal(editors[0].view.element, f.rowsOf()[0], "the row view is the row controller's root");
  const input = f.rowsOf()[0].children[0].children[0];
  assert.equal(input.value, "Ada");
  input.value = "Ada L";
  input.dispatchEvent(new Event("input"));
  assert.equal(ada.name, "Ada L", "row controller bindings resolve under its represented object");
  const gone = [];
  editors.forEach((editor, index) => { editor.viewDidDisappear = () => gone.push(index); });
  f.parent.people = [ada];
  assert.deepEqual(gone, [0, 1, 2], "re-rendering tears down row controllers");
  assert.equal(f.controller.childControllers().length, 1);
  assert.equal(f.controller.childControllers()[0].representedObject, ada);
  assert.deepEqual(Array.from(Awakening.instantiate(f.rowsOf()[0])), [], "the observer finds nothing new in a rendered row");
  f.controller.unload();
  assert.deepEqual([f.rowsOf().length, f.controller.childControllers().length], [0, 0]);
});

test("a list's selection restores by id from the fragment and follows it afterwards", () => {
  const f = peoplePage("#people.selected=2");
  const [ada, grace, linus] = f.parent.people;
  assert.equal(f.controller.selectedObject, grace, "the fragment selected by id once the roster was in place");
  assert.deepEqual(f.rowsOf().map(row => row.classList.contains("selected")), [false, true, false]);
  assert.equal(f.browser.location.hash, "#people.selected=2");
  f.rowsOf()[0].children[0].click();
  assert.equal(f.browser.location.hash, "#people.selected=1&people.dir=ascending",
    "a new selection replaces the fragment value; every restorable value is written, defaults included");
  f.controller.selectedObjectId = "3";
  assert.equal(f.controller.selectedObject, linus, "writing the id selects");
  f.controller.selectedObjectId = "9";
  assert.deepEqual([Array.from(f.controller.selectedObjects), f.controller.selectedObjectId, f.browser.location.hash],
    [[], "9", "#people.selected=9&people.dir=ascending"], "an unknown id clears the selection and stays wanted");
  const late = new SpecialPerson();
  late.id = "9";
  late.name = "Nine";
  f.parent.people = [ada, late];
  assert.equal(f.controller.selectedObject, late, "the wanted id resolves when its object arrives");
  f.browser.navigate("#people.selected=1");
  assert.equal(f.controller.selectedObject, ada, "the fragment reapplies on navigation");
  f.controller.deselectAll();
  assert.equal(f.browser.location.hash, "#people.dir=ascending", "no selection leaves the fragment");
  assert.equal(f.browser.entries.length, 2, "selection changes add no history entries");
});

test("a sortable list orders rows by a column, flips on repeat, and keeps the selection", () => {
  const f = peoplePage();
  const [, grace] = f.parent.people;
  const names = () => f.rowsOf().map(row => row.children[0].textContent);
  const sorts = () => [f.nameHeader.getAttribute("aria-sort"), f.roleHeader.getAttribute("aria-sort")];
  assert.deepEqual(names(), ["Ada", "Grace", "Linus"]);
  assert.deepEqual([f.controller.sortKey, f.controller.sortDirection, {...f.controller.sortStates}], [null, "ascending", {}]);
  assert.deepEqual(sorts(), [null, null]);
  f.controller.selectObject(grace);
  f.roleHeader.click();
  assert.deepEqual(names(), ["Grace", "Ada", "Linus"], "the header's sort_by action sorts by its column");
  assert.deepEqual([f.controller.sortKey, f.controller.sortDirection], ["role", "ascending"]);
  assert.deepEqual(sorts(), [null, "ascending"], "bind-aria-sort reads the column's state from the sort_states hash");
  assert.deepEqual([f.controller.selectedObject, Array.from(f.controller.selectedIndexes)], [grace, [0]], "the selection follows its object");
  assert.deepEqual(f.rowsOf().map(row => row.classList.contains("selected")), [true, false, false]);
  f.roleHeader.click();
  assert.deepEqual(names(), ["Linus", "Ada", "Grace"], "the same column flips the direction");
  assert.deepEqual(sorts(), [null, "descending"]);
  f.nameHeader.click();
  assert.deepEqual(names(), ["Ada", "Grace", "Linus"], "a new column sorts ascending");
  assert.deepEqual(sorts(), ["ascending", null]);
  f.controller.sort(null, "ascending");
  assert.deepEqual([names(), sorts(), {...f.controller.sortStates}], [["Ada", "Grace", "Linus"], [null, null], {}], "no key restores the represented order");
  f.controller.sortDirection = "descending";
  assert.deepEqual(names(), ["Ada", "Grace", "Linus"], "a direction without a key changes nothing");
  f.controller.sortKey = "name";
  assert.deepEqual(names(), ["Linus", "Grace", "Ada"], "setting the key alone sorts with the current direction");
  assert.equal(f.controller.selectedObject, grace);
  const [ada] = f.parent.people;
  f.parent.people = [grace, ada];
  assert.deepEqual(names(), ["Grace", "Ada"], "a new collection is sorted too");
});

test("a sortable list restores its sort from the fragment and writes changes back", () => {
  const f = peoplePage("#people.sort=role&people.dir=descending");
  const names = () => f.rowsOf().map(row => row.children[0].textContent);
  assert.deepEqual(names(), ["Linus", "Ada", "Grace"], "the fragment chose the column and direction");
  assert.equal(f.roleHeader.getAttribute("aria-sort"), "descending");
  assert.equal(f.browser.location.hash, "#people.sort=role&people.dir=descending");
  f.nameHeader.click();
  assert.equal(f.browser.location.hash, "#people.sort=name&people.dir=ascending", "the sort replaces the fragment values");
  assert.equal(f.browser.entries.length, 1, "sorting adds no history entries");
});

// ---- editable lists ----

const InlineEditor = Runtime.resolve("Swill::Controller::InlineEditor");
const TextField = Runtime.resolve("Swill::Control::TextField");
const Button = Runtime.resolve("Swill::Control::Button");
const Select = Runtime.resolve("Swill::Control::Select");
const CustomSelect = Runtime.resolve("Swill::Control::CustomSelect");

// The editor row after the row being edited, and its inputs.
function editorOf(f) {
  const row = f.rows.children.find(child => child.getAttribute("controller") === "Swill::Controller::InlineEditor");
  return row ? {row, controller: row.__swill_view__.controllerValue(), inputs: row.querySelectorAll("input")} : null;
}

function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

test("Enter edits the selected row through a draft: Enter commits it into the person, Escape discards", () => {
  const f = peoplePage();
  const [ada, grace] = f.parent.people;
  const rowsOf = () => Array.from(f.controller.rowElements());
  const names = () => rowsOf().map(row => row.children[0].textContent);
  const key = (target, name) => target.dispatchEvent(keyEvent("keydown", name));
  f.application.makeFirstResponder(f.controller);
  key(f.list, "ArrowDown");
  key(f.list, "Enter");
  const editor = editorOf(f);
  assert.ok(f.controller.isEditing(), "Enter on a selected row begins editing");
  assert.ok(editor.controller instanceof InlineEditor);
  assert.equal(editor.controller.parent(), f.controller, "the editor is the list's child");
  assert.equal(f.rows.children.indexOf(editor.row), f.rows.children.indexOf(rowsOf()[1]) + 1, "it sits after its row");
  assert.ok(rowsOf()[1].classList.contains("being-edited"));
  assert.equal(rowsOf().length, 3, "the editor is not a row");
  assert.equal(f.rowsOf().length, 4, "though it is a tr among them");
  assert.ok(f.application.firstResponder() === editor.inputs[0].__swill_view__, "the editor's first field took the keyboard");
  assert.equal(f.document.activeElement, editor.inputs[0]);
  assert.ok(f.controller.editedObject instanceof SpecialPerson);
  assert.notEqual(f.controller.editedObject, grace, "the edit works on a draft");
  assert.equal(editor.controller.representedObject, f.controller.editedObject);
  assert.equal(editor.inputs[0].value, "Grace");
  typeInto(editor.inputs[0], "Grace Hopper");
  key(editor.inputs[0], "ArrowDown");
  assert.equal(f.controller.selectedObject, grace, "Down in an editor field leaves the list's selection alone");
  key(editor.inputs[0], "ArrowUp");
  assert.equal(f.controller.selectedObject, grace, "and so does Up");
  assert.equal(f.controller.editedObject.name, "Grace Hopper");
  assert.equal(grace.name, "Grace", "the person is untouched until the commit");
  assert.notEqual(f.parent.person, grace, "editing did not hand the selection to the owner");
  key(editor.inputs[0], "Enter");
  assert.equal(f.controller.isEditing(), false);
  assert.equal(editorOf(f), null, "the editor was removed");
  assert.equal(grace.name, "Grace Hopper", "the draft was applied to the person");
  assert.deepEqual(names(), ["Ada", "Grace Hopper", "Linus"], "the row shows the change");
  assert.equal(rowsOf()[1].classList.contains("being-edited"), false);
  assert.equal(f.controller.selectedObject, grace);
  assert.equal(f.controller.editedObject, null);
  assert.equal(f.application.firstResponder(), f.controller, "the list took the keyboard back");
  assert.equal(f.controller.childControllers().length, 0, "the editor was released");
  f.controller.beginEditing(0);
  typeInto(editorOf(f).inputs[0], "Augusta");
  key(editorOf(f).inputs[0], "Escape");
  assert.deepEqual([f.controller.isEditing(), ada.name, names()[0]], [false, "Ada", "Ada"], "Escape discards");
  assert.ok(f.controller.beginEditing(1));
  assert.equal(f.controller.beginEditing(7), false, "no object, no editor");
  assert.ok(f.controller.isEditing(), "a failed begin leaves the current edit alone");
  typeInto(editorOf(f).inputs[0], "G");
  f.controller.beginEditing(0);
  assert.equal(grace.name, "G", "beginning another edit commits the current one");
  assert.equal(f.controller.editedObject.name, "Ada");
  f.controller.unload();
  assert.equal(f.controller.isEditing(), false);
});

test("focus leaving the editor asks the list: an untouched draft is dropped, changes commit, a refusal keeps focus", () => {
  const f = peoplePage();
  const [, grace] = f.parent.people;
  f.controller.beginEditing(1);
  f.nameInput.focus();
  assert.equal(f.controller.isEditing(), false, "leaving an unchanged editor discards it");
  assert.equal(f.application.firstResponder(), f.parent.nameField);
  f.controller.beginEditing(1);
  typeInto(editorOf(f).inputs[0], "Grace H");
  editorOf(f).inputs[1].focus();
  assert.ok(f.controller.isEditing(), "focus moving within the editor is free");
  f.controller.confirmEdit = () => false;
  const field = editorOf(f).inputs[1].__swill_view__;
  assert.ok(field instanceof TextField, "the editor's inputs are text fields");
  assert.equal(f.application.firstResponder(), field, "a focused control is the first responder");
  assert.equal(field.delegate, editorOf(f).controller, "and the editor is its delegate");
  f.nameInput.focus();
  assert.ok(f.controller.isEditing(), "a refused confirmation keeps the edit");
  assert.equal(f.document.activeElement, editorOf(f).inputs[1], "and focus goes back to the control");
  assert.equal(f.application.firstResponder(), field);
  f.controller.confirmEdit = () => true;
  f.nameInput.focus();
  assert.equal(f.controller.isEditing(), false);
  assert.equal(grace.name, "Grace H", "leaving a changed editor commits when confirmed");
  assert.equal(f.application.firstResponder(), f.parent.nameField, "focus went where the user put it");
  f.controller.beginEditing(0);
  const failures = [];
  f.controller.validationError = object => object.name === "" ? new Error("name is required") : null;
  f.controller.editingDidFailValidation = error => failures.push(error.message);
  typeInto(editorOf(f).inputs[0], "");
  assert.equal(f.controller.endEditing(true), false, "a validation error refuses the commit");
  assert.deepEqual([failures, f.controller.isEditing()], [["name is required"], true]);
  typeInto(editorOf(f).inputs[0], "Ada L");
  assert.equal(f.controller.commitEditingIfNeeded(), true);
  assert.equal(f.parent.people[0].name, "Ada L");
});

test("sorting commits an edit in progress and a new collection discards one", () => {
  const f = peoplePage();
  const [ada, grace] = f.parent.people;
  const names = () => Array.from(f.controller.rowElements()).map(row => row.children[0].textContent);
  f.controller.beginEditing(0);
  typeInto(editorOf(f).inputs[0], "Zed");
  f.roleHeader.click();
  assert.equal(f.controller.isEditing(), false, "the sort ended the edit first");
  assert.equal(ada.name, "Zed");
  assert.deepEqual(names(), ["Grace", "Zed", "Linus"], "sorted by role with the committed name");
  assert.equal(f.controller.selectedObject, ada, "the edited object stays selected through the reorder");
  f.controller.beginEditing(0);
  typeInto(editorOf(f).inputs[0], "Grace Hopper");
  f.parent.people = [grace, ada];
  assert.equal(f.controller.isEditing(), false);
  assert.equal(grace.name, "Grace", "a replaced collection drops the edit");
  assert.equal(editorOf(f), null);
  assert.equal(f.controller.rowElements().length, 2);
});

test("plain objects are edited through a duplicate that replaces the original on commit", () => {
  const f = bareList();
  const people = [{id: "1", name: "Ada"}, {id: "2", name: "Grace"}];
  f.controller.representedObject = people;
  assert.ok(f.controller.beginEditing(1));
  const copy = f.controller.editedObject;
  assert.notEqual(copy, people[1]);
  assert.deepEqual({...copy}, {id: "2", name: "Grace"});
  const input = f.list.querySelector("input");
  typeInto(input, "Grace Hopper");
  assert.equal(people[1].name, "Grace", "the original is untouched while editing");
  assert.ok(f.controller.endEditing(true));
  assert.notEqual(f.controller.representedObject, people, "a commit replaces the collection");
  assert.deepEqual(f.controller.representedObject.map(person => person.name), ["Ada", "Grace Hopper"]);
  assert.deepEqual(f.items().map(item => item.textContent), ["Ada", "Grace Hopper"]);
  assert.equal(f.controller.selectedObject, f.controller.representedObject[1], "the copy is selected");
  assert.equal(f.controller.selectedObjectId, "2");
});

test("an editable list needs an editor template whose root is an inline editor", () => {
  const plain = element("template", {for: "editor"}, [element("tr", {}, [element("td", {}, [element("input", {bind: "name"})])])]);
  const f = peoplePage();
  f.editorTemplate.remove();
  f.controller.selectIndexes([0]);
  assert.throws(() => f.controller.activateSelection(), /EditableList has no <template for="editor">/);
  f.rows.append(plain);
  assert.throws(() => f.controller.beginEditing(0), /editor template root must be a Swill::Controller::InlineEditor/);
  assert.equal(f.controller.isEditing(), false);
  assert.equal(f.rows.children.filter(child => child.tagName === "TR").length, 3, "the rejected clone was removed");
});

// ---- controls ----

test("a button joins the keyboard focus order without overriding an author's choice", () => {
  const button = element("button", {klass: "Swill::Control::Button", outlet: "button"});
  const excluded = element("button", {klass: "Swill::Control::Button", outlet: "excluded", tabindex: "-1"});
  const host = installHost({button: false, excluded: false});
  const [controller] = launched(element("body", {}, [element("main", {controller: host}, [button, excluded])]));
  assert.ok(controller.button instanceof Button);
  assert.equal(button.getAttribute("tabindex"), "0");
  assert.equal(excluded.getAttribute("tabindex"), "-1");
});

test("a text field mirrors its input both ways and a select renders its options", () => {
  const nameInput = element("input", {klass: "Swill::Control::TextField", outlet: "field", value: "Ada"});
  nameInput.value = "Ada";
  const wrapped = element("label", {klass: "Swill::Control::TextField", outlet: "wrapped"}, [element("span"), element("input")]);
  const select = element("select", {klass: "Swill::Control::Select", outlet: "choice"}, [element("option", {value: ""})]);
  const host = installHost({field: false, wrapped: false, choice: false});
  const [controller] = launched(element("body", {}, [element("main", {controller: host}, [nameInput, wrapped, select])]));
  const field = controller.field;
  assert.ok(field instanceof TextField);
  assert.equal(field.value, "Ada", "the initial value comes from the input");
  nameInput.value = "Grace";
  nameInput.dispatchEvent(new Event("input"));
  assert.equal(field.value, "Grace", "typing updates the control");
  const seen = [];
  field.observe("value", value => seen.push(value));
  field.value = "Linus";
  assert.equal(nameInput.value, "Linus", "assigning writes the input");
  assert.deepEqual(seen, ["Linus"]);
  assert.equal(controller.wrapped.inputElement(), wrapped.children[1], "a wrapping element finds its input");
  const choice = controller.choice;
  assert.ok(choice instanceof Select);
  choice.options = ["a", "b"];
  assert.deepEqual(select.children.map(option => option.value), ["", "a", "b"], "markup options stay as a prefix");
  choice.value = "b";
  assert.equal(select.value, "b");
  choice.options = ["b", "c"];
  assert.deepEqual(select.children.map(option => option.value), ["", "b", "c"], "assigning replaces only the suffix");
  assert.equal(select.value, "b", "the value survives when still offered");
  select.value = "c";
  select.dispatchEvent(new Event("change"));
  assert.equal(choice.value, "c", "a change updates the control");
});

test("a control's delegate can refuse to let it resign first responder", () => {
  const input = element("input", {klass: "Swill::Control::TextField", outlet: "field"});
  const other = element("input", {outlet: "other"});
  const host = installHost({field: false, other: false});
  const [controller] = launched(element("body", {}, [element("main", {controller: host}, [input, other])]));
  const application = Application.shared();
  const field = controller.field;
  assert.equal(application.makeFirstResponder(field), true);
  const asked = [];
  // A delegate is asked through metadata, so it declares the hook.
  class Gatekeeper { controlShouldResignFirstResponder(control, next) { asked.push([control, next]); return false; } }
  Runtime.install({classes: {"Test::Gatekeeper": {constructor: Gatekeeper, methods: {
    control_should_resign_first_responder: {arity: 2, js: "controlShouldResignFirstResponder"}
  }}}});
  field.delegate = new Gatekeeper();
  assert.equal(application.makeFirstResponder(controller.other), false, "the delegate refused");
  assert.deepEqual(asked, [[field, controller.other]]);
  assert.equal(application.firstResponder(), field);
  field.delegate = null;
  assert.equal(application.makeFirstResponder(controller.other), true, "without a delegate the control resigns");
});

test("a custom select builds its chrome, follows the keyboard and pointer, and reports choices as events", () => {
  const picker = element("div", {klass: "Swill::Control::CustomSelect", outlet: "picker"});
  const host = installHost({picker: false});
  const [controller] = launched(element("body", {}, [element("main", {controller: host}, [picker])]));
  const control = controller.picker;
  assert.ok(control instanceof CustomSelect);
  const button = () => picker.children[0];
  const popup = () => picker.children[1];
  const rows = () => popup().children;
  const labels = () => rows().map(row => row.querySelector("[class='custom-select-option-label']").textContent);
  assert.deepEqual([picker.getAttribute("role"), picker.getAttribute("tabindex"), popup().hidden, rows().length], ["combobox", "0", true, 0]);
  const events = [];
  picker.addEventListener("change", () => events.push(["change", control.value]));
  control.options = [{value: "a", label: "Alpha", icon: "globe"}, {value: "b", label: "Beta", description: "second"}];
  assert.deepEqual(labels(), ["Alpha", "Beta"]);
  assert.equal(rows()[1].querySelector("[class='custom-select-option-description']").textContent, "second");
  assert.equal(button().children[1].textContent, "", "no value, no label");
  control.value = "b";
  assert.deepEqual([button().children[1].textContent, rows().map(row => row.getAttribute("aria-selected"))], ["Beta", ["false", "true"]]);
  assert.deepEqual(rows().map(row => [row.classList.contains("selected"), row.getAttribute("role")]), [[false, "option"], [true, "option"]], "the selected class carries the state; the role is decoration");
  assert.equal(button().children[0].hidden, true, "Beta has no icon");
  Application.shared().makeFirstResponder(control);
  const key = name => picker.dispatchEvent(keyEvent("keydown", name));
  key("Enter");
  assert.deepEqual([popup().hidden, picker.getAttribute("aria-expanded"), picker.classList.contains("open")], [false, "true", true], "Enter opens");
  key("ArrowDown");
  assert.deepEqual([control.value, events], ["a", [["change", "a"]]], "arrows wrap around and a choice is a change");
  assert.equal(button().children[0].getAttribute("class"), "custom-select-trigger-icon icon-globe");
  assert.equal(popup().hidden, true, "a choice closes the listbox");
  key("Enter");
  key("Escape");
  assert.equal(popup().hidden, true, "Escape closes");
  key(" ");
  rows()[1].click();
  assert.deepEqual([control.value, popup().hidden, events.length], ["b", true, 2], "clicking an option chooses it");
  key("Enter");
  const outside = element("p");
  picker.ownerDocument.append(outside);
  outside.dispatchEvent(new Event("pointerdown", {bubbles: true}));
  assert.equal(popup().hidden, true, "a pointer outside closes");
  key("Enter");
  control.options = [{value: "b", label: "Beta"}];
  assert.deepEqual([labels(), control.value, button().children[1].textContent], [["Beta"], "b", "Beta"], "re-rendering keeps the value");
});

// ---- notifications and control bindings ----

test("the notification center observes by name until the observation ends, and controllers observe until unload", () => {
  const NotificationCenter = Runtime.resolve("Swill::NotificationCenter");
  const center = NotificationCenter.default();
  assert.equal(NotificationCenter.default(), center, "one default center");
  const seen = [];
  const stop = center.addObserver("ping", notification => seen.push([notification.name, notification.object, notification.userInfo]));
  const posted = center.post("ping", "poster", {count: 1});
  assert.deepEqual(seen, [["ping", "poster", {count: 1}]]);
  assert.equal(posted.name, "ping");
  center.post("other", null, null);
  stop();
  center.post("ping", "poster", {count: 2});
  assert.equal(seen.length, 1, "an ended observation hears nothing");
  const f = peoplePage();
  f.parent.observeNotification("ping", notification => seen.push(notification.userInfo));
  center.post("ping", null, "alive");
  f.parent.unload();
  center.post("ping", null, "gone");
  assert.deepEqual(seen.slice(1), ["alive"], "teardown ends a controller's observation");
});

test("first responder changes are posted as notifications", () => {
  const f = peoplePage();
  const changes = [];
  const stop = Runtime.resolve("Swill::NotificationCenter").default().addObserver("first_responder_did_change", notification => {
    changes.push([notification.object === f.application, notification.userInfo]);
  });
  f.application.makeFirstResponder(f.controller);
  f.application.makeFirstResponder(f.controller);
  f.application.makeFirstResponder(null);
  stop();
  assert.deepEqual(changes, [[true, f.controller], [true, null]], "once per change, not per call");
});

test("bind on a control keeps the control's value equal to the path both ways", () => {
  const Host = class extends SwillController {};
  Runtime.install({classes: {"Test::ChoiceHost": {constructor: Host, properties: {
    choice: {defaultValue() { return "b"; }}
  }}}});
  const picker = element("div", {klass: "Swill::Control::CustomSelect", bind: "choice"});
  const field = element("input", {klass: "Swill::Control::TextField", bind: "choice"});
  const [host] = launched(element("body", {}, [element("main", {controller: "Test::ChoiceHost"}, [picker, field])]));
  const control = picker.__swill_view__;
  control.options = [{value: "a", label: "A"}, {value: "b", label: "B"}];
  assert.equal(control.value, "b", "the control took the path's value");
  assert.equal(field.value, "b", "and so did the text field's input");
  host.choice = "a";
  assert.deepEqual([control.value, picker.children[0].children[1].textContent, field.value], ["a", "A", "a"]);
  Application.shared().makeFirstResponder(control);
  picker.dispatchEvent(keyEvent("keydown", "Enter"));
  picker.dispatchEvent(keyEvent("keydown", "ArrowDown"));
  assert.equal(host.choice, "b", "a choice in the control writes the path");
  field.value = "typed";
  field.dispatchEvent(new Event("input"));
  assert.deepEqual([host.choice, control.value], ["typed", "typed"], "typing in the text field writes the path too");
  host.unload();
  host.choice = "c";
  assert.equal(control.value, "typed", "teardown releases the binding");
});

// ---- models over the wire ----

const Author = Runtime.resolve("Demo::Author");
const Book = Runtime.resolve("Demo::Book");
const Note = Runtime.resolve("Demo::Note");
const Wire = Runtime.resolve("Swill::Wire");
const ModelResource = Runtime.resolve("Swill::Model::Resource");
const ValueTransformer = Runtime.resolve("Swill::ValueTransformer");

// Arrays and objects made in the sandbox have that realm's prototypes;
// compare their contents.
const plain = value => JSON.parse(JSON.stringify(value));

afterEach(() => { [Author, Book, Note].forEach(klass => klass.clear()); delete context.fetch; });

// A fake server behind the sandbox's fetch: routes keyed "METHOD url" answer
// a JSON body, a function of the request, or null for 204. Every request
// is recorded with its decoded body.
// Let a request started by a property read settle.
function settle() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function fakeServer(routes) {
  const requests = [];
  context.fetch = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const json = init.headers?.["Content-Type"] === "application/vnd.api+json";
    const request = {method, url, headers: init.headers, body: json && init.body != null ? JSON.parse(init.body) : init.body ?? null};
    requests.push(request);
    if (!Object.hasOwn(routes, `${method} ${url}`)) return {ok: false, status: 404, json: async () => ({})};
    const route = routes[`${method} ${url}`];
    const body = typeof route === "function" ? route(request) : route;
    if (body === null) return {ok: true, status: 204, json: async () => { throw new Error("no content"); }};
    return {ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body))};
  };
  return requests;
}

const authorsDocument = {
  data: [
    {id: "1", type: "authors", attributes: {name: "Ada", born: 1815},
     relationships: {books: {data: [{id: "10", type: "books"}, {id: "11", type: "books"}]}}},
    {id: "2", type: "authors", attributes: {name: "Grace"}, relationships: {books: {data: []}}}
  ],
  included: [
    {id: "10", type: "books", attributes: {title: "Notes"}, relationships: {author: {data: {id: "1", type: "authors"}}}},
    {id: "11", type: "books", attributes: {title: "Engines"}, relationships: {author: {data: {id: "1", type: "authors"}}}}
  ]
};

test("JSON:API documents pool records by type and hydrate associations from included resources", async () => {
  const requests = fakeServer({"GET /api/authors": authorsDocument});
  const authors = await Author.findAll();
  assert.deepEqual(plain(authors.map(author => [author.id, author.name, author.born])), [["1", "Ada", 1815], ["2", "Grace", null]]);
  const [ada, grace] = authors;
  assert.deepEqual(plain(ada.books.map(book => book.title)), ["Notes", "Engines"]);
  assert.ok(ada.books[0].author === ada, "has_one resolves to the pooled owner");
  assert.deepEqual(plain([ada.isAssociationLoaded("books"), ada.books[0].isAssociationLoaded("author"), grace.books]), [true, true, []]);
  assert.ok((await Author.find("1")) === ada, "find answers the pooled instance without a request");
  assert.equal(requests.length, 1);
  assert.ok(Book.get("10") === ada.books[0]);
  assert.ok(Author.store() !== Book.store(), "each class has its own store");
  assert.ok(ModelResource.classForType("books") === Book && ModelResource.classForType("pages") === null);
  assert.deepEqual(plain([ada.isDirty, Author.isPooled("2"), Author.values().length]), [false, true, 2], "applied attributes are clean");
  assert.deepEqual(plain(ada.associations().map(association => [association.name, association.key, association.isMany()])), [["books", "books", true]]);
});

test("save posts a new record, patches only dirty attributes, and delete leaves the pool", async () => {
  const requests = fakeServer({
    "POST /api/authors": request => ({data: {id: "7", type: "authors", attributes: {...request.body.data.attributes, name: request.body.data.attributes.name.trim()}}}),
    "PATCH /api/authors/7": {data: {id: "7", type: "authors", attributes: {name: "Ada Lovelace", born: 1815}}},
    "DELETE /api/authors/7": null
  });
  const author = new Author();
  author.name = "  ";
  await assert.rejects(author.save(), /name must not be blank/);
  author.name = " Ada ";
  author.born = 1815;
  const saved = await author.save();
  assert.ok(saved === author);
  assert.deepEqual(plain(requests[0].body), {data: {type: "authors", attributes: {name: " Ada ", born: 1815}}}, "a create sends every attribute and no id");
  assert.equal(requests[0].headers["Content-Type"], "application/vnd.api+json");
  assert.deepEqual(plain([author.id, author.name, author.isDirty]), ["7", "Ada", false], "the server's answer is applied");
  assert.ok(Author.get("7") === author, "the saved instance is the pooled one");
  await author.save();
  assert.equal(requests.length, 1, "a clean record is not sent");
  author.name = "Ada Lovelace";
  await author.save();
  assert.deepEqual(plain(requests[1].body), {data: {type: "authors", id: "7", attributes: {name: "Ada Lovelace"}}}, "an update sends the dirty attributes");
  assert.equal(author.isDirty, false);
  await author.delete();
  assert.deepEqual(plain([requests[2].method, requests[2].url, Author.get("7")]), ["DELETE", "/api/authors/7", null]);
  await new Author().delete();
  assert.equal(requests.length, 3, "a record without an id has nothing to delete");
});

test("associations load from their URL with a loading flag, and reload refreshes a pooled record", async () => {
  const requests = fakeServer({
    "GET /api/authors/1": {data: {id: "1", type: "authors", attributes: {name: "Ada", born: 1816}}},
    "GET /api/authors/1/books": {data: [{id: "10", type: "books", attributes: {title: "Notes"}}]},
    "GET /api/books/10/author": {data: {id: "1", type: "authors", attributes: {name: "Ada"}}}
  });
  const ada = await Author.find("1");
  const flags = [];
  ada.observe("books_loading", value => flags.push(value));
  // Reading an association nobody prefetched starts its request: the value
  // answers what it has, and fills in when the request lands.
  assert.deepEqual(plain([ada.name, ada.born, ada.isAssociationLoaded("books"), ada.books]), ["Ada", 1816, false, []]);
  assert.equal(ada.booksLoading, true, "the read started the request");
  const sameLoad = ada.loadAssociation("books");
  await sameLoad;
  const books = ada.books;
  assert.deepEqual(plain([books.map(book => book.title), ada.isAssociationLoaded("books"), flags]),
    [["Notes"], true, [true, false]]);
  assert.equal(requests.length, 2, "one request for the record, one for the association");
  ada.books;
  assert.equal(requests.length, 2, "a loaded association is not requested again on a second read");
  assert.ok((await ada.loadAssociation("books")) === books, "a loaded association is not requested again");
  assert.equal(requests.length, 2);
  const firstReload = ada.reloadBooks();
  const secondReload = ada.reloadBooks();
  const [firstReloaded, secondReloaded] = await Promise.all([firstReload, secondReload]);
  assert.ok(firstReloaded === secondReloaded, "both callers receive the installed association value");
  assert.equal(requests.length, 3, "concurrent reloads share one request");
  const book = books[0];
  assert.equal(book.association("author").urlFor(book), "/api/books/10/author", "without a pattern, the owner's URL is followed by the key");
  assert.equal(ada.association("books").urlFor(ada), "/api/authors/1/books", ":id in a pattern is the owner's id");
  assert.ok((await book.loadAssociation("author")) === ada);
  ada.name = "Changed";
  await ada.reload();
  assert.deepEqual(plain([ada.name, ada.isDirty]), ["Ada", false]);
  assert.throws(() => ada.association("title"), /title is not an association/);
  await assert.rejects(new Author().reload(), /reload requires an id/);
});

test("an association that cannot load says so on a property, and is not asked again", async () => {
  const requests = fakeServer({
    "GET /api/authors/2": {data: {id: "2", type: "authors", attributes: {name: "Grace"}}}
  });
  const grace = await Author.find("2");
  const states = [];
  grace.observe("books_error", value => states.push(["error", value]));
  grace.observe("books_loading", value => states.push(["loading", value]));

  // Reading starts the request; the failure lands on a property a binding
  // can show, not in a rescue a controller has to write.
  assert.deepEqual(plain([grace.books, grace.booksLoading, grace.booksError]), [[], true, null]);
  await settle();
  assert.deepEqual(plain([grace.booksLoading, grace.isAssociationLoaded("books"), grace.books]), [false, false, []]);
  assert.match(grace.booksError, /\/api\/authors\/2\/books/);
  assert.deepEqual(states.map(([name]) => name), ["loading", "error", "loading"]);

  // A remembered failure is what keeps a re-render from re-requesting.
  grace.books;
  grace.books;
  await settle();
  assert.equal(requests.length, 2, "one request for the record, one for the association");

  // An explicit reload always asks again, and clears the failure first.
  requests.length = 0;
  const pending = grace.reloadBooks();
  assert.deepEqual(plain([grace.booksError, grace.booksLoading]), [null, true]);
  await assert.rejects(pending, /\/api\/authors\/2\/books/);
  assert.deepEqual(plain([grace.books, grace.booksError != null]), [[], true],
    "a failed reload preserves data and exposes its error");
  assert.equal(requests.length, 1);
});

test("plain JSON codec, datasets, query parameters, and the wire's base URL", async () => {
  const requests = fakeServer({
    "GET https://example.test/api/notes?q=milk&limit=2": [{id: 3, body: "Milk"}, {id: 4, body: "Eggs"}],
    "GET https://example.test/api/notes": [{id: 3, body: "Milk!"}],
    "POST https://example.test/api/notes": request => ({id: 9, ...request.body}),
    "GET https://example.test/api/missing": null
  });
  Wire.default().baseURL = "https://example.test";
  try {
    const notes = await Note.where({q: "milk", limit: 2, skip: null});
    assert.deepEqual(plain(notes.map(note => [note.id, note.body])), [["3", "Milk"], ["4", "Eggs"]], "plain JSON ids are strings in the pool");
    const note = new Note();
    note.body = "Bread";
    await note.save();
    assert.deepEqual(plain([requests[1].body, note.id, Note.get("9") === note]), [{body: "Bread"}, "9", true]);
    const dataset = Note.dataset("/api/notes", {});
    const states = [];
    dataset.observe("loading", value => states.push(value));
    await dataset.reload();
    assert.deepEqual(plain([dataset.records.map(item => item.body), dataset.records[0] === notes[0], states, dataset.error]),
      [["Milk!"], true, [true, false], null]);
    const failing = Note.dataset("/api/nowhere", {});
    await failing.reload();
    assert.match(failing.error, /GET https:\/\/example.test\/api\/nowhere -> 404/);
    assert.equal(failing.loading, false);
    assert.equal(await Wire.default().requestJSON("GET", "/api/missing"), null, "204 yields nil");
  } finally {
    Wire.default().baseURL = "";
  }
});

test("the wire encodes forms, resolves relative URLs against its base, and reports failures", async () => {
  const requests = fakeServer({"POST /api/login": {ok: 1}});
  const wire = new Wire();
  const answer = await wire.requestFormJSON("POST", "/api/login", Runtime.keywordArguments({body: {user: "ada", token: null, n: 2}}));
  assert.deepEqual(plain([answer, requests[0].body, requests[0].headers["Content-Type"]]), [{ok: 1}, "user=ada&n=2", "application/x-www-form-urlencoded"]);
  assert.equal(requests[0].headers.Accept, "application/vnd.api+json, application/json");
  wire.baseURL = "https://api.test";
  assert.deepEqual(plain([wire.resolveURL("api/x"), wire.resolveURL("/api/x"), wire.resolveURL("https://other.test/y")]),
    ["https://api.test/api/x", "https://api.test/api/x", "https://other.test/y"]);
  await assert.rejects(wire.getJSON("/api/nowhere"), /GET https:\/\/api.test\/api\/nowhere -> 404/);
  assert.equal(Wire.urlWithParams("/a?x=1", {y: "2 3"}), "/a?x=1&y=2+3");
  assert.equal(Wire.resourceURL("/api/notes", "a/b"), "/api/notes/a%2Fb");
});

test("codecs agree with MRI", async () => {
  fakeServer({"GET /api/authors": authorsDocument});
  const authors = await Author.findAll();
  const ada = authors[0];
  const result = {};
  result.authors = authors.map(author => [author.id, author.name, author.born]);
  result.books = ada.books.map(book => book.title);
  result.linked = ada.books[0].author === ada;
  result.loaded = [ada.isAssociationLoaded("books"), ada.books[0].isAssociationLoaded("author")];
  result.pooled = Author.get("1") === ada && Book.get("10") === ada.books[0];
  result.clean = ada.isDirty;
  ada.name = "Ada Lovelace";
  result.patch = ada.serialize(true);
  const draft = new Note();
  draft.body = "Bread";
  result.post = draft.serialize(false);
  const note = Note.parseOne({id: 3, body: "Milk"});
  result.note = [note.id, note.body, Note.get("3") === note];
  assert.deepEqual(plain(result), JSON.parse(readFileSync("build/mri-models.json")));
});

test("a document's nil for an attribute that is not nilable leaves the declared default", async () => {
  // Real servers send null for empty columns. The declaration says what the
  // attribute is, and the compiler types its reader from that, so a nil for a
  // String attribute is an absent value and the default stands.
  fakeServer({"GET /api/authors": {data: [{id: "1", type: "authors", attributes: {name: null, born: null}}]}});
  const [author] = await Author.findAll();
  assert.deepEqual(plain([author.name, author.born]), ["", null], "String keeps its default; T.nilable(Integer) keeps the nil");
  assert.equal(author.isDirty, false, "a document applies cleanly");
  author.name = "Ada";
  author.applyAttributes({name: null, born: 1815});
  assert.deepEqual(plain([author.name, author.born]), ["", 1815], "a direct apply follows the same rule");
  const note = Note.parseOne({id: 5, body: null});
  assert.equal(note.body, "", "the plain JSON codec applies it too");
});

test("transform= formats and parses through value transformers; predicate readers end bind-* paths", () => {
  const author = new Author();
  author.born = 1815;
  const root = element("div", {}, [
    element("input", {bind: "born", transform: "number"}),
    element("span", {bind: "born", transform: "number"}),
    element("button", {"bind-disabled": "name.blank?", "bind-data-old": "born.positive?"}),
    element("input", {bind: "name", transform: "shout"})
  ]);
  const [born, shown, button, shouted] = root.children;
  assert.throws(() => Bindings.establishIn(element("div", {}, [element("input", {bind: "name", transform: "nope"})]), author), /unknown transform nope/);
  class Shout extends ValueTransformer {
    format(value) { return String(value ?? "").toUpperCase(); }
    parse(text) { return text.toLowerCase(); }
  }
  ValueTransformer.register("shout", new Shout());
  const dispose = Bindings.establishIn(root, author);
  assert.deepEqual(plain([born.value, shown.textContent, button.disabled, button.getAttribute("data-old"), shouted.value]), ["1815", "1815", true, "true", ""]);
  born.value = "1816";
  born.dispatchEvent(new Event("input"));
  assert.deepEqual(plain([author.born, shown.textContent]), [1816, "1816"], "number parses the field");
  born.value = " ";
  born.dispatchEvent(new Event("input"));
  assert.deepEqual(plain([author.born, shown.textContent, button.getAttribute("data-old")]), [null, "", null], "blank text is nil");
  shouted.value = "ADA";
  shouted.dispatchEvent(new Event("input"));
  assert.deepEqual(plain([author.name, shouted.value, button.disabled]), ["ada", "ADA", false]);
  assert.deepEqual(plain([Runtime.read(-2, "negative?"), Runtime.read(0, "zero?"), Runtime.read(null, "positive?")]), [true, true, null]);
  assert.equal(ValueTransformer.named("boolean").parse("on"), true);
  dispose();
});

test("array controllers cache arrangement and track filter and sort property reads", () => {
  const ArrayController = Runtime.resolve("Swill::ArrayController");
  let visits = 0;
  class Filtered extends ArrayController {
    includesObject(object) { visits++; return object.name.toLowerCase().includes(this.query); }
  }
  Runtime.installClass(Filtered, "Test::FilteredArray", [
    {name: "query", js: "query", defaultValue: () => ""}
  ], [{name: "includes_object?", js: "includesObject", arity: 1}]);
  const ada = new Person(); ada.id = "1"; ada.name = "Ada";
  const grace = new Person(); grace.id = "2"; grace.name = "Grace";
  const controller = new Filtered();
  controller.content = [grace, ada];
  assert.equal(visits, 0, "constructing or assigning content is lazy");
  controller.sort("name", "ascending");
  assert.deepEqual(Array.from(controller.arrangedObjects), [ada, grace]);
  const initialVisits = visits;
  controller.selectObject(grace);
  for (let i = 0; i < 10; i++) { controller.arrangedObjects; controller.selectedIndexes; }
  assert.equal(visits, initialVisits, "selection and index reads do not repeat filtering");
  controller.query = "ada";
  assert.deepEqual(Array.from(controller.arrangedObjects), [ada]);
  assert.equal(controller.selectedObject, null);
  controller.query = "";
  assert.equal(controller.selectedObject, grace, "clearing the filter restores the requested selection");
  grace.name = "Aaron";
  assert.deepEqual(Array.from(controller.arrangedObjects), [grace, ada]);
  const other = new ArrayController(); other.content = controller.content;
  other.sort("name", "descending");
  assert.deepEqual(Array.from(other.arrangedObjects), [ada, grace]);
  assert.deepEqual(Array.from(controller.content), [grace, ada], "arrangement does not reorder content");
  controller.dealloc(); other.dealloc();
  assert.equal(Runtime.observed(grace, "name"), false);
});

test("arranged_objects is the observable and bindable arrangement property", () => {
  const ArrayController = Runtime.resolve("Swill::ArrayController");
  const source = new ArrayController();
  const consumer = new ArrayController();
  const ada = new Person(); ada.name = "Ada";
  const grace = new Person(); grace.name = "Grace";
  source.content = [grace, ada];
  const changes = [];
  const dispose = source.observe("arranged_objects", value => changes.push(Array.from(value)));
  consumer.bind("content", Runtime.keywordArguments({to: source, key_path: "arranged_objects"}));
  assert.deepEqual(Array.from(consumer.content), [grace, ada]);
  changes.length = 0;
  source.sort("name", "ascending");
  assert.deepEqual(changes, [[ada, grace]]);
  assert.deepEqual(Array.from(consumer.content), [ada, grace]);
  assert.equal(source.arrangedObjects, source.arrangedObjects, "reads reuse the cached array");
  assert.equal("arrangedContent" in source, false, "there is only one arrangement property");
  consumer.unbind("content");
  dispose();
  consumer.dealloc(); source.dealloc();
});

test("replacing array controller content releases obsolete member dependencies", () => {
  const ArrayController = Runtime.resolve("Swill::ArrayController");
  const first = new Person(); first.name = "Ada";
  const second = new Person(); second.name = "Grace";
  const controller = new ArrayController();
  controller.content = [first];
  controller.sort("name", "ascending");
  // Two members ensure sorting reads names and subscribes to them.
  controller.content = [second, first];
  controller.arrangedObjects;
  const dispose = controller.observe("arranged_objects", () => {});
  assert.equal(Runtime.observed(first, "name"), true);
  controller.content = [];
  assert.equal(Runtime.observed(first, "name"), false);
  dispose();
  controller.dealloc();
});

test("lists accept an array controller through ordinary bind and share one selection", () => {
  const f = peoplePage();
  const [ada, grace] = f.parent.people;
  const ArrayController = Runtime.resolve("Swill::ArrayController");
  const controller = new ArrayController();
  controller.content = [grace, ada];
  // The existing bind="people" supplies the controller just as it supplied an array.
  f.parent.people = controller;
  assert.equal(f.controller.arrayController, controller);
  assert.equal(f.controller.representedObject, controller);
  assert.equal(f.controller.content, null);
  controller.selectObject(ada);
  assert.equal(f.controller.selectedObject, ada);
  f.controller.selectObject(grace);
  assert.equal(controller.selectedObject, grace);
  f.nameHeader.dispatchEvent(new Event("click"));
  assert.equal(controller.sortKey, "name");
  assert.deepEqual(f.rowsOf().map(row => row.children[0].textContent), ["Ada", "Grace"]);
  assert.deepEqual(Array.from(f.controller.selectedIndexes), [1]);
  assert.throws(() => { f.controller.content = [ada]; }, /either content or array_controller/);
  let renders = 0;
  const render = f.controller.renderAll.bind(f.controller);
  f.controller.renderAll = () => { renders++; render(); };
  controller.sort("name", "descending");
  assert.equal(renders, 1, "one sort operation renders once");
  f.controller.unload();
  assert.equal(Runtime.observed(controller, "arranged_objects"), false);
  controller.sort("name", "ascending");
  assert.equal(renders, 1, "unloading the list releases its observations");
  controller.dealloc();
});

test("temporary first placement belongs to presentation and clears on sorting or new content", () => {
  const ArrayController = Runtime.resolve("Swill::ArrayController");
  const Collection = Runtime.resolve("Swill::Model::Collection");
  const first = new Person(); first.id = "1"; first.name = "Ada";
  const added = new Person(); added.id = "2"; added.name = "Zed";
  const source = new Collection().replace([first]);
  const controller = new ArrayController(); controller.content = source;
  controller.showFirst(added);
  assert.deepEqual(Array.from(controller.arrangedObjects), [added, first]);
  assert.equal(controller.selectedObject, added);
  assert.deepEqual(Array.from(source.records), [first]);
  controller.sort("name", "ascending");
  assert.deepEqual(Array.from(controller.arrangedObjects), [first]);
  controller.showFirst(added);
  controller.content = new Collection().replace([first]);
  assert.deepEqual(Array.from(controller.arrangedObjects), [first]);
  controller.content = source;
  assert.deepEqual(Array.from(controller.arrangedObjects), [first], "returning to old content does not restore temporary placement");
  assert.throws(() => { controller.arrayController = controller; }, /either content|delegate to itself/);
  controller.dealloc();
});

test("compiled filtering works directly on lists or on an including view controller", () => {
  const f = bareList("Demo::FilteredPeopleList");
  const ada = new Person(); ada.id = "1"; ada.name = "Ada";
  const grace = new Person(); grace.id = "2"; grace.name = "Grace";
  f.controller.representedObject = [grace, ada];
  f.controller.selectObject(grace);
  f.controller.filterText = "ada";
  assert.deepEqual(f.items().map(item => item.textContent), ["Ada"]);
  assert.equal(f.controller.selectedObject, null);
  f.controller.filterText = "";
  f.controller.sort("name", "ascending");
  grace.name = "Aaron";
  assert.deepEqual(f.items().map(item => item.textContent), ["Aaron", "Ada"]);
  const Owner = Runtime.resolve("Demo::FilteredPeopleController");
  const owner = new Owner(); owner.content = [ada, grace];
  owner.filterText = "aaron";
  assert.deepEqual(Array.from(owner.arrangedObjects), [grace]);
  owner.selectObject(grace);
  assert.equal(owner.selectedObject, grace);
  owner.dealloc();
});

for (const fails of [false, true]) test(`inline row stays visible while remote save is pending (${fails ? "failure" : "success"})`, async () => {
  const f = peoplePage();
  const ada = f.parent.people[0];
  let resolve, reject, pending;
  ada.applyDraft = () => new Promise((done, fail) => { resolve = done; reject = fail; });
  f.controller.commitEdit = (copy, original, index) => {
    pending = f.controller.commitDistantEdit(copy, original, index);
  };
  f.controller.editingDidFailSave = () => {};
  f.controller.selectObject(ada);
  f.controller.beginEditing(0);
  const row = f.controller.rowElements()[0];
  f.controller.editedObject.name = "Updated";
  assert.equal(row.classList.contains("being-edited"), true);
  assert.equal(f.controller.endEditing(true), true);
  assert.equal(f.controller.isEditing(), false);
  assert.equal(row.classList.contains("being-edited"), false, "original row reappears before the response");
  assert.equal(f.controller.rowElements()[0], row);
  assert.equal(f.controller.selectedObject, ada);
  assert.equal(ada.name, "Ada", "pending draft does not change canonical data");
  if (fails) reject(new Error("save failed")); else resolve(ada);
  await pending;
  assert.equal(f.controller.isEditing(), fails);
  assert.equal(row.classList.contains("being-edited"), fails);
  if (fails) assert.equal(f.controller.editedObject.name, "Updated", "failed save retains the draft");
});

test("failed remote edits reopen beside the record's current row", async () => {
  const f = peoplePage();
  const [ada, grace] = f.parent.people;
  let reject;
  ada.applyDraft = () => new Promise((_resolve, fail) => { reject = fail; });
  f.controller.editingDidFailSave = () => {};
  const pending = f.controller.commitDistantEdit(ada.draft(), ada, 0);
  f.controller.sort("name", "descending");
  reject(new Error("save failed"));
  await pending;
  assert.equal(f.controller.isEditing(), true);
  const index = Array.from(f.controller.arrangedObjects).indexOf(ada);
  const row = f.controller.rowElements()[index];
  assert.ok(f.rows.children.indexOf(editorOf(f).row) === f.rows.children.indexOf(row) + 1, "editor follows the current row");
  assert.equal(f.controller.editedObject.name, "Ada");
});

test("a failed remote edit cannot replace a newer editor", async () => {
  const f = peoplePage();
  const [ada, grace] = f.parent.people;
  let reject;
  ada.applyDraft = () => new Promise((_resolve, fail) => { reject = fail; });
  f.controller.editingDidFailSave = () => {};
  const pending = f.controller.commitDistantEdit(ada.draft(), ada, 0);
  f.controller.beginEditing(1);
  const draft = f.controller.editedObject;
  reject(new Error("save failed"));
  await pending;
  assert.ok(f.controller.editedObject === draft, "the newer draft stays active");
  assert.equal(draft.name, grace.name);
});

test("remote save completion leaves a replacement query alone", async () => {
  const f = peoplePage();
  const [ada, grace] = f.parent.people;
  let resolve;
  ada.applyDraft = () => new Promise(done => { resolve = done; });
  const pending = f.controller.commitDistantEdit(ada.draft(), ada, 0);
  f.parent.people = [grace];
  f.controller.selectObject(grace);
  f.application.makeFirstResponder(f.parent.nameField);
  resolve(ada);
  await pending;
  assert.ok(f.controller.selectedObject === grace, "replacement query selection stays intact");
  assert.ok(f.application.firstResponder() === f.parent.nameField, "completion does not steal focus");
});

test("a failed remote edit does not reopen after the list unloads", async () => {
  const f = peoplePage();
  const ada = f.parent.people[0];
  let reject;
  ada.applyDraft = () => new Promise((_resolve, fail) => { reject = fail; });
  const pending = f.controller.commitDistantEdit(ada.draft(), ada, 0);
  f.controller.unload();
  reject(new Error("save failed"));
  await pending;
  assert.equal(f.controller.isEditing(), false);
});

test("focused buttons retain native activation inside editable lists", () => {
  const f = peoplePage();
  const elementNode = element("button", {klass: "Swill::Control::Button", "data-action": "activate_selection"});
  f.list.append(elementNode);
  Awakening.instantiate(elementNode);
  const button = elementNode.__swill_view__;
  f.controller.selectIndexes([0]);
  f.application.makeFirstResponder(button);
  const enter = keyEvent("keydown", "Enter");
  elementNode.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, false, "the browser can activate the button");
  assert.equal(f.controller.isEditing(), false, "Enter did not reach the list's editing handler");
});


test("application outlets connect before controller callbacks and respect ownership", () => {
  class App extends Application {}
  let seen;
  class Root extends SwillController {
    awakeFromDOM() { seen = this.application().main; }
  }
  Runtime.install({classes: {
    "Test::OutletApp": {constructor: App, properties: {
      main: outletDescriptor("T.nilable(Test::OutletRoot)"),
      optional: outletDescriptor("T.nilable(Swill::View)", true)
    }},
    "Test::OutletRoot": {constructor: Root, properties: {field: outletDescriptor("T.nilable(Swill::View)")}}
  }});
  const field = element("input", {outlet: "field"});
  const main = element("main", {controller: "Test::OutletRoot", outlet: "main"}, [field]);
  const app = new App();
  app.launch(element("body", {}, [main]));
  assert.equal(app.main, main.__swill_view__.controllerValue());
  assert.equal(seen, app.main);
  assert.equal(app.main.field.element, field);
  assert.equal(app.optional, null);
});

test("application outlets validate missing, duplicate, undeclared and mistyped connections", () => {
  class App extends Application {}
  Runtime.install({classes: {"Test::InvalidOutletApp": {constructor: App, properties: {
    main: outletDescriptor("T.nilable(Swill::Controller)")
  }}}});
  const launch = children => {
    if (Application.isRunning()) Application.shared().terminate();
    return new App().launch(element("body", {}, children));
  };
  const main = () => element("main", {controller: installHost({}), outlet: "main"});
  assert.throws(() => launch([]), /Unresolved outlet main on Test::InvalidOutletApp/);
  assert.throws(() => launch([main(), main()]), /Duplicate outlet main on Test::InvalidOutletApp/);
  assert.throws(() => launch([main(), element("div", {outlet: "other"})]), /Undeclared outlet other on Test::InvalidOutletApp/);
  assert.throws(() => launch([element("div", {outlet: "main"})]), /Outlet main expects/);
});


test("segmented binds one selection, roves focus, emits user changes and releases connections", () => {
  const Host = class extends SwillController {};
  Runtime.install({classes: {"Test::SegmentHost": {constructor: Host, properties: {
    choice: {defaultValue() { return "b"; }},
    picker: outletDescriptor("Swill::Control::Segmented")
  }}}});
  const root = element("div", {klass: "Swill::Control::Segmented", bind: "choice", outlet: "picker"});
  const [host] = launched(element("body", {}, [element("main", {controller: "Test::SegmentHost"}, [root])]));
  const control = host.picker;
  control.options = [{value: "a", label: "Alpha"}, {value: "b", label: "Beta"}];
  const buttons = () => root.querySelectorAll("[role='radio']");
  assert.deepEqual(buttons().map(b => b.getAttribute("tabindex")), ["-1", "0"]);
  assert.deepEqual(buttons().map(b => [b.classList.contains("checked"), b.getAttribute("aria-checked")]), [[false, "false"], [true, "true"]],
    "the checked class carries the state, and update_accessibility describes it");
  assert.equal(root.getAttribute("role"), "radiogroup");
  const changes = [];
  root.addEventListener("change", () => changes.push(control.value));
  Application.shared().makeFirstResponder(control);
  assert.equal(root.ownerDocument.activeElement, buttons()[1]);
  buttons()[1].dispatchEvent(keyEvent("keydown", "ArrowRight"));
  assert.equal(root.ownerDocument.activeElement, buttons()[0], "Right wraps to the first segment");
  assert.equal(host.choice, "b", "arrows move focus without choosing");
  assert.deepEqual(buttons().map(b => b.getAttribute("tabindex")), ["0", "-1"], "the tab stop follows focus");
  buttons()[0].dispatchEvent(keyEvent("keydown", "ArrowLeft"));
  buttons()[1].dispatchEvent(keyEvent("keydown", "ArrowLeft"));
  assert.equal(root.ownerDocument.activeElement, buttons()[0], "Left steps back, wrapping");
  buttons()[0].dispatchEvent(keyEvent("keydown", "ArrowUp"));
  assert.equal(host.choice, "b", "Up is not the control's");
  buttons()[0].click();
  assert.equal(host.choice, "a", "pressing the focused segment chooses it");
  assert.deepEqual(changes, ["a"]);
  host.choice = "b";
  assert.deepEqual(changes, ["a"], "assignments are silent");
  control.disabled = true;
  buttons()[0].click();
  assert.equal(host.choice, "b");
  assert.ok(buttons().every(button => button.disabled));
  control.disabled = false;
  buttons()[0].click();
  assert.equal(host.choice, "a");
  const oldButton = buttons()[1];
  host.unload();
  oldButton.click();
  assert.equal(control.value, "a", "unload removes control listeners");
  assert.equal(root.__swill_view__, null);
});

test("shared templates clone independently and controls own their internal connections", () => {
  const templates = swill.Swill__Templates;
  const document = element("body");
  const first = templates.named("custom_select", document);
  assert.equal(templates.named("custom_select", document), first, "parsed prototype is reused");
  assert.notEqual(templates.named("custom_select", element("body")), first, "documents keep separate prototypes");
  assert.throws(() => templates.named("missing", document), /Unknown control template: missing/);

  const Control = Runtime.resolve("Swill::Control");
  class OwnedControl extends Control {
    constructor(element) { super(element); this.loadTemplate("owned"); }
    increment() { this.value += "!"; }
  }
  Runtime.install({classes: {"Test::OwnedControl": {constructor: OwnedControl,
    properties: {value: {defaultValue() { return "local"; }}, label: outletDescriptor("Swill::View")},
    methods: {increment: {js: "increment", arity: 0}}
  }}});
  // An application bundle's catalog, embedded as the build embeds one, is
  // searched before the framework's.
  const Bundle = Runtime.resolve("Swill::Bundle");
  Bundle.register("templates-app", "/app/", ["templates.html"], {
    "templates.html": '<template name="owned"><span outlet="label" bind="value"></span><button data-action="increment"></button></template>'
  }, true);
  const hostName = installHost({picker: false});
  const picker = element("div", {klass: "Test::OwnedControl", outlet: "picker"});
  const body = element("body", {}, [element("main", {controller: hostName}, [picker])]);
  const [host] = launched(body);
  const control = host.picker;
  assert.equal(control.label.element.textContent, "local");
  picker.querySelector("button").click();
  assert.equal(control.label.element.textContent, "local!");
  assert.equal(templates.named("owned", body).content.children[0].textContent, "", "prototype was not mutated");
  const label = control.label.element;
  host.unload();
  control.value = "after";
  assert.equal(label.textContent, "local!", "unload releases internal bindings");
  Bundle.register("no-app", "", [], {}, true);
});


test("native controls can awaken again without stale listeners or duplicated options", () => {
  const name = installHost({field: false, picker: false});
  const input = element("input", {klass: "Swill::Control::TextField", outlet: "field"});
  const select = element("select", {klass: "Swill::Control::Select", outlet: "picker"}, [element("option", {value: ""})]);
  const root = element("main", {controller: name}, [input, select]);
  const body = element("body", {}, [root]);
  let [host] = launched(body);
  const oldField = host.field;
  host.picker.options = ["a", "b"];
  assert.equal(select.children.length, 3);
  host.unload();
  [host] = swill.Swill__Awakening.instantiate(root);
  host.picker.options = ["a", "b"];
  assert.equal(select.children.length, 3);
  input.value = "new";
  input.dispatchEvent(new Event("input", {bubbles: true}));
  assert.equal(host.field.value, "new");
  assert.equal(oldField.value, "");
});


test("Swell chains DOM edits without changing managed ownership", () => {
  const node = element("input");
  const view = new View(node);
  const Swell = Runtime.resolve("Swill::Swell");
  const dom = Swell.$index(node);
  assert.equal(dom.addClass("active").attr("tabindex", 0).aria("expanded", false), dom);
  assert.equal(node.__swill_view__, view);
  assert.equal(dom.element, node);
  assert.equal(dom.hasClass("active"), true);
  dom.toggleClass("active");
  assert.equal(dom.hasClass("active"), false);
  dom.toggleClass("active", true).removeClass("active");
  assert.equal(dom.hasClass("active"), false);
  assert.equal(dom.attribute("tabindex"), "0");
  assert.equal(dom.attribute("aria-expanded"), "false");
  assert.equal(dom.ariaValue("expanded"), "false");
  assert.equal(dom.dataValue("missing"), null);
  dom.attr("disabled", true);
  assert.equal(dom.attribute("disabled"), "");
  dom.attr("disabled", false);
  assert.equal(dom.hasAttribute("disabled"), false);
  dom.data("ready", false).aria("expanded", null);
  assert.equal(dom.attribute("data-ready"), "false");
  assert.equal(dom.attribute("aria-expanded"), null);
  assert.equal(dom.dataValue("ready"), "false");
  assert.equal(dom.ariaValue("expanded"), null);
  dom.removeAttr("data-ready").prop("checked", false).prop("value", "edited");
  assert.equal(node.checked, false);
  assert.equal(node.value, "edited");
  assert.equal(dom.propertyValue("checked"), false);
  assert.equal(dom.propertyValue("value"), "edited");
  dom.hide(); assert.equal(node.hidden, true);
  dom.show(); assert.equal(node.hidden, false);
});

test("Swell finds children, writes literal text and exposes listener disposal", () => {
  const root = element("div");
  const child = element("span", {class: "label"});
  const dom = Runtime.resolve("Swill::Swell").$index(root);
  assert.equal(dom.append(child), dom);
  const label = dom.findBang(".label");
  label.text("<em>literal</em>");
  assert.equal(child.textContent, "<em>literal</em>");
  assert.equal(label.textContent(), "<em>literal</em>");
  assert.equal(child.children.length, 0);
  assert.equal(dom.find(".missing"), null);
  assert.throws(() => dom.findBang(".missing"), /No element matching .missing/);
  let clicks = 0;
  const stop = dom.listen("click", () => clicks++);
  root.click(); stop(); stop(); root.click();
  assert.equal(clicks, 1);
  label.remove(); assert.equal(root.children.length, 0);
  dom.append(child).empty(); assert.equal(root.children.length, 0);
});

test("View clones template roots and supplies fresh divs for empty templates", () => {
  const view = new View(element("section"));
  const template = element("template");
  const blank = view.cloneTemplate(template);
  assert.equal(blank.tagName, "DIV");
  assert.equal(blank.children.length, 0);
  assert.notEqual(view.cloneTemplate(template), blank);
  assert.equal(template.content.children.length, 0);

  const root = element("article", {}, [element("span", {class: "label"})]);
  template.content.appendChild(root);
  const clone = view.cloneTemplate(template);
  assert.equal(clone.tagName, "ARTICLE");
  assert.notEqual(clone, root);
  assert.equal(clone.children.length, 1);
  assert.notEqual(clone.children[0], root.children[0]);
  assert.equal(clone.children[0].getAttribute("class"), "label");
});
