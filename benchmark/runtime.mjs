import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import vm from "node:vm";
import {Runtime} from "../rb/runtime/runtime.mjs";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";
import {loadBundles} from "../spec/load_bundles.mjs";
import {element} from "../spec/dom.mjs";

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(name, iterations, operation, samples = 9) {
  let value = 0;
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) value += operation(index) ?? 0;
    timings.push((performance.now() - started) * 1e6 / iterations);
  }
  console.log(`${name}: ${median(timings).toFixed(2)} ns/op (${samples} samples)`);
  return value;
}

class GetterSubject {
  propertyWillAccess() {}
  coercePropertyValue(_name, value) { return value; }
  propertyWillChange() {}
}

Runtime.installClass(GetterSubject, "Benchmark::GetterSubject", [
  {name: "ordinary", js: "ordinary", defaultValue: () => 1},
  {name: "loaded", js: "loaded", defaultValue: () => 1, willAccess: true}
], []);

const subject = new GetterSubject();
measure("ordinary getter", 2_000_000, () => subject.ordinary);
measure("will_access getter", 2_000_000, () => subject.loaded);

function dispatchSubject(name, unrelated) {
  class Subject {
    target(sender, event) { return sender + event; }
  }
  const methods = [{name: "target", js: "target", arity: 2}];
  for (let index = 0; index < unrelated; index += 1) {
    const js = `method${index}`;
    Subject.prototype[js] = () => index;
    methods.push({name: js, js, arity: 0});
  }
  Runtime.installClass(Subject, name, [], methods);
  return new Subject();
}

const ten = dispatchSubject("Benchmark::TenMethods", 9);
const hundred = dispatchSubject("Benchmark::HundredMethods", 99);
measure("Runtime.invoke (100 methods)", 1_000_000, () => Runtime.invoke(hundred, "target", 1, 2));
measure("action (10 methods)", 1_000_000, () => Runtime.performAction(ten, "target", 1, 2));
measure("action (100 methods)", 1_000_000, () => Runtime.performAction(hundred, "target", 1, 2));

const complexSignature = {
  positional: [{name: "first", kind: "req"}, {name: "rest", kind: "rest"}],
  keywords: [{name: "limit", kind: "key"}], keywordRest: "options", block: "block"
};
const complexCall = [1, 2, 3, Runtime.keywordArguments({limit: 10, order: "newest"})];
measure("complex argument bind", 250_000, () => {
  const bound = Runtime.bindArguments(complexCall, complexSignature);
  return Runtime.argument(bound, "rest").length;
});
measure("keyword carrier", 1_000_000, () => Runtime.keywordArguments({limit: 10}).value.limit);

const envelope = {
  type: "RESULT", request_id: 42, generation: 91,
  value: [{"$ref": ["Post", "123"]}],
  patches: [{model: "Post", id: "123", generation: 91,
    fields: {title: "Distributed Objects", excerpt: null, published: true}}]
};
const encodedEnvelope = pack(envelope);
measure("MessagePack encode", 100_000, () => pack(envelope).length);
measure("MessagePack decode", 100_000, () => unpack(encodedEnvelope).generation);

const canonical = new Map([["Post:123", {id: "123"}]]);
measure("canonical Store lookup", 2_000_000, () => canonical.get("Post:123").id.length);

const members = new Map();
const merge = generation => {
  for (const [name, value] of Object.entries(envelope.patches[0].fields)) {
    const current = members.get(name);
    if (!current || generation >= current.generation) members.set(name, {generation, value});
  }
  return members.size;
};
measure("three-member patch merge", 250_000, index => merge(index));

const demands = new Set();
measure("demand coalescing", 1_000_000, index => {
  demands.add(`Post:${index % 20}:author`);
  if (demands.size === 20) demands.clear();
  return demands.size;
});

measure("in-memory protocol round trip", 50_000, () => unpack(pack(envelope)).request_id);

// Bindings, against the built framework rather than the runtime alone, because
// the cost that matters includes reading the markup. A list re-creates its rows
// wholesale on every render, so wiring is a hot path, not a one-off.
{
  const swill = loadBundles();
  const Framework = swill.Runtime;
  const FrameworkObject = Framework.resolve("Swill::Object");
  const Bindings = swill.Swill__Connections__Bindings;

  const DistantObject = Framework.resolve("Swill::Distant::Object");
  const DistantClient = Framework.resolve("Swill::Distant::Client");
  class Remote extends DistantObject {}
  Framework.install({classes: {"Benchmark::Remote": {
    constructor: Remote,
    properties: {
      title: {type: "String", attribute: true, key: "title", willAccess: true, defaultValue: () => ""},
      excerpt: {type: "T.nilable(String)", attribute: true, key: "excerpt", willAccess: true,
        defaultValue: () => null},
      ...Object.fromEntries(["title", "excerpt", "published"].flatMap(name => [
        [`${name}_loaded`, {type: "T::Boolean", defaultValue: () => false}],
        [`${name}_loading`, {type: "T::Boolean", defaultValue: () => false}],
        [`${name}_error`, {type: "T.nilable(String)", defaultValue: () => null}]
      ])),
      published: {type: "T::Boolean", attribute: true, key: "published", willAccess: true,
        defaultValue: () => false}
    },
    registries: {
      modelAttributes: {
        id: {name: "id", key: "id", type: "T.nilable(String)", default: null},
        title: {name: "title", key: "title", type: "String", default: ""},
        excerpt: {name: "excerpt", key: "excerpt", type: "T.nilable(String)", default: null},
        published: {name: "published", key: "published", type: "T::Boolean", default: false}
      },
      dataFields: {
        title: {kind: "field", type: "String"},
        excerpt: {kind: "field", type: "T.nilable(String)"},
        published: {kind: "field", type: "T::Boolean"}
      }
    },
    settings: [{js: "dataModelName", value: "Benchmark::Remote"}]
  }}});
  const distantClient = DistantClient.default();
  const remote = distantClient.canonical("Benchmark::Remote", "123", 1);
  const remotePatch = {model: "Benchmark::Remote", id: "123", generation: 1,
    fields: {title: "Distributed Objects", excerpt: null, published: true}};
  distantClient.applyPatch(remotePatch, null, true);

  measure("distant canonical lookup", 1_000_000,
    () => distantClient.canonical("Benchmark::Remote", "123", 1).id.length);
  measure("distant three-member patch", 100_000, index => {
    remotePatch.generation = index + 2;
    distantClient.applyPatch(remotePatch, null, true);
    return remote.title.length;
  });
  measure("distant loaded-state read", 1_000_000, () => remote.isFieldLoaded("title"));

  class Row extends FrameworkObject {}
  Framework.installClass(Row, "Benchmark::Row", [
    {name: "name", js: "name", defaultValue: () => ""},
    {name: "size", js: "size", defaultValue: () => 0},
    {name: "child", js: "child", defaultValue: () => null}
  ], []);

  class Child extends FrameworkObject {}
  Framework.installClass(Child, "Benchmark::Child", [
    {name: "label", js: "label", defaultValue: () => ""}
  ], []);

  const rowMarkup = () => element("div", {}, [
    element("span", {bind: "name"}),
    element("input", {bind: "name"}),
    element("b", {"bind-hidden": "size"})
  ]);

  // What a list pays per row on every render: wire the region, then release it.
  measure("binding wire+release (3 per row)", 20_000, () => {
    Bindings.establishIn(rowMarkup(), new Row())();
  });

  // Steady state: a write reaching a bound element. Values must alternate,
  // since writing an equal value never notifies.
  const live = new Row();
  Bindings.establishIn(rowMarkup(), live);
  measure("binding notify (1 hop)", 200_000, index => {
    live.name = index & 1 ? "a" : "b";
  });

  const nested = new Row();
  nested.child = new Child();
  const nestedElement = element("div", {}, [element("span", {bind: "child.label"})]);
  Bindings.establishIn(nestedElement, nested);
  measure("binding notify (2 hop)", 200_000, index => {
    nested.child.label = index & 1 ? "a" : "b";
  });

  // Swapping an intermediate re-subscribes the whole chain.
  const first = new Child();
  const second = new Child();
  measure("path re-subscribe (intermediate swap)", 100_000, index => {
    nested.child = index & 1 ? first : second;
  });

  measure("observePath establish+dispose", 200_000, () => {
    Framework.observePath(nested, "child.label", () => {})();
  });
}

const bundle = readFileSync(new URL("../rb/dist/swill.js", import.meta.url), "utf8");
const evaluations = [];
for (let sample = 0; sample < 5; sample += 1) {
  const context = vm.createContext({console, URLSearchParams, TextEncoder, TextDecoder});
  const started = performance.now();
  vm.runInContext(bundle, context, {filename: "swill.js"});
  evaluations.push(performance.now() - started);
}
console.log(`fresh swill.js evaluation: ${median(evaluations).toFixed(2)} ms median (${evaluations.length} samples)`);
