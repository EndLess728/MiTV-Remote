import { create, StateCreator } from 'zustand';
import { createJSONStorage, persist, PersistOptions } from 'zustand/middleware';

import { storage } from '@/storage';

/**
 * Zustand storage adapter using MMKV.
 *
 * Guards against pre-init access: stores are created at module-import time,
 * before initStorage() runs. Returning null from getItem causes Zustand to
 * keep the initial state — rehydrateStores() is called explicitly in App.tsx
 * once the MMKV instance is ready.
 */
export const zustandStorage = {
  getItem: (name: string): string | null => {
    if (!storage) return null;
    return storage.getString(name) ?? null;
  },
  setItem: (name: string, value: string): void => {
    if (!storage) return;
    storage.set(name, value);
  },
  removeItem: (name: string): void => {
    if (!storage) return;
    storage.remove(name);
  },
};

/**
 * Pre-configured JSON storage using MMKV
 */
export const mmkvStorage = createJSONStorage(() => zustandStorage);

/**
 * Creates a Zustand store with MMKV persistence pre-configured.
 * Just pass the store name - no need to configure storage each time.
 *
 * @example
 * const useMyStore = createPersistedStore<MyState>(
 *   'my-store',  // storage key
 *   (set) => ({
 *     count: 0,
 *     increment: () => set((s) => ({ count: s.count + 1 })),
 *   })
 * );
 */
export function createPersistedStore<T>(
  name: string,
  storeCreator: StateCreator<T, [], [['zustand/persist', unknown]]>,
  options?: Omit<PersistOptions<T>, 'name' | 'storage'>,
) {
  return create<T>()(
    persist(storeCreator, {
      name,
      storage: mmkvStorage,
      // Skip auto-hydration at store-creation time (MMKV isn't ready yet).
      // App.tsx calls rehydrateStores() explicitly after initStorage() resolves.
      skipHydration: true,
      ...options,
    }),
  );
}
