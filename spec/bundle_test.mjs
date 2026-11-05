import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bundleEnvironment} from "./load_bundles.mjs";
import {Browser, element} from "./dom.mjs";

const minified = process.env.MINIFIED === "1";

test("in_development checks are in a development build and left out of an optimized one", () => {
  const source = readFileSync(new URL(`../rb/dist/swill${minified ? ".min" : ""}.js`, import.meta.url), "utf8");
  const checks = source.match(/\.isDevelopment\(\)/g) ?? [];
  if (minified) assert.equal(checks.length, 0, "the bundler drops every in_development block");
  else assert.ok(checks.length > 0, "the framework's own checks are there");
  const Swill = bundleEnvironment({minified}).load("swill");
  assert.equal(typeof Swill.Runtime.sourceMappedOrigin, minified ? "undefined" : "function");
  if (minified) assert.ok(!source.includes("Invalid development source map"), "optimized bundles omit the map decoder");
});

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
  assert.deepEqual(Object.keys(environment.context).filter(key => !["console", "URLSearchParams", "Event"].includes(key)), ["Swill"]);
  const controller = new (Runtime.resolve("Demo::Controller"))();
  const person = new (Runtime.resolve("Demo::SpecialPerson"))();
  assert.ok(person instanceof Base);
  assert.ok(person instanceof Runtime.resolve("Swill::Object"));
  assert.equal(Runtime.invoke(person, "rename", " Ada "), "[<Ada>]");
  const materialized = Runtime.resolve("Demo::SpecialPerson").fromAttributes({name: "Grace", job: " lead "});
  assert.ok(materialized instanceof Base);
  assert.deepEqual([materialized.name, materialized.role], ["Grace", "lead"], "from_attributes applies through validation");
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
  const map = JSON.parse(readFileSync(new URL(`../rb/dist/app${suffix}.js.map`, import.meta.url)));
  assert.ok(map.sources.some(source => source.endsWith("application.meta.mjs")));
  assert.ok(map.sources.some(source => source.endsWith("framework.external.mjs")));
  assert.ok(!map.sources.some(source => source.endsWith("runtime.mjs") || source.includes("/runtime/")));
  assert.ok(!map.sources.some(source => source.endsWith("framework.classes.mjs")));
  assert.ok(map.sources.some(source => source.endsWith("/examples/rb/models.rb")));
  if (minified) assert.equal(map.sourcesContent, undefined);
  else assert.equal(map.sources.length, map.sourcesContent.length);
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

test("JavaScript classes reach every method, hook their own changes, and restore their properties", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const changes = [];
  class Counter extends Swill.Controller {
    static properties = {count: {default: 0}, label: {default: "clicks"}, expanded: {default: false}};
    static restorable = {count: "n", label: "label", expanded: "open"};
    increment() { this.count += 1; }
    addMany(sender, event, extra) { this.count += extra ?? 10; }
    countDidChange(previous, value) { changes.push([previous, value]); }
  }
  Swill.register("Demo.Counter", Counter);
  assert.equal(Swill.Runtime.resolve("Demo::Counter"), Counter, "a dotted name is a namespace");
  assert.equal(Swill.Runtime.resolve("Demo.Counter"), Counter, "and markup may write it with dots");
  assert.equal(Swill.Runtime.resolve("Swill.List"), Swill.List, "markup may name a framework class as JavaScript does");
  assert.equal(Swill.Runtime.resolve("Swill.Controller.List"), Swill.List);
  const counter = new Counter();
  Swill.Runtime.performAction(counter, "increment", null, null);
  assert.equal(counter.count, 1, "a method markup sends needs no static actions");
  Swill.Runtime.invoke(counter, "addMany", null, null, 5);
  assert.equal(counter.count, 6, "nor one a path invokes");
  assert.deepEqual(changes, [[0, 1], [1, 6]], "countDidChange is count's change hook");
  assert.equal(JSON.stringify(Swill.Runtime.restorations(counter).map(item => [item.path, item.key, item.type])),
    JSON.stringify([["count", "n", "Integer"], ["label", "label", "String"], ["expanded", "open", "T::Boolean"]]),
    "a restorable value is typed by its property's default");
});

test("a page with JavaScript classes may spell framework names in JavaScript", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const seen = [];
  class Roster extends Swill.List {
    makeRowElement(item) {
      const row = element("li", {});
      row.textContent = item.name;
      return row;
    }
  }
  Swill.register(Roster);
  class Page extends Swill.Controller {
    static outlets = {roster: {}};
  }
  Swill.register(Page);
  const list = element("ul", {controller: "Roster", outlet: "roster"});
  const chosen = element("p", {bind: "roster.selectedObject.name"});
  const empty = element("p", {"bind-hidden": "roster.selectedObject.nil?"});
  const main = element("main", {controller: "Page"}, [list, chosen, empty]);
  const body = element("body", {}, [main]);
  const document = element("#document", {}, [body]);
  document.defaultView = new Browser();
  const application = Swill.start({root: body});
  const [page, roster] = application.controllers;
  roster.observe("selectedObjects", value => seen.push(value.length));
  roster.representedObject = [{name: "Ada"}, {name: "Grace"}];
  assert.equal(empty.hidden, true);
  list.children[1].click();
  assert.equal(chosen.textContent, "Grace", "selectedObject is selected_object, and bindings follow it");
  assert.equal(empty.hidden, false);
  assert.deepEqual(seen, [1], "observing the JavaScript spelling observes the property");
  assert.equal(Swill.Runtime.read(roster, "selectedObject").name, "Grace");
  assert.equal(Swill.Runtime.read(roster, "selected_object").name, "Grace", "the Ruby spelling still answers");
  assert.equal(page.roster, roster);
  application.terminate();
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
      this.status.element.title = "Ready";
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
  assert.equal(Swill.Application.shared(), application);
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
  assert.equal(application.development, false, "development is opted into");
  application.terminate();
  assert.equal(Swill.Application.isRunning(), false);
  const developing = Swill.start({root: element("body"), development: true});
  assert.equal(developing.development, true, "Swill.start takes development");
  developing.terminate();
  assert.deepEqual(lifecycle.slice(-2), ["applicationWillTerminate", "viewDidDisappear"]);
});

test("a failed build is shown in the page instead of launching", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const errors = [];
  const original = console.error;
  console.error = message => errors.push(message);
  try {
    // What swill build --show-errors writes in place of app.js.
    Swill.Runtime.reportBuildFailure("app/application.rb:7: uninitialized constant Movies::StatusField");
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, ["[Swill] The application failed to build: app/application.rb:7: uninitialized constant Movies::StatusField"]);
  const body = element("body", {application: "Movies::Application"});
  const document = element("#document", {}, [body]);
  document.head = element("head");
  document.readyState = "complete";
  document.defaultView = new Browser();
  assert.equal(new Swill.Swill__Launcher().launch(document), null, "no application launches");
  assert.equal(Swill.Application.isRunning(), false);
  const dialog = body.children[0];
  assert.equal(dialog.tagName, "DIALOG");
  assert.equal(dialog.open, true);
  const [icon, text] = dialog.children;
  assert.equal(icon.getAttribute("src"), "resources/swill/Stop.png");
  assert.deepEqual([text.children[0].textContent, text.children[1].textContent],
    ["The application failed to build", "app/application.rb:7: uninitialized constant Movies::StatusField"]);
  assert.equal(dialog.querySelector(".actions"), null, "nothing to dismiss: the fix is in the source");
});

test("JavaScript lists extend Swill.List and override row hooks in camel case", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const seen = [];
  class Roster extends Swill.List {
    makeRowElement(item) {
      const row = element("li", {});
      row.textContent = item.name;
      return row;
    }
    configureRow(row, item) { row.setAttribute("data-name", item.name); }
    selectedObjectDidChange(_previous, object) { seen.push(object?.name ?? null); }
  }
  Swill.register(Roster);
  const list = element("ul", {controller: "Roster"});
  const body = element("body", {}, [list]);
  const document = element("#document", {}, [body]);
  document.defaultView = new Browser();
  const application = Swill.start({root: body});
  const [controller] = application.controllers;
  assert.ok(controller instanceof Swill.List);
  controller.representedObject = [{name: "Ada"}, {name: "Grace"}];
  assert.deepEqual(list.children.map(row => [row.textContent, row.getAttribute("data-name")]), [["Ada", "Ada"], ["Grace", "Grace"]]);
  list.children[1].click();
  assert.deepEqual(seen, ["Grace"]);
  assert.equal(controller.selectedObject.name, "Grace");
  assert.equal(controller.selectedObjectId, null, "plain objects carry no id");
  application.terminate();
  assert.equal(list.children.length, 0);
});

test("the UI build carries the UI framework without models or remote data", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill-ui");
  for (const name of ["Controller", "Application", "View", "List", "Control", "NotificationCenter", "ValueTransformer"]) {
    assert.equal(typeof Swill[name], "function", `${name} is present`);
  }
  for (const name of ["Model", "Wire", "TextField", "Select", "CustomSelect", "SortableList", "Editor", "EditableList"]) {
    assert.equal(name in Swill, false, `${name} is absent rather than undefined`);
  }
  assert.equal(Swill.Runtime.configureData, undefined, "no remote data client");
  assert.throws(() => Swill.Runtime.resolve("Swill::Model::Base"), /Unknown class/);
});

test("a plain JavaScript application filters a bound list on the UI build", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill-ui");
  const entries = [{name: "Swill::Application"}, {name: "Swill::Binding"}, {name: "Swill::Controller"}];
  class Finder extends Swill.Controller {
    static properties = {query: {default: ""}};
    get matches() {
      const query = this.query.toLowerCase();
      return entries.filter(entry => entry.name.toLowerCase().includes(query));
    }
  }
  Swill.register(Finder);
  const search = element("input", {bind: "query"});
  const template = element("template", {for: "row"}, [element("li", {bind: "name"})]);
  const results = element("ul", {controller: "Swill::Controller::List", bind: "matches"}, [template]);
  const main = element("main", {controller: "Finder"}, [search, results]);
  const body = element("body", {}, [main]);
  const document = element("#document", {}, [body]);
  document.defaultView = new Browser();
  const application = Swill.start({root: body});
  const rows = () => results.children.filter(child => child.tagName !== "TEMPLATE").map(row => row.textContent);
  assert.deepEqual(rows(), ["Swill::Application", "Swill::Binding", "Swill::Controller"]);
  search.value = "bind";
  search.dispatchEvent(new Event("input", {bubbles: true}));
  assert.deepEqual(rows(), ["Swill::Binding"], "the list follows the computed filter");
  application.terminate();
});

test("plain JavaScript extends the object, transformer, and model roots", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const {Runtime} = Swill;
  for (const name of ["Object", "Button", "ValueTransformer"]) assert.equal(typeof Swill[name], "function", name);
  assert.equal(typeof Swill.Distant.Client.configure, "function");

  class Contact extends Swill.Object {
    static properties = {first: {default: "Ada"}, last: {default: "Lovelace"}};
    get name() { return `${this.first} ${this.last}`; }
  }
  Swill.register(Contact);
  const contact = new Contact();
  const names = [];
  contact.observe("name", value => names.push(value));
  contact.last = "Byron";
  assert.deepEqual(names, ["Ada Byron"]);

  class Shout extends Swill.ValueTransformer {
    transformedValue(value) { return String(value).toUpperCase(); }
  }
  Swill.register(Shout);
  Swill.ValueTransformer.register("shout", new Shout());
  assert.equal(Swill.ValueTransformer.named("shout").transformedValue("hi"), "HI");

  class Note extends Swill.Model.Base {
    static properties = {title: {default: ""}};
    get heading() { return this.title.toUpperCase(); }
  }
  Swill.register(Note);
  const note = new Note();
  note.title = "draft";
  assert.equal(Runtime.read(note, "heading"), "DRAFT");
  assert.ok(note instanceof Swill.Model.Base);

  class Primary extends Swill.Button {}
  Swill.register(Primary);
  assert.equal(Runtime.resolve("Primary"), Primary);
});

test("JavaScript attributes share model validation, wire keys, dirty tracking, and inheritance", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  let factories = 0;
  class Note extends Swill.Model.Resource {
    static attributes = {
      title: {default: "", type: "String", key: "name"},
      tags: {default: () => { factories++; return []; }, type: "T::Array[String]"},
      optional: {default: null}
    };
    static properties = {expanded: {default: false}};
    validateTitle(value, _previous) {
      if (value === "invalid") throw new Error("bad title");
      return value.trim();
    }
  }
  Swill.register(Note);
  Note.resourceType("notes");
  assert.equal(factories, 0, "registration never runs a default factory");
  const note = Note.fromAttributes({id: "1", name: " First ", tags: ["a"]});
  assert.equal(note.title, "First");
  assert.equal(note.isDirty, false, "materialization is clean");
  const changes = [];
  note.observe("title", value => changes.push(value));
  note.title = " Second ";
  note.expanded = true;
  assert.deepEqual(changes, ["Second"]);
  assert.equal(JSON.stringify(note.collectDirtyAttributes()), JSON.stringify({name: "Second"}));
  assert.deepEqual(JSON.parse(JSON.stringify(note.serialize(true))),
    {data: {type: "notes", id: "1", attributes: {name: "Second"}}});
  assert.throws(() => { note.title = "invalid"; }, /bad title/);
  assert.equal(note.title, "Second", "a failed validation leaves the previous value");
  note.title = "First";
  assert.equal(note.isDirty, false, "returning to the baseline is clean");
  const beforeNull = factories;
  note.applyAttributes({name: null, tags: null, optional: null});
  assert.equal(note.title, "", "a non-nilable type normalizes null to its default");
  assert.deepEqual(Array.from(note.tags), []);
  assert.equal(note.optional, null, "untyped attributes retain null");
  assert.equal(factories, beforeNull + 1, "null normalization uses a fresh factory value");
  const other = new Note();
  assert.notEqual(other.tags, note.tags);
  class SpecialNote extends Note {
    static attributes = {score: {default: 1}};
    validateTitle(value, _previous) { return value.toUpperCase(); }
  }
  Swill.register(SpecialNote);
  const special = SpecialNote.fromAttributes({name: "special", score: 5});
  assert.equal(special.title, "SPECIAL", "subclasses may override inherited validators");
  assert.equal(special.score, 5);
  assert.ok(SpecialNote.modelAttributes().id, "the framework's id is inherited");
  assert.ok(SpecialNote.modelAttributes().title);
  assert.equal(Note.modelAttributes().score, undefined, "a subclass never changes its parent's registry");
  assert.equal(Swill.Model.Base.modelAttributes().title, undefined);
  class WithoutDeclarations extends SpecialNote {}
  Swill.register(WithoutDeclarations);
  assert.equal(new WithoutDeclarations().score, 1, "inherited static fields are not redeclared");
});

test("JavaScript attribute declarations reject malformed and conflicting descriptors", () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  for (const [attributes, pattern] of [
    [[], /static attributes must be an object/],
    [{title: ""}, /must use a descriptor/],
    [{title: {}}, /missing default/],
    [{title: {default: []}}, /Mutable default/],
    [{title: {default: "", typo: true}}, /Unknown attribute title option/],
    [{title: {default: "", key: 1}}, /key and type must be non-empty strings/],
    [{title: {default: "", type: String}}, /key and type must be non-empty strings/]
  ]) {
    class Invalid extends Swill.Model.Base { static attributes = attributes; }
    assert.throws(() => Swill.register(Invalid), pattern);
  }
  class NotAModel extends Swill.Controller { static attributes = {title: {default: ""}}; }
  assert.throws(() => Swill.register(NotAModel), /requires a Swill.Model.Base subclass/);
  class Duplicate extends Swill.Model.Base {
    static attributes = {title: {default: ""}};
    static properties = {title: {default: ""}};
  }
  assert.throws(() => Swill.register(Duplicate), /Duplicate declaration: title/);
  class Computed extends Swill.Model.Base {
    static attributes = {title: {default: ""}};
    get title() { return ""; }
  }
  assert.throws(() => Swill.register(Computed), /Duplicate declaration: title/);
});

test("a page without a build registers its bundle, and starting waits for its templates", async () => {
  const environment = bundleEnvironment({minified});
  const Swill = environment.load("swill");
  const fetched = [];
  environment.context.fetch = async url => {
    fetched.push(url);
    return {ok: true, status: 200, text: async () => '<template name="row"><li></li></template>'};
  };
  const bundle = Swill.registerBundle("app", {base: "https://example.test/assets", manifest: ["Poster.png", "rows.html"]});
  assert.equal(Swill.Bundle.main(), bundle);
  assert.equal(Swill.Image.named("Poster").url, "https://example.test/assets/resources/app/Poster.png");
  assert.ok(Swill.Image.named("Warning"), "the framework's images are still found");
  assert.throws(() => Swill.registerBundle("app", {manifest: "Poster.png"}), /manifest must be an array/);

  const body = element("body", {});
  const document = element("#document", {}, [body]);
  document.defaultView = new Browser();
  const application = Swill.start({root: body});
  assert.equal(Swill.Application.isRunning(), false, "it launches once its templates arrive");
  assert.throws(() => Swill.start({root: body}), /already running/);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(Swill.Application.shared(), application);
  assert.deepEqual(fetched, ["https://example.test/assets/resources/app/rows.html"]);
  assert.match(bundle.loadedResourceWithExtension("rows", "html"), /name="row"/);
  application.terminate();
});
