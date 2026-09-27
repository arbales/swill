// Ruby semantics for plain JavaScript values.

// Ruby strip retains Unicode whitespace.
function stripString(value) {
  return value.replace(/^[\x00\t\n\v\f\r ]+|[\x00\t\n\v\f\r ]+$/g, "");
}

/**
 * Returns whether `value` is truthy: every value is, except `false`, `null`,
 * and `undefined`. Zero and the empty string are truthy.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTruthy(value) {
  return value !== false && value !== null && value !== undefined;
}

/**
 * Returns `left` if it is falsy; otherwise calls `right` and returns its
 * result. `right` is a function, so it is evaluated only when needed.
 *
 * @param {unknown} left
 * @param {() => unknown} right
 * @returns {unknown}
 */
export function logicalAnd(left, right) {
  return isTruthy(left) ? right() : left;
}

/**
 * Returns `left` if it is truthy; otherwise calls `right` and returns its
 * result. `right` is a function, so it is evaluated only when needed.
 *
 * @param {unknown} left
 * @param {() => unknown} right
 * @returns {unknown}
 */
export function logicalOr(left, right) {
  return isTruthy(left) ? left : right();
}

/**
 * Returns `null` if `value` is `undefined`, and `value` otherwise. Safe
 * navigation compiles to optional chaining, which returns `undefined` where
 * the framework uses `null`, so its result passes through here.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function nilable(value) {
  return value === undefined ? null : value;
}

/**
 * Returns whether `left` and `right` are equal. Arrays are equal when they have
 * the same length and their elements are equal, recursively; any other value,
 * a framework object included, is equal only to itself. `null` and
 * `undefined` are equal to each other.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function isEqual(left, right) {
  if (left === right) return true;
  // An unset expando (__swill_view__ on an element the framework has not
  // touched) reads as undefined where the rest of the runtime says null.
  // Both spell nothing.
  if (left == null && right == null) return true;

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

/**
 * Returns a shallow copy of `value`: a new array or hash with the same
 * elements, or `value` itself if it is a primitive. A framework object has
 * observers and metadata a copy would not carry, so copying one raises; a
 * model offers `draft` instead.
 *
 * @param {unknown} value
 * @returns {unknown}
 * @throws {TypeError} For a framework object.
 */
export function duplicate(value) {
  if (Array.isArray(value)) return value.slice();
  if (isPlainObject(value)) return {...value};
  if (value !== null && typeof value === "object") {
    throw new TypeError("dup of a framework object is not supported; use draft");
  }

  return value;
}

/**
 * Returns whether `value` is blank: nil, `false`, a string containing only
 * whitespace, or an empty array or hash.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBlank(value) {
  if (value == null || value === false) return true;
  if (typeof value === "string") return stripString(value).length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * Returns whether `value` is not blank.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPresent(value) {
  return !isBlank(value);
}

/**
 * Returns whether `value`, a string, array, or hash, has a length of zero.
 *
 * @param {string | Array | object} value
 * @returns {boolean}
 * @throws {TypeError} For any other value.
 */
export function isEmpty(value) {
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length === 0;
  }

  if (isPlainObject(value)) return Object.keys(value).length === 0;
  throw new TypeError("empty? requires a string, array, or hash");
}

/**
 * Returns a copy of `value` with leading and trailing whitespace removed.
 * Whitespace is null, horizontal tab, line feed, vertical tab, form feed,
 * carriage return, and space; other Unicode whitespace is kept.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError} For a value that is not a string.
 */
export function strip(value) {
  if (typeof value !== "string") throw new TypeError("strip requires a string");
  return stripString(value);
}

/**
 * Returns a string containing the upcased characters in `value`.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError} For a value that is not a string.
 */
export function upcase(value) {
  if (typeof value !== "string") throw new TypeError("upcase requires a string");
  return value.toUpperCase();
}

/**
 * Returns a string containing the downcased characters in `value`.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError} For a value that is not a string.
 */
export function downcase(value) {
  if (typeof value !== "string") throw new TypeError("downcase requires a string");
  return value.toLowerCase();
}

/**
 * Returns the number of characters in a string, elements in an array, or
 * entries in a hash.
 *
 * @param {string | Array | object} value
 * @returns {number}
 * @throws {TypeError} For any other value.
 */
export function length(value) {
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length;
  }

  if (isPlainObject(value)) return Object.keys(value).length;
  throw new TypeError("length requires a string, array, or hash");
}

// Ruby core methods that differ from JavaScript.

/**
 * Returns `value` as a string: the empty string for nil.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stringify(value) {
  return value == null ? "" : String(value);
}

/**
 * Returns the result of interpreting the leading characters of `value` as a
 * decimal integer. Characters past a leading valid number are ignored; if
 * there is none, returns zero.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toInteger(value) {
  const match = /^\s*[+-]?\d+/.exec(String(value));
  return match ? Number.parseInt(match[0], 10) : 0;
}

/**
 * Returns the result of interpreting the leading characters of `value` as a
 * floating-point number. Characters past a leading valid number are ignored;
 * if there is none, returns zero.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toFloat(value) {
  const match = /^\s*[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(String(value));
  return match ? Number.parseFloat(match[0]) : 0;
}

/**
 * Returns a string containing the characters in `value`, with the first
 * character upcased and the rest downcased.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError} For a value that is not a string.
 */
export function capitalize(value) {
  if (typeof value !== "string") {
    throw new TypeError("capitalize requires a string");
  }

  return value.length === 0
    ? value
    : value[0].toUpperCase() + value.slice(1).toLowerCase();
}

/**
 * Returns an array of the substrings of `value` between each occurrence of
 * `separator`. When `separator` is omitted or a single space, `value` is split
 * at runs of whitespace, and leading whitespace is ignored. Trailing empty
 * substrings are removed.
 *
 * @param {string} value
 * @param {string | RegExp} [separator]
 * @returns {string[]}
 * @throws {TypeError} For a value that is not a string.
 */
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

/**
 * Returns the substring of `value` starting at `start`: one character, or
 * `count` characters when `count` is given. A negative `start` counts back
 * from the end. Returns nil if `start` is out of range.
 *
 * @param {string} value
 * @param {number} start
 * @param {number} [count]
 * @returns {string | null}
 * @throws {TypeError} For a value that is not a string.
 */
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

/**
 * Returns a new array containing the elements of `values`, sorted. The
 * elements must be of one type, and are compared with `<`.
 *
 * @param {Array} values
 * @returns {Array}
 * @throws {TypeError} For values of mixed types.
 */
export function sort(values) {
  return values.slice().sort(compare);
}

/**
 * Returns a new array containing the elements of `values`, sorted by
 * `comparator`.
 *
 * @param {Array} values
 * @param {(left: unknown, right: unknown) => number} comparator
 * @returns {Array}
 */
export function sortWith(values, comparator) {
  return values.slice().sort(comparator);
}

/**
 * Returns a new array containing the elements of `values`, sorted by the key
 * `keyOf` returns for each. The sort is stable, and the keys must be of one
 * type.
 *
 * @param {Array} values
 * @param {(value: unknown) => unknown} keyOf
 * @returns {Array}
 * @throws {TypeError} For keys of mixed types.
 */
export function sortBy(values, keyOf) {
  return values
    .map((value, index) => ({value, key: keyOf(value), index}))
    .sort((left, right) => compare(left.key, right.key) || left.index - right.index)
    .map(entry => entry.value);
}

/**
 * Returns the element of `values` for which `keyOf` returns the smallest key,
 * or nil if `values` is empty.
 *
 * @param {Array} values
 * @param {(value: unknown) => unknown} keyOf
 * @returns {unknown}
 */
export function minBy(values, keyOf) {
  return values.length === 0 ? null : sortBy(values, keyOf)[0];
}

/**
 * Returns the element of `values` for which `keyOf` returns the largest key,
 * or nil if `values` is empty.
 *
 * @param {Array} values
 * @param {(value: unknown) => unknown} keyOf
 * @returns {unknown}
 */
export function maxBy(values, keyOf) {
  return values.length === 0 ? null : sortBy(values, keyOf).at(-1);
}

/**
 * Returns the element of `values` with the smallest value, or nil if `values`
 * is empty.
 *
 * @param {Array} values
 * @returns {unknown}
 */
export function min(values) {
  return values.length === 0 ? null : sort(values)[0];
}

/**
 * Returns the element of `values` with the largest value, or nil if `values`
 * is empty.
 *
 * @param {Array} values
 * @returns {unknown}
 */
export function max(values) {
  return values.length === 0 ? null : sort(values).at(-1);
}

/**
 * Returns the sum of the elements of `values`, or zero if it is empty.
 *
 * @param {number[]} values
 * @returns {number}
 */
export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Returns a new array containing the elements of `values` with duplicates
 * removed; the first occurrence of each is kept. Elements are compared with
 * `isEqual`.
 *
 * @param {Array} values
 * @returns {Array}
 */
export function uniq(values) {
  return values.filter((value, index) =>
    values.findIndex(other => isEqual(other, value)) === index
  );
}

/**
 * Returns a new array containing the elements of `values` that are not nil.
 *
 * @param {Array} values
 * @returns {Array}
 */
export function compact(values) {
  return values.filter(value => value != null);
}

/**
 * Returns a new array that is a recursive flattening of `values`.
 *
 * @param {Array} values
 * @returns {Array}
 */
export function flatten(values) {
  return values.flat(Infinity);
}

/**
 * Returns a new array containing the elements of `values` in reverse order.
 *
 * @param {Array} values
 * @returns {Array}
 */
export function reverse(values) {
  return values.slice().reverse();
}

/**
 * Returns the index of the first element of `values` equal to `wanted`, as
 * `isEqual` compares them, or nil if there is none.
 *
 * @param {Array} values
 * @param {unknown} wanted
 * @returns {number | null}
 */
export function indexOf(values, wanted) {
  const index = values.findIndex(value => isEqual(value, wanted));
  return index < 0 ? null : index;
}

/**
 * Appends `value` to `values`, and returns `values`.
 *
 * @param {Array} values
 * @param {unknown} value
 * @returns {Array} The same array.
 */
export function append(values, value) {
  values.push(value);
  return values;
}

/**
 * Prepends `value` to `values`, and returns `values`.
 *
 * @param {Array} values
 * @param {unknown} value
 * @returns {Array} The same array.
 */
export function prepend(values, value) {
  values.unshift(value);
  return values;
}

/**
 * Returns a new array containing the elements of `values` not found in
 * `removed`, as `isEqual` compares them.
 *
 * @param {Array} values
 * @param {Array} removed
 * @returns {Array}
 */
export function difference(values, removed) {
  return values.filter(value =>
    !removed.some(other => isEqual(other, value))
  );
}

/**
 * Returns the value for `key` in `hash`. If `hash` has no such key, returns
 * the fallback when one is given, and raises otherwise.
 *
 * @param {object} hash
 * @param {string} key
 * @param {...unknown} fallback At most one default.
 * @returns {unknown}
 * @throws {Error} `key not found` with neither.
 */
export function fetch(hash, key, ...fallback) {
  if (Object.hasOwn(hash, key)) return hash[key];
  if (fallback.length > 0) return fallback[0];
  throw new Error(`key not found: ${key}`);
}

/**
 * Deletes the entry for `key` from `hash`, and returns its value, or nil if
 * `hash` has no such key.
 *
 * @param {object} hash
 * @param {string} key
 * @returns {unknown}
 */
export function deleteKey(hash, key) {
  if (!Object.hasOwn(hash, key)) return null;
  const value = hash[key];
  delete hash[key];
  return value;
}

/**
 * Returns the quotient of `left` divided by `right`, rounded down:
 * `intDiv(-7, 2)` returns -4.
 *
 * @param {number} left
 * @param {number} right
 * @returns {number}
 * @throws {RangeError} `divided by 0`.
 */
export function intDiv(left, right) {
  if (right === 0) throw new RangeError("divided by 0");
  return Math.floor(left / right);
}

/**
 * Returns the remainder of `left` divided by `right`, with the sign of
 * `right`: `modulo(-7, 3)` returns 2.
 *
 * @param {number} left
 * @param {number} right
 * @returns {number}
 * @throws {RangeError} `divided by 0`.
 */
export function modulo(left, right) {
  if (right === 0) throw new RangeError("divided by 0");
  return ((left % right) + right) % right;
}

/**
 * Returns whether `value` is a number.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNumber(value) {
  return typeof value === "number";
}

/**
 * Returns whether `value` is `true` or `false`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBoolean(value) {
  return typeof value === "boolean";
}

/**
 * Returns a negative number, zero, or a positive number as `left` sorts
 * before, with, or after `right` in the reader's locale.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} Negative, zero, or positive.
 */
export function compareText(left, right) {
  return left.localeCompare(right);
}

/**
 * Returns whether `value` is between `low` and `high`, inclusive.
 *
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {boolean}
 */
export function between(value, low, high) {
  return value >= low && value <= high;
}

/**
 * Returns `low` if `value` is less than it, `high` if `value` is greater than
 * it, and `value` otherwise.
 *
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
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

/**
 * Returns the result of the reader `name` on `value`, a value with no member
 * of that name: `nil?`, `zero?`, `positive?`, `negative?`, `blank?`,
 * `present?`, `empty?`, `size`, `length`, `strip`, `upcase`, `downcase`,
 * `capitalize`, `dup`, `first`, `last`, `compact`, `uniq`, `reverse`, `sum`,
 * `min`, `max`, `to_s`, `to_sym`, `to_i`, or `to_f`. `read` and `send` reach
 * it.
 *
 * @param {unknown} value
 * @param {string} name The Ruby name.
 * @returns {unknown}
 * @throws {Error} `Unknown value reader` for any other name.
 */
export function valueRead(value, name) {
  switch (name) {
    case "nil?":
      return value == null;
    case "zero?":
      return typeof value === "number" && value === 0;
    case "positive?":
      return typeof value === "number" && value > 0;
    case "negative?":
      return typeof value === "number" && value < 0;
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

/**
 * The names of the readers nil responds to: `nil?`, `blank?`, `present?`,
 * `to_s`, `to_i`, and `to_f`. Sending nil any other name raises; reading any
 * other name of nil in a key path returns nil.
 */
export const NIL_READERS = ["nil?", "blank?", "present?", "to_s", "to_i", "to_f"];
/**
 * The names of the readers `valueRead` responds to.
 */
export const VALUE_READERS = [
  "nil?",
  "zero?",
  "positive?",
  "negative?",
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
