import Foundation
import Network
import Security
import XCTest
@testable import MiRemote

/// The client key and certificate on a real (CI runner's) login keychain, step by step, so a
/// failure names the step that broke.
final class ClientIdentityTests: XCTestCase {
    func testCreatesAStableCertificateAndATLSIdentity() throws {
        let first = try ClientIdentity.ensureCertificate()
        let der = try XCTUnwrap(ClientIdentity.certificate(), "certificate wasn't stored")
        XCTAssertEqual(try DER.rsaPublicKey(der), first, "stored certificate is for another key")

        // A second call must reuse the key and certificate, not make new ones.
        let second = try ClientIdentity.ensureCertificate()
        XCTAssertEqual(second, first, "key changed between calls")
        XCTAssertEqual(ClientIdentity.certificate(), der, "certificate was re-created")

        let key = try ClientIdentity.privateKey()
        XCTAssertEqual(try DER.rsaPublicKey(try ClientIdentity.publicKeyData(key)), first)

        let identity = try ClientIdentity.identity()
        var cert: SecCertificate?
        XCTAssertEqual(SecIdentityCopyCertificate(identity, &cert), errSecSuccess)
        XCTAssertEqual(cert.map { [UInt8](SecCertificateCopyData($0) as Data) }, der)
        var identityKey: SecKey?
        XCTAssertEqual(SecIdentityCopyPrivateKey(identity, &identityKey), errSecSuccess)
        XCTAssertNotNil(sec_identity_create(identity), "Network.framework can't use the identity")
    }
}
