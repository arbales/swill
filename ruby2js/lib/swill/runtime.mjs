// Browser runtime surface used by generated and framework code.
import {
  install,
  include,
  installClass,
  inheritableRegistry,
  classSetting,
  resolve
} from "./runtime/install.mjs";
import {observe, dispose} from "./runtime/properties.mjs";
import {
  isTruthy, logicalAnd, logicalOr, isEqual, duplicate,
  isBlank, isPresent, isEmpty,
  strip, upcase, downcase,
  valueRead, NIL_READERS, VALUE_READERS,
  decodeFragment, encodeFragment,
  length, stringify, toInteger, toFloat, capitalize, split, slice,
  sort, sortBy, minBy, maxBy, min, max, sum,
  uniq, compact, flatten, reverse, indexOf,
  append, prepend, difference, fetch, deleteKey,
  intDiv, modulo, between, clamp, compareValues
} from "./runtime/values.mjs";
import {
  read, segments, readPath,
  write, assertWritablePath, writePath,
  observePath, respondsTo, invoke, performAction
} from "./runtime/paths.mjs";
import {must, cast, absurd, conforms} from "./runtime/types.mjs";
import {
  isAttribute, validateAttribute,
  restorations, outlets,
  collectAttributes, applyAttributes
} from "./runtime/attributes.mjs";

export const Runtime = {
  // Classes
  install, include, installClass,
  inheritableRegistry, classSetting, resolve,

  // Values
  isTruthy, logicalAnd, logicalOr, isEqual, duplicate,
  isBlank, isPresent, isEmpty,
  strip, upcase, downcase, valueRead,
  decodeFragment, encodeFragment, NIL_READERS, VALUE_READERS,

  // Ruby core semantics
  length, stringify, toInteger, toFloat, capitalize, split, slice,
  sort, sortBy, minBy, maxBy, min, max, sum,
  uniq, compact, flatten, reverse, indexOf,
  append, prepend, difference, fetch, deleteKey,
  intDiv, modulo, between, clamp, compareValues,

  // Sorbet runtime operations
  must, cast, absurd, conforms,

  // Dispatch
  read, segments, readPath,
  write, assertWritablePath, writePath,
  respondsTo, invoke, performAction,

  // Observation
  observe, observePath, dispose,

  // Declarations
  isAttribute, validateAttribute, restorations, outlets, collectAttributes, applyAttributes,

  // Invalid URL input is reported, not raised.
  warn(message) {
    console.warn(`[Swill] ${message}`);
  }
};
