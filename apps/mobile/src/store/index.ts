import { useSettingsStore } from './useSettingsStore';

export { useSettingsStore } from './useSettingsStore';

/**
 * Rehydrates all persisted Zustand stores from MMKV.
 *
 * Call this once in `app/_layout.tsx` after `initStorage()` resolves. Stores
 * use `skipHydration: true`, so they hold their initial state until this runs
 * — preventing access to the MMKV instance before it is initialized.
 */
export async function rehydrateStores(): Promise<void> {
  await useSettingsStore.persist.rehydrate();
}
