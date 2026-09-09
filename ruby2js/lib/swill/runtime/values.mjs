// Ruby value semantics over plain JavaScript values: truthiness, equality,
// and the finite value readers that binding paths and compiled code share.

// JS trim also strips NBSP and other Unicode whitespace that Ruby String#strip
// retains. Static Ruby calls and string-path calls must use the same rule.
function stripString(value) {
  return value.replace(/^[\x00\t\n\v\f\r ]+|[\x00\t\n\v\f\r ]+$/g, "");
}

export function isTruthy(value) {
  return value !== false && value !== null && value !== undefined;
}

export function logicalAnd(left, right) {
  return isTruthy(left) ? right() : left;
}

export function logicalOr(left, right) {
  return isTruthy(left) ? left : right();
}

// Spike contract: scalar values and acyclic arrays have Ruby value equality;
// framework objects retain identity. General Hash/custom == is not implemented.
export function isEqual(left, right) {
  if (left === right) return true;
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => isEqual(value, right[index]));
}

export function isBlank(value) {
  if (value == null || value === false) return true;
  if (typeof value === "string") return stripString(value).length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function isPresent(value) {
  return !isBlank(value);
}

export function isEmpty(value) {
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  throw new TypeError("empty? requires a string or array");
}

export function strip(value) {
  if (typeof value !== "string") throw new TypeError("strip requires a string");
  return stripString(value);
}

export function upcase(value) {
  if (typeof value !== "string") throw new TypeError("upcase requires a string");
  return value.toUpperCase();
}

export function downcase(value) {
  if (typeof value !== "string") throw new TypeError("downcase requires a string");
  return value.toLowerCase();
}

export function valueRead(value, name) {
  switch (name) {
    case "nil?": return value == null;
    case "blank?": return isBlank(value);
    case "present?": return isPresent(value);
    case "empty?": return isEmpty(value);
    case "strip": return strip(value);
    case "upcase": return upcase(value);
    case "downcase": return downcase(value);
    default: throw new Error(`Unknown value reader: ${name}`);
  }
}

// URL fragment values are strings. A declared leaf type decodes integers
// and booleans; anything else stays a string. Undefined means "not a value
// of that type", and the caller ignores it.
export function decodeFragment(type, text) {
  const inner = (type ?? "").replace(/^T\.nilable\((.+)\)$/, "$1");
  switch (inner) {
    case "Integer": {
      const number = Number.parseInt(text, 10);
      return Number.isNaN(number) ? undefined : number;
    }
    case "T::Boolean":
      if (text === "true" || text === "1") return true;
      if (text === "false" || text === "0") return false;
      return undefined;
    default:
      return text;
  }
}

// nil and "" leave the fragment; everything else is written as text.
export function encodeFragment(value) {
  return value == null || value === "" ? null : String(value);
}

// Readers defined for nil itself; any other reader on a nil intermediate
// yields nil, so partially built paths render as empty.
export const NIL_READERS = ["nil?", "blank?", "present?"];
export const VALUE_READERS = ["nil?", "blank?", "present?", "empty?", "strip", "upcase", "downcase"];
