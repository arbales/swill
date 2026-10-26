// Values that MessagePack cannot express without losing their Ruby meaning.
const brand = Symbol.for("swill.data.type");

function checkDate(value) {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) throw new TypeError(`Invalid date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError(`Invalid date: ${value}`);
  }
  return [year, month, day];
}

export class CalendarDate {
  constructor(iso) {
    const [year, month, day] = checkDate(iso);
    this.iso = iso;
    this.year = year;
    this.month = month;
    this.day = day;
    Object.defineProperty(this, brand, {value: "Date"});
    Object.freeze(this);
  }
  iso8601() { return this.iso; }
  equals(other) { return other instanceof CalendarDate && this.iso === other.iso; }
  toString() { return this.iso; }
  valueOf() { return this.year * 10000 + this.month * 100 + this.day; }
}

export class Instant {
  constructor(iso, type = "DateTime") {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(iso)) {
      throw new TypeError(`Invalid timestamp: ${iso}`);
    }
    const millis = Date.parse(iso);
    if (!Number.isFinite(millis)) throw new TypeError(`Invalid timestamp: ${iso}`);
    const micros = BigInt(millis) * 1000n + BigInt((iso.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6) || "0");
    const fraction = (micros % 1000000n + 1000000n) % 1000000n;
    this.iso = new Date(millis).toISOString().replace(/\.\d{3}Z$/, `.${String(fraction).padStart(6, "0")}+00:00`);
    this.micros = micros;
    Object.defineProperty(this, brand, {value: type});
    Object.freeze(this);
  }
  iso8601() { return this.iso; }
  toISOString() { return this.iso.replace(/(\.\d{3})000\+00:00$/, "$1Z").replace(/\+00:00$/, "Z"); }
  equals(other) { return other instanceof Instant && this.micros === other.micros; }
  toString() { return this.iso; }
  valueOf() { return Number(this.micros / 1000n); }
}

function decimalParts(text) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(text));
  if (!match) throw new TypeError(`Invalid decimal: ${text}`);
  const fraction = match[3] ?? "";
  const coefficient = BigInt(`${match[1]}${match[2]}${fraction}`);
  return [coefficient, fraction.length];
}

export class Decimal {
  constructor(text) {
    [this.coefficient, this.scale] = decimalParts(text);
    Object.defineProperty(this, brand, {value: "BigDecimal"});
    Object.freeze(this);
  }
  toString() {
    let digits = (this.coefficient < 0n ? -this.coefficient : this.coefficient).toString();
    if (this.scale) digits = digits.padStart(this.scale + 1, "0").slice(0, -this.scale) + "." + digits.padStart(this.scale + 1, "0").slice(-this.scale);
    return (this.coefficient < 0n ? "-" : "") + digits;
  }
  // Implicit Number conversion would silently round exact database numerics.
  [Symbol.toPrimitive](hint) {
    if (hint === "string") return this.toString();
    throw new TypeError("BigDecimal requires explicit conversion or exact comparison");
  }
  equals(other) { return other instanceof Decimal && compareDecimal(this, other) === 0; }
}

export function compareDecimal(left, right) {
  const scale = Math.max(left.scale, right.scale);
  const a = left.coefficient * 10n ** BigInt(scale - left.scale);
  const b = right.coefficient * 10n ** BigInt(scale - right.scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

export class TimeOfDay {
  constructor(iso) {
    if (!/^\d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(iso)) throw new TypeError(`Invalid time of day: ${iso}`);
    this.iso = iso;
    Object.defineProperty(this, brand, {value: "TimeOfDay"});
    Object.freeze(this);
  }
  toString() { return this.iso; }
  equals(other) { return other instanceof TimeOfDay && this.iso === other.iso; }
}

export class DataRange {
  constructor(dbType, empty, first, last, excludeFirst, excludeLast) {
    Object.assign(this, {dbType, empty, first, last, excludeFirst, excludeLast});
    Object.defineProperty(this, brand, {value: "RangeValue"});
    Object.freeze(this);
  }
  equals(other) {
    return other instanceof DataRange && this.dbType === other.dbType && this.empty === other.empty &&
      this.excludeFirst === other.excludeFirst && this.excludeLast === other.excludeLast &&
      (this.first?.equals?.(other.first) ?? this.first === other.first) &&
      (this.last?.equals?.(other.last) ?? this.last === other.last);
  }
}

export class DataInterval {
  constructor(months, days, microseconds) {
    Object.assign(this, {months, days, microseconds: String(microseconds)});
    Object.defineProperty(this, brand, {value: "Interval"});
    Object.freeze(this);
  }
  equals(other) {
    return other instanceof DataInterval && this.months === other.months &&
      this.days === other.days && this.microseconds === other.microseconds;
  }
}

export function dataValueType(value) { return value?.[brand] ?? null; }
export function dataValuePayload(value) {
  switch (dataValueType(value)) {
    case "Date": case "DateTime": case "Time": case "TimeOfDay": case "BigDecimal": return value.toString();
    case "RangeValue": return [value.dbType, value.empty, value.first, value.last, value.excludeFirst, value.excludeLast];
    case "Interval": return [value.months, value.days, value.microseconds];
    default: return null;
  }
}
export function dataDateFromISO(value) { return new CalendarDate(value); }
export function dataDateISO(value) {
  if (!(value instanceof CalendarDate)) throw new TypeError("Expected a calendar date");
  return value.iso8601();
}
export function dataDateTimeFromISO(value) { return new Instant(value); }
export function dataTimeFromISO(value) { return new Instant(value, "Time"); }
export function dataDecimalFromString(value) { return new Decimal(value); }
export function dataTimeOfDayFromISO(value) { return new TimeOfDay(value); }
export function dataRange(dbType, empty, first, last, excludeFirst, excludeLast) {
  return new DataRange(dbType, empty, first, last, excludeFirst, excludeLast);
}
export function dataInterval(months, days, microseconds) { return new DataInterval(months, days, microseconds); }
