import test from "node:test";
import assert from "node:assert/strict";
import {
  CalendarDate, Instant, Decimal, TimeOfDay, DataRange, DataInterval, dataTimeFromISO,
  compareDecimal, dataValuePayload, dataValueType
} from "../rb/runtime/data_values.mjs";

test("date-only values stay distinct from instants", () => {
  const date = new CalendarDate("2026-09-23");
  const instant = new Instant("2026-09-23T00:00:00.123456-04:00");
  assert.equal(date.iso8601(), "2026-09-23");
  assert.equal(dataValueType(date), "Date");
  assert.equal(dataValueType(instant), "DateTime");
  assert.equal(dataValuePayload(instant), "2026-09-23T04:00:00.123456+00:00");
  assert.ok(instant.equals(new Instant("2026-09-23T04:00:00.123456Z")));
  const time = dataTimeFromISO("2026-09-23T04:00:00.123456Z");
  assert.equal(dataValueType(time), "Time");
  assert.equal(time.toISOString(), "2026-09-23T04:00:00.123456Z");
  assert.throws(() => new CalendarDate("2026-02-30"), TypeError);
});

test("database numerics retain precision and compare exactly", () => {
  const large = new Decimal("12345678901234567890.123456");
  const larger = new Decimal("12345678901234567890.123457");
  assert.equal(dataValuePayload(large), "12345678901234567890.123456");
  assert.equal(compareDecimal(large, larger), -1);
  assert.ok(new Decimal("1.0").equals(new Decimal("1.00")));
  assert.throws(() => Number(large), /explicit conversion/);
});

test("time, range and interval payloads keep their structure", () => {
  const time = new TimeOfDay("12:34:56.123456");
  const range = new DataRange("daterange", false, null, new CalendarDate("2026-10-01"), false, true);
  const interval = new DataInterval(2, 3, "456789");
  assert.equal(dataValuePayload(time), "12:34:56.123456");
  assert.deepEqual(dataValuePayload(range), ["daterange", false, null, range.last, false, true]);
  assert.deepEqual(dataValuePayload(interval), [2, 3, "456789"]);
});
