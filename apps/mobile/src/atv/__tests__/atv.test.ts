import { createHash, generateKeyPairSync, sign, X509Certificate } from 'crypto';

import {
  CLIENT_CERT,
  PAIRING_CODE,
  PAIRING_SECRET_HEX,
  PB,
  SERVER_CERT,
} from '../__fixtures__/vectors';
import { certificate, rsaPublicKey, subjectPublicKeyInfo, tbsCertificate } from '../der';
import {
  Direction,
  imeBatchEdit,
  keyInject,
  normalizeCode,
  pairingConfiguration,
  pairingOptions,
  pairingRequest,
  pairingSecret,
  pairingSecretFor,
  parsePairingMessage,
  parseRemoteMessage,
  pingResponse,
  remoteConfigure,
  remoteSetActive,
  STATUS_BAD_SECRET,
} from '../messages';
import { delimited, splitDelimited, varint } from '../protobuf';
import { sha256 } from '../sha256';

const bytesOf = (b64: string) => Array.from(Buffer.from(b64, 'base64'));
const hex = (bytes: number[]) => Buffer.from(bytes).toString('hex');

describe('protobuf', () => {
  it('encodes varints, including negative int32 as 10 bytes', () => {
    expect(varint(0)).toEqual([0]);
    expect(varint(300)).toEqual([0xac, 0x02]);
    expect(varint(-1)).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
  });

  it('splits length-delimited messages across chunk boundaries', () => {
    const big = Array.from({ length: 200 }, (_, i) => i & 0xff);
    const stream = [...delimited([1, 2, 3]), ...delimited(big)];
    const first = splitDelimited(stream.slice(0, 5));
    expect(first.messages).toEqual([[1, 2, 3]]);
    const second = splitDelimited([...first.rest, ...stream.slice(5)]);
    expect(second.messages).toEqual([big]);
    expect(second.rest).toEqual([]);
  });

  it('keeps a partial varint length for the next chunk', () => {
    const stream = delimited(Array.from({ length: 200 }, () => 7));
    const { messages, rest } = splitDelimited(stream.slice(0, 1));
    expect(messages).toEqual([]);
    expect(rest).toEqual(stream.slice(0, 1));
  });
});

describe('sha256', () => {
  it('matches node crypto for several lengths', () => {
    for (const len of [0, 3, 55, 56, 64, 300]) {
      const data = Array.from({ length: len }, (_, i) => (i * 31) & 0xff);
      expect(hex(sha256(data))).toBe(createHash('sha256').update(Buffer.from(data)).digest('hex'));
    }
  });
});

describe('DER', () => {
  it('reads the RSA key from a certificate, an SPKI and PKCS#1', () => {
    const cert = new X509Certificate(Buffer.from(CLIENT_CERT, 'base64'));
    const jwk = cert.publicKey.export({ format: 'jwk' });
    const modulus = Array.from(Buffer.from(jwk.n as string, 'base64url'));
    const exponent = Array.from(Buffer.from(jwk.e as string, 'base64url'));

    expect(rsaPublicKey(bytesOf(CLIENT_CERT))).toEqual({ modulus, exponent });
    const spki = Array.from(cert.publicKey.export({ format: 'der', type: 'spki' }));
    expect(rsaPublicKey(spki)).toEqual({ modulus, exponent });
    const pkcs1 = Array.from(cert.publicKey.export({ format: 'der', type: 'pkcs1' }));
    expect(rsaPublicKey(pkcs1)).toEqual({ modulus, exponent });
  });

  it('builds a self-signed certificate that OpenSSL accepts and verifies', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = rsaPublicKey(Array.from(publicKey.export({ format: 'der', type: 'spki' })));
    expect(subjectPublicKeyInfo(key)).toEqual(
      Array.from(publicKey.export({ format: 'der', type: 'spki' })),
    );

    const tbs = tbsCertificate(key, 'Mi Remote', [0x81, 2, 3, 4], new Date('2026-10-20T00:00:00Z'));
    const signature = Array.from(sign('sha256', Buffer.from(tbs), privateKey));
    const der = certificate(tbs, signature);

    const cert = new X509Certificate(Buffer.from(der));
    expect(cert.subject).toBe('CN=Mi Remote');
    expect(cert.issuer).toBe('CN=Mi Remote');
    expect(cert.verify(publicKey)).toBe(true);
    expect(new Date(cert.validTo).getUTCFullYear()).toBe(2049);
    expect(rsaPublicKey(der)).toEqual(key);
  });
});

describe('pairing', () => {
  const client = rsaPublicKey(bytesOf(CLIENT_CERT));
  const server = rsaPublicKey(bytesOf(SERVER_CERT));

  it('computes the same secret as androidtvremote2', () => {
    expect(hex(pairingSecretFor(client, server, PAIRING_CODE)!)).toBe(PAIRING_SECRET_HEX);
    expect(hex(pairingSecretFor(client, server, ' aa3f9a ')!)).toBe(PAIRING_SECRET_HEX);
  });

  it('rejects a mistyped code using its checksum byte', () => {
    expect(pairingSecretFor(client, server, 'AB3F9A')).toBeNull();
    expect(pairingSecretFor(client, server, 'AA3F9')).toBeNull();
  });

  it('normalizes codes', () => {
    expect(normalizeCode('ab 12 cd')).toBe('AB12CD');
    expect(normalizeCode('xyz123')).toBeNull();
  });

  it('serializes pairing messages like the reference', () => {
    expect(pairingRequest('Mi Remote')).toEqual(PB.pairingRequest);
    expect(pairingOptions()).toEqual(PB.pairingOptions);
    expect(pairingConfiguration()).toEqual(PB.pairingConfiguration);
    expect(pairingSecret(Array.from({ length: 32 }, (_, i) => i))).toEqual(PB.pairingSecret0to31);
  });

  it('parses pairing replies', () => {
    expect(parsePairingMessage(PB.inRequestAck)).toEqual({ status: 200, reply: 'requestAck' });
    expect(parsePairingMessage(PB.pairingOptions)).toEqual({ status: 200, reply: 'options' });
    expect(parsePairingMessage(PB.inConfigurationAck)).toEqual({
      status: 200,
      reply: 'configurationAck',
    });
    expect(parsePairingMessage(PB.inBadSecret).status).toBe(STATUS_BAD_SECRET);
  });
});

describe('remote messages', () => {
  it('serializes outgoing messages like the reference', () => {
    expect(keyInject(19, Direction.short)).toEqual(PB.keyDpadUpShort);
    expect(pingResponse(-5)).toEqual(PB.pingResponseMinus5);
    expect(remoteSetActive(615)).toEqual(PB.setActive615);
    expect(imeBatchEdit(3, 7, 'héllo')).toEqual(PB.imeHello);
    expect(remoteConfigure(615)).toEqual(PB.configure615);
  });

  it('parses incoming messages', () => {
    expect(parseRemoteMessage(PB.inPing12345)).toEqual({ type: 'ping', value: 12345 });
    expect(parseRemoteMessage(PB.inConfigure)).toEqual({
      type: 'configure',
      features: 639,
      model: 'MiTV-MOOR2',
      vendor: 'Xiaomi',
    });
    expect(parseRemoteMessage(PB.inStart)).toEqual({ type: 'start', started: true });
    expect(parseRemoteMessage(PB.inVolume)).toEqual({
      type: 'volume',
      level: 12,
      max: 100,
      muted: false,
    });
    expect(parseRemoteMessage(PB.inImeBatch)).toEqual({
      type: 'imeBatchEdit',
      imeCounter: 9,
      fieldCounter: 2,
    });
    expect(parseRemoteMessage(PB.inImeKey)).toEqual({
      type: 'imeKeyInject',
      appPackage: 'com.netflix',
    });
    expect(parseRemoteMessage(PB.pingResponseMinus5)).toEqual({ type: 'other' });
  });
});
