// MessagePack subset used by Swill's symbolic v1 protocol.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class Writer {
  constructor() { this.bytes = []; }
  byte(value) { this.bytes.push(value & 255); }
  integer(value, bytes) {
    for (let shift = (bytes - 1) * 8; shift >= 0; shift -= 8) this.byte(value / 2 ** shift);
  }
  integer64(value) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, BigInt(value));
    this.raw(bytes);
  }
  raw(values) { this.bytes.push(...values); }
  result() { return Uint8Array.from(this.bytes); }
}

function writeString(writer, value) {
  const bytes = encoder.encode(value);
  if (bytes.length < 32) writer.byte(0xa0 | bytes.length);
  else if (bytes.length < 256) { writer.byte(0xd9); writer.byte(bytes.length); }
  else if (bytes.length < 65536) { writer.byte(0xda); writer.integer(bytes.length, 2); }
  else { writer.byte(0xdb); writer.integer(bytes.length, 4); }
  writer.raw(bytes);
}

function writeValue(writer, value) {
  if (value == null) return writer.byte(0xc0);
  if (value === false) return writer.byte(0xc2);
  if (value === true) return writer.byte(0xc3);
  if (typeof value === "string") return writeString(writer, value);
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value < 128) return writer.byte(value);
    if (value >= -32 && value < 0) return writer.byte(256 + value);
    if (value >= 0 && value < 256) { writer.byte(0xcc); return writer.byte(value); }
    if (value >= 0 && value < 65536) { writer.byte(0xcd); return writer.integer(value, 2); }
    if (value >= 0 && value <= 0xffffffff) { writer.byte(0xce); return writer.integer(value, 4); }
    if (value >= -128 && value < 0) { writer.byte(0xd0); return writer.byte(value); }
    if (value >= -32768 && value < 0) { writer.byte(0xd1); return writer.integer(65536 + value, 2); }
    if (value >= -0x80000000 && value < 0) { writer.byte(0xd2); return writer.integer(0x100000000 + value, 4); }
    if (Number.isSafeInteger(value)) { writer.byte(value >= 0 ? 0xcf : 0xd3); return writer.integer64(value); }
  }
  if (typeof value === "number") {
    writer.byte(0xcb);
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value);
    return writer.raw(bytes);
  }
  if (Array.isArray(value)) {
    if (value.length < 16) writer.byte(0x90 | value.length);
    else { writer.byte(0xdc); writer.integer(value.length, 2); }
    value.forEach(item => writeValue(writer, item));
    return;
  }
  if (value instanceof Uint8Array) {
    writer.byte(0xc6); writer.integer(value.length, 4); writer.raw(value); return;
  }
  const entries = Object.entries(value);
  if (entries.length < 16) writer.byte(0x80 | entries.length);
  else { writer.byte(0xde); writer.integer(entries.length, 2); }
  for (const [key, item] of entries) { writeString(writer, key); writeValue(writer, item); }
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.offset = 0;
  }
  byte() { return this.bytes[this.offset++]; }
  integer(length) {
    let value = 0;
    for (let index = 0; index < length; index += 1) value = value * 256 + this.byte();
    return value;
  }
  string(length) {
    const value = decoder.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }
  value() {
    const tag = this.byte();
    if (tag <= 0x7f) return tag;
    if (tag >= 0xe0) return tag - 256;
    if ((tag & 0xe0) === 0xa0) return this.string(tag & 0x1f);
    if ((tag & 0xf0) === 0x90) return this.array(tag & 0x0f);
    if ((tag & 0xf0) === 0x80) return this.map(tag & 0x0f);
    switch (tag) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return this.byte();
      case 0xcd: return this.integer(2);
      case 0xce: return this.integer(4);
      case 0xcf: return this.bigInteger(false);
      case 0xd0: { const value = this.byte(); return value > 127 ? value - 256 : value; }
      case 0xd1: { const value = this.integer(2); return value > 32767 ? value - 65536 : value; }
      case 0xd2: { const value = this.integer(4); return value > 0x7fffffff ? value - 0x100000000 : value; }
      case 0xd3: return this.bigInteger(true);
      case 0xcb: {
        const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
        this.offset += 8;
        return view.getFloat64(0);
      }
      case 0xd9: return this.string(this.byte());
      case 0xda: return this.string(this.integer(2));
      case 0xdb: return this.string(this.integer(4));
      case 0xdc: return this.array(this.integer(2));
      case 0xdd: return this.array(this.integer(4));
      case 0xde: return this.map(this.integer(2));
      case 0xdf: return this.map(this.integer(4));
      case 0xc4: return this.binary(this.byte());
      case 0xc5: return this.binary(this.integer(2));
      case 0xc6: return this.binary(this.integer(4));
      default: throw new Error(`Unsupported MessagePack tag: 0x${tag.toString(16)}`);
    }
  }
  array(length) { return Array.from({length}, () => this.value()); }
  map(length) {
    const value = {};
    for (let index = 0; index < length; index += 1) {
      const key = this.value();
      const item = this.value();
      Object.defineProperty(value, key, {value: item, enumerable: true, configurable: true, writable: true});
    }
    return value;
  }
  bigInteger(signed) {
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
    const value = signed ? view.getBigInt64(0) : view.getBigUint64(0);
    this.offset += 8;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("MessagePack integer exceeds JavaScript's safe range");
    return number;
  }
  binary(length) {
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

export function pack(value) {
  const writer = new Writer();
  writeValue(writer, value);
  return writer.result();
}

export function unpack(bytes) {
  const reader = new Reader(bytes);
  const value = reader.value();
  if (reader.offset !== reader.bytes.length) throw new Error("Trailing MessagePack data");
  return value;
}
