import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bundleEnvironment} from "./load_bundles.mjs";
import {Browser, element} from "./dom.mjs";

const minified = process.env.MINIFIED === "1";

test("script loading installs both artifacts using a single runtime", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const {Runtime} = Swill;
  const Base = Runtime.resolve("Swill::Model::Base");
  assert.throws(() => Runtime.resolve("Demo::Person"), /Unknown class/);
  assert.equal(environment.load("app"), Swill);
  assert.equal(Runtime.resolve("Swill::Model::Base"), Base);
  assert.equal(Swill.Runtime, Runtime);
  assert.equal(Swill.Swill__Model__Base, Base);
  assert.deepEqual(Object.keys(environment.context).filter(key => !["console", "URLSearchParams"].includes(key)), ["Swill"]);
  const controller = new (Runtime.resolve("Demo::Controller"))();
  const person = new (Runtime.resolve("Demo::SpecialPerson"))();
  assert.ok(person instanceof Base);
  assert.ok(person instanceof Runtime.resolve("Swill::Object"));
  assert.equal(Runtime.invoke(person, "rename", " Ada "), "[<Ada>]");
  controller.person = person;
  const changes = [];
  const dispose = Runtime.observePath(controller, "title", value => changes.push(value));
  person.loud = true;
  assert.deepEqual(changes, ["Hello [<ADA>]"]);
  assert.equal(Runtime.readPath(person, "name.blank?"), false);
  assert.equal(Runtime.read(person, "role"), "editor");
  dispose();

  class Addon extends Base {}
  Swill.install({classes: {"Test::Addon": {constructor: Addon}}});
  assert.equal(Runtime.resolve("Test::Addon"), Addon);
});

test("application-first loading reports the required script order", () => {
  const environment = bundleEnvironment({minified});
  assert.throws(() => environment.load("app"), /Load swill.js before app.js/);
  assert.equal(environment.context.Swill, undefined);
});

test("loading a bundle twice cannot silently replace the registry", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  assert.throws(() => environment.load("swill"), /Framework already loaded/);
  assert.equal(environment.context.Swill, Swill);
  environment.load("app");
  const Person = Swill.Runtime.resolve("Demo::Person");
  assert.throws(() => environment.load("app"), /Duplicate class/);
  assert.equal(Swill.Runtime.resolve("Demo::Person"), Person);
});

test("the application contains neither the framework implementation nor another runtime", () => {
  const suffix = minified ? ".min" : "";
  const map = JSON.parse(readFileSync(new URL(`../dist/app${suffix}.js.map`, import.meta.url)));
  assert.ok(map.sources.some(source => source.endsWith("application.meta.mjs")));
  assert.ok(map.sources.some(source => source.endsWith("framework.external.mjs")));
  assert.ok(!map.sources.some(source => source.endsWith("runtime.mjs") || source.includes("/runtime/")));
  assert.ok(!map.sources.some(source => source.endsWith("framework.classes.mjs")));
  assert.equal(map.sources.length, map.sourcesContent.length);
});

test("plain JavaScript classes use the public registration surface", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  class Greeting extends Swill.Controller {
    static properties = {
      name: {default: "Ada"},
      items: {default: () => []}
    };
    static outlets = {field: {}, missing: {optional: true}};
    static actions = ["clearName"];
    get greeting() { return `Hello ${this.name}`; }
    clearName() { this.name = ""; }
  }
  assert.equal(Swill.register(Greeting), Greeting);
  assert.equal(Swill.Runtime.resolve("Greeting"), Greeting);
  const first = new Greeting();
  const second = new Greeting();
  assert.notEqual(first.items, second.items);
  assert.deepEqual(Array.from(Swill.Runtime.outlets(first), outlet => [outlet.name, outlet.optional]), [
    ["field", false], ["missing", true]
  ]);
  const changes = [];
  first.observe("greeting", value => changes.push(value));
  first.name = "Grace";
  Swill.Runtime.performAction(first, "clearName", null, null);
  assert.deepEqual(changes, ["Hello Grace", "Hello "]);

  class SpecializedGreeting extends Greeting {
    static properties = {suffix: {default: "!"}};
    get emphaticGreeting() { return `${this.greeting}${this.suffix}`; }
  }
  Swill.register("Greeting::Specialized", SpecializedGreeting);
  const specialized = new SpecializedGreeting();
  assert.equal(specialized.emphaticGreeting, "Hello Ada!");
});

test("JavaScript registration rejects ambiguous declarations", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  class MutableDefault extends Swill.Controller {
    static properties = {items: {default: []}};
  }
  assert.throws(() => Swill.register(MutableDefault), /Mutable default/);
  class GetterSetter extends Swill.Controller {
    get value() { return 1; }
    set value(_next) {}
  }
  assert.throws(() => Swill.register(GetterSetter), /cannot have a setter/);
  class MissingAction extends Swill.Controller {
    static actions = ["save"];
  }
  assert.throws(() => Swill.register(MissingAction), /Missing action method/);
  class WideAction extends Swill.Controller {
    static actions = ["save"];
    save(_sender, _event, _extra) {}
  }
  assert.throws(() => Swill.register(WideAction), /more than two arguments/);
  assert.throws(() => Swill.register(class extends Swill.Controller {}), /need a name/);
  class UnregisteredParent extends Swill.Controller {}
  class Child extends UnregisteredParent {}
  assert.throws(() => Swill.register(Child), /Register the parent class/);
  class Named extends Swill.Controller {}
  Swill.register("Fixed", Named);
  assert.throws(() => Swill.register("Again", Named), /already registered/);
  class DuplicateName extends Swill.Controller {}
  assert.throws(() => Swill.register("Fixed", DuplicateName), /Duplicate class/);
});

test("Swill.start manually launches and terminates a JavaScript application", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const lifecycle = [];
  class ManualController extends Swill.Controller {
    static properties = {name: {default: "Ada"}};
    static outlets = {status: {}};
    static actions = ["clearName"];
    get greeting() { return `Hello ${this.name}`; }
    viewDidLoad() { lifecycle.push("viewDidLoad"); }
    awakeFromDOM() {
      lifecycle.push("awakeFromDOM");
      this.status.element().title = "Ready";
    }
    controllerDidLoad() { lifecycle.push("controllerDidLoad"); }
    viewDidDisappear() { lifecycle.push("viewDidDisappear"); }
    clearName() { this.name = ""; }
  }
  class ManualApplication extends Swill.Application {
    static actions = ["resetAll"];
    applicationDidLaunch() { lifecycle.push("applicationDidLaunch"); }
    applicationWillTerminate() { lifecycle.push("applicationWillTerminate"); }
    resetAll(sender, event) { lifecycle.push([sender.tagName, event.type]); }
  }
  Swill.register(ManualController);
  Swill.register(ManualApplication);
  const input = element("input", {bind: "name"});
  const output = element("output", {bind: "greeting"});
  const button = element("button", {"data-action": "clearName"});
  const applicationButton = element("button", {"data-action": "resetAll"});
  const status = element("span", {outlet: "status"});
  const main = element("main", {controller: "ManualController"}, [input, output, button, applicationButton, status]);
  const body = element("body", {}, [main]);
  const document = element("#document", {}, [body]);
  document.defaultView = new Browser();
  const application = Swill.start({root: body, application: ManualApplication});
  assert.ok(application instanceof Swill.Application);
  assert.ok(application instanceof ManualApplication);
  assert.equal(body.__swill_application__, application);
  assert.deepEqual(lifecycle, ["viewDidLoad", "awakeFromDOM", "controllerDidLoad", "applicationDidLaunch"]);
  assert.equal(status.title, "Ready");
  assert.equal(output.textContent, "Hello Ada");
  input.value = "Grace";
  input.dispatchEvent(new Event("input", {bubbles: true}));
  assert.equal(output.textContent, "Hello Grace");
  button.click();
  assert.equal(output.textContent, "Hello ");
  applicationButton.click();
  assert.deepEqual(lifecycle.at(-1), ["BUTTON", "click"]);
  class LateController extends Swill.Controller {}
  Swill.register(LateController);
  assert.equal(Swill.Runtime.resolve("LateController"), LateController);
  assert.throws(() => Swill.start({root: body}), /already running/);
  application.terminate();
  assert.equal(body.__swill_application__, null);
  assert.deepEqual(lifecycle.slice(-2), ["applicationWillTerminate", "viewDidDisappear"]);
});
