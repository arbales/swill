// Isolate controller bookkeeping from network and model decoding costs.
import {performance} from "node:perf_hooks";
import {Swill__ArrayController as ArrayController} from "../build/framework.mjs";
import {Runtime} from "../rb/runtime/runtime.mjs";

const rows = Array.from({length: 50}, (_, id) => ({id: String(id), name: `Row ${50 - id}`}));
const reverse = [...rows].reverse();
const direct = new ArrayController(), fetched = new ArrayController();
for (const controller of [direct, fetched]) controller.sort("name", "ascending");
let current = rows;
await fetched.fetch(Runtime.blockArgument(() => current));

async function measure(label, operation) {
  const samples = [];
  for (let sample = 0; sample < 9; sample++) {
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      current = i % 2 ? rows : reverse;
      await operation();
    }
    samples.push((performance.now() - start) * 1000 / 5000);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label}: ${samples[4].toFixed(2)} µs/op`);
}
await measure("assign and arrange 50 rows", () => {
  direct.content = current;
  direct.arrangedObjects;
});
await measure("fetch and arrange 50 rows", async () => {
  await fetched.fetch();
  fetched.arrangedObjects;
});
direct.dealloc(); fetched.dealloc();
