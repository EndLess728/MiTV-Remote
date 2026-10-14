import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import i18n from 'i18next';

import { resources } from './resources';
import { getLanguage } from './utils';

let initialized = false;

/**
 * Initialize i18next with the user's saved language (or device locale fallback).
 *
 * Must be called AFTER `initStorage()` resolves — `getLanguage()` reads from
 * MMKV, which isn't created until storage init completes. Initializing earlier
 * would always fall back to the device locale and silently ignore the user's
 * saved preference.
 *
 * Idempotent: safe to call more than once.
 */
export async function initI18n(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const savedLanguage = getLanguage();
  const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? 'en';

  await i18n.use(initReactI18next).init({
    resources,
    lng: savedLanguage || deviceLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

  // Apply RTL based on the actual active language, not a guess.
  const isRTL = i18n.dir() === 'rtl';
  I18nManager.allowRTL(isRTL);
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.forceRTL(isRTL);
  }
}

export default i18n;
