/**
 * Just enough protobuf to speak the Android TV Remote protocol: varints, length-delimited
 * fields and nested messages. Bytes are plain number arrays, matching the native socket API.
 */

export type Bytes = number[];

/** Encodes a varint. Negative numbers are sign-extended to 64 bits, as protobuf does for int32. */
export function varint(value: number): Bytes {
  const out: Bytes = [];
  if (value < 0) {
    // Two's complement over 64 bits: low word is value >>> 0, high word is all ones.
    let lo = value >>> 0;
    let hi = 0xffffffff;
    for (let i = 0; i < 9; i++) {
      out.push((lo & 0x7f) | 0x80);
      lo = ((lo >>> 7) | ((hi & 0x7f) << 25)) >>> 0;
      hi >>>= 7;
    }
    out.push(1);
    return out;
  }
  let v = Math.floor(value);
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
  return out;
}

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_BYTES = 2;
const WIRE_FIXED32 = 5;

export function fieldVarint(field: number, value: number): Bytes {
  return [...varint((field << 3) | WIRE_VARINT), ...varint(value)];
}

export function fieldBytes(field: number, bytes: Bytes): Bytes {
  return [...varint((field << 3) | WIRE_BYTES), ...varint(bytes.length), ...bytes];
}

export function fieldString(field: number, text: string): Bytes {
  return fieldBytes(field, utf8(text));
}

/** A nested message is encoded exactly like a bytes field. */
export const fieldMessage = fieldBytes;

/** Prefixes a message with its varint length, the framing both TV ports use. */
export function delimited(message: Bytes): Bytes {
  return [...varint(message.length), ...message];
}

export function utf8(text: string): Bytes {
  const out: Bytes = [];
  for (const ch of text) {
    let c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return out;
}

export function fromUtf8(bytes: Bytes): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let c: number;
    if (b < 0x80) {
      c = b;
      i += 1;
    } else if (b < 0xe0) {
      c = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b < 0xf0) {
      c = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      c =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }
    out += String.fromCodePoint(c);
  }
  return out;
}

/** Reads a varint at `offset`. `value` is the low 32 bits as a signed int32, which is what every
 *  field this app reads (int32, uint32 below 2^31, enum, bool) needs. */
function readVarint(bytes: Bytes, offset: number): { value: number; next: number } | null {
  let lo = 0;
  let shift = 0;
  let i = offset;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (shift < 32) lo |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) return { value: lo | 0, next: i };
    if (shift >= 70) throw new Error('Malformed varint');
  }
  return null;
}

export type Field = { wire: 0; value: number } | { wire: 2; bytes: Bytes };

/** Decoded message: every occurrence of each field number, in order. */
export type Message = Map<number, Field[]>;

export function decode(bytes: Bytes): Message {
  const fields: Message = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (!key) throw new Error('Truncated field key');
    offset = key.next;
    const field = key.value >>> 3;
    const wire = key.value & 7;
    let entry: Field | null = null;
    if (wire === WIRE_VARINT) {
      const v = readVarint(bytes, offset);
      if (!v) throw new Error('Truncated varint');
      offset = v.next;
      entry = { wire: 0, value: v.value };
    } else if (wire === WIRE_BYTES) {
      const len = readVarint(bytes, offset);
      if (!len || len.next + len.value > bytes.length) throw new Error('Truncated bytes field');
      entry = { wire: 2, bytes: bytes.slice(len.next, len.next + len.value) };
      offset = len.next + len.value;
    } else if (wire === WIRE_FIXED64) {
      offset += 8;
    } else if (wire === WIRE_FIXED32) {
      offset += 4;
    } else {
      throw new Error(`Unsupported wire type ${wire}`);
    }
    if (entry) {
      const list = fields.get(field);
      if (list) list.push(entry);
      else fields.set(field, [entry]);
    }
  }
  return fields;
}

export function has(message: Message, field: number): boolean {
  return message.has(field);
}

/** Last value of a varint field, or `fallback` if absent. */
export function getInt(message: Message, field: number, fallback = 0): number {
  const list = message.get(field);
  const last = list?.[list.length - 1];
  return last?.wire === 0 ? last.value : fallback;
}

export function getBytes(message: Message, field: number): Bytes | undefined {
  const list = message.get(field);
  const last = list?.[list.length - 1];
  return last?.wire === 2 ? last.bytes : undefined;
}

export function getMessage(message: Message, field: number): Message | undefined {
  const bytes = getBytes(message, field);
  return bytes ? decode(bytes) : undefined;
}

export function getString(message: Message, field: number): string {
  const bytes = getBytes(message, field);
  return bytes ? fromUtf8(bytes) : '';
}

/**
 * Splits complete length-delimited messages off the front of `buffer`. Returns the messages and
 * whatever partial message remains, to be prepended to the next chunk.
 */
export function splitDelimited(buffer: Bytes): { messages: Bytes[]; rest: Bytes } {
  const messages: Bytes[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const len = readVarint(buffer, offset);
    if (!len) break;
    if (len.next + len.value > buffer.length) break;
    messages.push(buffer.slice(len.next, len.next + len.value));
    offset = len.next + len.value;
  }
  return { messages, rest: buffer.slice(offset) };
}
