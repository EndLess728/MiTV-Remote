import Foundation
import Network

/// Finds Mi TVs on the LAN. They advertise `_googlecast._tcp` with a TXT `md=MiTV-…` model,
/// so we browse that service, then briefly connect to resolve the host's IPv4 address.
@MainActor
final class TVDiscovery: ObservableObject {
    struct TV: Identifiable, Hashable {
        let id: String
        let name: String
        let model: String
        let address: String
    }

    @Published private(set) var tvs: [TV] = []
    @Published private(set) var isSearching = false

    private var browser: NWBrowser?
    private var resolvers: [String: NWConnection] = [:]

    func start() {
        stop()
        tvs = []
        isSearching = true
        let params = NWParameters()
        params.includePeerToPeer = false
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_googlecast._tcp", domain: "local."), using: params)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in self?.handle(results) }
        }
        browser.start(queue: .main)
        self.browser = browser
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.isSearching = false
        }
    }

    func stop() {
        browser?.cancel()
        browser = nil
        resolvers.values.forEach { $0.cancel() }
        resolvers.removeAll()
        isSearching = false
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
            guard resolvers[name] == nil, !tvs.contains(where: { $0.id == name }) else { continue }
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
            Task { @MainActor in
                guard let self, let conn else { return }
                switch state {
                case .ready:
                    if case let .hostPort(host, _)? = conn.currentPath?.remoteEndpoint {
                        var address = "\(host)"
                        if let pct = address.firstIndex(of: "%") { address = String(address[..<pct]) }
                        if !self.tvs.contains(where: { $0.id == id }) {
                            self.tvs.append(TV(id: id, name: name, model: model, address: address))
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
        }
        conn.start(queue: .main)
    }
}
