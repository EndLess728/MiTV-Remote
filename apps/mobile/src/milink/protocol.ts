/**
 * MiLink remote-control wire format (com.mitv.milinkservice, TCP 6091), recovered from
 * RCServerThread / SendKeyPacket / SendKeyData. All integers are big-endian.
 *
 *   frame    = type:u8  length:u16  payload[length]
 *   type 2   = heartbeat (empty payload)
 *   type 4   = send key; payload = code:u8 (1 = send, 2 = response) id:u32 len:u16 data[len]
 *   key data = TLVs: 1 meta, 2 action, 3 keycode, 4 scancode, 5 repeat, 6 flags (i32),
 *              7 downTime, 8 eventTime (i64), 10 deviceId, 11 source (i32)
 *
 * downTime/eventTime MUST be 0: the TV's Instrumentation.sendKeySync() then stamps them with its
 * own uptime clock. Phone-clock timestamps land "in the future" on the TV and can wedge its
 * input dispatcher until that time arrives.
 */

export const MILINK_PORT = 6091;

export const FRAME_HEARTBEAT = 2;
export const FRAME_KEY = 4;

export const ACTION_DOWN = 0;
export const ACTION_UP = 1;

/** KeyCharacterMap.VIRTUAL_KEYBOARD */
const DEVICE_VIRTUAL_KEYBOARD = -1;
/** InputDevice.SOURCE_KEYBOARD */
const SOURCE_KEYBOARD = 0x101;

export const HEARTBEAT: readonly number[] = [FRAME_HEARTBEAT, 0, 0];

export interface KeyEventFields {
  code: number;
  action: number;
  meta?: number;
  repeatCount?: number;
}

function u16(v: number): number[] {
  return [(v >>> 8) & 0xff, v & 0xff];
}

function u32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function tlvI32(tag: number, v: number): number[] {
  return [tag, ...u32(v | 0)];
}

/** Only ever called with 0 (see header), so the high word is the sign extension. */
function tlvI64(tag: number, v: number): number[] {
  const high = v < 0 ? 0xffffffff : 0;
  return [tag, ...u32(high), ...u32(v)];
}

/** The TLV-encoded KeyEvent carried inside a send-key frame. */
export function keyData({ code, action, meta = 0, repeatCount = 0 }: KeyEventFields): number[] {
  return [
    ...tlvI32(1, meta),
    ...tlvI32(2, action),
    ...tlvI32(3, code),
    ...tlvI32(4, 0), // scanCode
    ...tlvI32(5, repeatCount),
    ...tlvI32(6, 0), // flags
    ...tlvI64(7, 0), // downTime: let the TV stamp it
    ...tlvI64(8, 0), // eventTime: let the TV stamp it
    ...tlvI32(10, DEVICE_VIRTUAL_KEYBOARD),
    ...tlvI32(11, SOURCE_KEYBOARD),
  ];
}

/** A complete send-key frame. `id` is echoed back in the TV's response. */
export function keyFrame(id: number, fields: KeyEventFields): number[] {
  const data = keyData(fields);
  const body = [1, ...u32(id), ...u16(data.length), ...data];
  return [FRAME_KEY, ...u16(body.length), ...body];
}

export interface Frame {
  type: number;
  payload: number[];
}

/**
 * Splits complete frames off the front of `buffer`. Returns the frames and whatever partial
 * frame remains, to be prepended to the next chunk.
 */
export function splitFrames(buffer: number[]): { frames: Frame[]; rest: number[] } {
  const frames: Frame[] = [];
  let offset = 0;
  while (buffer.length - offset >= 3) {
    const length = (buffer[offset + 1] << 8) | buffer[offset + 2];
    if (buffer.length - offset < 3 + length) break;
    frames.push({
      type: buffer[offset],
      payload: buffer.slice(offset + 3, offset + 3 + length),
    });
    offset += 3 + length;
  }
  return { frames, rest: buffer.slice(offset) };
}

/** The packet id of a send-key response frame, or null if `frame` isn't one. */
export function keyResponseId(frame: Frame): number | null {
  if (frame.type !== FRAME_KEY || frame.payload.length < 7) return null;
  const p = frame.payload;
  return ((p[1] << 24) | (p[2] << 16) | (p[3] << 8) | p[4]) >>> 0;
}
