import Foundation
import Security

/// The RSA key and self-signed certificate the app presents to Android TVs (Android TV Remote
/// protocol). The TV trusts it once paired, so both live in the keychain. iOS can't create
/// certificates, so the certificate is built in TypeScript (src/atv/der.ts), which asks this
/// type to sign it; the keychain pairs the stored key and certificate into a TLS identity.
enum ClientIdentity {
  private static let keyTag = Data("expo.modules.milink.atv.key".utf8)
  private static let certLabel = "expo.modules.milink.atv.certificate"

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

  /// PKCS#1 RSAPublicKey DER of the client key, creating the key on first use.
  static func publicKey() throws -> Data {
    let key = try privateKey()
    guard let pub = SecKeyCopyPublicKey(key) else { throw Failure.security("No public key") }
    var error: Unmanaged<CFError>?
    guard let data = SecKeyCopyExternalRepresentation(pub, &error) as Data? else {
      throw error!.takeRetainedValue() as Error
    }
    return data
  }

  static func certificate() -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: certLabel,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }

  static func setCertificate(_ der: Data) throws {
    guard let cert = SecCertificateCreateWithData(nil, der as CFData) else {
      throw Failure.security("Not a valid certificate")
    }
    SecItemDelete([
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: certLabel,
    ] as CFDictionary)
    let status = SecItemAdd([
      kSecClass as String: kSecClassCertificate,
      kSecValueRef as String: cert,
      kSecAttrLabel as String: certLabel,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ] as CFDictionary, nil)
    guard status == errSecSuccess else { throw Failure.keychain(status) }
  }

  /// SHA256withRSA (PKCS#1 v1.5) signature, used to self-sign the certificate.
  static func sign(_ data: Data) throws -> Data {
    let key = try privateKey()
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
      key, .rsaSignatureMessagePKCS1v15SHA256, data as CFData, &error
    ) as Data? else {
      throw error!.takeRetainedValue() as Error
    }
    return signature
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
         SecCertificateCopyData(cert) as Data == wanted {
        return identity
      }
    }
    return nil
  }

  private static func privateKey() throws -> SecKey {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: keyTag,
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let item {
      return item as! SecKey // swiftlint:disable:this force_cast
    }
    // A certificate for an older key would never match the new one.
    SecItemDelete([
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: certLabel,
    ] as CFDictionary)
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeySizeInBits as String: 2048,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: keyTag,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      ],
    ]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      throw error!.takeRetainedValue() as Error
    }
    return key
  }
}
