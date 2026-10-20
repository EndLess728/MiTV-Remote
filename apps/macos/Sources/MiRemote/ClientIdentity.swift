import Foundation
import Security

/// The RSA key and self-signed certificate Mi Remote presents to Android TVs. The TV trusts the
/// certificate once paired, so both live in the login keychain, which pairs them into the TLS
/// identity. macOS can't create certificates, so `DER` builds it and this signs it.
///
/// The app is ad-hoc signed, so after an update macOS may ask once whether Mi Remote may use
/// its own keychain key; "Always Allow" keeps the pairing.
enum ClientIdentity {
    private static let keyLabel = "Mi Remote client key"
    private static let certLabel = "Mi Remote client certificate"

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

    /// The keychain identity (stored key + stored certificate), for TLS client authentication.
    static func identity() -> SecIdentity? {
        guard let wanted = certificate() else { return nil }
        let query: [String: Any] = [
            kSecClass as String: kSecClassIdentity,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnRef as String: true,
        ]
        var items: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &items) == errSecSuccess,
              let identities = items as? [SecIdentity] else { return nil }
        for identity in identities {
            var cert: SecCertificate?
            if SecIdentityCopyCertificate(identity, &cert) == errSecSuccess, let cert,
               [UInt8](SecCertificateCopyData(cert) as Data) == wanted {
                return identity
            }
        }
        return nil
    }

    // MARK: Keychain

    private static func certificate() -> [UInt8]? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassCertificate,
            kSecAttrLabel as String: certLabel,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return [UInt8](data)
    }

    private static func setCertificate(_ der: Data) throws {
        guard let cert = SecCertificateCreateWithData(nil, der as CFData) else {
            throw Failure.security("Not a valid certificate")
        }
        deleteCertificate()
        let status = SecItemAdd([
            kSecClass as String: kSecClassCertificate,
            kSecValueRef as String: cert,
            kSecAttrLabel as String: certLabel,
        ] as CFDictionary, nil)
        guard status == errSecSuccess else { throw Failure.keychain(status) }
    }

    private static func deleteCertificate() {
        SecItemDelete([
            kSecClass as String: kSecClassCertificate,
            kSecAttrLabel as String: certLabel,
        ] as CFDictionary)
    }

    private static func publicKeyData(_ key: SecKey) throws -> [UInt8] {
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

    private static func privateKey() throws -> SecKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrLabel as String: keyLabel,
            kSecReturnRef as String: true,
        ]
        var item: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let item,
           CFGetTypeID(item) == SecKeyGetTypeID() {
            return (item as! SecKey) // swiftlint:disable:this force_cast
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
            ],
        ]
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw error!.takeRetainedValue() as Error
        }
        return key
    }
}
