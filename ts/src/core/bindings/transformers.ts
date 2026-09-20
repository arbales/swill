export interface Transformer<V> {
  parse(input: string): V;
  format(value: V): string;
}

const transformers = new Map<string, Transformer<any>>();

export function registerTransformer<V>(name: string, t: Transformer<V>): void {
  transformers.set(name, t);
}

export function getTransformer(name: string): Transformer<any> {
  return transformers.get(name) ?? transformers.get("string")!;
}

export function applyTransform(name: string, value: unknown): unknown {
  const fn = valueTransforms.get(name);
  if (!fn) {
    console.warn(`[bindings] unknown transform "${name}"`);
    return value;
  }
  return fn(value);
}

registerTransformer<string>("string", {
  parse: (s) => s,
  format: (v) => (v == null ? "" : String(v)),
});

registerTransformer<number | null>("number", {
  parse: (s) => (s.trim() === "" ? null : Number(s)),
  format: (v) => (v == null || Number.isNaN(v) ? "" : String(v)),
});

registerTransformer<boolean>("boolean", {
  parse: (s) => s === "true" || s === "1" || s === "on",
  format: (v) => (v ? "true" : "false"),
});

registerTransformer<Date | null>("date", {
  parse: (s) => (s.trim() === "" ? null : new Date(s)),
  format: (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as any) ?? "")),
});

registerTransformer<string>("phone", {
  parse: (s) => s,
  format(value: string): string {
    if (!value) return "";
    const raw = String(value).trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return raw;
  },
});

registerTransformer<string>("url-display", {
  parse: (s) => s,
  format(value: string): string {
    if (!value) return "";
    return String(value).trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  },
});

const valueTransforms = new Map<string, (value: unknown) => unknown>();

export function registerValueTransform(name: string, transform: (value: unknown) => unknown): void {
  valueTransforms.set(name, transform);
}

valueTransforms.set("isBlank", (value) => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
});

valueTransforms.set("isEmpty", (value) => {
  if (value == null) return true;
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  return false;
});

valueTransforms.set("isPresent", (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
});

valueTransforms.set("isPositive", (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
});

valueTransforms.set("isNegative", (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n < 0;
});
