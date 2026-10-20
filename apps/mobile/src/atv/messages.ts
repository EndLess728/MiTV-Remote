/**
 * Android TV Remote protocol v2, the one Google's TV remote apps use. Two TLS ports, both
 * carrying varint-length-delimited protobuf messages, and both requiring a client certificate:
 *
 *   6467  pairing ("polo"): the TV shows a 6-digit hex code; proving we saw it makes the TV
 *         trust our certificate from then on.
 *   6466  remote: key presses, text, pings. The TV drops the TLS session if the certificate
 *         isn't paired.
 *
 * Field numbers follow polo.proto and remotemessage.proto as used by androidtvremote2.
 */
import type { RsaPublicKey } from './der';
import {
  type Bytes,
  decode,
  fieldBytes,
  fieldMessage,
  fieldString,
  fieldVarint,
  getInt,
  getMessage,
  getString,
  has,
} from './protobuf';
import { sha256 } from './sha256';

export const ATV_REMOTE_PORT = 6466;
export const ATV_PAIRING_PORT = 6467;

// ── Pairing (polo) ───────────────────────────────────────────

const PROTOCOL_VERSION = 2;
export const STATUS_OK = 200;
export const STATUS_BAD_SECRET = 402;
const ENCODING_HEXADECIMAL = 3;
const ROLE_INPUT = 1;
const CODE_LENGTH = 6;

function outer(body: Bytes): Bytes {
  return [...fieldVarint(1, PROTOCOL_VERSION), ...fieldVarint(2, STATUS_OK), ...body];
}

const hexEncoding = (): Bytes => [
  ...fieldVarint(1, ENCODING_HEXADECIMAL),
  ...fieldVarint(2, CODE_LENGTH),
];

export function pairingRequest(clientName: string): Bytes {
  return outer(fieldMessage(10, [...fieldString(1, 'atvremote'), ...fieldString(2, clientName)]));
}

export function pairingOptions(): Bytes {
  return outer(
    fieldMessage(20, [...fieldMessage(1, hexEncoding()), ...fieldVarint(3, ROLE_INPUT)]),
  );
}

export function pairingConfiguration(): Bytes {
  return outer(
    fieldMessage(30, [...fieldMessage(1, hexEncoding()), ...fieldVarint(2, ROLE_INPUT)]),
  );
}

export function pairingSecret(secret: Bytes): Bytes {
  return outer(fieldMessage(40, fieldBytes(1, secret)));
}

export type PairingReply = 'requestAck' | 'options' | 'configurationAck' | 'secretAck' | 'unknown';

export function parsePairingMessage(bytes: Bytes): { status: number; reply: PairingReply } {
  const msg = decode(bytes);
  const status = getInt(msg, 2, STATUS_OK);
  let reply: PairingReply = 'unknown';
  if (has(msg, 11)) reply = 'requestAck';
  else if (has(msg, 20)) reply = 'options';
  else if (has(msg, 31)) reply = 'configurationAck';
  else if (has(msg, 41)) reply = 'secretAck';
  return { status, reply };
}

/** Normalizes what the user typed: uppercase hex, 6 characters, or null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const code = input.replace(/\s/g, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(code) ? code : null;
}

/**
 * The pairing secret: SHA-256 over both public keys and the last 4 hex digits of the code.
 * The first 2 hex digits are a checksum: they must equal the hash's first byte, which catches
 * a mistyped code before the TV sees it. Returns null when the checksum doesn't match.
 */
export function pairingSecretFor(
  client: RsaPublicKey,
  server: RsaPublicKey,
  code: string,
): Bytes | null {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const codeBytes = [0, 2, 4].map((i) => parseInt(normalized.slice(i, i + 2), 16));
  const hash = sha256([
    ...client.modulus,
    ...client.exponent,
    ...server.modulus,
    ...server.exponent,
    ...codeBytes.slice(1),
  ]);
  return hash[0] === codeBytes[0] ? hash : null;
}

// ── Remote ───────────────────────────────────────────────────

/** Feature bits exchanged in RemoteConfigure / RemoteSetActive. */
export const Feature = {
  ping: 1 << 0,
  key: 1 << 1,
  ime: 1 << 2,
  power: 1 << 5,
  volume: 1 << 6,
  appLink: 1 << 9,
} as const;

export const WANTED_FEATURES =
  Feature.ping | Feature.key | Feature.ime | Feature.power | Feature.volume | Feature.appLink;

export const Direction = {
  startLong: 1,
  endLong: 2,
  short: 3,
} as const;

export function remoteConfigure(features: number): Bytes {
  const deviceInfo = [
    ...fieldString(1, 'Mi Remote'),
    ...fieldString(2, 'Mi Remote'),
    ...fieldVarint(3, 1),
    ...fieldString(4, '1'),
    ...fieldString(5, 'atvremote'),
    ...fieldString(6, '1.0.0'),
  ];
  return fieldMessage(1, [...fieldVarint(1, features), ...fieldMessage(2, deviceInfo)]);
}

export function remoteSetActive(features: number): Bytes {
  return fieldMessage(2, fieldVarint(1, features));
}

export function pingResponse(value: number): Bytes {
  return fieldMessage(9, fieldVarint(1, value));
}

/** `code` is an Android KeyEvent keycode; the protocol's key enum uses the same numbers. */
export function keyInject(code: number, direction: number): Bytes {
  return fieldMessage(10, [...fieldVarint(1, code), ...fieldVarint(2, direction)]);
}

/**
 * Puts `text` into the focused text field on the TV, cursor after it. The counters echo the
 * TV's latest (0 before it has sent any), as the Google TV app and other clients do.
 */
export function imeBatchEdit(imeCounter: number, fieldCounter: number, text: string): Bytes {
  const cursor = Array.from(text).length;
  const imeObject = [...fieldVarint(1, cursor), ...fieldVarint(2, cursor), ...fieldString(3, text)];
  const editInfo = [...fieldVarint(1, 1), ...fieldMessage(2, imeObject)];
  return fieldMessage(21, [
    ...fieldVarint(1, imeCounter),
    ...fieldVarint(2, fieldCounter),
    ...fieldMessage(3, editInfo),
  ]);
}

export type RemoteEvent =
  | { type: 'configure'; features: number; model: string; vendor: string }
  | { type: 'setActive' }
  | { type: 'ping'; value: number }
  | { type: 'start'; started: boolean }
  | { type: 'imeBatchEdit'; imeCounter: number; fieldCounter: number }
  | { type: 'imeKeyInject'; appPackage: string; fieldCounter?: number }
  | { type: 'imeShow'; fieldCounter: number }
  | { type: 'volume'; level: number; max: number; muted: boolean }
  | { type: 'error' }
  | { type: 'other' };

export function parseRemoteMessage(bytes: Bytes): RemoteEvent {
  const msg = decode(bytes);
  const configure = getMessage(msg, 1);
  if (configure) {
    const info = getMessage(configure, 2);
    return {
      type: 'configure',
      features: getInt(configure, 1),
      model: info ? getString(info, 1) : '',
      vendor: info ? getString(info, 2) : '',
    };
  }
  if (has(msg, 2)) return { type: 'setActive' };
  if (has(msg, 3)) return { type: 'error' };
  const ping = getMessage(msg, 8);
  if (ping) return { type: 'ping', value: getInt(ping, 1) };
  const imeKey = getMessage(msg, 20);
  if (imeKey) {
    const app = getMessage(imeKey, 1);
    const field = getMessage(imeKey, 2);
    return {
      type: 'imeKeyInject',
      appPackage: app ? getString(app, 12) : '',
      fieldCounter: field ? getInt(field, 1) : undefined,
    };
  }
  const show = getMessage(msg, 22);
  const showField = show ? getMessage(show, 2) : undefined;
  if (showField) return { type: 'imeShow', fieldCounter: getInt(showField, 1) };
  const batch = getMessage(msg, 21);
  if (batch) {
    return { type: 'imeBatchEdit', imeCounter: getInt(batch, 1), fieldCounter: getInt(batch, 2) };
  }
  const start = getMessage(msg, 40);
  if (start) return { type: 'start', started: getInt(start, 1) !== 0 };
  const volume = getMessage(msg, 50);
  if (volume) {
    return {
      type: 'volume',
      level: getInt(volume, 7),
      max: getInt(volume, 6),
      muted: getInt(volume, 8) !== 0,
    };
  }
  return { type: 'other' };
}
