import Foundation
import XCTest
@testable import MiRemote

/// End to end against Tests/fake_tv.py, a stand-in Android TV (TLS 1.2 only, client
/// certificates required, unpaired certificates rejected on 6466). Exercises what the unit tests
/// can't: Network.framework TLS, the keychain identity, and the whole probe → pair → connect flow.
///
/// Runs when MIREMOTE_FAKE_TV_CODE and MIREMOTE_FAKE_TV_KEYS point at the fake TV's files (CI
/// starts it); skipped otherwise.
final class FakeTVTests: XCTestCase {
    struct Timeout: Error, CustomStringConvertible {
        var description: String
    }

    @MainActor
    private func waitUntil(_ what: String, timeout: TimeInterval = 30, client: RemoteClient,
                           _ condition: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            if Date() > deadline {
                throw Timeout(description: "Timed out waiting for \(what). state=\(client.state) "
                    + "pairingStep=\(String(describing: client.pairingStep)) "
                    + "pairingError=\(String(describing: client.pairingError)) "
                    + "lastError=\(client.lastError ?? "nil")")
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    @MainActor
    func testPairsWithAndControlsAnAndroidTV() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let codeFile = env["MIREMOTE_FAKE_TV_CODE"], let keysFile = env["MIREMOTE_FAKE_TV_KEYS"] else {
            throw XCTSkip("Fake TV not running (set MIREMOTE_FAKE_TV_CODE and MIREMOTE_FAKE_TV_KEYS)")
        }
        try? FileManager.default.removeItem(atPath: codeFile)
        try? FileManager.default.removeItem(atPath: keysFile)
        UserDefaults.standard.removeObject(forKey: "tvProtocols")

        let client = RemoteClient()
        // Nothing listens on 6091 here, so this also covers the MiLink → Android TV fallback.
        client.connect(to: "127.0.0.1")

        try await waitUntil("the TV to show a pairing code", client: client) {
            client.pairingStep == .enterCode && FileManager.default.fileExists(atPath: codeFile)
        }
        let code = try String(contentsOfFile: codeFile, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertTrue(client.submitPairingCode(code), "client rejected the TV's code \(code)")

        try await waitUntil("the remote connection after pairing", client: client) {
            client.state == .connected
        }
        XCTAssertEqual(client.tvProtocol, .atv)

        client.press(.dpadUp)
        client.press(.home)
        try await waitUntil("the TV to receive the keys", client: client) {
            ((try? String(contentsOfFile: keysFile, encoding: .utf8)) ?? "").contains("3 3")
        }
        let keys = try String(contentsOfFile: keysFile, encoding: .utf8)
        XCTAssertEqual(keys, "19 3\n3 3\n")

        // Text goes in as an IME edit, even before the TV has sent any IME counters.
        client.type("Hello!")
        try await waitUntil("the TV to receive typed text", client: client) {
            ((try? String(contentsOfFile: keysFile, encoding: .utf8)) ?? "").contains("text 0 0 6 Hello!")
        }

        // Reconnecting reuses the pairing: straight to connected, no new code.
        client.disconnect()
        try? FileManager.default.removeItem(atPath: codeFile)
        client.connect(to: "127.0.0.1")
        try await waitUntil("reconnecting with the saved pairing", client: client) {
            client.state == .connected
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: codeFile), "TV was asked to pair again")
        client.disconnect()
    }
}
