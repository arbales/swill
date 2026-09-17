import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";

// A fresh script-tag-like global per test, without Node's ESM cache or a DOM.
export function bundleEnvironment({minified = false} = {}) {
  // A script-tag-like global: only the browser intrinsics the runtime needs.
  const context = createContext({console, URLSearchParams, Event});
  const load = name => {
    const file = new URL(`../dist/${name}${minified ? ".min" : ""}.js`, import.meta.url);
    runInContext(readFileSync(file, "utf8"), context, {filename: file.pathname});
    return context.Swill;
  };
  return {context, load};
}

// The framework with the sandbox global alongside, so a test can install
// what a page would provide (a fetch).
export function loadBundles() {
  const environment = bundleEnvironment();
  environment.load("swill");
  return {...environment.load("app"), context: environment.context};
}
