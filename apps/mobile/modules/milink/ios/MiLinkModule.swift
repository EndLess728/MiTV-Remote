import ExpoModulesCore
import Network

/// Raw TCP socket and Mi TV discovery for the MiLink remote protocol.
/// Framing and key packets live in TypeScript (src/milink); this module only moves bytes.
public class MiLinkModule: Module {
  private let queue = DispatchQueue(label: "expo.modules.milink")
  private var connection: NWConnection?
  private var browser: NWBrowser?
  private var resolvers: [String: NWConnection] = [:]
  private var reported: Set<String> = []

  public func definition() -> ModuleDefinition {
    Name("MiLink")

    Events("onSocketState", "onSocketData", "onTvFound")

    Function("connect") { (host: String, port: Int) in
      self.queue.async { self.open(host: host, port: port) }
    }

    Function("disconnect") {
      self.queue.async { self.close() }
    }

    Function("send") { (bytes: [Int]) in
      let data = Data(bytes.map { UInt8(truncatingIfNeeded: $0) })
      self.queue.async {
        self.connection?.send(content: data, completion: .contentProcessed { _ in })
      }
    }

    Function("startDiscovery") {
      self.queue.async { self.startBrowsing() }
    }

    Function("stopDiscovery") {
      self.queue.async { self.stopBrowsing() }
    }

    OnDestroy {
      self.queue.sync {
        self.close()
        self.stopBrowsing()
      }
    }
  }

  // MARK: - Socket

  private func open(host: String, port: Int) {
    close()
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else { return }
    let tcp = NWProtocolTCP.Options()
    tcp.noDelay = true
    tcp.connectionTimeout = 4
    tcp.enableKeepalive = true
    let conn = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: NWParameters(tls: nil, tcp: tcp))
    connection = conn
    emitState("connecting")
    conn.stateUpdateHandler = { [weak self, weak conn] state in
      guard let self, let conn, conn === self.connection else { return }
      switch state {
      case .ready:
        self.emitState("connected")
        self.receive(on: conn)
      case .waiting(let error), .failed(let error):
        // .waiting covers "no route" and a denied Local Network permission; report it as a
        // failure and let the JS side decide when to retry.
        self.connection = nil
        conn.stateUpdateHandler = nil
        conn.cancel()
        self.emitState("failed", error: error.localizedDescription)
      default:
        break
      }
    }
    conn.start(queue: queue)
  }

  private func receive(on conn: NWConnection) {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self, weak conn] data, _, isComplete, error in
      guard let self, let conn, conn === self.connection else { return }
      if let data, !data.isEmpty {
        self.sendEvent("onSocketData", ["bytes": data.map { Int($0) }])
      }
      if isComplete || error != nil {
        self.connection = nil
        conn.stateUpdateHandler = nil
        conn.cancel()
        self.emitState("failed", error: error?.localizedDescription ?? "TV closed the connection")
      } else {
        self.receive(on: conn)
      }
    }
  }

  private func close() {
    guard let conn = connection else { return }
    connection = nil
    conn.stateUpdateHandler = nil
    conn.cancel()
    emitState("disconnected")
  }

  private func emitState(_ state: String, error: String? = nil) {
    var body: [String: Any] = ["state": state]
    if let error { body["error"] = error }
    sendEvent("onSocketState", body)
  }

  // MARK: - Discovery

  /// Mi TVs advertise `_googlecast._tcp` with a TXT `md=MiTV-…` model. Browse that service,
  /// then briefly connect to each match to learn its IPv4 address.
  private func startBrowsing() {
    stopBrowsing()
    reported.removeAll()
    let params = NWParameters()
    params.includePeerToPeer = false
    let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_googlecast._tcp", domain: "local."), using: params)
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      self?.handle(results)
    }
    browser.start(queue: queue)
    self.browser = browser
  }

  private func stopBrowsing() {
    browser?.cancel()
    browser = nil
    resolvers.values.forEach { $0.cancel() }
    resolvers.removeAll()
  }

  private func handle(_ results: Set<NWBrowser.Result>) {
    for result in results {
      guard case let .service(name, _, _, _) = result.endpoint else { continue }
      var model = ""
      var friendly = name
      if case let .bonjour(txt) = result.metadata {
        model = txt["md"] ?? ""
        friendly = txt["fn"] ?? name
      }
      guard model.lowercased().hasPrefix("mitv") || name.lowercased().hasPrefix("mitv") else { continue }
      guard resolvers[name] == nil, !reported.contains(name) else { continue }
      resolve(result.endpoint, id: name, name: friendly, model: model)
    }
  }

  private func resolve(_ endpoint: NWEndpoint, id: String, name: String, model: String) {
    let params = NWParameters.tcp
    if let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
      ip.version = .v4
    }
    let conn = NWConnection(to: endpoint, using: params)
    resolvers[id] = conn
    conn.stateUpdateHandler = { [weak self, weak conn] state in
      guard let self, let conn else { return }
      switch state {
      case .ready:
        if case let .hostPort(host, _)? = conn.currentPath?.remoteEndpoint {
          var address = "\(host)"
          if let pct = address.firstIndex(of: "%") { address = String(address[..<pct]) }
          if !self.reported.contains(id) {
            self.reported.insert(id)
            self.sendEvent("onTvFound", ["id": id, "name": name, "model": model, "address": address])
          }
        }
        conn.cancel()
        self.resolvers[id] = nil
      case .failed, .cancelled:
        self.resolvers[id] = nil
      default:
        break
      }
    }
    conn.start(queue: queue)
  }
}
