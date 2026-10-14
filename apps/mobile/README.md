# Mi Remote for Android and iOS

A React Native (Expo) remote for Xiaomi Mi TV, built from [React-Native-Expo-Boilterplate](https://github.com/EndLess728/React-Native-Expo-Boilterplate) (Expo Router, Unistyles, Zustand + MMKV, i18n, ESLint, Husky).

See the [main README](../../README.md) for installation (including iPhone sideloading) and how the protocol works.

## Develop

Needs Node 22 and Yarn 1. Android needs JDK 17 and the Android SDK; iOS needs Xcode and CocoaPods.

```sh
yarn install
yarn ios:development       # build a dev client in the iOS simulator and start Metro
yarn android:development   # same on an Android emulator or a USB-connected phone
```

The app talks to the TV through a native module, so it doesn't run in Expo Go; the commands above build a development client.

The iOS simulator and the Android emulator both reach the Mac's network, so discovery and the remote work against a real TV.

Other scripts:

| Script | What it does |
|---|---|
| `yarn ios:production` / `yarn android:production` | Release-like build named "Mi Remote" |
| `yarn build:android:production` | Release APK in `android/app/build/outputs/apk/release` |
| `yarn test` | Jest unit tests (protocol encoding, key mapping) |
| `yarn lint` / `yarn type-check` | ESLint and TypeScript |
| `yarn icons` | Re-renders the app icons in `assets/` |

Release builds for all platforms come from the repo's [GitHub Actions workflow](../../.github/workflows/build.yml).

## Layout

| Path | Purpose |
|---|---|
| `src/app/index.tsx` | The remote screen |
| `src/app/connect.tsx` | TV picker sheet: discovered TVs, manual IP, haptics setting |
| `src/components/remote/` | D-pad, rockers, round keys, and the tap/hold/haptics hook they share |
| `src/milink/protocol.ts` | MiLink frame and key-packet encoding (pure, unit tested) |
| `src/milink/keys.ts` | Android key codes and the character-to-keystroke map |
| `src/milink/client.ts` | Connection client: heartbeat, reconnect, latency, hold-to-repeat, typing |
| `src/store/useSettingsStore.ts` | Persisted settings: last TV, haptics |
| `modules/milink/` | Local Expo module: TCP socket and Mi TV discovery |

### Native module

`modules/milink` keeps native code to the minimum: a raw TCP socket and Bonjour/NSD discovery. The MiLink protocol stays in TypeScript, so both platforms share one tested implementation.

| | iOS (`ios/MiLinkModule.swift`) | Android (`android/.../MiLinkModule.kt`) |
|---|---|---|
| Socket | `NWConnection` | `java.net.Socket` with a reader thread |
| Discovery | `NWBrowser` for `_googlecast._tcp` | `NsdManager`, resolving one service at a time |

API (`modules/milink/index.ts`): `connect(host, port)`, `disconnect()`, `send(bytes)`, `startDiscovery()`, `stopDiscovery()`, and the events `onSocketState`, `onSocketData` and `onTvFound`.

iOS needs `NSLocalNetworkUsageDescription` and `NSBonjourServices` in Info.plist to reach the TV and browse for it; both are set in `app.config.ts`.

## Commits

The Husky hooks from the boilerplate are active for the whole repository. Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org) (`feat: …`, `fix: …`), and direct commits to `main` are blocked; work on a branch and open a pull request. Set `SKIP_BRANCH_PROTECTION=1` to bypass the branch check.
