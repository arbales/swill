import {test} from "node:test";
import assert from "node:assert/strict";
import {sourceMappedOrigin} from "../rb/runtime/source_maps.mjs";

const scriptURL = "http://example.test/assets/app.js";
const mapURL = `${scriptURL}.map`;
const detail = `at Hello.explode (${scriptURL}:3:5)`;
const mapped = "at Hello.explode (http://example.test/client/hello.rb:12:6)";
const payload = (overrides = {}) => ({
  version: 3, sources: ["../client/hello.rb"], names: [], mappings: ";;IAWK", ...overrides
});

function fixture(map = payload()) {
  const responses = new Map([
    [scriptURL, {body: "// code\n//# sourceMappingURL=app.js.map\n"}],
    [mapURL, {body: JSON.stringify(map)}]
  ]);
  const requests = [];
  const browser = {
    location: {href: "http://example.test/index.html"},
    URL, AbortController, setTimeout, clearTimeout,
    async fetch(url, options) {
      requests.push({url, options});
      const response = responses.get(url);
      if (typeof response === "function") return response(options);
      if (response instanceof Error) throw response;
      return {
        ok: response !== undefined && response.status !== 404,
        url: response?.url || url,
        headers: new Headers(response?.headers),
        text: async () => response?.body || ""
      };
    }
  };
  return {browser, responses, requests};
}

test("development frames resolve to Ruby with one-based positions and preserved function names", async () => {
  const f = fixture();
  assert.equal(await sourceMappedOrigin(detail, f.browser), mapped);
  assert.deepEqual(f.requests.map(request => request.url), [scriptURL, mapURL]);
  assert.ok(f.requests.every(request => request.options.redirect === "error" && request.options.signal));
  assert.equal(await sourceMappedOrigin(`at ${scriptURL}:3:6`, f.browser),
    "at http://example.test/client/hello.rb:12:6", "anonymous frames and greatest-lower-bound columns");
});

test("concurrent lookups share the script and map while different windows do not share caches", async () => {
  const f = fixture();
  assert.deepEqual(await Promise.all([sourceMappedOrigin(detail, f.browser), sourceMappedOrigin(detail, f.browser)]), [mapped, mapped]);
  assert.equal(f.requests.length, 2);
  const other = fixture();
  assert.equal(await sourceMappedOrigin(detail, other.browser), mapped);
  assert.equal(other.requests.length, 2);
});

test("the script cache is bounded", async () => {
  const f = fixture();
  for (let index = 0; index < 17; index++) {
    const url = `${scriptURL}?v=${index}`;
    f.responses.set(url, {body: "//# sourceMappingURL=app.js.map\n"});
    assert.equal(await sourceMappedOrigin(detail.replace(scriptURL, url), f.browser), mapped);
  }
  const before = f.requests.length;
  await sourceMappedOrigin(detail.replace(scriptURL, `${scriptURL}?v=0`), f.browser);
  assert.equal(f.requests.length, before + 2, "the oldest script's lookup was evicted");
});

test("sourceRoot, SourceMap headers, block pragmas, and CRLF scripts are supported", async () => {
  const f = fixture(payload({sources: ["hello.rb"], sourceRoot: "/client"}));
  f.responses.set(scriptURL, {body: "// no pragma", headers: {"SourceMap": "app.js.map"}});
  assert.equal(await sourceMappedOrigin(detail, f.browser), mapped);
  const block = fixture();
  block.responses.set(scriptURL, {body: "/*# sourceMappingURL=app.js.map */\r\n"});
  assert.equal(await sourceMappedOrigin(detail, block.browser), mapped);
  const crlf = fixture();
  crlf.responses.set(scriptURL, {body: "//# sourceMappingURL=app.js.map\r\n"});
  assert.equal(await sourceMappedOrigin(detail, crlf.browser), mapped);
});

test("missing, malformed, unsupported, and unmapped maps leave the original frame intact", async () => {
  for (const map of [
    null, {}, payload({version: 2}), payload({sections: []}),
    payload({mappings: ";;IAW"}), payload({mappings: ";;!"}),
    payload({mappings: ";;ggggggggggggA"}), payload({mappings: ";;IAWK,C"}),
    payload({mappings: ""}), payload({mappings: ";;KAWK"}),
    payload({sources: []}), payload({sources: [17]}),
    payload({sources: ["../client/hello.js"]}),
    payload({sources: ["https://other.test/hello.rb"]}),
    payload({sourceRoot: 42}), payload({mappings: ";;IDWK"})
  ]) {
    const f = fixture(map);
    const frame = map?.mappings === ";;IAWK,C" ? detail.replace(":3:5", ":3:6") : detail;
    assert.equal(await sourceMappedOrigin(frame, f.browser), frame, JSON.stringify(map));
  }
  const invalidJSON = fixture();
  invalidJSON.responses.set(mapURL, {body: "{broken"});
  assert.equal(await sourceMappedOrigin(detail, invalidJSON.browser), detail);
});

test("unusable and external frames do not fetch, and external map URLs are not requested", async () => {
  const f = fixture();
  for (const frame of [
    "", "at native", "at file:///private/app.js:3:5", "at https://other.test/app.js:3:5",
    detail.replace(":3:5", ":0:5"), detail.replace(":3:5", ":3:0")
  ]) assert.equal(await sourceMappedOrigin(frame, f.browser), frame);
  assert.equal(f.requests.length, 0);
  f.responses.set(scriptURL, {body: "//# sourceMappingURL=https://other.test/app.js.map\n"});
  assert.equal(await sourceMappedOrigin(detail, f.browser), detail);
  assert.deepEqual(f.requests.map(request => request.url), [scriptURL]);
});

test("a script without a linked map never guesses a map URL", async () => {
  const f = fixture();
  f.responses.set(scriptURL, {body: "// no source map"});
  assert.equal(await sourceMappedOrigin(detail, f.browser), detail);
  assert.deepEqual(f.requests.map(request => request.url), [scriptURL]);
});

test("network and HTTP failures fall back and can be retried", async () => {
  for (const url of [scriptURL, mapURL]) {
    const f = fixture();
    const good = f.responses.get(url);
    f.responses.set(url, new Error("offline"));
    assert.equal(await sourceMappedOrigin(detail, f.browser), detail);
    f.responses.set(url, {status: 404});
    assert.equal(await sourceMappedOrigin(detail, f.browser), detail);
    f.responses.set(url, good);
    assert.equal(await sourceMappedOrigin(detail, f.browser), mapped);
  }
});

test("a hung request times out even when fetch ignores abort", async () => {
  const f = fixture();
  f.responses.set(scriptURL, () => new Promise(() => {}));
  assert.equal(await sourceMappedOrigin(detail, f.browser, 10), detail);
  assert.equal(f.requests[0].options.signal.aborted, true);
});
