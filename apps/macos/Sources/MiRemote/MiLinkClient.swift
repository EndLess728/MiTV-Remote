import Foundation
import Network

/// Client for the Xiaomi MiLink remote-control service (com.mitv.milinkservice, TCP 6091).
///
/// Wire format (recovered from RCServerThread / SendKeyPacket / SendKeyData, all big-endian):
///   frame      = type:u8  length:u16  payload[length]
///   type 2     = heartbeat (empty payload)
///   type 4     = send key; payload = code:u8 (1=send, 2=response) id:u32 len:u16 data[len]
///   key data   = TLVs: 1 meta, 2 action, 3 keycode, 4 scancode, 5 repeat, 6 flags (i32),
///                7 downTime, 8 eventTime (i64), 10 deviceId, 11 source (i32)
///
/// downTime/eventTime MUST be 0: the TV's Instrumentation.sendKeySync() then stamps them with the
/// TV's own uptime clock. Host-clock timestamps land "in the future" on the TV and can wedge its
/// input dispatcher until that time arrives.
@MainActor
final class MiLinkClient: ObservableObject {
    enum State: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)
    }

    static let port: UInt16 = 6091

    @Published private(set) var state: State = .disconnected
    @Published private(set) var lastAckMs: Int?

    private(set) var host: String = ""
    private var connection: NWConnection?
    private var buffer = Data()
    private var nextId: UInt32 = 0
    private var heartbeat: Timer?
    private var reconnectWork: DispatchWorkItem?
    private var pendingSends: [UInt32: Date] = [:]
    private var wantConnected = false

    // Hold-to-repeat
    private var repeatTimer: Timer?
    private var repeatCode: Int32 = 0
    private var repeatCount: Int32 = 0

    // MARK: Connection

    func connect(to host: String) {
        let host = host.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty else { return }
        disconnect()
        self.host = host
        wantConnected = true
        open()
    }

    func disconnect() {
        wantConnected = false
        reconnectWork?.cancel()
        reconnectWork = nil
        stopRepeat(sendUp: false)
        teardown()
        state = .disconnected
    }

    private func open() {
        guard let port = NWEndpoint.Port(rawValue: Self.port) else { return }
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.connectionTimeout = 4
        tcp.enableKeepalive = true
        let conn = NWConnection(host: NWEndpoint.Host(host), port: port, using: NWParameters(tls: nil, tcp: tcp))
        connection = conn
        state = .connecting
        conn.stateUpdateHandler = { [weak self, weak conn] newState in
            Task { @MainActor in
                guard let self, let conn, conn === self.connection else { return }
                self.handle(newState)
            }
        }
        conn.start(queue: .main)
    }

    private func handle(_ newState: NWConnection.State) {
        switch newState {
        case .ready:
            state = .connected
            buffer.removeAll()
            receive()
            heartbeat?.invalidate()
            heartbeat = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.write(Data([2, 0, 0])) }
            }
        case .failed(let error):
            fail(error.localizedDescription)
        case .waiting(let error):
            fail(error.localizedDescription)
        case .cancelled:
            break
        default:
            break
        }
    }

    private func fail(_ message: String) {
        teardown()
        state = .failed(message)
        scheduleReconnect()
    }

    private func teardown() {
        heartbeat?.invalidate()
        heartbeat = nil
        connection?.stateUpdateHandler = nil
        connection?.cancel()
        connection = nil
        pendingSends.removeAll()
    }

    private func scheduleReconnect() {
        guard wantConnected else { return }
        reconnectWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self, self.wantConnected, self.connection == nil else { return }
                self.open()
            }
        }
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    private func receive() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
            Task { @MainActor in
                guard let self else { return }
                if let data, !data.isEmpty {
                    self.buffer.append(data)
                    self.drainFrames()
                }
                if isComplete || error != nil {
                    self.fail(error?.localizedDescription ?? "TV closed the connection")
                } else {
                    self.receive()
                }
            }
        }
    }

    private func drainFrames() {
        while buffer.count >= 3 {
            let bytes = [UInt8](buffer.prefix(3))
            let length = Int(bytes[1]) << 8 | Int(bytes[2])
            guard buffer.count >= 3 + length else { return }
            let payload = buffer.subdata(in: buffer.startIndex + 3 ..< buffer.startIndex + 3 + length)
            buffer.removeSubrange(buffer.startIndex ..< buffer.startIndex + 3 + length)
            if bytes[0] == 4, payload.count >= 7 {
                let p = [UInt8](payload)
                let id = UInt32(p[1]) << 24 | UInt32(p[2]) << 16 | UInt32(p[3]) << 8 | UInt32(p[4])
                if let sent = pendingSends.removeValue(forKey: id) {
                    lastAckMs = Int(Date().timeIntervalSince(sent) * 1000)
                }
            }
        }
    }

    private func write(_ data: Data) {
        guard state == .connected, let connection else { return }
        connection.send(content: data, completion: .contentProcessed { _ in })
    }

    // MARK: Keys

    private func keyPacket(code: Int32, action: Int32, meta: Int32 = 0, repeatCount: Int32 = 0) -> Data {
        func i32(_ tag: UInt8, _ v: Int32) -> [UInt8] {
            let u = UInt32(bitPattern: v)
            return [tag, UInt8(u >> 24), UInt8(u >> 16 & 0xFF), UInt8(u >> 8 & 0xFF), UInt8(u & 0xFF)]
        }
        func i64(_ tag: UInt8, _ v: Int64) -> [UInt8] {
            let u = UInt64(bitPattern: v)
            return [tag] + (0..<8).map { UInt8(u >> (56 - 8 * UInt64($0)) & 0xFF) }
        }
        var data: [UInt8] = []
        data += i32(1, meta)
        data += i32(2, action)          // 0 = ACTION_DOWN, 1 = ACTION_UP
        data += i32(3, code)
        data += i32(4, 0)
        data += i32(5, repeatCount)
        data += i32(6, 0)
        data += i64(7, 0)               // downTime: let the TV stamp it
        data += i64(8, 0)               // eventTime: let the TV stamp it
        data += i32(10, -1)             // KeyCharacterMap.VIRTUAL_KEYBOARD
        data += i32(11, 0x101)          // InputDevice.SOURCE_KEYBOARD

        nextId &+= 1
        let id = nextId
        pendingSends[id] = Date()
        if pendingSends.count > 64 { pendingSends.removeAll() }

        let len = UInt16(data.count)
        var body: [UInt8] = [1, UInt8(id >> 24), UInt8(id >> 16 & 0xFF), UInt8(id >> 8 & 0xFF), UInt8(id & 0xFF),
                             UInt8(len >> 8), UInt8(len & 0xFF)]
        body += data
        let total = UInt16(body.count)
        return Data([4, UInt8(total >> 8), UInt8(total & 0xFF)] + body)
    }

    /// Single press: DOWN followed by UP.
    func press(_ key: AndroidKey) { press(code: key.rawValue) }

    func press(code: Int32, meta: Int32 = 0) {
        write(keyPacket(code: code, action: 0, meta: meta))
        write(keyPacket(code: code, action: 1, meta: meta))
    }

    /// Begin a press-and-hold. The TV auto-releases a key 175 ms after the last DOWN,
    /// so repeated DOWNs are sent every 100 ms until `endHold()`.
    func beginHold(_ key: AndroidKey) {
        stopRepeat(sendUp: true)
        repeatCode = key.rawValue
        repeatCount = 0
        write(keyPacket(code: repeatCode, action: 0))
        repeatTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.repeatCount += 1
                self.write(self.keyPacket(code: self.repeatCode, action: 0, repeatCount: self.repeatCount))
            }
        }
    }

    func endHold() { stopRepeat(sendUp: true) }

    private func stopRepeat(sendUp: Bool) {
        guard let timer = repeatTimer else { return }
        timer.invalidate()
        repeatTimer = nil
        if sendUp { write(keyPacket(code: repeatCode, action: 1)) }
    }

    /// Types text by sending one keystroke per character. Unsupported characters are skipped.
    func type(_ text: String) {
        var delay = 0.0
        for ch in text {
            guard let stroke = androidKeystroke(for: ch) else { continue }
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.press(code: stroke.code, meta: stroke.meta)
            }
            delay += 0.04
        }
    }
}
