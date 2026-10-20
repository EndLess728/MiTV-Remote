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

export interface SocketStateEvent {
  state: SocketState;
  error?: string;
  /** On 'failed': whether TCP had connected, i.e. something is listening on that port. */
  reachable?: boolean;
  /** On 'connected' over TLS: the server's certificate (DER). */
  peerCertificate?: number[];
}

export interface ClientKey {
  /** RSA public key, DER: SubjectPublicKeyInfo on Android, PKCS#1 on iOS. */
  publicKey: number[];
  /** The stored self-signed certificate (DER), if one was set. */
  certificate?: number[];
}

type MiLinkEvents = {
  onSocketState(event: SocketStateEvent): void;
  onSocketData(event: { bytes: number[] }): void;
  onTvFound(event: FoundTV): void;
};

declare class MiLinkModule extends NativeModule<MiLinkEvents> {
  /**
   * Opens a TCP connection, replacing any existing one; with `tls`, a TLS session that presents
   * the client certificate and accepts any server certificate. Progress arrives as
   * `onSocketState`.
   */
  connect(host: string, port: number, tls: boolean): void;
  disconnect(): void;
  /** Writes raw bytes (0–255) to the open connection. */
  send(bytes: number[]): void;
  /** Browses the LAN for Mi TVs; each match arrives as `onTvFound`. */
  startDiscovery(): void;
  stopDiscovery(): void;
  /** The app's persistent RSA client key (created on first call) and its certificate. */
  clientKey(): Promise<ClientKey>;
  /** SHA256withRSA (PKCS#1 v1.5) signature with the client key. */
  signWithClientKey(data: number[]): Promise<number[]>;
  /** Stores the self-signed client certificate used for TLS. */
  setClientCertificate(der: number[]): Promise<void>;
}

export default requireNativeModule<MiLinkModule>('MiLink');
