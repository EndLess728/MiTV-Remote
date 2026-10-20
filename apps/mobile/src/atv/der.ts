/**
 * Minimal DER for the remote's client certificate: build a self-signed X.509 certificate around
 * an RSA key the native side generated, and read RSA public keys out of certificates.
 * iOS has no API to create certificates, so this lives here, shared by both platforms.
 */
import type { Bytes } from './protobuf';

const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_NULL = 0x05;
const TAG_OID = 0x06;
const TAG_UTF8 = 0x0c;
const TAG_UTC_TIME = 0x17;
const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;
const TAG_VERSION = 0xa0; // [0] EXPLICIT

function length(n: number): Bytes {
  if (n < 0x80) return [n];
  const out: Bytes = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return [0x80 | out.length, ...out];
}

export function tlv(tag: number, content: Bytes): Bytes {
  return [tag, ...length(content.length), ...content];
}

export const sequence = (...items: Bytes[]): Bytes => tlv(TAG_SEQUENCE, items.flat());

/** INTEGER from unsigned big-endian bytes. */
export function integer(magnitude: Bytes): Bytes {
  const bytes = stripZeros(magnitude);
  return tlv(TAG_INTEGER, bytes[0] & 0x80 ? [0, ...bytes] : bytes);
}

export function oid(dotted: string): Bytes {
  const parts = dotted.split('.').map(Number);
  const out: Bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk: Bytes = [];
    let v = part;
    do {
      chunk.unshift((v & 0x7f) | (chunk.length ? 0x80 : 0));
      v = Math.floor(v / 128);
    } while (v > 0);
    out.push(...chunk);
  }
  return tlv(TAG_OID, out);
}

const OID_RSA = '1.2.840.113549.1.1.1';
const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_COMMON_NAME = '2.5.4.3';

function algorithm(dotted: string): Bytes {
  return sequence(oid(dotted), tlv(TAG_NULL, []));
}

function name(commonName: string): Bytes {
  const cn = Array.from(commonName, (c) => c.charCodeAt(0) & 0x7f);
  return sequence(tlv(TAG_SET, sequence(oid(OID_COMMON_NAME), tlv(TAG_UTF8, cn))));
}

/** UTCTime, YYMMDDHHMMSSZ. Only valid until 2049, which is all the certificate needs. */
function utcTime(date: Date): Bytes {
  const two = (n: number) => String(n).padStart(2, '0');
  const text =
    two(date.getUTCFullYear() % 100) +
    two(date.getUTCMonth() + 1) +
    two(date.getUTCDate()) +
    two(date.getUTCHours()) +
    two(date.getUTCMinutes()) +
    two(date.getUTCSeconds()) +
    'Z';
  return tlv(
    TAG_UTC_TIME,
    Array.from(text, (c) => c.charCodeAt(0)),
  );
}

export interface RsaPublicKey {
  /** Unsigned big-endian, no leading zeros. */
  modulus: Bytes;
  exponent: Bytes;
}

export function subjectPublicKeyInfo(key: RsaPublicKey): Bytes {
  const pkcs1 = sequence(integer(key.modulus), integer(key.exponent));
  return sequence(algorithm(OID_RSA), tlv(TAG_BIT_STRING, [0, ...pkcs1]));
}

/** The to-be-signed part of a self-signed v3 certificate for `key`. */
export function tbsCertificate(
  key: RsaPublicKey,
  commonName: string,
  serial: Bytes,
  notBefore: Date,
): Bytes {
  const subject = name(commonName);
  return sequence(
    tlv(TAG_VERSION, integer([2])),
    integer(serial),
    algorithm(OID_SHA256_RSA),
    subject,
    sequence(utcTime(notBefore), utcTime(new Date(Date.UTC(2049, 11, 31, 23, 59, 59)))),
    subject,
    subjectPublicKeyInfo(key),
  );
}

/** Wraps a TBS certificate and its SHA256withRSA signature into the final certificate. */
export function certificate(tbs: Bytes, signature: Bytes): Bytes {
  return sequence(tbs, algorithm(OID_SHA256_RSA), tlv(TAG_BIT_STRING, [0, ...signature]));
}

// ── Parsing ──────────────────────────────────────────────────

interface Node {
  tag: number;
  content: Bytes;
}

function readNode(bytes: Bytes, offset: number): { node: Node; next: number } {
  const tag = bytes[offset];
  let len = bytes[offset + 1];
  let start = offset + 2;
  if (len === undefined) throw new Error('Truncated DER');
  if (len & 0x80) {
    const count = len & 0x7f;
    len = 0;
    for (let i = 0; i < count; i++) len = len * 256 + bytes[start + i];
    start += count;
  }
  if (start + len > bytes.length) throw new Error('Truncated DER');
  return { node: { tag, content: bytes.slice(start, start + len) }, next: start + len };
}

function children(content: Bytes): Node[] {
  const out: Node[] = [];
  let offset = 0;
  while (offset < content.length) {
    const { node, next } = readNode(content, offset);
    out.push(node);
    offset = next;
  }
  return out;
}

function stripZeros(bytes: Bytes): Bytes {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

/**
 * The RSA public key in an X.509 certificate, a SubjectPublicKeyInfo, or a PKCS#1 RSAPublicKey
 * (what iOS exports). Throws for anything else, such as an EC key.
 */
export function rsaPublicKey(der: Bytes): RsaPublicKey {
  const top = readNode(der, 0).node;
  if (top.tag !== TAG_SEQUENCE) throw new Error('Not a DER sequence');
  const parts = children(top.content);

  // PKCS#1: SEQUENCE { INTEGER modulus, INTEGER exponent }
  if (parts.length === 2 && parts[0].tag === TAG_INTEGER && parts[1].tag === TAG_INTEGER) {
    return { modulus: stripZeros(parts[0].content), exponent: stripZeros(parts[1].content) };
  }
  // SubjectPublicKeyInfo: SEQUENCE { AlgorithmIdentifier, BIT STRING { PKCS#1 } }
  if (parts.length === 2 && parts[0].tag === TAG_SEQUENCE && parts[1].tag === TAG_BIT_STRING) {
    return rsaPublicKey(parts[1].content.slice(1));
  }
  // Certificate: SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
  if (parts.length === 3 && parts[0].tag === TAG_SEQUENCE) {
    const tbs = children(parts[0].content);
    const spki = tbs[tbs[0].tag === TAG_VERSION ? 6 : 5];
    if (!spki) throw new Error('Certificate has no public key');
    return rsaPublicKey(tlv(spki.tag, spki.content));
  }
  throw new Error('Unrecognized public key format');
}
