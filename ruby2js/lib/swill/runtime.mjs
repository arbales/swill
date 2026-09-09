// Browser-only support. No Ruby object model, prototype patches, or eval.
// Static declarations are installed by generated code; changing state lives
// in the modules under runtime/. This object is the surface generated code
// and framework Ruby call.
import {install, include, installClass, inheritableRegistry, classSetting, resolve} from "./runtime/install.mjs";
import {observe, dispose} from "./runtime/properties.mjs";
import {isTruthy, logicalAnd, logicalOr, isEqual, isBlank, isPresent, isEmpty, strip, upcase, downcase,
  valueRead, NIL_READERS, VALUE_READERS} from "./runtime/values.mjs";
import {read, segments, readPath, write, assertWritablePath, writePath, observePath, respondsTo, invoke,
  performAction} from "./runtime/paths.mjs";
import {isAttribute, validate_attribute, outlets, collect_attributes, apply_attributes} from "./runtime/attributes.mjs";

export const Runtime = {
  // installation and class configuration
  install, include, installClass, inheritableRegistry, classSetting, resolve,
  // values
  isTruthy, logicalAnd, logicalOr, isEqual, isBlank, isPresent, isEmpty, strip, upcase, downcase, valueRead,
  NIL_READERS, VALUE_READERS,
  // metadata-driven dispatch
  read, segments, readPath, write, assertWritablePath, writePath, respondsTo, invoke, performAction,
  // observation
  observe, observePath, dispose,
  // declarations
  isAttribute, validate_attribute, outlets, collect_attributes, apply_attributes
};
