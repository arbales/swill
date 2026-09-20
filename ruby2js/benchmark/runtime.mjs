import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import vm from "node:vm";
import {Runtime} from "../lib/swill/runtime.mjs";

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

const bundle = readFileSync(new URL("../dist/swill.js", import.meta.url), "utf8");
const evaluations = [];
for (let sample = 0; sample < 5; sample += 1) {
  const context = vm.createContext({console, URLSearchParams});
  const started = performance.now();
  vm.runInContext(bundle, context, {filename: "swill.js"});
  evaluations.push(performance.now() - started);
}
console.log(`fresh swill.js evaluation: ${median(evaluations).toFixed(2)} ms median (${evaluations.length} samples)`);
