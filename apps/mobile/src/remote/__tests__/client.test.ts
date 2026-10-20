import { X509Certificate } from 'crypto';

import { CLIENT_CERT, PAIRING_CODE, PAIRING_SECRET_HEX, PB, SERVER_CERT } from '@/atv/__fixtures__/vectors';
import {
  ATV_PAIRING_PORT,
  ATV_REMOTE_PORT,
  Direction,
  imeBatchEdit,
  keyInject,
  pairingConfiguration,
  pairingOptions,
  pairingRequest,
  pingResponse,
  remoteConfigure,
  WANTED_FEATURES,
} from '@/atv/messages';
import { delimited } from '@/atv/protobuf';
import { MILINK_PORT } from '@/milink/protocol';

type Listener = (event: never) => void;

// A scripted stand-in for the mockNative socket module.
const mockNative = {
  listeners: {} as Record<string, Listener>,
  connect: jest.fn(),
  disconnect: jest.fn(),
  send: jest.fn(),
  clientKey: jest.fn(),
  signWithClientKey: jest.fn(),
  setClientCertificate: jest.fn(),
  addListener(name: string, listener: Listener) {
    this.listeners[name] = listener;
    return { remove: () => {} };
  },
  emitState(event: object) {
    (this.listeners.onSocketState as (e: object) => void)(event);
  },
  emitData(bytes: number[]) {
    (this.listeners.onSocketData as (e: object) => void)({ bytes });
  },
};

jest.mock('milink', () => ({ __esModule: true, default: mockNative }));

const bytesOf = (b64: string) => Array.from(Buffer.from(b64, 'base64'));
const clientSpki = Array.from(
  new X509Certificate(Buffer.from(CLIENT_CERT, 'base64')).publicKey.export({
    format: 'der',
    type: 'spki',
  }),
);

/** Lets the client's awaited mockNative calls (client key, signing) settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));
const sentMessages = () => mockNative.send.mock.calls.map(([bytes]) => bytes as number[]);

describe('RemoteClient', () => {
  let remote: typeof import('../client').remote;
  let useConnectionStore: typeof import('../client').useConnectionStore;
  let useSettingsStore: typeof import('@/store').useSettingsStore;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockNative.clientKey.mockResolvedValue({ publicKey: clientSpki, certificate: bytesOf(CLIENT_CERT) });
    ({ remote, useConnectionStore } = require('../client'));
    ({ useSettingsStore } = require('@/store'));
  });

  afterEach(() => remote.disconnect());

  it('uses MiLink when port 6091 answers, and remembers it', () => {
    remote.connect('192.168.1.10');
    expect(mockNative.connect).toHaveBeenLastCalledWith('192.168.1.10', MILINK_PORT, false);
    mockNative.emitState({ state: 'connected' });
    expect(useConnectionStore.getState().status).toBe('connected');
    expect(useSettingsStore.getState().tvProtocols['192.168.1.10']).toBe('milink');
  });

  it('pairs and connects over Android TV Remote when MiLink is absent', async () => {
    remote.connect('192.168.1.54');
    expect(mockNative.connect).toHaveBeenLastCalledWith('192.168.1.54', MILINK_PORT, false);

    // Nothing on 6091 → try the Android TV Remote port.
    mockNative.emitState({ state: 'failed', error: 'refused', reachable: false });
    await flush();
    expect(mockNative.connect).toHaveBeenLastCalledWith('192.168.1.54', ATV_REMOTE_PORT, true);

    // TLS refused before any message: certificate not paired → pairing port.
    mockNative.emitState({ state: 'failed', error: 'certificate unknown', reachable: true });
    await flush();
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'pairing',
      pairingStep: 'starting',
    });
    expect(mockNative.connect).toHaveBeenLastCalledWith('192.168.1.54', ATV_PAIRING_PORT, true);

    // Pairing handshake.
    mockNative.send.mockClear();
    mockNative.emitState({ state: 'connected', peerCertificate: bytesOf(SERVER_CERT) });
    expect(sentMessages()).toEqual([delimited(pairingRequest('Mi Remote'))]);
    mockNative.emitData(delimited(PB.inRequestAck));
    mockNative.emitData(delimited(PB.pairingOptions));
    expect(sentMessages().slice(1)).toEqual([
      delimited(pairingOptions()),
      delimited(pairingConfiguration()),
    ]);
    mockNative.emitData(delimited(PB.inConfigurationAck));
    expect(useConnectionStore.getState().pairingStep).toBe('enterCode');

    // A code with a bad checksum never reaches the TV.
    mockNative.send.mockClear();
    expect(remote.submitPairingCode('000000')).toBe(false);
    expect(mockNative.send).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().pairingError).toBe('wrongCode');

    // The right code sends the secret androidtvremote2 computes for these certificates.
    expect(remote.submitPairingCode(PAIRING_CODE.toLowerCase())).toBe(true);
    const secretMessage = sentMessages()[0];
    expect(Buffer.from(secretMessage.slice(-32)).toString('hex')).toBe(PAIRING_SECRET_HEX);
    expect(useConnectionStore.getState().pairingStep).toBe('verifying');

    // TV accepts → reconnect to the remote port.
    mockNative.emitData(delimited([8, 2, 16, 200, 1, 202, 2, 2, 10, 0])); // secret_ack
    await flush();
    expect(mockNative.connect).toHaveBeenLastCalledWith('192.168.1.54', ATV_REMOTE_PORT, true);
    expect(useSettingsStore.getState().tvProtocols['192.168.1.54']).toBe('atv');

    // Remote session: answer configure and pings, then send keys.
    mockNative.send.mockClear();
    mockNative.emitState({ state: 'connected', peerCertificate: bytesOf(SERVER_CERT) });
    mockNative.emitData([...delimited(PB.inConfigure), ...delimited(PB.inPing12345)]);
    expect(useConnectionStore.getState().status).toBe('connected');
    expect(sentMessages()).toEqual([
      delimited(remoteConfigure(WANTED_FEATURES & 639)),
      delimited(pingResponse(12345)),
    ]);

    mockNative.send.mockClear();
    remote.press('dpadUp');
    expect(sentMessages()).toEqual([delimited(keyInject(19, Direction.short))]);

    // Text goes in as an IME edit even before the TV has sent IME counters.
    mockNative.send.mockClear();
    remote.type('Hi');
    expect(sentMessages()).toEqual([delimited(imeBatchEdit(0, 0, 'Hi'))]);
  });

  it('goes straight to Android TV Remote for a TV known to use it', async () => {
    useSettingsStore.getState().setTvProtocol('192.168.1.54', 'atv');
    remote.connect('192.168.1.54');
    await flush();
    expect(mockNative.connect).toHaveBeenCalledTimes(1);
    expect(mockNative.connect).toHaveBeenLastCalledWith('192.168.1.54', ATV_REMOTE_PORT, true);
  });

  it('creates and stores a self-signed certificate when none exists', async () => {
    mockNative.clientKey.mockResolvedValue({ publicKey: clientSpki });
    mockNative.signWithClientKey.mockResolvedValue(Array.from({ length: 256 }, () => 1));
    remote.connect('192.168.1.54');
    mockNative.emitState({ state: 'failed', reachable: false });
    await flush();
    expect(mockNative.signWithClientKey).toHaveBeenCalledTimes(1);
    expect(mockNative.setClientCertificate).toHaveBeenCalledTimes(1);
    const der = mockNative.setClientCertificate.mock.calls[0][0] as number[];
    expect(new X509Certificate(Buffer.from(der)).subject).toBe('CN=Mi Remote');
  });
});
