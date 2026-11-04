// Compare a saved pre-change bundle with the current one without sharing globals.
import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";
import {performance} from "node:perf_hooks";
const context = createContext({console, URLSearchParams, Event, TextEncoder, TextDecoder, Blob});
runInContext(readFileSync(Deno.args[0] || new URL("../rb/dist/swill.js", import.meta.url), "utf8"), context);
const {Runtime, Distant} = context.Swill;
class Record extends Distant.Object {}
const names = ["title", "body", "year"];
Runtime.install({classes: {"Benchmark::EditRecord": {
  constructor: Record,
  properties: Object.fromEntries(names.flatMap(name => [
    [name, {type: "T.nilable(String)", attribute: true, key: name, willAccess: true, defaultValue: () => null}],
    [`${name}_loaded`, {defaultValue: () => false}],
    [`${name}_loading`, {defaultValue: () => false}],
    [`${name}_error`, {defaultValue: () => null}]
  ])),
  registries: {
    modelAttributes: Object.fromEntries(["id", ...names].map(name =>
      [name, {name, key: name, type: "T.nilable(String)", default: null}])),
    dataFields: Object.fromEntries(names.map(name => [name, {kind: "field"}]))
  },
  settings: [{js: "dataModelName", value: "Benchmark::EditRecord"}]
}}});
const client = Distant.Client.default();
const record = client.canonical("Benchmark::EditRecord", "1", 1);
for (const name of names) record.applyDataField(name, "Original", 1, false);
const refs = Array.from({length: 50}, () => ({$ref: ["Benchmark::EditRecord", "1"]}));
function measure(name, count, operation) {
  const samples = [];
  for (let sample = 0; sample < 9; sample++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) operation();
    samples.push((performance.now() - start) * 1e3 / count);
  }
  samples.sort((a, b) => a - b);
  console.log(`${name}: ${samples[4].toFixed(3)} µs/op`);
}
measure("decode 50 overlapping references", 20000, () => client.decodeValue(refs, 1));
measure("edit and restore one field", 20000, () => {
  record.title = "Edited";
  record.title = "Original";
});
measure("open and discard isolated editor (3 fields)", 5000, () => {
  if (record.context) {
    const editing = record.context().newEditingContext();
    editing.object(record).title = "Edited";
    editing.dealloc();
  } else {
    const draft = record.draft();
    draft.title = "Edited";
    draft.dealloc();
  }
});
