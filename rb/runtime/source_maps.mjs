// Development-only source-map lookup at the browser boundary. The reporter
// retains the original detail while this resolves; it must never hide an error.
const caches = /* @__PURE__ */ new WeakMap();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const capacity = 16;

function vlq(segment) {
  const values = [];
  let value = 0, shift = 0;
  for (const character of segment) {
    const digit = alphabet.indexOf(character);
    if (digit < 0 || shift > 45) throw new Error("Invalid development source map");
    value += (digit & 31) * 2 ** shift;
    if (digit & 32) shift += 5;
    else {
      values.push(value % 2 ? -Math.floor(value / 2) : value / 2);
      value = shift = 0;
    }
  }
  if (shift || ![1, 4, 5].includes(values.length)) throw new Error("Invalid development source map");
  return values;
}

function originalPosition(map, row, column) {
  if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== "string" || map.sections) return null;
  const lines = map.mappings.split(";");
  if (row >= lines.length) return null;
  const state = [0, 0, 0, 0]; // source, original row, original column, name
  let found = null;
  for (let line = 0; line <= row; line++) {
    let generatedColumn = 0;
    if (!lines[line]) continue;
    for (const segment of lines[line].split(",")) {
      const values = vlq(segment);
      if (values[0] < 0) return null;
      generatedColumn += values[0];
      if (line === row && generatedColumn > column) break;
      for (let index = 1; index < values.length; index++) state[index - 1] += values[index];
      if (line === row) found = values.length === 1 ? null : state.slice(0, 3);
    }
  }
  if (!found || found.some(value => !Number.isSafeInteger(value) || value < 0)) return null;
  const source = map.sources[found[0]];
  return typeof source === "string" ? {source, row: found[1], column: found[2]} : null;
}

function linkedMap(script, headers) {
  const header = headers?.get("SourceMap") || headers?.get("X-SourceMap");
  if (header) return header;
  const pattern = /^[ \t]*(?:\/\/[#@][ \t]*sourceMappingURL[ \t]*=[ \t]*(\S+)|\/\*[#@][ \t]*sourceMappingURL[ \t]*=[ \t]*([^\s*]+)[ \t]*\*\/)[ \t]*\r?$/gm;
  let url = null;
  for (const match of script.matchAll(pattern)) url = match[1] || match[2];
  return url;
}

async function loadMap(scriptURL, browser, URLClass, origin, timeout) {
  const controller = new browser.AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await browser.fetch(scriptURL.href, {signal: controller.signal, credentials: "same-origin", redirect: "error"});
        if (!response.ok) throw new Error("Script unavailable");
        const reference = linkedMap(await response.text(), response.headers);
        if (!reference) return null;
        const url = new URLClass(reference, response.url || scriptURL.href);
        if (!/^https?:$/.test(url.protocol) || url.origin !== origin) return null;
        const mapped = await browser.fetch(url.href, {signal: controller.signal, credentials: "same-origin", redirect: "error"});
        if (!mapped.ok) throw new Error("Source map unavailable");
        return {map: JSON.parse(await mapped.text()), url: mapped.url || url.href};
      })(),
      new Promise((_, reject) => {
        timer = browser.setTimeout(() => {
          controller.abort();
          reject(new Error("Source map lookup timed out"));
        }, timeout);
      })
    ]);
  } finally {
    browser.clearTimeout(timer);
  }
}

/**
 * Resolves a normalized first stack frame to Ruby, or returns it unchanged.
 * Only same-origin HTTP(S) scripts and linked external maps are fetched.
 * Requests share a bounded per-window cache and have a total time limit.
 *
 * @param {string} detail The reporter's `at fn (url:line:column)` detail.
 * @param {Window | null} browser The reporter's window.
 * @param {number} [timeout] Total lookup time in milliseconds.
 * @returns {Promise<string>} A mapped frame, or the original detail.
 * @ignore
 */
export async function sourceMappedOrigin(detail, browser, timeout = 1500) {
  try {
    const frame = /^(at (?:.* \()?)(https?:\/\/.*):(\d+):(\d+)(\)?)$/.exec(detail);
    if (!frame || typeof browser?.fetch !== "function" || !browser.location?.href) return detail;
    const URLClass = browser.URL;
    const page = new URLClass(browser.location.href);
    const script = new URLClass(frame[2], page);
    if (script.origin !== page.origin || !/^https?:$/.test(script.protocol)) return detail;
    const row = Number(frame[3]) - 1, column = Number(frame[4]) - 1;
    if (!Number.isSafeInteger(row) || row < 0 || !Number.isSafeInteger(column) || column < 0) return detail;
    let cache = caches.get(browser);
    if (!cache) caches.set(browser, cache = new Map());
    let pending = cache.get(script.href);
    if (!pending) {
      pending = loadMap(script, browser, URLClass, page.origin, timeout);
      cache.set(script.href, pending);
      if (cache.size > capacity) cache.delete(cache.keys().next().value);
      pending.catch(() => { if (cache.get(script.href) === pending) cache.delete(script.href); });
    }
    const loaded = await pending;
    if (!loaded) return detail;
    const position = originalPosition(loaded.map, row, column);
    if (!position) return detail;
    const root = loaded.map.sourceRoot;
    if (root !== undefined && typeof root !== "string") return detail;
    const base = root ? new URLClass(root.endsWith("/") ? root : `${root}/`, loaded.url) : loaded.url;
    const source = new URLClass(position.source, base);
    if (source.origin !== page.origin || !source.pathname.endsWith(".rb")) return detail;
    return `${frame[1]}${source.href}:${position.row + 1}:${position.column + 1}${frame[5]}`;
  } catch {
    return detail;
  }
}
