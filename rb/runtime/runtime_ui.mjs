/**
 * `Swill.Runtime`: what compiled code calls, and what the framework's own Ruby
 * reaches as `Runtime`. It installs classes, gives plain JavaScript values
 * Ruby's semantics, resolves names and key paths against installed
 * declarations, and carries observation.
 *
 * An application seldom calls it directly; plain JavaScript uses
 * `Swill.register` and the public classes instead. The UI build carries
 * everything here except the remote data functions.
 *
 * @module
 */
import {
  install,
  include,
  installClass,
  inheritableRegistry,
  classSetting,
  classWithSetting,
  identityStore,
  resolve,
  aliasInstalledJavaScriptNames,
  classIsA,
  nameOf
} from "./install.mjs";
import {observe, observed, retain, release, dealloc, disconnect} from "./properties.mjs";
import {
  isTruthy, logicalAnd, logicalOr, isEqual, duplicate, nilable,
  isBlank, isPresent, isEmpty,
  strip, upcase, downcase,
  valueRead, NIL_READERS, VALUE_READERS,
  length, stringify, toInteger, toFloat, capitalize, split, slice,
  sort, sortWith, sortBy, minBy, maxBy, min, max, sum,
  uniq, compact, flatten, reverse, indexOf,
  append, prepend, difference, fetch, deleteKey,
  intDiv, modulo, between, clamp, isNumber, isBoolean, compareText
} from "./values.mjs";
import {
  read, segments, readPath,
  write, assertWritablePath, writePath,
  observePath, respondsTo, methodAccepts, send, invoke, performAction
} from "./paths.mjs";
import {must, cast, absurd, conforms} from "./types.mjs";
import {
  restorations, outlets
} from "./attributes.mjs";
import {
  keywordArguments, blockArgument, omittedArgument, isOmittedArgument,
  bindArguments, argument, yieldBlock
} from "./arguments.mjs";

/**
 * Reports a problem that is not an error: input from outside the application,
 * such as a URL fragment naming content that does not exist, which the
 * application ignores rather than fails on.
 *
 * @param {string} message
 * @returns {void}
 */
export function warn(message) {
  console.warn(`[Swill] ${message}`);
  for (const observer of [...warningObservers]) observer(message);
}

const warningObservers = new Set();

let development = false;

/**
 * Whether the running application is in development. Code in an
 * `in_development` block runs only then; see doc/compiler.md.
 *
 * @returns {boolean}
 */
export function isDevelopment() {
  return development;
}

/**
 * Records whether the running application is in development. The
 * application sets it from its `development` property.
 *
 * @param {boolean} flag
 */
export function setDevelopment(flag) {
  development = flag === true;
}

let failedBuild = null;

/**
 * Records that the application's build failed, with the compiler's message.
 * A development build that fails to compile writes a script calling this in
 * place of the application, so the launcher shows the error rather than
 * starting an application whose classes are missing.
 *
 * @param {string} message
 * @returns {void}
 */
export function reportBuildFailure(message) {
  console.error(`[Swill] The application failed to build: ${message}`);
  failedBuild = String(message);
}

/**
 * The message of a build failure `reportBuildFailure` recorded, or null.
 *
 * @returns {string | null}
 */
export function buildFailure() {
  return failedBuild;
}

/**
 * Calls `callback` with each message `warn` reports, after it is logged, until
 * the returned function is called. A development application shows them.
 *
 * @param {(message: string) => void} callback
 * @returns {() => void} Stops observing.
 */
export function observeWarnings(callback) {
  warningObservers.add(callback);
  return () => { warningObservers.delete(callback); };
}

export const UIRuntime = {
  // Classes
  install, include, installClass,
  inheritableRegistry, classSetting, classWithSetting, identityStore, resolve, classIsA, nameOf,
  aliasInstalledJavaScriptNames,

  // Values
  isTruthy, logicalAnd, logicalOr, isEqual, duplicate, nilable,
  isBlank, isPresent, isEmpty,
  strip, upcase, downcase, valueRead,
  NIL_READERS, VALUE_READERS,

  // Ruby core semantics
  length, stringify, toInteger, toFloat, capitalize, split, slice,
  sort, sortWith, sortBy, minBy, maxBy, min, max, sum,
  uniq, compact, flatten, reverse, indexOf,
  append, prepend, difference, fetch, deleteKey,
  intDiv, modulo, between, clamp, isNumber, isBoolean, compareText,

  // Sorbet runtime operations
  must, cast, absurd, conforms,

  // Dispatch
  read, segments, readPath,
  write, assertWritablePath, writePath,
  respondsTo, methodAccepts, send, invoke, performAction,

  // Observation
  observe, observed, observePath, retain, release, dealloc, disconnect,

  // Declarations
  restorations, outlets,

  // Ruby complex calls
  keywordArguments, blockArgument, omittedArgument, isOmittedArgument,
  bindArguments, argument, yieldBlock,

  // Reporting
  warn, observeWarnings, reportBuildFailure, buildFailure, isDevelopment, setDevelopment
};

// Generated UI-only modules import Runtime; the full bundle extends this base.
export {UIRuntime as Runtime};
