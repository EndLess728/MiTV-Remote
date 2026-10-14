/** Android `KeyEvent.KEYCODE_*` values used by the remote. */
export const AndroidKey = {
  home: 3,
  back: 4,
  dpadUp: 19,
  dpadDown: 20,
  dpadLeft: 21,
  dpadRight: 22,
  dpadCenter: 23,
  volumeUp: 24,
  volumeDown: 25,
  power: 26,
  enter: 66,
  del: 67,
  menu: 82,
  search: 84,
  playPause: 85,
  next: 87,
  previous: 88,
  rewind: 89,
  fastForward: 90,
  mute: 164,
  info: 165,
  channelUp: 166,
  channelDown: 167,
  settings: 176,
  tvInput: 178,
  appSwitch: 187,
} as const;

export type AndroidKeyName = keyof typeof AndroidKey;

/** META_SHIFT_ON | META_SHIFT_LEFT_ON */
export const META_SHIFT = 0x41;

export interface Keystroke {
  code: number;
  meta: number;
}

const SYMBOLS: Record<string, [number, number]> = {
  ' ': [62, 0],
  '\n': [66, 0],
  '\t': [61, 0],
  '.': [56, 0],
  ',': [55, 0],
  '-': [69, 0],
  '=': [70, 0],
  '[': [71, 0],
  ']': [72, 0],
  '\\': [73, 0],
  ';': [74, 0],
  "'": [75, 0],
  '/': [76, 0],
  '@': [77, 0],
  '+': [81, 0],
  '*': [17, 0],
  '#': [18, 0],
  '`': [68, 0],
  '!': [8, META_SHIFT],
  $: [11, META_SHIFT],
  '%': [12, META_SHIFT],
  '^': [13, META_SHIFT],
  '&': [14, META_SHIFT],
  '(': [16, META_SHIFT],
  ')': [7, META_SHIFT],
  _: [69, META_SHIFT],
  '?': [76, META_SHIFT],
  ':': [74, META_SHIFT],
  '"': [75, META_SHIFT],
  '<': [55, META_SHIFT],
  '>': [56, META_SHIFT],
  '{': [71, META_SHIFT],
  '}': [72, META_SHIFT],
  '|': [73, META_SHIFT],
  '~': [68, META_SHIFT],
};

/**
 * Maps a character to an Android key code (+ shift) on the virtual keyboard layout, so text can
 * be "typed" through the key-event channel (MiLink has no text packet). Returns null for
 * characters with no key, such as emoji or accented letters.
 */
export function keystrokeFor(ch: string): Keystroke | null {
  if (ch.length !== 1) return null;
  const c = ch.charCodeAt(0);
  if (c >= 0x61 && c <= 0x7a) return { code: 29 + (c - 0x61), meta: 0 }; // a-z
  if (c >= 0x41 && c <= 0x5a) return { code: 29 + (c - 0x41), meta: META_SHIFT }; // A-Z
  if (c >= 0x30 && c <= 0x39) return { code: 7 + (c - 0x30), meta: 0 }; // 0-9
  const entry = SYMBOLS[ch];
  return entry ? { code: entry[0], meta: entry[1] } : null;
}
