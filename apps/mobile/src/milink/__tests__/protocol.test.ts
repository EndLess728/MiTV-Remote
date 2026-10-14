import { keystrokeFor, META_SHIFT } from '../keys';
import {
  ACTION_DOWN,
  ACTION_UP,
  FRAME_KEY,
  HEARTBEAT,
  keyData,
  keyFrame,
  keyResponseId,
  splitFrames,
} from '../protocol';

describe('MiLink protocol', () => {
  it('encodes key data as the 58-byte TLV block the TV parses', () => {
    // The TV logs "SendKeyPacket: data length:58" for every key from the official remote.
    expect(keyData({ code: 24, action: ACTION_UP })).toHaveLength(58);
  });

  it('encodes each KeyEvent field big-endian with its tag', () => {
    const data = keyData({ code: 24, action: ACTION_UP, meta: META_SHIFT, repeatCount: 2 });
    expect(data.slice(0, 5)).toEqual([1, 0, 0, 0, 0x41]); // meta
    expect(data.slice(5, 10)).toEqual([2, 0, 0, 0, 1]); // action
    expect(data.slice(10, 15)).toEqual([3, 0, 0, 0, 24]); // keycode
    expect(data.slice(20, 25)).toEqual([5, 0, 0, 0, 2]); // repeat count
    expect(data.slice(30, 39)).toEqual([7, 0, 0, 0, 0, 0, 0, 0, 0]); // downTime = 0
    expect(data.slice(39, 48)).toEqual([8, 0, 0, 0, 0, 0, 0, 0, 0]); // eventTime = 0
    expect(data.slice(48, 53)).toEqual([10, 0xff, 0xff, 0xff, 0xff]); // deviceId = -1
    expect(data.slice(53, 58)).toEqual([11, 0, 0, 0x01, 0x01]); // source = keyboard
  });

  it('wraps key data in a send-key frame', () => {
    const frame = keyFrame(0x01020304, { code: 19, action: ACTION_DOWN });
    expect(frame.slice(0, 3)).toEqual([FRAME_KEY, 0, 65]); // 1 + 4 + 2 + 58
    expect(frame.slice(3, 10)).toEqual([1, 1, 2, 3, 4, 0, 58]);
    expect(frame).toHaveLength(68);
  });

  it('splits frames across chunk boundaries', () => {
    const response = [FRAME_KEY, 0, 8, 2, 0, 0, 0, 9, 0, 1, 0];
    const stream = [...HEARTBEAT, ...response];
    const first = splitFrames(stream.slice(0, 7));
    expect(first.frames).toEqual([{ type: 2, payload: [] }]);
    const second = splitFrames([...first.rest, ...stream.slice(7)]);
    expect(second.frames).toHaveLength(1);
    expect(second.rest).toEqual([]);
    expect(keyResponseId(second.frames[0])).toBe(9);
  });

  it('maps characters to Android keystrokes', () => {
    expect(keystrokeFor('a')).toEqual({ code: 29, meta: 0 });
    expect(keystrokeFor('Z')).toEqual({ code: 54, meta: META_SHIFT });
    expect(keystrokeFor('7')).toEqual({ code: 14, meta: 0 });
    expect(keystrokeFor('?')).toEqual({ code: 76, meta: META_SHIFT });
    expect(keystrokeFor('é')).toBeNull();
  });
});
