import Foundation
import Network
import Security
import XCTest
@testable import MiRemote

/// Same fixtures as the mobile app's src/atv tests: generated with androidtvremote2 (the Python
/// library Home Assistant uses) and its protobuf definitions.
final class ATVProtocolTests: XCTestCase {
    private let clientCert = Data(base64Encoded: "MIICxDCCAaygAwIBAgICA+gwDQYJKoZIhvcNAQELBQAwETEPMA0GA1UEAwwGY2xpZW50MB4XDTI2MTAyMDAxNTIyNloXDTM2MTAxNzAxNTIyNlowETEPMA0GA1UEAwwGY2xpZW50MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwI5zpLK19vU172TlpQeRzqPtI6vS+aAbmrvjyKzHwN6iJYSGd3YP5mKnIvRWz4MO4YVgFQUQTG+gxB7OxTIeKjjyZBwTFMgD0n8pc7QCokAU9YxeQOqfJtiaVVO8G0D0a9p7hyd51iJ3J8Cn01QiY/R9Vu5EtfuzAw8BSr2buGI0cJpLGgskg+2yxysuo/GUCPWhoBjdj/Fi6+HJ0GsIrx40bAbfxfpmKtswO7ePPz93rYA99VamcUc771RgrYEuF2yenpdHKICxHOtvVzoOjNGC6E5vWohG1Fj3csvk7ON9m8OVdfoqyJPU9K7TUNiFGnlfo1bc9z5PfubYoZr1EwIDAQABoyYwJDAPBgNVHRMECDAGAQH/AgEAMBEGA1UdEQQKMAiCBmNsaWVudDANBgkqhkiG9w0BAQsFAAOCAQEAajHqzHW5Ujyw4CyXVhyK/G4k4w0o8QhIox/w5B1wnw1rcAt+/F4GHS2aQ11h1/gJtsC+YaqcbelxVvSSCqhvLDX7CWe8xoPCDX65HufvFNLQQEEUlJxkyegBe6n4tT22xJdTn6zTD65vYRZfSjKuvGXzpjRKZZFHSKd6aSGLtpqhVPqcR2Z/3YB9Su1VqEI/F2SWBCSejZUUD9f8X1f+aLPM6A77tOm5kz5M0CMFsIA+MqqTJn9cz+jbdkFKYkiWtBMAiGi+v9uVPdypQyHq88f7gfzBEVMko3I9/XPgUd353cKXUTei986incGaWHp7NAotNKE9yMEDIxxv5b3CwA==")!
    private let serverCert = Data(base64Encoded: "MIICuDCCAaCgAwIBAgICA+gwDQYJKoZIhvcNAQELBQAwDTELMAkGA1UEAwwCdHYwHhcNMjYxMDIwMDE1MjI2WhcNMzYxMDE3MDE1MjI2WjANMQswCQYDVQQDDAJ0djCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKOqS1k8/QaU27Ah/BkgYO6xR0qM2tI1HbzsrPe/YEQHjT95yqYUcgVgQ74wPqUshrj4GoSfF4u9IF7iqMaYKv5sc/fVQhmR0ej8AJQa7OYWchzgP/fFl2I/A+/6epG7A+IwgMPwb+PEMdvZNsY6XuyqUEKg/AL8b/2/xXjCGCSG2vC1cuOTyBFwGmrSM9girl7ISea9kRx3KlF9oXG0ekUI7OZRPwkTRJTfkyk4oygYhR4KVW+eAc23Q9TIw1TyxHU8sz3v6wWlAC6WHXBESvOb+/bCdxXjZZiEUL0bGM9YfZFpLn/rKGDR/sX2B8EO5qd9XSn9FyJ/DCEyaZoYdDcCAwEAAaMiMCAwDwYDVR0TBAgwBgEB/wIBADANBgNVHREEBjAEggJ0djANBgkqhkiG9w0BAQsFAAOCAQEAX4P/t/4WtUhbiUXfnMrnTilNrvensSm5jxV95gMAbsF+8y/ikhkhdjb11gfs++68eBvpkOBnk7yeizK9W84QpKEUbMpcBTTbeBlf5RaPpsMGtYpaabAVKMe3VVFld+06oZj8QTEWYRC5FNEndvAYc9epHnRYQiT/lZBKbLFGRYaWzRefvVgr4lEPpzq44Q8vr1T8bakJXZM4FoGpjg+f+7X1uOIAIFVXpKbhOg9k1ZuKppSI8NZiaRM+3BXfJ1ek0ANG5V3q3VpmczXH7KrVgrbZJrrlUfgJf2V2eFee3aieiqeayWkn/dbslsZpLOZvEwuO531yglPfcziup268Dg==")!
    private let pairingCode = "AA3F9A"
    private let pairingSecretHex = "aa7fdc8dfcff4b9ddd943c85edcd6ba1469fe9795d6029fe03f55ede331c8ecc"

    private func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02x", $0) }.joined() }

    func testVarints() {
        XCTAssertEqual(Proto.varint(0), [0])
        XCTAssertEqual(Proto.varint(300), [0xAC, 0x02])
        XCTAssertEqual(Proto.varint(-1), [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01])
    }

    func testSplitsDelimitedMessagesAcrossChunks() {
        let big = (0..<200).map { UInt8($0 & 0xFF) }
        let stream = Proto.delimited([1, 2, 3]) + Proto.delimited(big)
        var buffer = Array(stream.prefix(5))
        let first = Proto.split(&buffer)
        XCTAssertEqual(first, [[1, 2, 3]])
        buffer += stream.dropFirst(5)
        let second = Proto.split(&buffer)
        XCTAssertEqual(second, [big])
        XCTAssertEqual(buffer, [])
    }

    func testPairingMessagesMatchReference() {
        XCTAssertEqual(Pairing.request(clientName: "Mi Remote"), [8, 2, 16, 200, 1, 82, 22, 10, 9, 97, 116, 118, 114, 101, 109, 111, 116, 101, 18, 9, 77, 105, 32, 82, 101, 109, 111, 116, 101])
        XCTAssertEqual(Pairing.options(), [8, 2, 16, 200, 1, 162, 1, 8, 10, 4, 8, 3, 16, 6, 24, 1])
        XCTAssertEqual(Pairing.configuration(), [8, 2, 16, 200, 1, 242, 1, 8, 10, 4, 8, 3, 16, 6, 16, 1])
        XCTAssertEqual(Pairing.secretMessage((0..<32).map { UInt8($0) }), [8, 2, 16, 200, 1, 194, 2, 34, 10, 32, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])
    }

    func testParsesPairingReplies() throws {
        XCTAssertEqual(try Pairing.parse([8, 2, 16, 200, 1, 90, 4, 10, 2, 116, 118]).reply, .requestAck)
        XCTAssertEqual(try Pairing.parse([8, 2, 16, 200, 1, 162, 1, 8, 10, 4, 8, 3, 16, 6, 24, 1]).reply, .options)
        XCTAssertEqual(try Pairing.parse([8, 2, 16, 200, 1, 250, 1, 0]).reply, .configurationAck)
        XCTAssertEqual(try Pairing.parse([8, 2, 16, 200, 1, 202, 2, 2, 10, 0]).reply, .secretAck)
        XCTAssertEqual(try Pairing.parse([8, 2, 16, 146, 3]).status, Pairing.statusBadSecret)
    }

    func testPairingSecretMatchesReference() throws {
        let client = try DER.rsaPublicKey([UInt8](clientCert))
        let server = try DER.rsaPublicKey([UInt8](serverCert))
        XCTAssertEqual(Pairing.secret(client: client, server: server, code: pairingCode).map(hex), pairingSecretHex)
        XCTAssertEqual(Pairing.secret(client: client, server: server, code: " aa3f9a ").map(hex), pairingSecretHex)
        XCTAssertNil(Pairing.secret(client: client, server: server, code: "AB3F9A"))
        XCTAssertNil(Pairing.secret(client: client, server: server, code: "AA3F9"))
    }

    func testRemoteMessagesMatchReference() {
        XCTAssertEqual(RemoteMessage.keyInject(code: 19, direction: .short), [82, 4, 8, 19, 16, 3])
        XCTAssertEqual(RemoteMessage.pingResponse(-5), [74, 11, 8, 251, 255, 255, 255, 255, 255, 255, 255, 255, 1])
        XCTAssertEqual(RemoteMessage.setActive(features: 615), [18, 3, 8, 231, 4])
        XCTAssertEqual(RemoteMessage.imeBatchEdit(imeCounter: 3, fieldCounter: 7, text: "héllo"), [170, 1, 22, 8, 3, 16, 7, 26, 16, 8, 1, 18, 12, 8, 5, 16, 5, 26, 6, 104, 195, 169, 108, 108, 111])
        XCTAssertEqual(RemoteMessage.configure(features: 615), [10, 50, 8, 231, 4, 18, 45, 10, 9, 77, 105, 32, 82, 101, 109, 111, 116, 101, 18, 9, 77, 105, 32, 82, 101, 109, 111, 116, 101, 24, 1, 34, 1, 49, 42, 9, 97, 116, 118, 114, 101, 109, 111, 116, 101, 50, 5, 49, 46, 48, 46, 48])
        XCTAssertEqual(RemoteMessage.wantedFeatures, 615)
    }

    func testParsesRemoteMessages() throws {
        XCTAssertEqual(try RemoteMessage.parse([66, 5, 8, 185, 96, 16, 1]), .ping(12345))
        XCTAssertEqual(try RemoteMessage.parse([178, 1, 12, 18, 10, 8, 4, 50, 6, 83, 101, 97, 114, 99, 104]), .imeField(fieldCounter: 4))
        XCTAssertEqual(try RemoteMessage.parse([162, 1, 19, 10, 13, 98, 11, 99, 111, 109, 46, 110, 101, 116, 102, 108, 105, 120, 18, 2, 8, 6]), .imeField(fieldCounter: 6))
        XCTAssertEqual(try RemoteMessage.parse([10, 25, 8, 255, 4, 18, 20, 10, 10, 77, 105, 84, 86, 45, 77, 79, 79, 82, 50, 18, 6, 88, 105, 97, 111, 109, 105]), .configure(features: 639, model: "MiTV-MOOR2"))
        XCTAssertEqual(try RemoteMessage.parse([194, 2, 2, 8, 1]), .start(true))
        XCTAssertEqual(try RemoteMessage.parse([170, 1, 4, 8, 9, 16, 2]), .imeBatchEdit(imeCounter: 9, fieldCounter: 2))
        XCTAssertEqual(try RemoteMessage.parse([74, 11, 8, 251, 255, 255, 255, 255, 255, 255, 255, 255, 1]), .other)
    }

    func testReadsRSAKeyFromCertificateAndPKCS1() throws {
        let fromCert = try DER.rsaPublicKey([UInt8](clientCert))
        let cert = try XCTUnwrap(SecCertificateCreateWithData(nil, clientCert as CFData))
        let key = try XCTUnwrap(SecCertificateCopyKey(cert))
        let pkcs1 = try XCTUnwrap(SecKeyCopyExternalRepresentation(key, nil) as Data?)
        XCTAssertEqual(try DER.rsaPublicKey([UInt8](pkcs1)), fromCert)
        XCTAssertEqual(fromCert.exponent, [1, 0, 1])
        XCTAssertEqual(fromCert.modulus.count, 256)
    }

    /// Builds a certificate the way ClientIdentity does, with an in-memory key, and checks that
    /// Security.framework parses it and that its signature verifies.
    func testBuildsAValidSelfSignedCertificate() throws {
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: 2048,
        ]
        let privateKey = try XCTUnwrap(SecKeyCreateRandomKey(attributes as CFDictionary, nil))
        let publicKey = try XCTUnwrap(SecKeyCopyPublicKey(privateKey))
        let pkcs1 = try XCTUnwrap(SecKeyCopyExternalRepresentation(publicKey, nil) as Data?)
        let rsa = try DER.rsaPublicKey([UInt8](pkcs1))

        let tbs = DER.tbsCertificate(key: rsa, commonName: "Mi Remote", serial: [0x81, 2, 3, 4], notBefore: Date())
        let signature = try XCTUnwrap(
            SecKeyCreateSignature(privateKey, .rsaSignatureMessagePKCS1v15SHA256, Data(tbs) as CFData, nil) as Data?
        )
        let der = DER.certificate(tbs: tbs, signature: [UInt8](signature))

        let cert = try XCTUnwrap(SecCertificateCreateWithData(nil, Data(der) as CFData))
        XCTAssertEqual(SecCertificateCopySubjectSummary(cert) as String?, "Mi Remote")
        XCTAssertEqual(try DER.rsaPublicKey(der), rsa)
        XCTAssertTrue(SecKeyVerifySignature(publicKey, .rsaSignatureMessagePKCS1v15SHA256,
                                            Data(tbs) as CFData, signature as CFData, nil))
    }

    @MainActor
    func testMapsKeysTheAndroidTVServiceIgnores() {
        XCTAssertEqual(RemoteClient.atvKey(for: AndroidKey.tvInput.rawValue), AndroidKey.settings.rawValue)
        XCTAssertNil(RemoteClient.atvKey(for: AndroidKey.appSwitch.rawValue))
        XCTAssertEqual(RemoteClient.atvKey(for: AndroidKey.home.rawValue), AndroidKey.home.rawValue)
    }

    /// A TV rejecting an unpaired certificate often shows up as a reset, not a TLS error; that
    /// must still count as "the service is there" so pairing starts.
    func testClassifiesConnectionErrors() {
        XCTAssertTrue(peerWasReachable(.posix(.ECONNRESET)))
        XCTAssertTrue(peerWasReachable(.posix(.EPIPE)))
        XCTAssertTrue(peerWasReachable(.tls(-9806)))
        XCTAssertFalse(peerWasReachable(.posix(.ECONNREFUSED)))
        XCTAssertFalse(peerWasReachable(.posix(.ETIMEDOUT)))
        XCTAssertFalse(peerWasReachable(.posix(.EHOSTUNREACH)))
    }
}
