// Pass a compiled framework module to compare another implementation.
import {performance} from "node:perf_hooks";
const framework = await import(new URL(Deno.args[0] || "../build/framework.mjs", import.meta.url));
const List = framework.Swill__Controller__SortableList;
const {Runtime} = await import("../rb/runtime/runtime.mjs");
class Row extends framework.Swill__Object {}
Runtime.installClass(Row, "Benchmark::CollectionRow", [
  {name: "id", js: "id", defaultValue: () => ""},
  {name: "name", js: "name", defaultValue: () => ""}
], []);
const observable = Deno.args.includes("--observable");
const rows = Array.from({length: 1000}, (_, id) =>
  Object.assign(observable ? new Row() : {}, {id: String(id), name: `Row ${1000 - id}`}));
const list = new List();
list.representedObject = rows;
list.sort("name", "ascending");
list.selectObject(rows[500]);

function measure(label, count, operation) {
  const samples = [];
  for (let sample = 0; sample < 9; sample++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) operation(i);
    samples.push((performance.now() - start) * 1e6 / count);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label}: ${samples[4].toFixed(2)} ns/op`);
}

measure("arranged_objects (1000 sorted rows)", 1000, () => list.arrangedObjects);
measure("selected_indexes (1000 sorted rows)", 1000, () => list.selectedIndexes);
measure("selection change (1000 sorted rows)", 1000, i => list.selectObject(rows[i % rows.length]));
const reversed = [...rows].reverse();
measure("replace and arrange (1000 sorted rows)", 200, i => {
  list.representedObject = i % 2 ? rows : reversed;
  list.arrangedObjects;
});
list.dealloc();
