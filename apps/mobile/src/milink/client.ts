import MiLink, { type SocketState } from 'milink';
import { create } from 'zustand';

import { AndroidKey, type AndroidKeyName, keystrokeFor } from './keys';
import {
  ACTION_DOWN,
  ACTION_UP,
  HEARTBEAT,
  keyFrame,
  keyResponseId,
  MILINK_PORT,
  splitFrames,
} from './protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface ConnectionState {
  status: ConnectionStatus;
  host: string;
  error?: string;
  /** Round trip of the last acknowledged key, in milliseconds. */
  latencyMs?: number;
}

/** Live connection state for the UI. Not persisted. */
export const useConnectionStore = create<ConnectionState>(() => ({ status: 'idle', host: '' }));

const HEARTBEAT_MS = 5000;
const RECONNECT_MS = 2000;
/** The TV auto-releases a key 175 ms after the last DOWN, so held keys resend DOWN faster. */
const REPEAT_MS = 100;
const TYPE_INTERVAL_MS = 40;

/**
 * Client for the Xiaomi MiLink remote-control service. Owns the native socket: connects,
 * keeps it alive with heartbeats, reconnects after failures, and sends key events.
 */
class MiLinkClient {
  private host = '';
  private wantConnected = false;
  private buffer: number[] = [];
  private nextId = 0;
  private pending = new Map<number, number>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private repeatTimer?: ReturnType<typeof setInterval>;
  private repeatCode = 0;
  private repeatCount = 0;

  constructor() {
    MiLink.addListener('onSocketState', ({ state, error }) => this.handleState(state, error));
    MiLink.addListener('onSocketData', ({ bytes }) => this.handleData(bytes));
  }

  // ── Connection ─────────────────────────────────────────────

  connect(host: string): void {
    const trimmed = host.trim();
    if (!trimmed) return;
    this.disconnect();
    this.host = trimmed;
    this.wantConnected = true;
    useConnectionStore.setState({ host: trimmed, status: 'connecting', error: undefined });
    MiLink.connect(trimmed, MILINK_PORT);
  }

  disconnect(): void {
    this.wantConnected = false;
    this.stopTimers();
    MiLink.disconnect();
    useConnectionStore.setState({ status: 'idle', error: undefined, latencyMs: undefined });
  }

  /** Drops the socket while the app is in the background; `resume()` reconnects. */
  suspend(): void {
    if (!this.wantConnected) return;
    this.stopTimers();
    MiLink.disconnect();
    useConnectionStore.setState({ status: 'idle', latencyMs: undefined });
  }

  resume(): void {
    if (this.wantConnected && this.host) this.connect(this.host);
  }

  get isConnected(): boolean {
    return useConnectionStore.getState().status === 'connected';
  }

  private handleState(state: SocketState, error?: string): void {
    if (state === 'connected') {
      this.buffer = [];
      this.pending.clear();
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => this.write([...HEARTBEAT]), HEARTBEAT_MS);
      useConnectionStore.setState({ status: 'connected', error: undefined });
    } else if (state === 'failed') {
      clearInterval(this.heartbeatTimer);
      this.endHold(false);
      useConnectionStore.setState({ status: 'failed', error });
      this.scheduleReconnect();
    } else if (state === 'connecting') {
      useConnectionStore.setState({ status: 'connecting' });
    }
    // 'disconnected' only follows our own disconnect()/suspend(), which already set the state.
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    if (!this.wantConnected) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.wantConnected && !this.isConnected) MiLink.connect(this.host, MILINK_PORT);
    }, RECONNECT_MS);
  }

  private stopTimers(): void {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.reconnectTimer);
    this.endHold(false);
  }

  private handleData(bytes: number[]): void {
    const { frames, rest } = splitFrames([...this.buffer, ...bytes]);
    this.buffer = rest;
    for (const frame of frames) {
      const id = keyResponseId(frame);
      const sentAt = id === null ? undefined : this.pending.get(id);
      if (id !== null && sentAt !== undefined) {
        this.pending.delete(id);
        useConnectionStore.setState({ latencyMs: Date.now() - sentAt });
      }
    }
  }

  private write(bytes: number[]): void {
    if (this.isConnected) MiLink.send(bytes);
  }

  private sendKey(code: number, action: number, meta = 0, repeatCount = 0): void {
    if (!this.isConnected) return;
    this.nextId = (this.nextId + 1) >>> 0;
    this.pending.set(this.nextId, Date.now());
    if (this.pending.size > 64) this.pending.clear();
    this.write(keyFrame(this.nextId, { code, action, meta, repeatCount }));
  }

  // ── Keys ───────────────────────────────────────────────────

  /** Single press: DOWN followed by UP. */
  press(key: AndroidKeyName): void {
    this.pressCode(AndroidKey[key]);
  }

  private pressCode(code: number, meta = 0): void {
    this.sendKey(code, ACTION_DOWN, meta);
    this.sendKey(code, ACTION_UP, meta);
  }

  /** Begins a press-and-hold that repeats until `endHold()`. */
  beginHold(key: AndroidKeyName): void {
    this.endHold(true);
    this.repeatCode = AndroidKey[key];
    this.repeatCount = 0;
    this.sendKey(this.repeatCode, ACTION_DOWN);
    this.repeatTimer = setInterval(() => {
      this.repeatCount += 1;
      this.sendKey(this.repeatCode, ACTION_DOWN, 0, this.repeatCount);
    }, REPEAT_MS);
  }

  endHold(sendUp = true): void {
    if (!this.repeatTimer) return;
    clearInterval(this.repeatTimer);
    this.repeatTimer = undefined;
    if (sendUp) this.sendKey(this.repeatCode, ACTION_UP);
  }

  /** Types text one keystroke at a time. Characters with no Android key are skipped. */
  type(text: string): void {
    let delay = 0;
    for (const ch of text) {
      const stroke = keystrokeFor(ch);
      if (!stroke) continue;
      setTimeout(() => this.pressCode(stroke.code, stroke.meta), delay);
      delay += TYPE_INTERVAL_MS;
    }
  }
}

export const milink = new MiLinkClient();
