import { useTranslation } from 'react-i18next';
import { I18nManager, NativeModules, Platform } from 'react-native';
import { useMMKVString } from 'react-native-mmkv';
import RNRestart from 'react-native-restart';
import type { TOptions } from 'i18next';
import i18n from 'i18next';

import { storage } from '../storage';
import type { Language, resources } from './resources';
import type { RecursiveKeyOf } from './types';

type DefaultLocale = typeof resources.en.translation;
export type TxKeyPath = RecursiveKeyOf<DefaultLocale>;

export const LOCAL = 'local';

// storage may not be initialized yet when i18n.ts runs at module load time.
// Return null if called before initStorage() completes — i18n falls back to device locale.
export const getLanguage = (): string | null => storage?.getString(LOCAL) ?? null;

/**
 * Translates text (non-reactive, use for static content).
 * For components that need to react to language changes, use useTranslate() hook.
 */
export function translate(key: TxKeyPath, options?: TOptions): string {
  if (i18n.isInitialized) {
    return i18n.t(key, options);
  }
  return key;
}

/**
 * A hook that returns a translate function that reacts to language changes.
 * Use this in components for UI that should update when language changes.
 */
export const useTranslate = () => {
  const { t } = useTranslation();
  return (key: TxKeyPath, options?: TOptions): string => t(key, options);
};

export const changeLanguage = (lang: Language) => {
  const currentLang = i18n.language;
  const isCurrentRTL = i18n.dir(currentLang) === 'rtl';
  const isNewRTL = i18n.dir(lang) === 'rtl';
  const needsRTLChange = isCurrentRTL !== isNewRTL;

  // Change i18next language (this triggers react-i18next to re-render)
  i18n.changeLanguage(lang);

  // Only reload if RTL direction needs to change
  if (needsRTLChange) {
    I18nManager.forceRTL(isNewRTL);
    // RTL changes require app restart to take effect
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      if (__DEV__) NativeModules.DevSettings.reload();
      else RNRestart.restart();
    } else if (Platform.OS === 'web') {
      window.location.reload();
    }
  }
};

export const useSelectedLanguage = () => {
  const [language, setLang] = useMMKVString(LOCAL, storage);

  const setLanguage = (lang: Language) => {
    setLang(lang);
    changeLanguage(lang);
  };

  return { language: language as Language, setLanguage };
};
