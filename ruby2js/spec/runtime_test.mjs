import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadBundles} from "./load_bundles.mjs";

const {Runtime, ReactiveObject} = loadBundles();

const Person = Runtime.resolve("Demo::Person");
const SpecialPerson = Runtime.resolve("Demo::SpecialPerson");
const Controller = Runtime.resolve("Demo::Controller");

test("real Attributes concern builds isolated inherited registries", () => {
  const Record = Runtime.resolve("Record");
  const result = {
    record: Object.keys(Record.model_attributes()),
    person: Object.keys(Person.model_attributes()),
    special: Object.keys(SpecialPerson.model_attributes())
  };
  assert.deepEqual(result, JSON.parse(readFileSync("build/mri-attributes.json")));
  assert.notEqual(Person.model_attributes(), Record.model_attributes());
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
      // Ruby2JS's core raise lowering throws the value, not a Ruby exception.
      message = typeof error === "string" ? error : error.message;
      return message === "name must not be blank";
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
  assert.equal(Object.getPrototypeOf(Person.prototype) instanceof ReactiveObject, true);
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
  class Base extends ReactiveObject {
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
  assert.equal(Runtime.invoke(controller, "clear"), "Nobody");
  assert.equal(controller.person, null);
  assert.throws(() => Runtime.invoke(controller, "clear", 1), /wrong arity/);
  assert.throws(() => Runtime.invoke(controller, "toString"), /Unknown action/);
});

test("DOM-shaped bindings are two-way and release listeners", () => {
  class Element extends EventTarget { value = ""; textContent = ""; }
  const person = new Person();
  const input = new Element();
  const output = new Element();
  const unbindInput = Runtime.bindElement(person, "name", input, {twoWay: true});
  const unbindOutput = Runtime.bindElement(person, "label", output);
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
  assert.throws(() => Runtime.bindElement(person, "label", input, {twoWay: true}), /Read-only/);
});

test("the shared setter coerces before equality and invalidates before hooks", () => {
  const events = [];
  class Hooks extends ReactiveObject {
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
  assert.equal(Runtime.truthy(0), true);
  assert.equal(Runtime.truthy(""), true);
  assert.equal(Runtime.truthy(false), false);
  assert.equal(Runtime.truthy(null), false);
  assert.equal(Runtime.equal([1, [2]], [1, [2]]), true);
  assert.equal(Runtime.equal([1], [2]), false);
  assert.equal(Runtime.equal(new Person(), new Person()), false);
});

test("computed cycles and exceptions do not leak capture state", () => {
  class Broken extends ReactiveObject {}
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
  class Parent extends ReactiveObject {
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
  class Valid extends ReactiveObject {}
  class Invalid extends ReactiveObject {}
  assert.throws(() => Runtime.install({classes: {
    "Test::Valid": {constructor: Valid},
    "Test::Invalid": {constructor: Invalid, mixins: [() => {}]}
  }}), /Unknown mixin/);
  assert.throws(() => Runtime.resolve("Test::Valid"), /Unknown class/);
  assert.throws(() => Runtime.install({classes: {"Test::Missing": {}}}), /Missing constructor/);
});
