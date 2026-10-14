import { type NativeModule, requireNativeModule } from 'expo';

export type SocketState = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface FoundTV {
  /** Bonjour/NSD service name, stable per TV. */
  id: string;
  /** Friendly name from the TXT `fn` field. */
  name: string;
  /** Model from the TXT `md` field, e.g. `MiTV-AXSO0`. */
  model: string;
  /** IPv4 address. */
  address: string;
}

type MiLinkEvents = {
  onSocketState(event: { state: SocketState; error?: string }): void;
  onSocketData(event: { bytes: number[] }): void;
  onTvFound(event: FoundTV): void;
};

declare class MiLinkModule extends NativeModule<MiLinkEvents> {
  /** Opens a TCP connection, replacing any existing one. Progress arrives as `onSocketState`. */
  connect(host: string, port: number): void;
  disconnect(): void;
  /** Writes raw bytes (0–255) to the open connection. */
  send(bytes: number[]): void;
  /** Browses the LAN for Mi TVs; each match arrives as `onTvFound`. */
  startDiscovery(): void;
  stopDiscovery(): void;
}

export default requireNativeModule<MiLinkModule>('MiLink');
