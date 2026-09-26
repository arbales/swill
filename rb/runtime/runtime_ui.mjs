// Browser runtime surface used by generated and framework code, without the
// remote data client. runtime.mjs is this plus remote data.
import {
  install,
  include,
  installClass,
  inheritableRegistry,
  classSetting,
  classWithSetting,
  identityStore,
  resolve,
  nameOf
} from "./install.mjs";
import {observe, retain, release, dealloc, disconnect} from "./properties.mjs";
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

export const Runtime = {
  // Classes
  install, include, installClass,
  inheritableRegistry, classSetting, classWithSetting, identityStore, resolve, nameOf,

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
  observe, observePath, retain, release, dealloc, disconnect,

  // Declarations
  restorations, outlets,

  // Ruby complex calls
  keywordArguments, blockArgument, omittedArgument, isOmittedArgument,
  bindArguments, argument, yieldBlock,

  // Invalid URL input is reported, not raised.
  warn(message) {
    console.warn(`[Swill] ${message}`);
  }
};
