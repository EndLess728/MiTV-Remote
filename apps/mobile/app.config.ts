import 'tsx/cjs';
// Hydrate process.env from .env files BEFORE evaluating ./env (which validates).
// Without this, EAS CLI's fallback `@expo/config` evaluates this file with an
// empty process.env and zod validation aborts the build. See ./load-env.ts.
import './load-env';

import { ConfigContext, ExpoConfig } from 'expo/config';

import Env from './env';

// CI passes the workflow run number so each sideloaded build installs as an update.
const BUILD_NUMBER = Number(process.env.BUILD_NUMBER ?? 1);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: Env.EXPO_PUBLIC_NAME,
  slug: 'mi-remote',
  scheme: 'miremote',
  experiments: {
    reactCompiler: true,
    typedRoutes: true,
  },
  version: Env.EXPO_PUBLIC_VERSION,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0E0E11',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: Env.EXPO_PUBLIC_PACKAGE_NAME,
    buildNumber: String(BUILD_NUMBER),
    infoPlist: {
      // iOS asks for Local Network access before the app can reach the TV, and only lets
      // apps browse the Bonjour service types they declare here.
      NSLocalNetworkUsageDescription:
        'Mi Remote finds and controls your Mi TV on the local network.',
      NSBonjourServices: ['_googlecast._tcp'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FF6900',
    },
    // SDK 55 removed `edgeToEdgeEnabled` — edge-to-edge is now mandatory and is
    // wired up via the `react-native-edge-to-edge` plugin in the plugins list.
    package: Env.EXPO_PUBLIC_PACKAGE_NAME,
    versionCode: BUILD_NUMBER,
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    // iOS 27 SDK requires the UIScene lifecycle; see the plugin for details.
    './plugins/withSceneLifecycle',
    'expo-localization',
    [
      'expo-font',
      {
        fonts: [
          './src/assets/fonts/OpenSans-Regular.ttf',
          './src/assets/fonts/OpenSans-Italic.ttf',
          './src/assets/fonts/OpenSans-Semibold.ttf',
          './src/assets/fonts/OpenSans-SemiboldItalic.ttf',
          './src/assets/fonts/OpenSans-Bold.ttf',
          './src/assets/fonts/OpenSans-BoldItalic.ttf',
        ],
      },
    ],
    // Required from SDK 55 onward — registers the SecureStore native module.
    'expo-secure-store',
    'expo-status-bar',
    ['react-native-edge-to-edge', { android: { enforceNavigationBarContrast: false } }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0E0E11',
        image: './assets/splash-icon.png',
        imageWidth: 160,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // R8 minifies Java/Kotlin in release builds. Required for
          // `enableShrinkResourcesInReleaseBuilds` (the plugin throws otherwise).
          enableMinifyInReleaseBuilds: true,
          // Strip unused resources (drawables, strings, layouts) from the APK/AAB.
          enableShrinkResourcesInReleaseBuilds: true,
          // Exclude emulator-only ABIs from release builds — reduces APK/AAB size.
          // x86 / x86_64 are only needed for emulators; real devices use ARM.
          //
          // The key is `buildArchs`, NOT `abiFilters`, and it must sit INSIDE this
          // android block. It writes `reactNativeArchitectures` into
          // gradle.properties, which is what the RN Gradle plugin actually reads.
          // `expo-build-properties` doesn't reject unknown or misplaced keys, so a
          // wrong spelling or placement is silently ignored and all four ABIs ship.
          buildArchs: ['arm64-v8a', 'armeabi-v7a'],
        },
      },
    ],
  ],
});
