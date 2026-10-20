import MiLink, { type SocketStateEvent } from 'milink';
import { create } from 'zustand';

import { certificate, type RsaPublicKey, rsaPublicKey, tbsCertificate } from '@/atv/der';
import {
  ATV_PAIRING_PORT,
  ATV_REMOTE_PORT,
  Direction,
  imeBatchEdit,
  keyInject,
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
  STATUS_OK,
  WANTED_FEATURES,
} from '@/atv/messages';
import { type Bytes, delimited, splitDelimited } from '@/atv/protobuf';
import { AndroidKey, type AndroidKeyName, keystrokeFor } from '@/milink/keys';
import {
  ACTION_DOWN,
  ACTION_UP,
  HEARTBEAT,
  keyFrame,
  keyResponseId,
  MILINK_PORT,
  splitFrames,
} from '@/milink/protocol';
import { type TvProtocol, useSettingsStore } from '@/store';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'pairing';

/** Where an Android TV pairing stands: asking the TV for a code, waiting for the user to type
 *  it, or waiting for the TV to accept it. */
export type PairingStep = 'starting' | 'enterCode' | 'verifying';

export type PairingError = 'wrongCode' | 'rejected' | 'connection' | 'certificate';

interface ConnectionState {
  status: ConnectionStatus;
  host: string;
  error?: string;
  /** Round trip of the last acknowledged key, in milliseconds (MiLink only). */
  latencyMs?: number;
  protocol?: TvProtocol;
  pairingStep?: PairingStep;
  pairingError?: PairingError;
}

/** Live connection state for the UI. Not persisted. */
export const useConnectionStore = create<ConnectionState>(() => ({ status: 'idle', host: '' }));

const setState = (state: Partial<ConnectionState>) => useConnectionStore.setState(state);

const HEARTBEAT_MS = 5000;
const RECONNECT_MS = 2000;
/** MiLink: the TV auto-releases a key 175 ms after the last DOWN, so held keys resend DOWN faster. */
const REPEAT_MS = 100;
/** Android TV Remote: held keys repeat as discrete presses. */
const ATV_REPEAT_MS = 120;
const TYPE_INTERVAL_MS = 40;
/** The TV pings every 5 s; three missed pings means the connection is gone. */
const ATV_IDLE_MS = 16000;
const CLIENT_NAME = 'Mi Remote';

/** Which socket the native module currently holds, so its events go to the right handler. */
type Phase = 'none' | 'milink' | 'atv' | 'pairing';

/**
 * Client for the TV's remote-control service. Owns the native socket and speaks one of two
 * protocols, remembered per TV:
 *
 * - MiLink (TCP 6091), Xiaomi's own service on PatchWall TVs. No pairing.
 * - Android TV Remote v2 (TLS 6466, pairing on 6467), the Google TV remote protocol, for Mi TVs
 *   without MiLink. Needs a one-time pairing code shown on the TV.
 *
 * For a TV it hasn't seen, it tries MiLink first and falls back to Android TV Remote when
 * nothing listens on 6091.
 */
class RemoteClient {
  private host = '';
  private wantConnected = false;
  private protocol?: TvProtocol;
  private phase: Phase = 'none';
  /** Bumped on every disconnect so async steps from an older attempt stop. */
  private attempt = 0;
  private buffer: Bytes = [];
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private repeatTimer?: ReturnType<typeof setInterval>;
  private repeatCode = 0;
  private repeatCount = 0;

  // MiLink
  private nextId = 0;
  private pending = new Map<number, number>();

  // Android TV Remote
  private atvReady = false;
  private features = WANTED_FEATURES;
  private imeCounter?: number;
  private imeFieldCounter = 0;
  private justPaired = false;
  private clientKey?: RsaPublicKey;
  private serverKey?: RsaPublicKey;

  constructor() {
    MiLink.addListener('onSocketState', (event) => this.handleState(event));
    MiLink.addListener('onSocketData', ({ bytes }) => this.handleData(bytes));
  }

  // ── Connection ─────────────────────────────────────────────

  connect(host: string): void {
    const trimmed = host.trim();
    if (!trimmed) return;
    this.disconnect();
    this.host = trimmed;
    this.wantConnected = true;
    this.protocol = useSettingsStore.getState().tvProtocols[trimmed];
    setState({
      host: trimmed,
      status: 'connecting',
      error: undefined,
      protocol: this.protocol,
      pairingStep: undefined,
      pairingError: undefined,
    });
    this.open();
  }

  disconnect(): void {
    this.wantConnected = false;
    this.drop();
    setState({
      status: 'idle',
      error: undefined,
      latencyMs: undefined,
      pairingStep: undefined,
      pairingError: undefined,
    });
  }

  /** Drops the socket while the app is in the background; `resume()` reconnects. */
  suspend(): void {
    if (!this.wantConnected) return;
    this.drop();
    setState({ status: 'idle', latencyMs: undefined, pairingStep: undefined });
  }

  resume(): void {
    if (this.wantConnected && this.host) this.connect(this.host);
  }

  get isConnected(): boolean {
    return useConnectionStore.getState().status === 'connected';
  }

  private drop(): void {
    this.attempt += 1;
    this.stopTimers();
    this.phase = 'none';
    MiLink.disconnect();
  }

  private open(): void {
    if (this.protocol === 'atv') void this.openAtv();
    else this.openMiLink();
  }

  private openMiLink(): void {
    this.phase = 'milink';
    this.buffer = [];
    MiLink.connect(this.host, MILINK_PORT, false);
  }

  private openAtv(): Promise<void> {
    this.atvReady = false;
    this.imeCounter = undefined;
    this.features = WANTED_FEATURES;
    return this.openTls(ATV_REMOTE_PORT, 'atv');
  }

  /** Opens a TLS socket once the client certificate exists. */
  private async openTls(port: number, phase: Phase): Promise<void> {
    // Silence the previous socket first, so its late events can't land in the new phase.
    this.phase = 'none';
    MiLink.disconnect();
    const attempt = this.attempt;
    try {
      await this.ensureCertificate();
    } catch (e) {
      if (attempt !== this.attempt) return;
      setState({ status: 'failed', error: String(e), pairingError: 'certificate' });
      return;
    }
    if (attempt !== this.attempt || !this.wantConnected) return;
    this.phase = phase;
    this.buffer = [];
    MiLink.connect(this.host, port, true);
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    if (!this.wantConnected) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.wantConnected && !this.isConnected) this.open();
    }, RECONNECT_MS);
  }

  private stopTimers(): void {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.idleTimer);
    this.endHold(false);
  }

  private rememberProtocol(protocol: TvProtocol): void {
    this.protocol = protocol;
    useSettingsStore.getState().setTvProtocol(this.host, protocol);
    setState({ protocol });
  }

  private handleState(event: SocketStateEvent): void {
    if (event.state === 'disconnected') return; // only follows our own disconnect()
    if (this.phase === 'milink') this.handleMiLinkState(event);
    else if (this.phase === 'atv') this.handleAtvState(event);
    else if (this.phase === 'pairing') this.handlePairingState(event);
  }

  private handleData(bytes: number[]): void {
    if (this.phase === 'milink') this.handleMiLinkData(bytes);
    else if (this.phase === 'atv' || this.phase === 'pairing') {
      let messages: Bytes[];
      try {
        const split = splitDelimited([...this.buffer, ...bytes]);
        messages = split.messages;
        this.buffer = split.rest;
      } catch {
        this.buffer = [];
        return;
      }
      for (const message of messages) {
        if (this.phase === 'atv') this.handleAtvMessage(message);
        else if (this.phase === 'pairing') this.handlePairingMessage(message);
      }
    }
  }

  private sendDelimited(message: Bytes): void {
    MiLink.send(delimited(message));
  }

  // ── MiLink ─────────────────────────────────────────────────

  private handleMiLinkState({ state, error, reachable }: SocketStateEvent): void {
    if (state === 'connected') {
      this.buffer = [];
      this.pending.clear();
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => this.writeMiLink([...HEARTBEAT]), HEARTBEAT_MS);
      if (this.protocol !== 'milink') this.rememberProtocol('milink');
      setState({ status: 'connected', error: undefined });
    } else if (state === 'failed') {
      clearInterval(this.heartbeatTimer);
      this.endHold(false);
      if (!this.protocol && !reachable) {
        // Nothing on 6091: this TV may only have the Android TV Remote service.
        void this.openAtv();
        return;
      }
      setState({ status: 'failed', error });
      this.scheduleReconnect();
    } else if (state === 'connecting') {
      setState({ status: 'connecting' });
    }
  }

  private handleMiLinkData(bytes: number[]): void {
    const { frames, rest } = splitFrames([...this.buffer, ...bytes]);
    this.buffer = rest;
    for (const frame of frames) {
      const id = keyResponseId(frame);
      const sentAt = id === null ? undefined : this.pending.get(id);
      if (id !== null && sentAt !== undefined) {
        this.pending.delete(id);
        setState({ latencyMs: Date.now() - sentAt });
      }
    }
  }

  private writeMiLink(bytes: number[]): void {
    if (this.isConnected && this.phase === 'milink') MiLink.send(bytes);
  }

  private sendMiLinkKey(code: number, action: number, meta = 0, repeatCount = 0): void {
    if (!this.isConnected || this.phase !== 'milink') return;
    this.nextId = (this.nextId + 1) >>> 0;
    this.pending.set(this.nextId, Date.now());
    if (this.pending.size > 64) this.pending.clear();
    this.writeMiLink(keyFrame(this.nextId, { code, action, meta, repeatCount }));
  }

  // ── Android TV Remote ──────────────────────────────────────

  /** Makes sure the persistent client key has a self-signed certificate, creating one once. */
  private async ensureCertificate(): Promise<void> {
    const key = await MiLink.clientKey();
    const publicKey = rsaPublicKey(key.publicKey);
    let valid = false;
    if (key.certificate) {
      try {
        const certKey = rsaPublicKey(key.certificate);
        valid = sameBytes(certKey.modulus, publicKey.modulus);
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      const serial = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
      serial[0] = (serial[0] & 0x7f) | 0x01;
      const tbs = tbsCertificate(publicKey, CLIENT_NAME, serial, new Date());
      const signature = await MiLink.signWithClientKey(tbs);
      await MiLink.setClientCertificate(certificate(tbs, signature));
    }
    this.clientKey = publicKey;
  }

  private handleAtvState({ state, error, reachable }: SocketStateEvent): void {
    if (state === 'connecting') {
      setState({ status: 'connecting' });
      return;
    }
    if (state === 'connected') {
      this.buffer = [];
      this.resetIdleTimer();
      return;
    }
    if (state !== 'failed') return;
    clearTimeout(this.idleTimer);
    this.endHold(false);
    this.phase = 'none';

    if (!this.atvReady && reachable) {
      // The service is there but dropped the TLS session: our certificate isn't paired (yet).
      if (this.justPaired) {
        this.justPaired = false;
        setState({ status: 'failed', error, pairingError: 'rejected' });
        return;
      }
      this.startPairing();
      return;
    }
    setState({ status: 'failed', error });
    this.scheduleReconnect();
  }

  private resetIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.phase !== 'atv') return;
      MiLink.disconnect();
      this.handleAtvState({ state: 'failed', error: 'No response from the TV', reachable: true });
    }, ATV_IDLE_MS);
  }

  private handleAtvMessage(bytes: Bytes): void {
    this.resetIdleTimer();
    let event: ReturnType<typeof parseRemoteMessage>;
    try {
      event = parseRemoteMessage(bytes);
    } catch {
      return;
    }
    switch (event.type) {
      case 'configure':
        this.features = WANTED_FEATURES & event.features;
        this.sendDelimited(remoteConfigure(this.features));
        this.markAtvReady();
        break;
      case 'setActive':
        this.sendDelimited(remoteSetActive(this.features));
        break;
      case 'ping':
        this.sendDelimited(pingResponse(event.value));
        break;
      case 'start':
        this.markAtvReady();
        break;
      case 'imeBatchEdit':
        this.imeCounter = event.imeCounter;
        this.imeFieldCounter = event.fieldCounter;
        break;
      case 'imeShow':
        this.imeFieldCounter = event.fieldCounter;
        break;
      case 'imeKeyInject':
        if (event.fieldCounter !== undefined) this.imeFieldCounter = event.fieldCounter;
        break;
      default:
        break;
    }
  }

  private markAtvReady(): void {
    if (this.atvReady) return;
    this.atvReady = true;
    this.justPaired = false;
    if (this.protocol !== 'atv') this.rememberProtocol('atv');
    setState({
      status: 'connected',
      error: undefined,
      latencyMs: undefined,
      pairingStep: undefined,
      pairingError: undefined,
    });
  }

  private sendAtvKey(code: number): void {
    if (!this.isConnected || this.phase !== 'atv') return;
    this.sendDelimited(keyInject(code, Direction.short));
  }

  // ── Android TV pairing ─────────────────────────────────────

  private startPairing(error?: PairingError): void {
    this.serverKey = undefined;
    setState({ status: 'pairing', pairingStep: 'starting', pairingError: error });
    void this.openTls(ATV_PAIRING_PORT, 'pairing');
  }

  /** Asks the TV for a new code, e.g. after a failed attempt. */
  retryPairing(): void {
    if (this.wantConnected && this.host) {
      this.attempt += 1;
      this.stopTimers();
      this.startPairing();
    }
  }

  /** Sends the code shown on the TV. Returns false if it can't be right (checksum mismatch). */
  submitPairingCode(code: string): boolean {
    const { pairingStep } = useConnectionStore.getState();
    if (this.phase !== 'pairing' || pairingStep !== 'enterCode') return false;
    if (!this.clientKey || !this.serverKey) return false;
    const secret = pairingSecretFor(this.clientKey, this.serverKey, code);
    if (!secret) {
      setState({ pairingError: 'wrongCode' });
      return false;
    }
    this.sendDelimited(pairingSecret(secret));
    setState({ pairingStep: 'verifying', pairingError: undefined });
    return true;
  }

  private handlePairingState({ state, error, reachable, peerCertificate }: SocketStateEvent): void {
    if (state === 'connected') {
      try {
        if (!peerCertificate) throw new Error('No TV certificate');
        this.serverKey = rsaPublicKey(peerCertificate);
      } catch (e) {
        this.phase = 'none';
        MiLink.disconnect();
        setState({ error: String(e), pairingError: 'connection' });
        return;
      }
      this.sendDelimited(pairingRequest(CLIENT_NAME));
      return;
    }
    if (state !== 'failed') return;
    this.phase = 'none';
    if (!reachable) {
      setState({ status: 'failed', error, pairingStep: undefined });
      this.scheduleReconnect();
      return;
    }
    setState({ error, pairingError: 'connection' });
  }

  private handlePairingMessage(bytes: Bytes): void {
    let parsed: ReturnType<typeof parsePairingMessage>;
    try {
      parsed = parsePairingMessage(bytes);
    } catch {
      return;
    }
    if (parsed.status !== STATUS_OK) {
      this.phase = 'none';
      MiLink.disconnect();
      if (parsed.status === STATUS_BAD_SECRET) this.startPairing('wrongCode');
      else setState({ pairingError: 'rejected' });
      return;
    }
    switch (parsed.reply) {
      case 'requestAck':
        this.sendDelimited(pairingOptions());
        break;
      case 'options':
        this.sendDelimited(pairingConfiguration());
        break;
      case 'configurationAck':
        setState({ pairingStep: 'enterCode' });
        break;
      case 'secretAck':
        this.justPaired = true;
        this.rememberProtocol('atv');
        setState({ status: 'connecting', pairingStep: undefined, pairingError: undefined });
        void this.openAtv();
        break;
      default:
        break;
    }
  }

  // ── Keys ───────────────────────────────────────────────────

  /** Single press: DOWN followed by UP. */
  press(key: AndroidKeyName): void {
    this.pressCode(AndroidKey[key]);
  }

  private pressCode(code: number, meta = 0): void {
    if (this.phase === 'atv') {
      this.sendAtvKey(code);
    } else {
      this.sendMiLinkKey(code, ACTION_DOWN, meta);
      this.sendMiLinkKey(code, ACTION_UP, meta);
    }
  }

  /** Begins a press-and-hold that repeats until `endHold()`. */
  beginHold(key: AndroidKeyName): void {
    this.endHold(true);
    this.repeatCode = AndroidKey[key];
    this.repeatCount = 0;
    if (this.phase === 'atv') {
      this.sendAtvKey(this.repeatCode);
      this.repeatTimer = setInterval(() => this.sendAtvKey(this.repeatCode), ATV_REPEAT_MS);
      return;
    }
    this.sendMiLinkKey(this.repeatCode, ACTION_DOWN);
    this.repeatTimer = setInterval(() => {
      this.repeatCount += 1;
      this.sendMiLinkKey(this.repeatCode, ACTION_DOWN, 0, this.repeatCount);
    }, REPEAT_MS);
  }

  endHold(sendUp = true): void {
    if (!this.repeatTimer) return;
    clearInterval(this.repeatTimer);
    this.repeatTimer = undefined;
    if (sendUp && this.phase === 'milink') this.sendMiLinkKey(this.repeatCode, ACTION_UP);
  }

  /**
   * Types text on the TV. Android TV Remote sends it as an IME edit into the focused text field
   * (the TV ignores letter key events there). MiLink types one keystroke at a time and skips
   * characters with no Android key.
   */
  type(text: string): void {
    if (!text) return;
    if (this.phase === 'atv') {
      if (!this.isConnected) return;
      this.sendDelimited(imeBatchEdit(this.imeCounter ?? 0, this.imeFieldCounter, text));
      return;
    }
    let delay = 0;
    for (const ch of text) {
      const stroke = keystrokeFor(ch);
      if (!stroke) continue;
      setTimeout(() => this.pressCode(stroke.code, stroke.meta), delay);
      delay += TYPE_INTERVAL_MS;
    }
  }
}

function sameBytes(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export const remote = new RemoteClient();
