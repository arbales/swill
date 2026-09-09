import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bundleEnvironment} from "./load_bundles.mjs";

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
