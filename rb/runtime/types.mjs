// Sorbet's runtime operations. The compiler emits these for T.must, T.cast,
// T.let, T.assert_type!, and T.absurd; a type is the declaration text the
// compiler carries, checked as sorbet-runtime checks it: a generic's elements
// are not walked.
import {registered} from "./install.mjs";
import {isPlainObject} from "./values.mjs";

/**
 * Returns `value`, and raises if it is nil. The compiler emits this for
 * `T.must`.
 *
 * @param {unknown} value
 * @returns {unknown}
 * @throws {TypeError} `T.must received nil`.
 */
export function must(value) {
  if (value == null) throw new TypeError("T.must received nil");
  return value;
}

/**
 * Returns `value`, and raises unless it conforms to `type`, as `conforms`
 * checks it. The compiler emits this for `T.cast`, `T.let`, and
 * `T.assert_type!`.
 *
 * @param {unknown} value
 * @param {string} type The Sorbet type, such as `"T.nilable(String)"`.
 * @returns {unknown}
 * @throws {TypeError} `T.cast expected …` when the value does not conform.
 */
export function cast(value, type) {
  if (!conforms(value, type)) {
    throw new TypeError(`T.cast expected ${type}, got ${describe(value)}`);
  }

  return value;
}

/**
 * Raises. The compiler emits this for `T.absurd`, in a branch that can never
 * run.
 *
 * @param {unknown} value
 * @returns {never}
 * @throws {TypeError} Always.
 */
export function absurd(value) {
  throw new TypeError(`T.absurd reached with ${describe(value)}`);
}

/**
 * Returns whether `value` conforms to the Sorbet type `type`: a string for
 * `String` and `Symbol`, a whole number for `Integer`, any number for
 * `Float`, `true` or `false` for `T::Boolean`, nil for `NilClass` or a
 * `T.nilable` type, an array or plain object for `T::Array[…]` and
 * `T::Hash[…]`, a function for a `T.proc` type, and otherwise an instance of
 * the class named. The check is shallow: the elements of an array or hash are
 * not checked.
 *
 * @param {unknown} value
 * @param {string} type
 * @returns {boolean}
 * @throws {Error} `Unknown class` for a class that is not installed.
 */
export function conforms(value, type) {
  const nilable = /^T\.nilable\((.+)\)$/.exec(type);
  if (nilable) return value == null || conforms(value, nilable[1]);

  if (type.startsWith("T.proc")) return typeof value === "function";
  switch (type) {
    case "T.untyped":
      return true;
    case "NilClass":
      return value == null;
    case "String":
    case "Symbol":
      return typeof value === "string";
    case "Integer":
      return Number.isInteger(value);
    case "Float":
      return typeof value === "number";
    case "T::Boolean":
      return typeof value === "boolean";
    default:
  }

  if (type === "Array" || type.startsWith("T::Array[")) return Array.isArray(value);
  if (type === "Hash" || type.startsWith("T::Hash[")) return isPlainObject(value);
  const klass = registered(type) ?? globalThis[type];
  if (typeof klass !== "function") throw new Error(`Unknown class: ${type}`);
  return value instanceof klass;
}

function describe(value) {
  if (value == null) return "nil";
  if (Array.isArray(value)) return "Array";
  if (isPlainObject(value)) return "Hash";
  if (typeof value === "object") return value.constructor?.name ?? "object";
  return typeof value;
}
