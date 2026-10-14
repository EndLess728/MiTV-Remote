import { createPersistedStore } from './storage';

interface SettingsState {
  /** IP address of the last TV the user connected to. Empty until one is chosen. */
  tvHost: string;
  haptics: boolean;
  setTvHost: (host: string) => void;
  setHaptics: (enabled: boolean) => void;
}

export const useSettingsStore = createPersistedStore<SettingsState>('settings-storage', (set) => ({
  tvHost: '',
  haptics: true,
  setTvHost: (tvHost) => set({ tvHost }),
  setHaptics: (haptics) => set({ haptics }),
}));
