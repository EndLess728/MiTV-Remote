# Mi Remote for macOS

A native SwiftUI menu bar app. Click the remote icon in the menu bar to open the remote; click away to close it. It has no Dock icon; right-click the menu bar icon and choose **Quit Mi Remote** to quit.

Tested on a Xiaomi Mi TV `MiTV-AXSO0`; see [Compatibility](../../README.md#compatibility) for other models. See the [main README](../../README.md) for installation and how the protocol works.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Arrow keys | D-pad |
| Return | OK |
| Esc / Delete | Back |
| Space | Play / Pause |
| H | Home |
| M | Menu |
| P | Power |
| + / − | Volume up / down |
| 0 | Mute |
| / or T | Focus the "Type on TV" box |

## Build

Needs Xcode 16 or later (Swift 6 toolchain).

```sh
./build-app.sh               # native build -> dist/Mi Remote.app
UNIVERSAL=1 ./build-app.sh   # arm64 + x86_64
VERSION=1.2.0 ./build-app.sh # stamp the version
```

During development, `swift run` launches the app directly, and `swift test` runs the protocol tests.

## Source

| File | Purpose |
|---|---|
| `Sources/MiRemote/RemoteClient.swift` | Connection, MiLink framing and key packets, heartbeat, reconnect, hold-to-repeat, typing; picks MiLink or Android TV Remote per TV and runs pairing |
| `Sources/MiRemote/ATVProtocol.swift` | Android TV Remote protocol: protobuf messages, pairing secret, self-signed certificate (DER) |
| `Sources/MiRemote/ClientIdentity.swift` | Client key and certificate in the login keychain, used for TLS |
| `Sources/MiRemote/TVDiscovery.swift` | Bonjour discovery of Mi TVs |
| `Sources/MiRemote/KeyCodes.swift` | Android key codes and the character-to-keystroke map |
| `Sources/MiRemote/RemoteView.swift` | SwiftUI remote UI, keyboard handling, TV picker and pairing sheet |
| `Sources/MiRemote/MiRemoteApp.swift` | Menu bar status item and popover |
| `scripts/make-icon.swift` | Renders `Resources/AppIcon.icns` |
