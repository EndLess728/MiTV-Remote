import Foundation
import Network

/// Client for the TV's remote-control service. Speaks one of two protocols, remembered per TV:
///
/// - **MiLink** (TCP 6091), Xiaomi's own service on PatchWall TVs. No pairing.
/// - **Android TV Remote v2** (TLS 6466, pairing on 6467), the Google TV remote protocol, for
///   Mi TVs without MiLink. Needs a one-time code shown on the TV. See ATVProtocol.swift.
///
/// For a TV it hasn't seen, it tries MiLink first and falls back to Android TV Remote when
/// nothing listens on 6091.
///
/// MiLink wire format (recovered from RCServerThread / SendKeyPacket / SendKeyData, big-endian):
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
final class RemoteClient: ObservableObject {
    enum State: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)
        /// Android TV Remote needs the code shown on the TV; see `pairingStep`.
        case pairing
    }

    enum TVProtocol: String {
        case milink
        case atv
    }

    /// Asking the TV for a code, waiting for the user to type it, or waiting for the TV to accept it.
    enum PairingStep: Equatable {
        case starting
        case enterCode
        case verifying
    }

    enum PairingError: Equatable {
        case wrongCode
        case rejected
        case connection
        case certificate
    }

    static let milinkPort: UInt16 = 6091

    @Published private(set) var state: State = .disconnected
    @Published private(set) var lastAckMs: Int?
    @Published private(set) var pairingStep: PairingStep?
    @Published private(set) var pairingError: PairingError?
    @Published private(set) var tvProtocol: TVProtocol?
    /// The last connection error, with the port, for the status line and the pairing sheet.
    @Published private(set) var lastError: String?

    private(set) var host: String = ""
    private var wantConnected = false
    private var reconnectWork: DispatchWorkItem?

    /// Which socket is open, so its events go to the right handler.
    private enum Phase { case none, milink, atv, pairing }
    private var phase: Phase = .none
    private var connection: NWConnection?
    /// Plain TCP connection made before a TLS one, to learn whether the port is open at all.
    private var probe: NWConnection?
    private var reachedPeer = false
    private var peerCertificate: [UInt8]?

    // MiLink
    private var milinkBuffer = Data()
    private var nextId: UInt32 = 0
    private var heartbeat: Timer?
    private var pendingSends: [UInt32: Date] = [:]

    // Android TV Remote
    private var atvBuffer: [UInt8] = []
    private var atvReady = false
    private var features = RemoteMessage.wantedFeatures
    private var imeCounter: Int32?
    private var imeFieldCounter: Int32 = 0
    private var justPaired = false
    private var idleTimer: Timer?
    private var clientKey: RSAPublicKey?
    private var serverKey: RSAPublicKey?

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
        tvProtocol = Self.savedProtocol(for: host)
        state = .connecting
        open()
    }

    func disconnect() {
        wantConnected = false
        reconnectWork?.cancel()
        reconnectWork = nil
        stopRepeat(sendUp: false)
        closeSocket()
        state = .disconnected
        pairingStep = nil
        pairingError = nil
    }

    private func open() {
        if tvProtocol == .atv {
            openAtv()
        } else {
            openSocket(port: Self.milinkPort, tls: false, phase: .milink)
        }
    }

    private func openAtv() {
        atvReady = false
        imeCounter = nil
        features = RemoteMessage.wantedFeatures
        guard prepareCertificate() else { return }
        openSocket(port: ATV.remotePort, tls: true, phase: .atv)
    }

    /// Creates the client certificate on first use. False (with the state set) if that failed.
    private func prepareCertificate() -> Bool {
        do {
            clientKey = try ClientIdentity.ensureCertificate()
            return true
        } catch {
            closeSocket()
            state = .pairing
            pairingStep = .starting
            pairingError = .certificate
            return false
        }
    }

    private func scheduleReconnect() {
        guard wantConnected else { return }
        reconnectWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self, self.wantConnected, self.connection == nil, self.probe == nil else { return }
                self.open()
            }
        }
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    private func remember(_ proto: TVProtocol) {
        tvProtocol = proto
        var saved = UserDefaults.standard.dictionary(forKey: "tvProtocols") as? [String: String] ?? [:]
        saved[host] = proto.rawValue
        UserDefaults.standard.set(saved, forKey: "tvProtocols")
    }

    private static func savedProtocol(for host: String) -> TVProtocol? {
        let saved = UserDefaults.standard.dictionary(forKey: "tvProtocols") as? [String: String]
        return saved?[host].flatMap(TVProtocol.init(rawValue:))
    }

    // MARK: Socket

    private func openSocket(port: UInt16, tls: Bool, phase: Phase) {
        closeSocket()
        guard let nwPort = NWEndpoint.Port(rawValue: port) else { return }
        self.phase = phase
        milinkBuffer.removeAll()
        atvBuffer.removeAll()
        reachedPeer = false
        peerCertificate = nil
        if state != .pairing { state = .connecting }
        if tls {
            probePort(nwPort)
        } else {
            startConnection(nwPort, tls: false)
        }
    }

    /// Connects plain TCP first and only then TLS, the way the Android app does. A TV that
    /// rejects an unpaired certificate, or stalls the TLS handshake, can surface as a reset or a
    /// timeout, which on its own reads like "nothing listens here". Knowing TCP got through
    /// makes any later failure mean "the service is there", so pairing starts.
    private func probePort(_ port: NWEndpoint.Port) {
        let tcp = NWProtocolTCP.Options()
        tcp.connectionTimeout = 4
        let conn = NWConnection(host: NWEndpoint.Host(host), port: port, using: NWParameters(tls: nil, tcp: tcp))
        probe = conn
        conn.stateUpdateHandler = { [weak self, weak conn] newState in
            Task { @MainActor in
                guard let self, let conn, conn === self.probe else { return }
                switch newState {
                case .ready:
                    conn.stateUpdateHandler = nil
                    conn.cancel()
                    self.probe = nil
                    self.reachedPeer = true
                    self.startConnection(port, tls: true)
                case .failed(let error), .waiting(let error):
                    conn.stateUpdateHandler = nil
                    conn.cancel()
                    self.probe = nil
                    self.socketFailed(error.localizedDescription, reachable: false)
                default:
                    break
                }
            }
        }
        conn.start(queue: .main)
    }

    private func startConnection(_ port: NWEndpoint.Port, tls: Bool) {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        // TLS gets longer: on first use the keychain may ask before the client key can sign.
        tcp.connectionTimeout = tls ? 10 : 4
        tcp.enableKeepalive = true
        let conn = NWConnection(host: NWEndpoint.Host(host), port: port,
                                using: NWParameters(tls: tls ? tlsOptions() : nil, tcp: tcp))
        connection = conn
        conn.stateUpdateHandler = { [weak self, weak conn] newState in
            Task { @MainActor in
                guard let self, let conn, conn === self.connection else { return }
                self.handle(newState)
            }
        }
        conn.start(queue: .main)
    }

    /// Presents the client certificate and accepts the TV's self-signed one. The pairing secret
    /// mixes in the TV's public key, which is what ties the session to the right TV.
    private func tlsOptions() -> NWProtocolTLS.Options {
        let options = NWProtocolTLS.Options()
        let sec = options.securityProtocolOptions
        // TLS 1.2 only. The TV's remote service (Netty) is a TLS 1.2 server, and Apple's TLS 1.3
        // handshake against it fails or stalls; native clients that work with Xiaomi TVs pin 1.2.
        sec_protocol_options_set_min_tls_protocol_version(sec, .TLSv12)
        sec_protocol_options_set_max_tls_protocol_version(sec, .TLSv12)
        do {
            if let secIdentity = sec_identity_create(try ClientIdentity.identity()) {
                sec_protocol_options_set_local_identity(sec, secIdentity)
            }
        } catch {
            // Without it the TV refuses the connection; say why instead of failing obscurely.
            lastError = "Client certificate unavailable: \(error.localizedDescription)"
        }
        sec_protocol_options_set_verify_block(sec, { [weak self] _, trust, complete in
            let secTrust = sec_trust_copy_ref(trust).takeRetainedValue()
            var leaf: [UInt8]?
            if let chain = SecTrustCopyCertificateChain(secTrust) as? [SecCertificate], let first = chain.first {
                leaf = [UInt8](SecCertificateCopyData(first) as Data)
            }
            // Runs on the main queue (below), before the connection reports .ready.
            MainActor.assumeIsolated { self?.peerCertificate = leaf }
            complete(true)
        }, .main)
        return options
    }

    private func closeSocket() {
        probe?.stateUpdateHandler = nil
        probe?.cancel()
        probe = nil
        heartbeat?.invalidate()
        heartbeat = nil
        idleTimer?.invalidate()
        idleTimer = nil
        connection?.stateUpdateHandler = nil
        connection?.cancel()
        connection = nil
        pendingSends.removeAll()
        phase = .none
    }

    private func handle(_ newState: NWConnection.State) {
        switch newState {
        case .ready:
            reachedPeer = true
            switch phase {
            case .milink: milinkConnected()
            case .atv: atvConnected()
            case .pairing: pairingConnected()
            case .none: break
            }
            receive()
        case .failed(let error), .waiting(let error):
            socketFailed(error.localizedDescription, reachable: reachedPeer || peerWasReachable(error))
        default:
            break
        }
    }

    /// `reachable`: TCP had connected, so something listens on that port.
    private func socketFailed(_ message: String, reachable: Bool) {
        let failedPhase = phase
        let port: UInt16 = switch failedPhase {
        case .milink: Self.milinkPort
        case .atv: ATV.remotePort
        case .pairing: ATV.pairingPort
        case .none: 0
        }
        let detail = port == 0 ? message : "\(port): \(message)"
        lastError = detail
        closeSocket()
        stopRepeat(sendUp: false)
        switch failedPhase {
        case .milink: milinkFailed(detail, reachable: reachable)
        case .atv: atvFailed(detail, reachable: reachable)
        case .pairing: pairingFailed(detail, reachable: reachable)
        case .none: break
        }
    }

    private func receive() {
        guard let current = connection else { return }
        current.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self, weak current] data, _, isComplete, error in
            Task { @MainActor in
                guard let self, let current, current === self.connection else { return }
                if let data, !data.isEmpty {
                    switch self.phase {
                    case .milink:
                        self.milinkBuffer.append(data)
                        self.drainMiLinkFrames()
                    case .atv, .pairing:
                        self.atvBuffer += [UInt8](data)
                        for message in Proto.split(&self.atvBuffer) {
                            if self.phase == .atv { self.handleAtvMessage(message) }
                            else if self.phase == .pairing { self.handlePairingMessage(message) }
                        }
                    case .none:
                        break
                    }
                }
                guard current === self.connection else { return }
                if isComplete || error != nil {
                    self.socketFailed(error?.localizedDescription ?? "TV closed the connection", reachable: true)
                } else {
                    self.receive()
                }
            }
        }
    }

    private func sendDelimited(_ message: [UInt8]) {
        connection?.send(content: Data(Proto.delimited(message)), completion: .contentProcessed { _ in })
    }

    // MARK: MiLink

    private func milinkConnected() {
        state = .connected
        lastError = nil
        if tvProtocol != .milink { remember(.milink) }
        heartbeat?.invalidate()
        heartbeat = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.write(Data([2, 0, 0])) }
        }
    }

    private func milinkFailed(_ message: String, reachable: Bool) {
        if tvProtocol == nil && !reachable {
            // Nothing on 6091: this TV may only have the Android TV Remote service.
            openAtv()
            return
        }
        state = .failed(message)
        scheduleReconnect()
    }

    private func drainMiLinkFrames() {
        while milinkBuffer.count >= 3 {
            let bytes = [UInt8](milinkBuffer.prefix(3))
            let length = Int(bytes[1]) << 8 | Int(bytes[2])
            guard milinkBuffer.count >= 3 + length else { return }
            let start = milinkBuffer.startIndex
            let payload = milinkBuffer.subdata(in: start + 3 ..< start + 3 + length)
            milinkBuffer.removeSubrange(start ..< start + 3 + length)
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
        guard state == .connected, phase == .milink, let connection else { return }
        connection.send(content: data, completion: .contentProcessed { _ in })
    }

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

    // MARK: Android TV Remote

    private func atvConnected() {
        resetIdleTimer()
    }

    private func atvFailed(_ message: String, reachable: Bool) {
        if !atvReady && reachable {
            // The service is there but dropped the TLS session: our certificate isn't paired (yet).
            if justPaired {
                justPaired = false
                state = .pairing
                pairingStep = .starting
                pairingError = .rejected
                return
            }
            startPairing()
            return
        }
        state = .failed(message)
        scheduleReconnect()
    }

    /// The TV pings every 5 s; three missed pings means the connection is gone.
    private func resetIdleTimer() {
        idleTimer?.invalidate()
        idleTimer = Timer.scheduledTimer(withTimeInterval: 16, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.phase == .atv else { return }
                self.socketFailed("No response from the TV", reachable: true)
            }
        }
    }

    private func handleAtvMessage(_ bytes: [UInt8]) {
        resetIdleTimer()
        guard let event = try? RemoteMessage.parse(bytes) else { return }
        switch event {
        case .configure(let supported, _):
            features = RemoteMessage.wantedFeatures & supported
            sendDelimited(RemoteMessage.configure(features: features))
            markAtvReady()
        case .setActive:
            sendDelimited(RemoteMessage.setActive(features: features))
        case .ping(let value):
            sendDelimited(RemoteMessage.pingResponse(value))
        case .start:
            markAtvReady()
        case .imeBatchEdit(let ime, let field):
            imeCounter = ime
            imeFieldCounter = field
        case .imeField(let field):
            imeFieldCounter = field
        case .error, .other:
            break
        }
    }

    private func markAtvReady() {
        guard !atvReady else { return }
        atvReady = true
        justPaired = false
        if tvProtocol != .atv { remember(.atv) }
        state = .connected
        lastAckMs = nil
        lastError = nil
        pairingStep = nil
        pairingError = nil
    }

    private func sendAtvKey(_ code: Int32) {
        guard state == .connected, phase == .atv else { return }
        sendDelimited(RemoteMessage.keyInject(code: code, direction: .short))
    }

    // MARK: Android TV pairing

    private func startPairing(error: PairingError? = nil) {
        serverKey = nil
        state = .pairing
        pairingStep = .starting
        pairingError = error
        guard prepareCertificate() else { return }
        openSocket(port: ATV.pairingPort, tls: true, phase: .pairing)
    }

    /// Asks the TV for a new code, e.g. after a failed attempt.
    func retryPairing() {
        guard wantConnected, !host.isEmpty else { return }
        reconnectWork?.cancel()
        startPairing()
    }

    /// Sends the code shown on the TV. False if it can't be right (checksum mismatch).
    @discardableResult
    func submitPairingCode(_ code: String) -> Bool {
        guard phase == .pairing, pairingStep == .enterCode, let clientKey, let serverKey else { return false }
        guard let secret = Pairing.secret(client: clientKey, server: serverKey, code: code) else {
            pairingError = .wrongCode
            return false
        }
        sendDelimited(Pairing.secretMessage(secret))
        pairingStep = .verifying
        pairingError = nil
        return true
    }

    private func pairingConnected() {
        guard let peerCertificate, let key = try? DER.rsaPublicKey(peerCertificate) else {
            closeSocket()
            pairingError = .connection
            return
        }
        serverKey = key
        sendDelimited(Pairing.request(clientName: ATV.clientName))
    }

    /// Stays on the pairing sheet with the error, rather than silently starting over.
    private func pairingFailed(_ message: String, reachable: Bool) {
        state = .pairing
        pairingStep = .starting
        pairingError = .connection
    }

    private func handlePairingMessage(_ bytes: [UInt8]) {
        guard let parsed = try? Pairing.parse(bytes) else { return }
        let (status, reply) = parsed
        guard status == Pairing.statusOK else {
            closeSocket()
            if status == Pairing.statusBadSecret {
                startPairing(error: .wrongCode)
            } else {
                pairingError = .rejected
            }
            return
        }
        switch reply {
        case .requestAck:
            sendDelimited(Pairing.options())
        case .options:
            sendDelimited(Pairing.configuration())
        case .configurationAck:
            pairingStep = .enterCode
        case .secretAck:
            justPaired = true
            remember(.atv)
            pairingStep = nil
            pairingError = nil
            state = .connecting
            openAtv()
        case .unknown:
            break
        }
    }

    // MARK: Keys

    /// Single press: DOWN followed by UP.
    func press(_ key: AndroidKey) { press(code: key.rawValue) }

    func press(code: Int32, meta: Int32 = 0) {
        if phase == .atv {
            sendAtvKey(code)
        } else {
            write(keyPacket(code: code, action: 0, meta: meta))
            write(keyPacket(code: code, action: 1, meta: meta))
        }
    }

    /// Begin a press-and-hold that repeats until `endHold()`. MiLink: the TV auto-releases a key
    /// 175 ms after the last DOWN, so DOWN is resent every 100 ms. Android TV Remote: discrete
    /// presses every 120 ms.
    func beginHold(_ key: AndroidKey) {
        stopRepeat(sendUp: true)
        repeatCode = key.rawValue
        repeatCount = 0
        if phase == .atv {
            sendAtvKey(repeatCode)
            repeatTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.sendAtvKey(self.repeatCode)
                }
            }
            return
        }
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
        if sendUp && phase == .milink { write(keyPacket(code: repeatCode, action: 1)) }
    }

    /// Types text on the TV. Android TV Remote sends it as an IME edit into the focused text
    /// field (the TV ignores letter key events there). MiLink types one keystroke at a time and
    /// skips characters with no Android key.
    func type(_ text: String) {
        guard !text.isEmpty else { return }
        if phase == .atv {
            guard state == .connected else { return }
            sendDelimited(RemoteMessage.imeBatchEdit(imeCounter: imeCounter ?? 0, fieldCounter: imeFieldCounter, text: text))
            return
        }
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

/// Whether a connection error means something is listening on the port. Network.framework
/// reports a TV that aborts the TLS handshake (an unpaired client certificate) as a TLS error or,
/// often, as a plain reset; only refusals, timeouts and missing routes mean nobody's there.
func peerWasReachable(_ error: NWError) -> Bool {
    switch error {
    case .tls:
        return true
    case .posix(let code):
        let unreachable: Set<POSIXErrorCode> = [
            .ECONNREFUSED, .ETIMEDOUT, .EHOSTUNREACH, .ENETUNREACH, .EHOSTDOWN, .ENETDOWN, .EADDRNOTAVAIL,
        ]
        return !unreachable.contains(code)
    default:
        return false
    }
}
