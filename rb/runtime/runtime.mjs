// Browser runtime surface used by generated and framework code.
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
  decodeFragment, encodeFragment,
  length, stringify, toInteger, toFloat, capitalize, split, slice,
  sort, sortWith, sortBy, minBy, maxBy, min, max, sum,
  uniq, compact, flatten, reverse, indexOf,
  append, prepend, difference, fetch, deleteKey,
  intDiv, modulo, between, clamp, compareValues
} from "./values.mjs";
import {
  read, segments, readPath,
  write, assertWritablePath, writePath,
  observePath, respondsTo, invoke, performAction
} from "./paths.mjs";
import {must, cast, absurd, conforms} from "./types.mjs";
import {
  isAttribute, validateAttribute,
  restorations, outlets,
  collectAttributes, applyAttributes
} from "./attributes.mjs";
import {
  configureData, closeData, initializeDistantData, dataQuery, dataResolve, dataCommand,
  dataSave, dataDelete, dataDraft, applyDataDraft,
  dataFieldWillAccess, dataFieldLoaded, dataFieldLoading, dataFieldError, loadDataField
} from "./data_client.mjs";
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
  decodeFragment, encodeFragment, NIL_READERS, VALUE_READERS,

  // Ruby core semantics
  length, stringify, toInteger, toFloat, capitalize, split, slice,
  sort, sortWith, sortBy, minBy, maxBy, min, max, sum,
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
  observe, observePath, retain, release, dealloc, disconnect,

  // Declarations
  isAttribute, validateAttribute, restorations, outlets, collectAttributes, applyAttributes,

  // Remote data
  configureData, closeData, initializeDistantData, dataQuery, dataResolve, dataCommand,
  dataSave, dataDelete, dataDraft, applyDataDraft,
  dataFieldWillAccess, dataFieldLoaded, dataFieldLoading, dataFieldError, loadDataField,

  // Ruby complex calls
  keywordArguments, blockArgument, omittedArgument, isOmittedArgument,
  bindArguments, argument, yieldBlock,

  // Invalid URL input is reported, not raised.
  warn(message) {
    console.warn(`[Swill] ${message}`);
  }
};
