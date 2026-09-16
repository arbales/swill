// Ruby semantics for plain JavaScript values.

// Ruby strip retains Unicode whitespace.
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

// Arrays compare recursively; framework objects retain identity.
export function isEqual(left, right) {
  if (left === right) return true;

  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => isEqual(value, right[index]));
}

// Ruby hashes compile to plain objects. Checked by shape rather than against
// this realm's Object.prototype, so objects from another realm (a page's
// JSON, a test harness) count too.
export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

// Ruby dup for plain values: a new array or hash with the same members, a
// primitive itself. A framework object has observers and metadata state
// that a shallow copy would not carry; a model offers draft instead.
export function duplicate(value) {
  if (Array.isArray(value)) return value.slice();
  if (isPlainObject(value)) return {...value};
  if (value !== null && typeof value === "object") {
    throw new TypeError("dup of a framework object is not supported; use draft");
  }

  return value;
}

export function isBlank(value) {
  if (value == null || value === false) return true;
  if (typeof value === "string") return stripString(value).length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function isPresent(value) {
  return !isBlank(value);
}

export function isEmpty(value) {
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length === 0;
  }

  if (isPlainObject(value)) return Object.keys(value).length === 0;
  throw new TypeError("empty? requires a string, array, or hash");
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

export function length(value) {
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length;
  }

  if (isPlainObject(value)) return Object.keys(value).length;
  throw new TypeError("length requires a string, array, or hash");
}

// Ruby core methods that differ from JavaScript.

// nil.to_s is empty.
export function stringify(value) {
  return value == null ? "" : String(value);
}

// Parse the leading integer, or return zero.
export function toInteger(value) {
  const match = /^\s*[+-]?\d+/.exec(String(value));
  return match ? Number.parseInt(match[0], 10) : 0;
}

// Parse the leading decimal, or return zero.
export function toFloat(value) {
  const match = /^\s*[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(String(value));
  return match ? Number.parseFloat(match[0]) : 0;
}

export function capitalize(value) {
  if (typeof value !== "string") {
    throw new TypeError("capitalize requires a string");
  }

  return value.length === 0
    ? value
    : value[0].toUpperCase() + value.slice(1).toLowerCase();
}

// Default split collapses whitespace and drops trailing empties.
export function split(value, separator) {
  if (typeof value !== "string") {
    throw new TypeError("split requires a string");
  }

  const parts = separator === undefined || separator === " "
    ? stripString(value)
      .split(/\s+/)
      .filter(part => part.length > 0)
    : value.split(separator);

  while (parts.length > 0 && parts.at(-1) === "") parts.pop();
  return parts;
}

// Negative offsets count from the end; out-of-range reads return nil.
export function slice(value, start, count) {
  if (typeof value !== "string") {
    throw new TypeError("slice requires a string");
  }

  const from = start < 0 ? value.length + start : start;
  if (count === undefined) {
    return from >= 0 && from < value.length ? value[from] : null;
  }

  if (from < 0 || from > value.length || count < 0) return null;
  return value.substr(from, count);
}

function compare(left, right) {
  if (typeof left !== typeof right) {
    throw new TypeError("comparison of mismatched types");
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

export function sort(values) {
  return values.slice().sort(compare);
}

// Ruby sort with a block: a sorted copy, by the comparator.
export function sortWith(values, comparator) {
  return values.slice().sort(comparator);
}

export function sortBy(values, keyOf) {
  return values
    .map((value, index) => ({value, key: keyOf(value), index}))
    .sort((left, right) => compare(left.key, right.key) || left.index - right.index)
    .map(entry => entry.value);
}

export function minBy(values, keyOf) {
  return values.length === 0 ? null : sortBy(values, keyOf)[0];
}

export function maxBy(values, keyOf) {
  return values.length === 0 ? null : sortBy(values, keyOf).at(-1);
}

export function min(values) {
  return values.length === 0 ? null : sort(values)[0];
}

export function max(values) {
  return values.length === 0 ? null : sort(values).at(-1);
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function uniq(values) {
  return values.filter((value, index) =>
    values.findIndex(other => isEqual(other, value)) === index
  );
}

export function compact(values) {
  return values.filter(value => value != null);
}

export function flatten(values) {
  return values.flat(Infinity);
}

export function reverse(values) {
  return values.slice().reverse();
}

// Return nil when Ruby equality finds no match.
export function indexOf(values, wanted) {
  const index = values.findIndex(value => isEqual(value, wanted));
  return index < 0 ? null : index;
}

// Ruby push returns the array.
export function append(values, value) {
  values.push(value);
  return values;
}

export function prepend(values, value) {
  values.unshift(value);
  return values;
}

// Remove values using Ruby equality.
export function difference(values, removed) {
  return values.filter(value =>
    !removed.some(other => isEqual(other, value))
  );
}

// Hash#fetch raises when no value or default exists.
export function fetch(hash, key, ...fallback) {
  if (Object.hasOwn(hash, key)) return hash[key];
  if (fallback.length > 0) return fallback[0];
  throw new Error(`key not found: ${key}`);
}

export function deleteKey(hash, key) {
  if (!Object.hasOwn(hash, key)) return null;
  const value = hash[key];
  delete hash[key];
  return value;
}

// Ruby integer division floors.
export function intDiv(left, right) {
  if (right === 0) throw new RangeError("divided by 0");
  return Math.floor(left / right);
}

export function modulo(left, right) {
  if (right === 0) throw new RangeError("divided by 0");
  return ((left % right) + right) % right;
}

// Sort-column comparison: nil last, numbers and booleans by value,
// everything else in locale-aware text order.
export function compareValues(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left).localeCompare(String(right));
}

export function between(value, low, high) {
  return value >= low && value <= high;
}

export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function arrayOnly(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} requires an array`);
  return value;
}

// Core methods with arguments, for a value without metadata.
export function valueInvoke(value, name, args) {
  switch (name) {
    case "index":
      return indexOf(arrayOnly(value, name), args[0]);
    case "take":
      return arrayOnly(value, name).slice(0, args[0]);
    case "drop":
      return arrayOnly(value, name).slice(args[0]);
    case "include?":
      return typeof value === "string"
        ? value.includes(args[0])
        : arrayOnly(value, name).some(other => isEqual(other, args[0]));
    default:
      throw new Error(`Unknown value method: ${name}`);
  }
}

export function valueRead(value, name) {
  switch (name) {
    case "nil?":
      return value == null;
    case "blank?":
      return isBlank(value);
    case "present?":
      return isPresent(value);
    case "empty?":
      return isEmpty(value);
    case "size":
    case "length":
      return length(value);
    case "strip":
      return strip(value);
    case "upcase":
      return upcase(value);
    case "downcase":
      return downcase(value);
    case "dup":
      return duplicate(value);
    case "first":
      return arrayOnly(value, name).length > 0 ? value[0] : null;
    case "last":
      return arrayOnly(value, name).length > 0 ? value.at(-1) : null;
    case "compact":
      return compact(arrayOnly(value, name));
    case "uniq":
      return uniq(arrayOnly(value, name));
    case "reverse":
      return typeof value === "string" ? [...value].reverse().join("") : reverse(arrayOnly(value, name));
    case "sum":
      return sum(arrayOnly(value, name));
    case "min":
      return min(arrayOnly(value, name));
    case "max":
      return max(arrayOnly(value, name));
    case "to_s":
      return stringify(value);
    case "to_sym":
      return String(value);
    case "to_i":
      return toInteger(value);
    case "to_f":
      return toFloat(value);
    case "capitalize":
      return capitalize(value);
    default:
      throw new Error(`Unknown value reader: ${name}`);
  }
}

// Decode typed fragment leaves; undefined rejects invalid values.
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

// nil and empty strings leave no fragment value.
export function encodeFragment(value) {
  return value == null || value === "" ? null : String(value);
}

// Readers with an answer for nil itself (nil.to_s is "", nil.to_i is 0);
// other readers on nil yield nil through path dispatch.
export const NIL_READERS = ["nil?", "blank?", "present?", "to_s", "to_i", "to_f"];
export const VALUE_READERS = [
  "nil?",
  "blank?",
  "present?",
  "empty?",
  "size",
  "length",
  "strip",
  "upcase",
  "downcase",
  "dup",
  "first",
  "last",
  "compact",
  "uniq",
  "reverse",
  "sum",
  "min",
  "max",
  "to_s",
  "to_sym",
  "to_i",
  "to_f",
  "capitalize"
];
export const VALUE_METHODS = ["index", "take", "drop", "include?"];
