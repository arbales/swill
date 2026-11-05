import {test} from "node:test";
import assert from "node:assert/strict";
import {removeBrowserProfile} from "./browser_profile.mjs";

test("profile cleanup retries only transient filesystem errors", async () => {
  let attempts = 0;
  const delays = [];
  await removeBrowserProfile("profile", async (path, options) => {
    assert.equal(path, "profile");
    assert.deepEqual(options, {recursive: true, force: true});
    if (attempts++ < 2) throw Object.assign(new Error("busy"), {code: "ENOTEMPTY"});
  }, async delay => { delays.push(delay); });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("profile cleanup preserves unrelated errors and bounds persistent retries", async () => {
  for (const [code, expected] of [["EIO", 1], ["ENOTEMPTY", 6]]) {
    let attempts = 0;
    const error = Object.assign(new Error(code), {code});
    await assert.rejects(removeBrowserProfile("profile", async () => {
      attempts++;
      throw error;
    }, async () => {}), failure => failure === error);
    assert.equal(attempts, expected);
  }
});
