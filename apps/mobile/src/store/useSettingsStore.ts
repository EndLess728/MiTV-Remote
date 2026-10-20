import { createPersistedStore } from './storage';

/** Which remote protocol a TV speaks: Xiaomi MiLink, or Google's Android TV Remote. */
export type TvProtocol = 'milink' | 'atv';

interface SettingsState {
  /** IP address of the last TV the user connected to. Empty until one is chosen. */
  tvHost: string;
  haptics: boolean;
  /** Protocol each TV answered on, by IP address, so reconnects skip the probing. */
  tvProtocols: Record<string, TvProtocol>;
  setTvHost: (host: string) => void;
  setHaptics: (enabled: boolean) => void;
  setTvProtocol: (host: string, protocol: TvProtocol | undefined) => void;
}

export const useSettingsStore = createPersistedStore<SettingsState>('settings-storage', (set) => ({
  tvHost: '',
  haptics: true,
  tvProtocols: {},
  setTvHost: (tvHost) => set({ tvHost }),
  setHaptics: (haptics) => set({ haptics }),
  setTvProtocol: (host, protocol) =>
    set((state) => {
      const tvProtocols = { ...state.tvProtocols };
      if (protocol) tvProtocols[host] = protocol;
      else delete tvProtocols[host];
      return { tvProtocols };
    }),
}));
