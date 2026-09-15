// Sorbet's runtime operations. The compiler emits these for T.must, T.cast,
// T.let, T.assert_type!, and T.absurd; a type is the declaration text the
// compiler carries, checked as sorbet-runtime checks it: a generic's elements
// are not walked.
import {registered} from "./install.mjs";
import {isPlainObject} from "./values.mjs";

export function must(value) {
  if (value == null) throw new TypeError("T.must received nil");
  return value;
}

export function cast(value, type) {
  if (!conforms(value, type)) {
    throw new TypeError(`T.cast expected ${type}, got ${describe(value)}`);
  }

  return value;
}

export function absurd(value) {
  throw new TypeError(`T.absurd reached with ${describe(value)}`);
}

export function conforms(value, type) {
  const nilable = /^T\.nilable\((.+)\)$/.exec(type);
  if (nilable) return value == null || conforms(value, nilable[1]);

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
