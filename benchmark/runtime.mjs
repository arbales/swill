import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import vm from "node:vm";
import {Runtime} from "../rb/runtime/runtime.mjs";
import {pack, unpack} from "../rb/runtime/message_pack.mjs";

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

const bundle = readFileSync(new URL("../rb/dist/swill.js", import.meta.url), "utf8");
const evaluations = [];
for (let sample = 0; sample < 5; sample += 1) {
  const context = vm.createContext({console, URLSearchParams, TextEncoder, TextDecoder});
  const started = performance.now();
  vm.runInContext(bundle, context, {filename: "swill.js"});
  evaluations.push(performance.now() - started);
}
console.log(`fresh swill.js evaluation: ${median(evaluations).toFixed(2)} ms median (${evaluations.length} samples)`);
