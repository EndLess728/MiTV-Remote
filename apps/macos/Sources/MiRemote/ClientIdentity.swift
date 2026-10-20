import Foundation
import Security

/// The RSA key and self-signed certificate Mi Remote presents to Android TVs. The TV trusts the
/// certificate once paired, so both persist: the private key in the login keychain, the
/// certificate (public data) in Application Support. `SecIdentityCreateWithCertificate` joins
/// them into the TLS identity. macOS can't create certificates, so `DER` builds it and this
/// signs it.
///
/// (An earlier version stored the certificate in the keychain too and looked the identity up by
/// label; on the login keychain that lookup came back empty, so no client certificate was sent.)
///
/// The app is ad-hoc signed, so after an update macOS may ask once whether Mi Remote may use
/// its own keychain key; "Always Allow" keeps the pairing.
enum ClientIdentity {
    private static let keyLabel = "Mi Remote client key"
    private static let keyTag = Data("local.miremote.client-key".utf8)

    enum Failure: LocalizedError {
        case keychain(OSStatus)
        case security(String)

        var errorDescription: String? {
            switch self {
            case .keychain(let status):
                return (SecCopyErrorMessageString(status, nil) as String?) ?? "Keychain error \(status)"
            case .security(let message):
                return message
            }
        }
    }

    /// The client key's public half, creating the key (and its certificate) on first use.
    static func ensureCertificate() throws -> RSAPublicKey {
        let key = try privateKey()
        let publicKey = try DER.rsaPublicKey(try publicKeyData(key))
        if let der = certificate(), let certKey = try? DER.rsaPublicKey(der), certKey == publicKey {
            return publicKey
        }
        var serial = (0..<8).map { _ in UInt8.random(in: 0...255) }
        serial[0] = (serial[0] & 0x7F) | 0x01
        let tbs = DER.tbsCertificate(key: publicKey, commonName: ATV.clientName, serial: serial, notBefore: Date())
        let signature = try sign(Data(tbs), with: key)
        try setCertificate(Data(DER.certificate(tbs: tbs, signature: [UInt8](signature))))
        return publicKey
    }

    /// The TLS client identity: the stored certificate joined with its private key in the
    /// keychain. Throws with the reason when that fails, so it shows up in the app.
    static func identity() throws -> SecIdentity {
        guard let der = certificate(),
              let cert = SecCertificateCreateWithData(nil, Data(der) as CFData) else {
            throw Failure.security("No client certificate yet")
        }
        var identity: SecIdentity?
        let status = SecIdentityCreateWithCertificate(nil, cert, &identity)
        guard status == errSecSuccess, let identity else { throw Failure.keychain(status) }
        return identity
    }

    // MARK: Storage

    private static var certificateURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Mi Remote", isDirectory: true)
        return dir.appendingPathComponent("client-certificate.der")
    }

    static func certificate() -> [UInt8]? {
        (try? Data(contentsOf: certificateURL)).map { [UInt8]($0) }
    }

    private static func setCertificate(_ der: Data) throws {
        guard SecCertificateCreateWithData(nil, der as CFData) != nil else {
            throw Failure.security("Not a valid certificate")
        }
        try FileManager.default.createDirectory(at: certificateURL.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try der.write(to: certificateURL, options: .atomic)
    }

    private static func deleteCertificate() {
        try? FileManager.default.removeItem(at: certificateURL)
    }

    static func publicKeyData(_ key: SecKey) throws -> [UInt8] {
        guard let pub = SecKeyCopyPublicKey(key) else { throw Failure.security("No public key") }
        var error: Unmanaged<CFError>?
        guard let data = SecKeyCopyExternalRepresentation(pub, &error) as Data? else {
            throw error!.takeRetainedValue() as Error
        }
        return [UInt8](data)
    }

    private static func sign(_ data: Data, with key: SecKey) throws -> Data {
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(key, .rsaSignatureMessagePKCS1v15SHA256, data as CFData, &error) as Data? else {
            throw error!.takeRetainedValue() as Error
        }
        return signature
    }

    static func privateKey() throws -> SecKey {
        // Found by tag; by label too, for keys made before the tag was added.
        let lookups: [(String, Any)] = [(kSecAttrApplicationTag as String, keyTag), (kSecAttrLabel as String, keyLabel)]
        for (attribute, value) in lookups {
            let query: [String: Any] = [
                kSecClass as String: kSecClassKey,
                kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
                kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
                attribute: value,
                kSecReturnRef as String: true,
            ]
            var item: CFTypeRef?
            if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let item,
               CFGetTypeID(item) == SecKeyGetTypeID() {
                return (item as! SecKey) // swiftlint:disable:this force_cast
            }
        }
        // A certificate for an older key would never match a new one.
        deleteCertificate()
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: 2048,
            kSecAttrLabel as String: keyLabel,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrLabel as String: keyLabel,
                kSecAttrApplicationTag as String: keyTag,
            ],
        ]
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw error!.takeRetainedValue() as Error
        }
        return key
    }
}
