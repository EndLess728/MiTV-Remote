// Unistyles config side-effect runs in `./index.ts` BEFORE expo-router scans
// any route — required because route modules transitively load components
// that call `StyleSheet.create` at import time. i18next is initialized below
// in `prepare()` because its language preference is stored in MMKV, which
// isn't available until `initStorage()` resolves.

import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useUnistyles } from 'react-native-unistyles';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { initI18n } from '@/localization/i18n';
import { initStorage } from '@/storage';
import { rehydrateStores } from '@/store';
import { toastConfig } from '@/utils/toast';

// Re-export expo-router's built-in ErrorBoundary so render-phase exceptions in
// the route tree surface with full router-aware stack frames.
export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 500, fade: true });

function RootNavigator(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="connect"
        // Android's form sheet can dismiss itself natively without popping the route, after which
        // the picker can't be reopened; a plain modal is reliable there.
        options={
          Platform.OS === 'ios'
            ? {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.75, 1],
                sheetGrabberVisible: true,
              }
            : { presentation: 'modal', animation: 'slide_from_bottom' }
        }
      />
      <Stack.Screen
        name="pair"
        options={
          Platform.OS === 'ios'
            ? {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.75, 1],
                sheetGrabberVisible: true,
              }
            : { presentation: 'modal', animation: 'slide_from_bottom' }
        }
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout(): React.JSX.Element | null {
  const [storageReady, setStorageReady] = useState(false);
  const { theme } = useUnistyles();

  useEffect(() => {
    async function prepare() {
      try {
        await initStorage().then(rehydrateStores);
        // initI18n() must run AFTER initStorage — it reads the saved language
        // from MMKV. Initializing earlier would always fall back to the
        // device locale.
        await initI18n();
      } catch (error) {
        if (__DEV__) console.error('[RootLayout] App initialization failed:', error);
      }
      setStorageReady(true);
      SplashScreen.hideAsync();
    }
    prepare();
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    <>
      <SystemBars
        style={{
          statusBar: theme.colors.barStyle === 'light-content' ? 'light' : 'dark',
          navigationBar: theme.colors.barStyle === 'light-content' ? 'light' : 'dark',
        }}
      />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <RootNavigator />
          </SafeAreaProvider>
        </KeyboardProvider>
        <Toast config={toastConfig} position="top" />
      </GestureHandlerRootView>
    </>
  );
}
