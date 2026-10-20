import SwiftUI

// MARK: - Palette

private enum Palette {
    static let body = Color(red: 0.11, green: 0.11, blue: 0.13)
    static let bodyEdge = Color.white.opacity(0.08)
    static let key = Color(red: 0.19, green: 0.19, blue: 0.22)
    static let keyPressed = Color(red: 0.28, green: 0.28, blue: 0.32)
    static let label = Color.white.opacity(0.88)
    static let dim = Color.white.opacity(0.5)
    static let accent = Color(red: 1.0, green: 0.42, blue: 0.0)   // Xiaomi orange
    static let power = Color(red: 0.92, green: 0.26, blue: 0.24)
}

// MARK: - Root

struct RemoteView: View {
    @StateObject private var client = RemoteClient()
    @StateObject private var discovery = TVDiscovery()
    @AppStorage("tvHost") private var savedHost = ""
    @State private var showConnect = false
    @State private var text = ""
    @FocusState private var remoteFocused: Bool
    @FocusState private var textFocused: Bool

    var body: some View {
        VStack(spacing: 18) {
            header
            topRow
            DPad(client: client)
            navRow
            HStack(alignment: .center, spacing: 22) {
                Rocker(client: client, up: .volumeUp, down: .volumeDown, label: "VOL")
                VStack(spacing: 14) {
                    RoundKey(symbol: "speaker.slash.fill", help: "Mute") { client.press(.mute) }
                    RoundKey(symbol: "magnifyingglass", help: "Search") { client.press(.search) }
                }
                Rocker(client: client, up: .channelUp, down: .channelDown, label: "CH", upSymbol: "chevron.up", downSymbol: "chevron.down")
            }
            mediaRow
            typeBar
            footer
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .padding(.bottom, 16)
        .frame(width: 320)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Palette.body)
                .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Palette.bodyEdge))
        )
        .padding(10)
        .background(Color(red: 0.06, green: 0.06, blue: 0.07))
        .preferredColorScheme(.dark)
        .focusable()
        .focusEffectDisabled()
        .focused($remoteFocused)
        .onKeyPress(phases: [.down, .repeat], action: handleKey)
        .onAppear {
            remoteFocused = true
            if savedHost.isEmpty {
                discovery.start()
                showConnect = true
            } else {
                client.connect(to: savedHost)
            }
        }
        .onChange(of: discovery.tvs) { _, tvs in
            // First run: auto-pick the only TV found.
            if savedHost.isEmpty, tvs.count == 1, let tv = tvs.first {
                connect(tv.address)
            }
        }
        .overlay {
            // An overlay rather than a sheet: sheets don't attach reliably to a menu bar popover.
            if showConnect {
                ZStack {
                    Color.black.opacity(0.55)
                        .onTapGesture { showConnect = false }
                    ConnectSheet(discovery: discovery, host: savedHost) { host in
                        connect(host)
                        showConnect = false
                    } onCancel: {
                        showConnect = false
                    }
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.body))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.bodyEdge))
                    .padding(14)
                }
            } else if client.state == .pairing {
                // Android TVs without MiLink need a one-time code shown on the TV.
                ZStack {
                    Color.black.opacity(0.55)
                    PairSheet(client: client)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.body))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.bodyEdge))
                        .padding(14)
                }
            }
        }
    }

    private func connect(_ host: String) {
        savedHost = host
        client.connect(to: host)
        remoteFocused = true
    }

    // MARK: Sections

    private var header: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .shadow(color: statusColor.opacity(0.8), radius: 4)
            VStack(alignment: .leading, spacing: 1) {
                Text("Mi TV")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.label)
                Text(statusText)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Palette.dim)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                discovery.start()
                showConnect = true
            } label: {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.dim)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Palette.key))
            }
            .buttonStyle(.plain)
            .help("Choose TV")
        }
        .padding(.leading, 4)
    }

    private var topRow: some View {
        HStack {
            RoundKey(symbol: "power", tint: Palette.power, help: "Power (P)") { client.press(.power) }
            Spacer()
            RoundKey(symbol: "rectangle.on.rectangle", help: "Input source") { client.press(.tvInput) }
            Spacer()
            RoundKey(symbol: "square.stack", help: "Recent apps") { client.press(.appSwitch) }
            Spacer()
            RoundKey(symbol: "gearshape.fill", help: "Settings") { client.press(.settings) }
        }
        .padding(.horizontal, 6)
    }

    private var navRow: some View {
        HStack {
            RoundKey(symbol: "arrow.uturn.backward", help: "Back (Esc)") { client.press(.back) }
            Spacer()
            RoundKey(symbol: "house.fill", size: 54, help: "Home (H)") { client.press(.home) }
            Spacer()
            RoundKey(symbol: "line.3.horizontal", help: "Menu (M)") { client.press(.menu) }
        }
        .padding(.horizontal, 22)
    }

    private var mediaRow: some View {
        HStack {
            RoundKey(symbol: "backward.end.fill", size: 38, help: "Previous") { client.press(.previous) }
            Spacer()
            HoldKey(client: client, key: .rewind, symbol: "backward.fill", size: 38, help: "Rewind")
            Spacer()
            RoundKey(symbol: "playpause.fill", size: 46, tint: Palette.accent, help: "Play / Pause (Space)") { client.press(.playPause) }
            Spacer()
            HoldKey(client: client, key: .fastForward, symbol: "forward.fill", size: 38, help: "Fast forward")
            Spacer()
            RoundKey(symbol: "forward.end.fill", size: 38, help: "Next") { client.press(.next) }
        }
    }

    private var typeBar: some View {
        HStack(spacing: 6) {
            Image(systemName: "keyboard")
                .foregroundStyle(Palette.dim)
            TextField("Type on TV…", text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($textFocused)
                .onSubmit {
                    client.type(text)
                    text = ""
                }
            Button {
                client.press(.del)
            } label: {
                Image(systemName: "delete.left")
                    .foregroundStyle(Palette.dim)
            }
            .buttonStyle(.plain)
            .help("Backspace on TV")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Palette.key))
    }

    private var footer: some View {
        Text("↑↓←→ move · ⏎ OK · Esc back · H home · M menu · Space play · +/− volume · P power")
            .font(.system(size: 9))
            .foregroundStyle(Palette.dim.opacity(0.8))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Status

    private var statusColor: Color {
        switch client.state {
        case .connected: return .green
        case .connecting: return .yellow
        case .failed: return Palette.power
        case .disconnected: return .gray
        case .pairing: return .yellow
        }
    }

    private var statusText: String {
        switch client.state {
        case .connected:
            if let ms = client.lastAckMs { return "\(client.host) · \(ms) ms" }
            return client.host
        case .connecting: return "Connecting to \(client.host)…"
        case .failed(let msg): return "Retrying · \(msg)"
        case .disconnected: return "Not connected"
        case .pairing: return "Pairing with \(client.host)…"
        }
    }

    // MARK: Keyboard

    private func handleKey(_ press: KeyPress) -> KeyPress.Result {
        if textFocused || press.modifiers.contains(.command) || client.state == .pairing { return .ignored }
        switch press.key {
        case .upArrow: client.press(.dpadUp)
        case .downArrow: client.press(.dpadDown)
        case .leftArrow: client.press(.dpadLeft)
        case .rightArrow: client.press(.dpadRight)
        case .return: client.press(.dpadCenter)
        case .escape: client.press(.back)
        case .delete: client.press(.back)
        case .space: client.press(.playPause)
        default:
            switch press.characters.lowercased() {
            case "h": client.press(.home)
            case "m": client.press(.menu)
            case "p": client.press(.power)
            case "+", "=": client.press(.volumeUp)
            case "-", "_": client.press(.volumeDown)
            case "0": client.press(.mute)
            case "/", "t":
                textFocused = true
            default: return .ignored
            }
        }
        return .handled
    }
}

// MARK: - Keys

struct RoundKey: View {
    var symbol: String
    var size: CGFloat = 44
    var tint: Color? = nil
    var help: String = ""
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(tint == nil ? Palette.label : .white)
                .frame(width: size, height: size)
        }
        .buttonStyle(KeyStyle(shape: Circle(), fill: tint ?? Palette.key))
        .help(help)
    }
}

/// Tap = single press; press-and-hold (>350 ms) = auto-repeat until release.
struct HoldKey: View {
    @ObservedObject var client: RemoteClient
    var key: AndroidKey
    var symbol: String
    var size: CGFloat = 44
    var help: String = ""
    @State private var pressed = false
    @State private var holding = false
    @State private var holdTask: DispatchWorkItem?

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.36, weight: .semibold))
            .foregroundStyle(Palette.label)
            .frame(width: size, height: size)
            .background(Circle().fill(pressed ? Palette.keyPressed : Palette.key))
            .scaleEffect(pressed ? 0.94 : 1)
            .contentShape(Circle())
            .gesture(holdGesture(pressed: $pressed, holding: $holding, task: $holdTask, client: client, key: key))
            .help(help)
            .animation(.easeOut(duration: 0.08), value: pressed)
    }
}

@MainActor
func holdGesture(pressed: Binding<Bool>, holding: Binding<Bool>, task: Binding<DispatchWorkItem?>,
                 client: RemoteClient, key: AndroidKey) -> some Gesture {
    DragGesture(minimumDistance: 0)
        .onChanged { _ in
            guard !pressed.wrappedValue else { return }
            pressed.wrappedValue = true
            let work = DispatchWorkItem {
                if pressed.wrappedValue {
                    holding.wrappedValue = true
                    client.beginHold(key)
                }
            }
            task.wrappedValue = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
        }
        .onEnded { _ in
            task.wrappedValue?.cancel()
            if holding.wrappedValue {
                client.endHold()
            } else {
                client.press(key)
            }
            pressed.wrappedValue = false
            holding.wrappedValue = false
        }
}

struct KeyStyle<S: Shape>: ButtonStyle {
    var shape: S
    var fill: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(shape.fill(fill).brightness(configuration.isPressed ? 0.08 : 0))
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .contentShape(shape)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

// MARK: - D-pad

struct DPad: View {
    @ObservedObject var client: RemoteClient
    private let diameter: CGFloat = 200

    var body: some View {
        ZStack {
            Circle()
                .fill(Palette.key)
                .overlay(Circle().stroke(Color.white.opacity(0.05), lineWidth: 1))
            arrow(.dpadUp, "chevron.up", offset: CGSize(width: 0, height: -diameter * 0.34))
            arrow(.dpadDown, "chevron.down", offset: CGSize(width: 0, height: diameter * 0.34))
            arrow(.dpadLeft, "chevron.left", offset: CGSize(width: -diameter * 0.34, height: 0))
            arrow(.dpadRight, "chevron.right", offset: CGSize(width: diameter * 0.34, height: 0))
            Button { client.press(.dpadCenter) } label: {
                Text("OK")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(Palette.label)
                    .frame(width: diameter * 0.42, height: diameter * 0.42)
            }
            .buttonStyle(KeyStyle(shape: Circle(), fill: Palette.body))
            .help("OK (Return)")
        }
        .frame(width: diameter, height: diameter)
    }

    private func arrow(_ key: AndroidKey, _ symbol: String, offset: CGSize) -> some View {
        DPadArrow(client: client, key: key, symbol: symbol)
            .offset(offset)
    }
}

private struct DPadArrow: View {
    @ObservedObject var client: RemoteClient
    var key: AndroidKey
    var symbol: String
    @State private var pressed = false
    @State private var holding = false
    @State private var holdTask: DispatchWorkItem?

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(pressed ? Palette.accent : Palette.label)
            .frame(width: 58, height: 58)
            .background(Circle().fill(pressed ? Palette.keyPressed : Color.clear))
            .contentShape(Circle())
            .gesture(holdGesture(pressed: $pressed, holding: $holding, task: $holdTask, client: client, key: key))
            .animation(.easeOut(duration: 0.08), value: pressed)
    }
}

// MARK: - Rocker

struct Rocker: View {
    @ObservedObject var client: RemoteClient
    var up: AndroidKey
    var down: AndroidKey
    var label: String
    var upSymbol = "plus"
    var downSymbol = "minus"

    var body: some View {
        VStack(spacing: 0) {
            RockerHalf(client: client, key: up, symbol: upSymbol)
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(Palette.dim)
                .padding(.vertical, 2)
            RockerHalf(client: client, key: down, symbol: downSymbol)
        }
        .frame(width: 50)
        .background(Capsule().fill(Palette.key))
    }
}

private struct RockerHalf: View {
    @ObservedObject var client: RemoteClient
    var key: AndroidKey
    var symbol: String
    @State private var pressed = false
    @State private var holding = false
    @State private var holdTask: DispatchWorkItem?

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(pressed ? Palette.accent : Palette.label)
            .frame(width: 50, height: 42)
            .contentShape(Rectangle())
            .gesture(holdGesture(pressed: $pressed, holding: $holding, task: $holdTask, client: client, key: key))
    }
}

// MARK: - Connect sheet

struct ConnectSheet: View {
    @ObservedObject var discovery: TVDiscovery
    @State var host: String
    var onConnect: (String) -> Void
    var onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Connect to Mi TV")
                .font(.headline)
            HStack {
                Text("Found on network")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if discovery.isSearching { ProgressView().controlSize(.small) }
                Spacer()
                Button("Rescan") { discovery.start() }
                    .controlSize(.small)
            }
            if discovery.tvs.isEmpty {
                Text(discovery.isSearching ? "Searching…" : "No Mi TV found. Enter its IP address below.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            } else {
                ForEach(discovery.tvs) { tv in
                    Button {
                        onConnect(tv.address)
                    } label: {
                        HStack {
                            Image(systemName: "tv")
                            VStack(alignment: .leading) {
                                Text(tv.model.isEmpty ? tv.name : tv.model).fontWeight(.medium)
                                Text(tv.address).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.secondary)
                        }
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.06)))
                    }
                    .buttonStyle(.plain)
                }
            }
            Divider()
            HStack {
                TextField("IP address, e.g. 192.168.0.106", text: $host)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { onConnect(host) }
                Button("Connect") { onConnect(host) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(host.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(18)
    }
}

// MARK: - Pair sheet

/// One-time pairing for TVs that only have Google's Android TV remote service: the TV shows a
/// 6-character code and the user types it here. Disappears once the TV is connected.
struct PairSheet: View {
    @ObservedObject var client: RemoteClient
    @State private var code = ""
    @FocusState private var codeFocused: Bool

    private var verifying: Bool { client.pairingStep == .verifying }
    private var canRetry: Bool {
        client.pairingError == .rejected || client.pairingError == .connection || client.pairingError == .certificate
    }
    private var showsCodeField: Bool {
        !canRetry && (client.pairingStep == .enterCode || client.pairingStep == .verifying)
    }
    private var valid: Bool { Pairing.normalize(code) != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pair with your TV")
                .font(.headline)
            Text("This TV (\(client.host)) doesn't have Xiaomi's MiLink service, so Mi Remote uses the Android TV remote service instead. That needs a one-time pairing.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if showsCodeField {
                Text("Enter the 6-character code shown on your TV")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack {
                    TextField("A1B2C3", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 18, weight: .semibold, design: .monospaced))
                        .focused($codeFocused)
                        .disabled(verifying)
                        .onSubmit(submit)
                        .onChange(of: code) { _, value in
                            let cleaned = String(value.uppercased().filter { !$0.isWhitespace }.prefix(6))
                            if cleaned != value { code = cleaned }
                        }
                    Button(action: submit) {
                        if verifying {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Pair")
                        }
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!valid || verifying)
                }
            } else if !canRetry {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Asking the TV for a pairing code…")
                        .font(.callout)
                }
            }

            if let message = errorMessage {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(Palette.power)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if client.pairingError != nil, let detail = client.lastError {
                Text(detail)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if canRetry {
                Button("Try again") { client.retryPairing() }
                    .keyboardShortcut(.defaultAction)
            }

            Text("You only need to do this once per TV. If it keeps failing, on the TV open Settings → Apps → See all apps → Show system apps → Android TV Remote Service, and clear its storage.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Spacer()
                Button("Cancel") { client.disconnect() }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(18)
        .onAppear { codeFocused = showsCodeField }
        .onChange(of: client.pairingStep) { _, step in
            if step == .starting { code = "" }
            if step == .enterCode { codeFocused = true }
        }
    }

    private var errorMessage: String? {
        switch client.pairingError {
        case .wrongCode: return "That code didn't work. Enter the code now shown on the TV."
        case .rejected: return "The TV didn't accept the pairing. Try again, and enter the code before it disappears from the TV."
        case .connection: return "Lost the connection to the TV while pairing."
        case .certificate: return "Couldn't create the pairing key in your keychain."
        case nil: return nil
        }
    }

    private func submit() {
        guard valid, !verifying else { return }
        client.submitPairingCode(code)
    }
}
