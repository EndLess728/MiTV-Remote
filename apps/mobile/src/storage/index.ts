import { createMMKV, type MMKV } from 'react-native-mmkv';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const MMKV_KEY_ID = 'mmkv_encryption_key_v1';

/**
 * The MMKV instance — assigned during initStorage().
 * Declared with definite assignment (`!`) because we guarantee
 * initStorage() is called before any component renders.
 */

export let storage!: MMKV;

/**
 * Generates a cryptographically secure 32-byte hex key using expo-crypto,
 * which works across iOS, Android, and web via the native crypto APIs.
 */
function generateKey(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Initializes encrypted MMKV storage with a key backed by the OS keychain.
 *
 * - iOS: key lives in the iOS Keychain (AES-256, hardware-backed on Secure Enclave devices)
 * - Android: key lives in EncryptedSharedPreferences (Android Keystore-backed)
 *
 * The key is generated once on first launch and never leaves secure storage.
 * Must be called at app startup (before any component renders or store accesses storage).
 */
export async function initStorage(): Promise<void> {
  let encryptionKey = await SecureStore.getItemAsync(MMKV_KEY_ID);

  if (!encryptionKey) {
    encryptionKey = generateKey();
    await SecureStore.setItemAsync(MMKV_KEY_ID, encryptionKey);
  }

  storage = createMMKV({ id: 'secureStorage', encryptionKey });
}

export function getItem<T>(key: string): T | null {
  if (!storage) return null;
  const value = storage.getString(key);
  return value ? (JSON.parse(value) as T) : null;
}

export function setItem<T>(key: string, value: T): void {
  if (!storage) return;
  storage.set(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  if (!storage) return;
  storage.remove(key);
}
