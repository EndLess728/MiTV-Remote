# Mi TV Remote for Mac

A native macOS menu bar remote for Xiaomi Mi TV (Android TV / PatchWall). Click the remote icon in the menu bar and control your TV from your Mac over Wi-Fi: no phone, no pairing, no ADB.

The TV's control protocol isn't documented, so it was **reverse engineered with [REA (Reverse Engineer Anything)](https://github.com/morluto/rea)** from the TV's own firmware (see [How it was reverse engineered](#how-it-was-reverse-engineered)).

![Mi Remote opened from the Mac menu bar controlling a Mi TV](docs/demo.gif)

*Left: the remote opened from the Mac menu bar. Right: the TV screen, recorded at the same time over ADB. Shown: Home, D-pad navigation, volume up and down, and keyboard arrows.* [Watch the MP4](docs/demo.mp4)

> Not affiliated with or endorsed by Xiaomi. "Mi" and "Xiaomi" are trademarks of their respective owners.

## Features

- **Menu bar app**: lives in the top-right menu bar; click the icon to open the remote, click away to close it. No Dock icon.
- **Full remote layout**: power, input source, D-pad and OK, back, home, menu, volume, mute, search, channel up and down, and media controls.
- **Hold to repeat** on the D-pad and volume and channel rockers.
- **Type on the TV**: send text to search boxes and login fields from your Mac keyboard.
- **Keyboard control** while the remote is open (see below).
- **Auto-discovery**: finds Mi TVs on your network over Bonjour, or you can enter the IP address by hand.
- **Auto-reconnect**: keeps the connection alive with heartbeats and reconnects if the TV restarts.
- Universal app for Apple Silicon and Intel Macs, macOS 14 Sonoma or later.

### Keyboard shortcuts

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

## Install

1. Download the latest `Mi-Remote-x.y.z.dmg` from [**Releases**](../../releases).
2. Open the DMG and drag **Mi Remote** to **Applications**.
3. The app is not notarized by Apple, so macOS blocks it the first time you open it:
   - Open it once. When macOS says it can't be verified, click **Done**.
   - Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to "Mi Remote".

   Or remove the quarantine flag from Terminal:
   ```sh
   xattr -dr com.apple.quarantine "/Applications/Mi Remote.app"
   ```
4. Allow **Local Network** access when asked. The app needs it to find and talk to the TV.
5. Click the remote icon in the menu bar. If one Mi TV is found it connects automatically; otherwise pick your TV or type its IP address.

To quit, right-click the menu bar icon and choose **Quit Mi Remote**. To start it at login, add it under **System Settings → General → Login Items**.

### Requirements

- The Mac and TV on the same network.
- A Xiaomi Mi TV running the MiLink service (`com.mitv.milinkservice`), which is built into Mi TV firmware. Tested on a **MiTV-AXSO0** (Android TV 9).

## Build from source

Needs Xcode 16 or later (Swift 6 toolchain).

```sh
git clone https://github.com/EndLess728/MiTV-Remote-Mac.git
cd MiTV-Remote-Mac
./build-app.sh               # native build    -> dist/Mi Remote.app
UNIVERSAL=1 ./build-app.sh   # arm64 + x86_64
```

During development, `swift run` launches the app directly.

### Releases (CI)

[`.github/workflows/build.yml`](.github/workflows/build.yml) builds a universal, ad-hoc signed app on every push and pull request and uploads the DMG and ZIP as workflow artifacts. Pushing a version tag publishes a GitHub Release with both files attached:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

## How it works

Mi TVs ship a system service, **MiLink** (`com.mitv.milinkservice`), that listens on **TCP port 6091**. It's what Xiaomi's own phone remote apps use. The service accepts Android key events and injects them on the TV with `Instrumentation.sendKeySync()`.

All fields are big-endian:

```
frame       = type:u8  length:u16  payload[length]
type 2      = heartbeat (empty payload), sent every 5 s
type 4      = send key
  payload   = code:u8 (1 = send, 2 = response)  id:u32  len:u16  data[len]
  data      = TLVs (tag:u8 value):
                1 metaState   i32     5 repeatCount  i32
                2 action      i32     6 flags        i32
                  (0 down, 1 up)      7 downTime     i64
                3 keyCode     i32     8 eventTime    i64
                4 scanCode    i32    10 deviceId     i32  (-1 = virtual keyboard)
                                     11 source       i32  (0x101 = keyboard)
```

The TV answers each key with a type 4 response (`code = 2`) that carries the same `id`. The app uses it to show latency.

Implementation notes:

- **`downTime` and `eventTime` must be 0.** The TV then stamps the event with its own uptime clock. Sending the Mac's clock puts events "in the future" on the TV and can stall its input dispatcher until that time arrives. This was the hardest bug to find.
- **Holding a key**: the TV releases a key on its own about 175 ms after the last DOWN, so held buttons resend DOWN every 100 ms with an increasing `repeatCount`, then send UP.
- **Text**: MiLink has no text packet, so typing maps each character to an Android key code (plus Shift) and sends it as a keystroke.
- **Discovery**: Mi TVs advertise `_googlecast._tcp` with a TXT `md=MiTV-…` model, which the app browses and resolves to an IPv4 address.

The source is in [`Sources/MiRemote`](Sources/MiRemote):

| File | Purpose |
|---|---|
| `MiLinkClient.swift` | TCP connection, framing, key packets, heartbeat, reconnect, hold-to-repeat, typing |
| `TVDiscovery.swift` | Bonjour discovery of Mi TVs |
| `KeyCodes.swift` | Android key codes and the character-to-keystroke map |
| `RemoteView.swift` | SwiftUI remote UI, keyboard handling and TV picker |
| `MiRemoteApp.swift` | Menu bar status item and popover |

## How it was reverse engineered

The protocol was recovered from the TV itself using **[REA](https://github.com/morluto/rea)**, an MCP server for reverse engineering binaries, apps and runtime behavior, driven by an AI agent:

1. **Device recon**: with ADB over Wi-Fi enabled on the TV, REA inspected the device and listed its packages, which pointed to the MiLink service.
2. **Extraction**: REA pulled the `com.mitv.milinkservice` APK off the TV.
3. **Static analysis**: REA searched and decompiled the Android classes to find the remote-control server (`RCServerThread`) and its packet classes (`SendKeyPacket`, `SendKeyHeader`, `SendKeyData`, `SendKeyHandler`), which gave the frame layout, TLV tags and key-injection path.
4. **Runtime verification**: a small test client sent packets to port 6091 while the TV's `logcat` was watched. The service logs every parsed TLV field and `Send key success`, which confirmed each field and exposed the timestamp problem.

The Mac app was then written from the confirmed protocol.

## Disclaimer

This is an independent interoperability project for controlling a TV you own on your own network. It uses only the TV's existing network remote service and does not modify the TV. Use it at your own risk.
